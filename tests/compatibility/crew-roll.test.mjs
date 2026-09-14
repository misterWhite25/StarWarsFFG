import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

test('pilot uses current speed, rounded silhouette, handling and the appropriate skill', async () => {
  let vehicle={system:{stats:{speed:{value:3,max:6},silhouette:{value:4},handling:{value:-2}},spaceShip:true}};
  const context=vm.createContext({foundry:{applications:{api:{}}},game:{actors:{get:()=>vehicle},settings:{get:()=> 'starwars'}}});
  const source=await readFile(new URL('../../modules/helpers/crew.js',import.meta.url),'utf8');
  const mod=new vm.SourceTextModule(source,{context});
  await mod.link(spec=>new vm.SyntheticModule(spec.includes('dice-helpers')?['default','get_dice_pool']:['DicePoolFFG'],function(){
    if(spec.includes('dice-helpers')) {this.setExport('default',{});this.setExport('get_dice_pool',(_id,skill,pool)=>({...pool,skill}));}
    else this.setExport('DicePoolFFG',class {constructor(data){Object.assign(this,data);}});
  },{context}));
  await mod.evaluate();
  const {buildPilotRoll,getPilotDifficulty}=mod.namespace;
  let pool=await buildPilotRoll('ship','pilot');
  assert.equal(pool.difficulty,1);assert.equal(pool.challenge,2);assert.equal(pool.setback,2);assert.equal(pool.skill,'Piloting: Space');
  vehicle.system.stats.speed.value=0;
  pool=await buildPilotRoll('ship','pilot');assert.equal(pool.difficulty,2);assert.equal(pool.challenge,0);
  vehicle.system.stats.speed.value=1;vehicle.system.stats.silhouette.value=5;
  pool=await buildPilotRoll('ship','pilot');assert.equal(pool.difficulty,2);assert.equal(pool.challenge,1);
  vehicle.system.spaceShip=false;vehicle.system.stats.handling.value=1;
  pool=await buildPilotRoll(vehicle,'pilot',3);assert.equal(pool.difficulty,3);assert.equal(pool.challenge,undefined);assert.equal(pool.boost,1);assert.equal(pool.skill,'Piloting: Planetary');
  assert.equal(getPilotDifficulty({}).difficulty,0);
});

test('ship weapons restrict stations independently of skill and deduplicate crew', async () => {
  const context=vm.createContext({foundry:{applications:{api:{}}}});
  const mod=new vm.SourceTextModule(await readFile(new URL('../../modules/helpers/crew.js',import.meta.url),'utf8'),{context});
  await mod.link(spec=>new vm.SyntheticModule(spec.includes('dice-helpers')?['default','get_dice_pool']:['DicePoolFFG'],function(){
    if(spec.includes('dice-helpers')) {this.setExport('default',{});this.setExport('get_dice_pool',()=>{});}
    else this.setExport('DicePoolFFG',class {});
  },{context}));
  await mod.evaluate();
  const {canCrewUseWeapon,weaponCrewCandidates}=mod.namespace;
  const weapon={flags:{starwarsffg:{weaponCrew:{pilot:true,copilot:true,gunner:false}}}};
  const crew=[{actor_id:'p',role:'Pilot'},{actor_id:'c',role:'Co-Pilote'},{actor_id:'g',role:'Artilleur'},{actor_id:'p',role:'Co-Pilot'}];
  const skillRoles=[{role_name:'Artilleur'}];
  assert.deepEqual(Array.from(weaponCrewCandidates(weapon,crew,skillRoles),c=>c.actor_id),['p','c']);
  assert.equal(canCrewUseWeapon(weapon,'Pilote'),true);
  assert.equal(canCrewUseWeapon(weapon,'Gunner'),false);
  assert.equal(canCrewUseWeapon(weapon,'Engineer'),false);
  weapon.flags.starwarsffg.weaponCrew={gunner:true};
  assert.deepEqual(Array.from(weaponCrewCandidates(weapon,crew,skillRoles),c=>c.actor_id),['g']);
  assert.equal(canCrewUseWeapon(weapon,'Gunner'),true);
  assert.equal(weaponCrewCandidates(weapon,[],skillRoles).length,0);
  for(const legacy of [{},{flags:{starwarsffg:{weaponCrew:{pilot:false,copilot:false,gunner:false}}}}]) {
    assert.equal(canCrewUseWeapon(legacy,'Custom station'),true);
    assert.deepEqual(Array.from(weaponCrewCandidates(legacy,crew,skillRoles),c=>c.actor_id),['g']);
  }
});
