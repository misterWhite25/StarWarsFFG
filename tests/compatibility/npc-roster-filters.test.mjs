import test from 'node:test';
import assert from 'node:assert/strict';
import {npcRosterFilter,npcRosterMatches,npcFavorites,toggleNpcFavorite} from '../../modules/helpers/npc-roster-filters.mjs';

test('initiative, scene and favorite filters use each roster entry rather than just its actor',()=>{
  const scene={id:'current',tokens:[{actorId:'ship'}]},favorites=new Set(['group-one']);
  const one={key:'group-one',token:{parent:{id:'current'}},participant:{id:'a'}};
  const two={key:'group-two',token:{parent:{id:'elsewhere'}}};
  const crew={key:'crew',mode:'space',vehicle:{id:'ship'}};
  const offboard={key:'other-crew',mode:'space',vehicle:{id:'offboard'}};
  const options={scene,favorites};
  assert.equal(npcRosterMatches(one,'initiative',options),true);assert.equal(npcRosterMatches(two,'initiative',options),false);
  assert.equal(npcRosterMatches(one,'scene',options),true);assert.equal(npcRosterMatches(two,'scene',options),false);
  assert.equal(npcRosterMatches(crew,'scene',options),true);assert.equal(npcRosterMatches(offboard,'scene',options),false);
  assert.equal(npcRosterMatches(one,'favorites',options),true);assert.equal(npcRosterMatches(two,'favorites',options),false);
  assert.equal(npcRosterMatches(two,'all',options),true);assert.equal(npcRosterMatches(one,'scene',{scene:null}),false);
});
test('each camp retains its filter and the default follows the availability of initiative',()=>{
  globalThis.game={combat:{combatants:{size:3}}};
  assert.equal(npcRosterFilter({side:'enemies'}),'initiative');
  const model={side:'enemies',rosterFilters:{enemies:'favorites',allies:'scene'}};
  assert.equal(npcRosterFilter(model),'favorites');assert.equal(npcRosterFilter(model,'allies'),'scene');
  globalThis.game.combat=null;assert.equal(npcRosterFilter({side:'allies'}),'scene');delete globalThis.game;
});
test('favorites persist separately for each GM and rapid clicks do not lose another group',async()=>{
  function user(){let stored=[];return {isGM:true,getFlag:()=>stored,setFlag:async(_scope,_key,value)=>{await Promise.resolve();stored=value;}};}
  const first=user(),second=user();
  await Promise.all([toggleNpcFavorite(first,'one'),toggleNpcFavorite(first,'two')]);
  assert.deepEqual([...npcFavorites(first)],['one','two']);assert.equal(npcFavorites(second).size,0);
  await toggleNpcFavorite(first,'one');assert.deepEqual([...npcFavorites(first)],['two']);
});
