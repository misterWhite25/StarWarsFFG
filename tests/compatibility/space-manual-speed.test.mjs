import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {loadSystemModule} from '../load-system-module.mjs';

async function fixture(){
 const user={id:'gm',isGM:true};
 const users=new Map([['gm',user]]);users.activeGM=user;
 const ship={id:'ship',actorId:'vehicle',version:4,silhouette:5,maxSpeed:5,speed:0,startSpeed:0,x:3,y:2,heading:90,movementSpent:2,combat:{pilotManeuvers:1,accelerated:false,turns:{pilot:{maneuvers:1}},effects:[{kind:'evasive'}]}};
 let state={round:0,epoch:2,ships:[ship]};
 let writes=0;
 const context=vm.createContext({structuredClone,console,game:{user,users,actors:new Map(),settings:{get:()=>state,set:async(_scope,_key,next)=>{state=next;writes++;}}},Hooks:{once(){},on(){}}});
 const api=(await loadSystemModule('space-combat/board.mjs',context,{
  'space-combat/encounter.mjs':{prepareSpaceEncounter:async()=>null},
  'helpers/integrated-crew.mjs':{resolveCrewActor:()=>null},
  'helpers/vehicle-token-artwork.mjs':{vehicleTokenArtwork:value=>value},
  'space-combat/scene-document.mjs':{ensureCombatScene:async()=>null,registerCombatScene(){}},
  'space-combat/combat-engine.mjs':{executeCombat(){throw Error('Must not spend a maneuver');},commitCombatUpdates(){throw Error('Must not update an actor');},rollbackCombatUpdates(){}},
  'space-combat/initiative.mjs':{initiativeStamp:()=>null,initiativeContext:()=>({}),synchronizeInitiative:value=>value}
 })).namespace;
 return {api,user,ship,get state(){return state;},get writes(){return writes;}};
}

test('GM can set a pawn speed from zero to its maximum without maneuver, strain, actor or position changes',async()=>{
 const f=await fixture();
 for(const value of [3,5,0]){
  const before=structuredClone(f.state.ships[0]);
  await f.api.command('speed',{shipId:'ship',version:before.version,speed:value});
  assert.deepEqual(structuredClone(f.state.ships[0]),{...before,speed:value,startSpeed:value,version:before.version+1});
  assert.equal(f.state.round,0);
 }
 assert.equal(f.writes,3);
});

test('manual speed rejects invalid values, stale commands and non-GM users without saving',async()=>{
 const f=await fixture();
 for(const speed of [-1,6,1.5,NaN,Infinity,'3',null]){
  await assert.rejects(f.api.command('speed',{shipId:'ship',version:4,speed}),{message:"SWFFG.UI.SpaceCombat.OutOfBounds"});
 }
 await assert.rejects(f.api.command('speed',{shipId:'ship',version:3,speed:3}),{message: "SWFFG.UI.SpaceCombat.TokenOrderChanged"});
 f.user.isGM=false;
 await assert.rejects(f.api.command('speed',{shipId:'ship',version:4,speed:3}),{message:"SWFFG.UI.SpaceCombat.CommandGMOnly"});
 assert.equal(f.writes,0);
 assert.equal(f.state.ships[0].speed,0);
});
