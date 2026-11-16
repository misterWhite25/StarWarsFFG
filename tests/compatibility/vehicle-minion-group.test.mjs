import test from 'node:test';
import assert from 'node:assert/strict';
import {vehicleMinionGroup,vehicleGroupSkillRank,applyVehicleMinionSkills,requireLivingVehicleGroup,setVehicleMinionGroup,vehicleGroupRepairValue,vehicleMinionCriticalChange} from '../../modules/helpers/vehicle-minion-group.mjs';
const vehicle=(damage=0,count=3,hull=6)=>({type:'vehicle',uuid:'Actor.ship',isOwner:true,flags:{starwarsffg:{vehicleMinionGroup:{enabled:true,count}}},system:{stats:{hullTrauma:{value:damage,max:hull}}}});

test('hull losses exceed individual thresholds, while size and armor stay individual',()=>{
  for(const [damage,alive]of [[0,3],[6,3],[7,2],[12,2],[13,1],[18,1],[19,0],[100,0]]){
    const data=vehicle(damage),view=vehicleMinionGroup(data);assert.equal(view.alive,alive,String(damage));assert.equal(view.totalHull,18);assert.equal(view.hullPerVehicle,6);assert.equal(data.system.stats.hullTrauma.max,6);
  }
});
test('group skill ranks fall with casualties, cap at five and leave other skills alone',()=>{
  assert.equal(vehicleGroupSkillRank(vehicle(7),'Gunnery'),1);assert.equal(vehicleGroupSkillRank(vehicle(13),'Piloting: Space'),0);
  assert.equal(vehicleGroupSkillRank(vehicle(0,100),'Gunnery'),5);assert.equal(vehicleGroupSkillRank(vehicle(0),'Mechanics'),null);
  const raw={type:'minion',system:{quantity:{max:1,value:1},stats:{wounds:{value:9,max:12}},skills:{Gunnery:{rank:0,groupskill:true},Mechanics:{rank:2}}}};
  assert.equal(applyVehicleMinionSkills(raw,vehicle(7)),raw);assert.equal(raw.system.skills.Gunnery.rank,1);assert.equal(raw.system.skills.Mechanics.rank,2);assert.equal(raw.system.quantity.max,2);assert.equal(raw.system.stats.wounds.value,0);
});
test('ordinary hull repairs cannot resurrect lost vehicles, but direct damage undo remains reversible',()=>{
  assert.equal(vehicleGroupRepairValue(vehicle(10),2),7);assert.equal(vehicleGroupRepairValue(vehicle(14),0),13);
  assert.equal(vehicleGroupRepairValue(vehicle(5),0),0);assert.equal(vehicleGroupRepairValue(vehicle(19),0),19);
  const data=vehicle(7);data.system.stats.hullTrauma.value=0;assert.equal(vehicleMinionGroup(data).alive,3);
});
test('one critical destroys one craft at every boundary and an empty group cannot act',()=>{
  for(const before of [0,1,5,6,7,12,13,18]){
    const data=vehicle(before),alive=vehicleMinionGroup(data).alive,change=vehicleMinionCriticalChange(data);data.system.stats.hullTrauma.value=change.after;
    assert.equal(vehicleMinionGroup(data).alive,alive-1,String(before));
  }
  assert.throws(()=>requireLivingVehicleGroup(vehicle(19)),/plus aucun véhicule/);assert.throws(()=>vehicleMinionCriticalChange(vehicle(19)));
});
test('configuration preserves cumulative damage and rejects invalid or unauthorized writes',async()=>{
  globalThis.game={user:{isGM:true}};const data=vehicle(10);data.setFlag=async(_scope,_flag,value)=>{data.flags.starwarsffg.vehicleMinionGroup=value;};
  const view=await setVehicleMinionGroup(data,{enabled:true,count:4});assert.equal(view.damage,10);assert.equal(view.alive,3);assert.equal(data.system.stats.hullTrauma.max,6);
  await assert.rejects(setVehicleMinionGroup(data,{enabled:true,count:0}));await assert.rejects(setVehicleMinionGroup(data,{enabled:true,count:101}));
  game.user.isGM=false;await assert.rejects(setVehicleMinionGroup(data,{enabled:false,count:4}));delete globalThis.game;
});
