import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {loadSystemModule} from '../load-system-module.mjs';
const context=vm.createContext({structuredClone});
const boundaries={
 'helpers/pilotage-assets.mjs':{setupPilotageAssets(){}},
 'helpers/pilotage-tabs.mjs':{setupPilotageTabs(){}}
};
const gm=await loadSystemModule('helpers/gm-difficulty.js',context,boundaries);
const {effectivePool,normalizeDifficulty,registerGMDifficulty,changeGMDifficulty}=gm.namespace;
const pool=await loadSystemModule('dice/pool.js',context,{
 'helpers/gm-difficulty.js':{...gm.namespace}
});
const {DicePoolFFG}=pool.namespace;
test('global difficulty replaces only negative dice, persists, and restores local dice when disabled', () => {
 let config = {enabled:true,difficulty:2,challenge:1,setback:3};
 context.game = {settings:{get:(_scope,key)=>key==='gmDifficulty'?config:true}};
 try {
  const pool=new DicePoolFFG({ability:3,boost:1,difficulty:5,challenge:0,setback:7,remsetback:2});
  const original=pool.renderDiceExpression();
  assert.match(original,/2di/);assert.match(original,/1dc/);assert.match(original,/3ds/);
  assert.match(original,/3da/);assert.match(original,/1db/);
  assert.equal(pool.difficulty,5);assert.equal(pool.setback,7);
  assert.equal(pool.renderDiceExpression(),original);
  config={...config,difficulty:0,challenge:0,setback:0};
  assert.doesNotMatch(pool.renderDiceExpression(),/d[ics]/);
  config.enabled=false;
  assert.match(pool.renderDiceExpression(),/5di/);assert.match(pool.renderDiceExpression(),/5ds/);
  assert.equal(effectivePool(pool).setback,7);
 } finally {delete context.game;}
});
test('configuration sanitizes counts and uses a world setting',()=>{
 assert.deepEqual(structuredClone(normalizeDifficulty({enabled:true,difficulty:-2,challenge:2.9,setback:'bad'})),{enabled:true,difficulty:0,challenge:2,setback:0});
 let registration;
 context.game={settings:{register:(_scope,_key,options)=>registration=options}};
 try {registerGMDifficulty();assert.equal(registration.scope,'world');assert.equal(registration.default.enabled,false);assert.equal(registration.default.difficulty,2);assert.equal(registration.default.challenge,0);assert.equal(registration.default.setback,0);assert.equal(registration.config,false);}
 finally {delete context.game;}
});

test('MJ difficulty buttons follow the roll builder upgrade and downgrade rules',()=>{
 for (const difficulty of [0,1,3]) for (const challenge of [0,1,2]) for (const downgrade of [false,true]) {
  const pool=new DicePoolFFG({difficulty,challenge,setback:2});
  const config={difficulty,challenge,setback:2,enabled:true};
  pool.upgradeDifficulty(downgrade?-1:1); changeGMDifficulty(config,downgrade);
  assert.equal(config.difficulty,pool.difficulty); assert.equal(config.challenge,pool.challenge);
  assert.equal(config.setback,2); assert.equal(config.enabled,true);
 }
});
