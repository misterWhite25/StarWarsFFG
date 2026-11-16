import test from 'node:test';
import assert from 'node:assert/strict';
import {planAutoCrew,detectsAstromech,autoCrewProfile} from '../../modules/helpers/auto-crew-model.mjs';
const weapon=(id,access,name='Battery')=>({id,type:'shipweapon',name,flags:access?{starwarsffg:{weaponCrew:access}}:{}});
const ship=(name,size=3,items=[])=>({name,system:{stats:{silhouette:{value:size},crew:{value:1}}},items,flags:{starwarsffg:{crew:[]}}});
test('fighters add a pilot and optional astromech, with fixed guns assigned to the pilot',()=>{
  for(const name of ['X-Wing T-65','Y-Wing BTL-A4','E-Wing']){
    const plan=planAutoCrew(ship(name,3,[weapon('laser')]));assert.equal(plan.layout,'fighter');assert.deepEqual(plan.stations.map(s=>s.kind),['pilot','astromech']);assert.equal(plan.stations[1].role,'Co-Pilot');assert.deepEqual(plan.weaponUpdates[0].after,{pilot:true,copilot:false,gunner:false});
    assert.deepEqual(planAutoCrew(ship(name),{astromech:'no'}).stations.map(s=>s.kind),['pilot']);
  }
  assert.equal(detectsAstromech(ship('TIE/ln')),false);assert.equal(planAutoCrew(ship('TIE/ln'),{astromech:'yes'}).stations.at(-1).kind,'astromech');
});
test('a large complement creates only representative stations and one gunner per battery item',()=>{
  const vehicle=ship('Destroyer',8,[weapon('a'),weapon('b')]);vehicle.system.stats.crew.value=37000;
  const plan=planAutoCrew(vehicle);assert.deepEqual(plan.stations.map(s=>s.kind),['pilot','copilot','gunner','gunner','engineer','operator']);assert.equal(plan.stations.filter(s=>s.kind==='gunner').length,2);
});
test('manual occupants and configured weapon access survive, with old unbound gunners reused',()=>{
  const vehicle=ship('Frégate',5,[weapon('a',{pilot:true,gunner:false,copilot:false}),weapon('b',{gunner:true}),weapon('c')]);
  const actors={p:{name:'Pilote PJ'},c:{name:'Copilote PJ'},g:{name:'Artilleur PNJ'},e:{name:'Mécanicien'}};
  vehicle.flags.starwarsffg.crew=[{actor_id:'p',role:'Pilote',custom:7},{actor_id:'c',role:'Co-Pilot'},{actor_id:'g',role:'Gunner'},{actor_id:'e',role:'Mécanicien'}];
  const plan=planAutoCrew(vehicle,{},id=>actors[id]);assert.equal(plan.crew[0].custom,7);assert.equal(plan.crew[2].weapon_id,'b');assert.deepEqual(plan.weaponUpdates.map(w=>w.id),['c']);assert.deepEqual(plan.stations.map(s=>s.key),['gunner:c','operator']);
});
test('an occupied copilot is preserved when adding an astromech and existing droids are not duplicated',()=>{
  const vehicle=ship('X-wing');vehicle.flags.starwarsffg.crew=[{actor_id:'c',role:'Co-Pilot'}];
  assert.equal(planAutoCrew(vehicle,{},()=>({name:'Copilote'})).stations.find(s=>s.kind==='astromech').role,'Astromech');
  vehicle.flags.starwarsffg.crew.push({actor_id:'r2',role:'Astromech'});assert.equal(planAutoCrew(vehicle,{},()=>({name:'R2-D2'})).stations.some(s=>s.kind==='astromech'),false);
});
test('profiles keep complete native data and expose the selected specialty without shared mutations',()=>{
  const base={characteristics:Object.fromEntries(['Brawn','Agility','Intellect','Cunning','Willpower','Presence'].map(k=>[k,{value:2}])),skills:Object.fromEntries(['Gunnery','Mechanics','Computers','Astrogation','Cool','Vigilance','Discipline'].map(k=>[k,{rank:0,characteristic:'Intellect'}])),stats:{wounds:{max:0},strain:{},soak:{}}};
  const data=autoCrewProfile(base,{kind:'astromech'},'veteran');assert.equal(data.skills.Mechanics.rank,3);assert.equal(data.skills.Gunnery.rank,0);assert.equal(data.characteristics.Intellect.value,4);assert.equal(data.characteristics.Agility.value,1);assert.equal(base.skills.Mechanics.rank,0);assert.equal(data.skills.Mechanics.characteristic,'Intellect');
  assert.throws(()=>planAutoCrew(ship('Test'),{quality:'bad'}));assert.throws(()=>planAutoCrew(ship('Test'),{astromech:'bad'}));
});
test('rollback snapshots do not change when weapon flags are later updated',()=>{
  const vehicle=ship('X-Wing',3,[weapon('w',{pilot:false,copilot:false,gunner:false})]);
  const plan=planAutoCrew(vehicle);vehicle.items[0].flags.starwarsffg.weaponCrew.pilot=true;
  assert.equal(plan.weaponUpdates[0].before.pilot,false);
});

test('silhouette alone determines crew organization despite the listed complement or old layout options',()=>{
  for(const [size,layout] of [[1,'fighter'],[3,'fighter'],[4,'transport'],[5,'capital'],[8,'capital']]){
    for(const complement of [1,37000,'37 000']){
      const vehicle=ship('Modèle générique',size,[weapon('fixed')]);
      vehicle.system.stats.crew.value=complement;
      const plan=planAutoCrew(vehicle,{layout:size<4?'capital':'fighter'});
      assert.equal(plan.layout,layout);
      assert.equal(plan.stations.some(station=>station.kind==='engineer'),size>=4);
      assert.equal(plan.stations.some(station=>station.kind==='operator'),size>=4);
      assert.equal(plan.weaponUpdates[0].after.pilot,size<4);
    }
  }
});
