import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {loadSystemModule} from '../load-system-module.mjs';

const globalRanges={contact:1.5,short:10,medium:20,long:50,extreme:150};

test('system range limits override obsolete scene flags in metres and feet, while movement stays local',async()=>{
 for(const units of ['m','ft']){
  let values={...globalRanges};
  const context=vm.createContext({game:{settings:{get:()=>values},i18n:{localize:key=>key}}});
  const {calibration,bandForDistance,validateCalibration}=(await loadSystemModule('helpers/ground-movement-model.mjs',context)).namespace;
  const flags={movement:15,short:5,medium:50,long:250,extreme:1000};
  const scene={grid:{units,distance:5},getFlag:()=>flags},factor=units==='ft'?.3048:1;
  const before=calibration(scene);
  assert.equal(before.movement,15);
  for(const key of ['short','medium','long','extreme'])assert.ok(Math.abs(before[key]*factor-values[key])<1e-9);
  assert.equal(bandForDistance(30/factor,before),3);
  values={contact:1.5,short:5,medium:40,long:80,extreme:200};
  assert.equal(bandForDistance(30/factor,calibration(scene)),2);
  assert.deepEqual(flags,{movement:15,short:5,medium:50,long:250,extreme:1000});
  assert.doesNotThrow(()=>validateCalibration({movement:15,short:100,medium:1}));
  assert.throws(()=>validateCalibration({movement:0}));
 }
});

async function fixture({rejectWrite=false}={}){
 const initializers=[],writes=[];
 let Settings,closed=false;
 const context=vm.createContext({innerWidth:1000,Hooks:{once:(_name,fn)=>initializers.push(fn)},
  foundry:{applications:{api:{ApplicationV2:class{async close(){closed=true;}}}}},
  game:{user:{isGM:true},i18n:{localize:key=>key},settings:{register(){},registerMenu:(_scope,_name,options)=>{Settings=options.type;},get:()=>false,set:async(_scope,key,value)=>{if(rejectWrite)throw Error('Settings save rejected');writes.push({key,value});}}}});
 await loadSystemModule('helpers/ground-range-settings.mjs',context);
 for(const initialize of initializers)initialize();
 const scene={update(){throw Error('Scene must never be changed');}};
 const app=new Settings({scene});
 app.inputs=Object.fromEntries(Object.entries(globalRanges).map(([key,value])=>[key,{m:{value:String(value)}}]));
 app.modeInputs={};app.error={hidden:true};
 return {app,writes,get closed(){return closed;}};
}

test('range settings save only the global reference and never update the current scene',async()=>{
 const f=await fixture();await f.app.save();
 assert.equal(f.closed,true);assert.equal(f.writes.length,1);
 assert.equal(f.writes[0].key,'groundRangeDistances');
 assert.deepEqual(structuredClone(f.writes[0].value),globalRanges);
});

test('a failed global range save keeps the settings open and shows the error',async()=>{
 const f=await fixture({rejectWrite:true});await f.app.save();
 assert.equal(f.closed,false);assert.equal(f.writes.length,0);
 assert.equal(f.app.error.hidden,false);assert.equal(f.app.error.textContent,'Settings save rejected');
});
