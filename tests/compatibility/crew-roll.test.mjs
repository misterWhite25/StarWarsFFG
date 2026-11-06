import {loadSystemModule} from '../load-system-module.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';

function loadCrew(context) {
  context.structuredClone = structuredClone;
  return loadSystemModule('helpers/crew.js', context, {
    'helpers/dice-helpers.js': {default: {}, get_dice_pool: (_id, skill, pool) => Object.assign(pool, {skill})},
    'dice/pool.js': {DicePoolFFG: class {
      constructor(data) { Object.assign(this, data); }
      upgradeDifficulty(times) { assert.equal(times, 0); }
    }}
  });
}

test('pilot uses current speed, rounded silhouette, handling and the appropriate skill', async () => {
  let vehicle={system:{stats:{speed:{value:3,max:6},silhouette:{value:4},handling:{value:-2}},spaceShip:true}};
  const context=vm.createContext({foundry:{applications:{api:{}}},game:{actors:{get:()=>vehicle},settings:{get:()=> 'starwars'}}});
  const mod = await loadCrew(context);
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
  const mod = await loadCrew(context);
  const {canCrewUseWeapon,weaponCrewCandidates}=mod.namespace;
  const weapon={id:'gun',type:'shipweapon',flags:{starwarsffg:{weaponCrew:{pilot:true,copilot:true,gunner:false}}}};
  const crew=[{actor_id:'p',role:'Pilot'},{actor_id:'c',role:'Co-Pilote'},{actor_id:'g',role:'Artilleur'},{actor_id:'p',role:'Co-Pilot'}];
  const skillRoles=[{role_name:'Artilleur'}];
  assert.deepEqual(Array.from(weaponCrewCandidates(weapon,crew,skillRoles),c=>c.actor_id),['p','c']);
  assert.equal(canCrewUseWeapon(weapon,'Pilote'),true);
  assert.equal(canCrewUseWeapon(weapon,'Gunner'),false);
  assert.equal(canCrewUseWeapon(weapon,'Engineer'),false);
  weapon.flags.starwarsffg.weaponCrew={gunner:true};
  crew[2].weapon_id='gun';
  assert.deepEqual(Array.from(weaponCrewCandidates(weapon,crew,skillRoles),c=>c.actor_id),['g']);
  assert.equal(canCrewUseWeapon(weapon,'Gunner'),true);
  assert.equal(weaponCrewCandidates(weapon,[],skillRoles).length,0);
  delete crew[2].weapon_id;
  for(const legacy of [{},{flags:{starwarsffg:{weaponCrew:{pilot:false,copilot:false,gunner:false}}}}]) {
    assert.equal(canCrewUseWeapon(legacy,'Custom station'),true);
    assert.deepEqual(Array.from(weaponCrewCandidates(legacy,crew,skillRoles),c=>c.actor_id),['g']);
  }
});

test('an old crew can fire its available station without first saving a reassignment', async () => {
  const context = vm.createContext({foundry: {applications: {api: {}}}});
  const {weaponCrewCandidates} = (await loadCrew(context)).namespace;
  const {vehicleCrew} = (await loadSystemModule('helpers/crew-gunners.mjs', context)).namespace;
  const guns = ['left', 'right'].map(id => ({id, type:'shipweapon', flags:{starwarsffg:{weaponCrew:{gunner:true}}}}));
  const original = [{actor_id:'a',role:'Gunner'}, {actor_id:'b',role:'Artilleur',weapon_id:'left'}];
  const crew = vehicleCrew({items:guns, getFlag:()=>original});
  assert.deepEqual(Array.from(weaponCrewCandidates(guns[0], crew), c => c.actor_id), ['b']);
  assert.deepEqual(Array.from(weaponCrewCandidates(guns[1], crew), c => c.actor_id), ['a']);
  assert.equal(original[0].weapon_id, undefined);
});

test('removing a crew member while an assignment is pending preserves both edits', async () => {
  const context = vm.createContext({foundry:{applications:{api:{}}},CONFIG:{logger:{debug(){}}}});
  const member = {id:'g', name:'Gunner', link:'Gunner'};
  context.game = {actors:{get:()=>member}, settings:{get:()=>[]}};
  context.foundry.applications.ux = {TextEditor:{enrichHTML:async text=>text}};
  const {deregister_crew, updateRoles} = (await loadCrew(context)).namespace;
  const roster = [{actor_id:'p',role:'Pilot'}];
  const ship = {uuid:'Actor.ship', getFlag:()=>roster, async setFlag(_s,_k,entries){roster.splice(0,roster.length,...entries);},
    async unsetFlag(){roster.length=0;}};
  await Promise.all([updateRoles(ship, 'g', ['Engineer']), deregister_crew(ship, 'p', 'Pilot')]);
  assert.deepEqual(roster.map(entry => entry.actor_id), ['g']);
});

test('the crew sheet rolls the assigned weapon with its malfunction setback and current gunner', async () => {
  const member = {actor_id:'a',role:'Gunner'};
  const gun = {type:'shipweapon',id:'laser',flags:{starwarsffg:{weaponCrew:{gunner:true}}}};
  const malfunction = {id:'fault',mechanics:{target:'weapon',targetId:'laser',setback:2}};
  const ship = {type:'vehicle',name:'Transport',img:'ship.webp',items:[gun],
    getFlag:(_s,key)=>key==='crew'?[member]:key==='vehicleMalfunctions'?[malfunction]:undefined};
  const calls = [], warnings = [], crewSheet = {};
  const context = vm.createContext({structuredClone, game:{actors:{get:()=>({sheet:crewSheet})},
    settings:{get:()=>[]},i18n:{localize:key=>key}},foundry:{appv1:{sheets:{ActorSheet:class{}}},applications:{api:{}}},
    ui:{notifications:{warn:key=>warnings.push(key)}}});
  const unused = {default: class {}};
  const mod = await loadSystemModule('actors/actor-sheet-ffg.js', context, {
    'applications/legacy-dialog-v2.js':{LegacyDialogV2:class{}}, 'popout-editor.js':unused,
    'helpers/dice-helpers.js':{default:{getModifiers:async p=>p,displayRollDialog:(...args)=>calls.push(args)},
      get_dice_pool:(_id,_skill,p)=>p},
    'dice/pool.js':{DicePoolFFG:class{constructor(data){Object.assign(this,data);}}},
    'actors/actor-ffg-options.js':unused, 'importer/import-helpers.js':unused, 'helpers/modifiers.js':unused,
    'helpers/actor-helpers.js':{...unused,xpLogEarn(){},xpLogSpend(){}}, 'helpers/embeddeditem-helpers.js':unused,
    'helpers/effects.js':unused, 'helpers/item-pill-hover.js':{itemPillHover(){}}
  });
  const roll = mod.namespace.ActorSheetFFG.prototype.vehicleCrewGunneryRoll.bind({actor:ship},gun,'Gunnery',member);
  await roll();
  assert.equal(calls.length,1);
  assert.equal(calls[0][0],crewSheet);
  assert.equal(calls[0][1].setback,2);
  assert.equal(calls[0][4],gun);
  assert.equal(calls[0][8].crew.role,'Gunner');
  assert.equal(calls[0][8].crew.name,'Transport');
  malfunction.mechanics.weaponOff = true;
  await roll();
  assert.equal(calls.length,1);
  assert.equal(warnings.length,1);
});
