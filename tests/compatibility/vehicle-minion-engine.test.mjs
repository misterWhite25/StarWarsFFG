import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {loadSystemModule} from '../load-system-module.mjs';

async function fixture(damage=14){
  const actor={id:'mechanic',uuid:'Actor.mechanic',name:'Mécanicien',system:{skills:{Mechanics:{rank:2}},stats:{strain:{value:0,max:12}}}};
  const vehicle={id:'ship',uuid:'Actor.ship',type:'vehicle',name:'Groupe',flags:{starwarsffg:{vehicleMinionGroup:{enabled:true,count:3}}},system:{stats:{hullTrauma:{value:damage,max:6},systemStrain:{value:0,max:8}}},getFlag:(_scope,key)=>key==='crew'?[{actor_id:'mechanic',role:'Engineer'}]:undefined};
  const actors=new Map([['mechanic',actor],['ship',vehicle]]),game={actors,user:{isGM:true},settings:{get:()=> 'starwars'}},context=vm.createContext({game,structuredClone,foundry:{utils:{randomID:()=> 'id'}}});
  const {executeCombat}=(await loadSystemModule('space-combat/combat-engine.mjs',context,{
    'helpers/integrated-crew.mjs':{resolveCrewActor:member=>actors.get(typeof member==='string'?member:member?.actor_id)},
    'space-combat/initiative.mjs':{initiativeReason:()=>''},'space-combat/movement.mjs':{resolveMovement:()=>({})}
  })).namespace;
  const ship={id:'s',actorId:'ship',speed:2,maxSpeed:4,silhouette:3},state={round:1,ships:[ship]};
  return {executeCombat,ship,state,vehicle};
}
test('native repair transaction keeps two destroyed craft and rolls difficulty from aggregate threshold',async()=>{
  const f=await fixture();let difficulty;
  const result=await f.executeCombat(f.state,f.ship,{crewId:'mechanic',combatAction:'repairHull'},{isGM:true},{rollCheck:async input=>{difficulty=input.difficulty;return {success:100,message:{text:'repair'}};}});
  assert.equal(difficulty,2);assert.equal(result.updates[0].before,14);assert.equal(result.updates[0].after,13);
});
test('a destroyed group cannot act but remains resettable by the GM',async()=>{
  const f=await fixture(19);
  await assert.rejects(f.executeCombat(f.state,f.ship,{crewId:'mechanic',combatAction:'repairHull'},{isGM:true}),/plus aucun véhicule/);
  const result=await f.executeCombat(f.state,f.ship,{crewId:'mechanic',combatAction:'resetEncounter'},{isGM:true});assert.equal(result.updates.length,0);
});

test('minion maneuvers plan hull damage instead of invisible mechanical strain',async()=>{
  const f=await fixture(0);f.vehicle.getFlag=(_scope,key)=>key==='crew'?[{actor_id:'mechanic',role:'Pilot'}]:undefined;
  const result=await f.executeCombat(f.state,f.ship,{crewId:'mechanic',combatAction:'punch'},{isGM:true});
  assert.equal(result.updates.length,1);assert.equal(result.updates[0].path,'system.stats.hullTrauma.value');assert.equal(result.updates[0].before,0);assert.equal(result.updates[0].after,2);
});
test('minion groups cannot spend an action repairing a nonexistent strain counter',async()=>{
  const f=await fixture(0);await assert.rejects(f.executeCombat(f.state,f.ship,{crewId:'mechanic',combatAction:'repairStrain'},{isGM:true}),/pas de stress/);
});
