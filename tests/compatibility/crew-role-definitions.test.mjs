import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {loadSystemModule} from '../load-system-module.mjs';

async function fixture() {
  const labels = {
    'SWFFG.SkillsNameGunnery': 'Artillerie',
    'SWFFG.SkillsNameMechanics': 'Mécanique',
    'SWFFG.SkillsNameAstrogation': 'Astrogation',
    'SWFFG.SkillsNamePilotingSpace': 'Pilotage : spatial',
  };
  const skills = {
    Gunnery: {value: 'Gunnery', label: 'SWFFG.SkillsNameGunnery'},
    Mechanics: {value: 'Mechanics', label: 'SWFFG.SkillsNameMechanics'},
    Astrogation: {value: 'Astrogation', label: 'SWFFG.SkillsNameAstrogation'},
    'Piloting: Space': {value: 'Piloting: Space', label: 'SWFFG.SkillsNamePilotingSpace'},
  };
  const context = vm.createContext({game: {i18n: {lang: 'fr', localize: key => labels[key] ?? key}}, CONFIG: {FFG: {skills}}});
  return (await loadSystemModule('helpers/crew-role-definitions.mjs', context)).namespace;
}

function vehicle(crew = [], definitions) {
  const flags = {crew, crewRoleDefinitions: definitions};
  return {type: 'vehicle', uuid: 'Actor.test-crew', items: [], getFlag: (_scope, key) => flags[key], flags: {starwarsffg: flags}};
}

test('standard stations work without the former global crew settings', async () => {
  const api = await fixture(), ship = vehicle();
  const roles = api.crewRoleDefinitions(ship);
  for (const name of ['Pilot', 'Co-Pilot', 'Gunner', 'Initiative']) assert.ok(roles.some(role => role.role_name === name), name);
  const gunner = api.crewRoleDefinition(ship, 'Gunner');
  assert.equal(gunner.kind, 'gunner');
  assert.equal(gunner.role_skill, 'Gunnery');
  assert.equal(gunner.use_weapons, true);
  assert.equal(api.isInitiativeCrewRole(ship, 'Initiative'), true);
});

test('French and English assigned role names resolve without renaming the assignments', async () => {
  const api = await fixture(), crew = ['Pilote', 'Co-Pilote', 'Artilleur'].map((role, index) => ({actor_id: String(index), role})), ship = vehicle(crew);
  const snapshot = JSON.stringify(crew);
  for (const [name, kind] of [['Pilot','pilot'],['Pilote','pilot'],['Co-Pilot','copilot'],['Co-Pilote','copilot'],['Gunner','gunner'],['Artilleur','gunner']]) {
    const role = api.crewRoleDefinition(ship, name);
    assert.equal(role.kind, kind, name);
    assert.equal(role.role_name, name);
  }
  assert.equal(JSON.stringify(crew), snapshot);
});

test('custom per-vehicle station metadata preserves its skill and handling options', async () => {
  const api = await fixture();
  const metadata = {version: 1, roles: [{role_name: 'Technicien de bord', role_skill: 'Mécanique', use_handling: true, use_weapons: false}]};
  const ship = vehicle([{actor_id: 'engineer', role: 'Technicien de bord'}], metadata), snapshot = JSON.stringify(ship.flags);
  const role = api.crewRoleDefinition(ship, 'Technicien de bord');
  assert.equal(role.role_skill, 'Mechanics');assert.equal(role.use_handling, true);assert.equal(role.use_weapons, false);
  assert.equal(JSON.stringify(ship.flags), snapshot);
});

test('saved metadata takes priority over built-in defaults for an existing station', async () => {
  const api = await fixture();
  const ship = vehicle([{actor_id: 'gunner', role: 'Gunner'}], {version:1,roles:[{role_name:'Gunner',role_skill:'Mechanics',use_handling:true,use_weapons:false}]});
  const role = api.crewRoleDefinition(ship, 'Gunner');
  assert.equal(role.role_skill, 'Mechanics');assert.equal(role.use_handling, true);assert.equal(role.use_weapons, false);
});

test('unknown assigned stations stay visible without gaining a made-up skill or weapon permission', async () => {
  const api = await fixture(), crew = [{actor_id:'observer',role:'Observateur historique',weapon_id:'legacy-weapon',link:'Legacy link'}], ship = vehicle(crew), snapshot = JSON.stringify(crew);
  const roles = api.crewRoleDefinitions(ship), role = roles.find(entry => entry.role_name === crew[0].role);
  assert.ok(role);assert.equal(role.kind, 'unknown');assert.ok(!role.role_skill);assert.ok(!role.use_weapons);
  assert.equal(JSON.stringify(crew), snapshot);
});

test('a custom initiative station is recognized from vehicle metadata', async () => {
  const api = await fixture(), ship = vehicle([{actor_id:'captain',role:'Coordination du capitaine'}],{version:1,roles:[{role_name:'Coordination du capitaine',kind:'initiative',use_handling:false,use_weapons:false}]});
  assert.equal(api.isInitiativeCrewRole(ship, 'Coordination du capitaine'), true);
  assert.equal(api.isInitiativeCrewRole(ship, 'Pilote'), false);
});

test('skill lookups canonicalize translated names and find the matching stations', async () => {
  const api = await fixture(), ship = vehicle([{actor_id:'gunner',role:'Artilleur'}]);
  for (const value of ['Gunnery', 'Artillerie', 'SWFFG.SkillsNameGunnery']) assert.equal(api.canonicalCrewSkill(value), 'Gunnery', value);
  assert.equal(api.canonicalCrewSkill('Mécanique'), 'Mechanics');
  assert.equal(api.canonicalCrewSkill('Pilotage : spatial'), 'Piloting: Space');
  assert.ok(api.crewRolesForSkill(ship, 'Artillerie').some(role => role.kind === 'gunner'));
});

test('array-shaped legacy per-vehicle definitions are still readable', async () => {
  const api = await fixture(), ship = vehicle([{actor_id:'navigator',role:'Navigateur historique'}],[{role_name:'Navigateur historique',role_skill:'Astrogation',use_handling:false,use_weapons:false}]);
  assert.equal(api.crewRoleDefinition(ship, 'Navigateur historique').role_skill, 'Astrogation');
});

test('migration snapshots old mechanics on world and unlinked vehicle actors without changing assignments', async () => {
  const makeActor = (uuid, crew) => {
    const actor = vehicle(crew);actor.uuid = uuid;
    actor.setFlag = async (_scope,key,value) => {actor.flags.starwarsffg[key] = value;};
    return actor;
  };
  const world = makeActor('Actor.ship', [{actor_id:'pilot',role:'Pilote',link:'Pilot link'},{actor_id:'captain',role:'Coordination du capitaine'}]);
  const synthetic = makeActor('Scene.scene.Token.ship.Actor.ship', [{actor_id:'tech',role:'Technicien de bord',weapon_id:'weapon-old'}]);synthetic.isToken = true;
  const tokenFlags = {}, token = {uuid:'Scene.scene.Token.ship',actorLink:false,actor:synthetic,getFlag:(_s,key)=>tokenFlags[key],setFlag:async(_s,key,value)=>{tokenFlags[key]=value;}};
  const worldBefore = JSON.stringify(world.flags.starwarsffg.crew), syntheticBefore = JSON.stringify(synthetic.flags.starwarsffg.crew), reads = [];
  const old = {
    'starwarsffg.arrayCrewRoles': [{role_name:'Pilote',role_skill:'Piloting: Space',use_handling:true,use_weapons:false},{role_name:'Technicien de bord',role_skill:'Mécanique',use_handling:true,use_weapons:false},{role_name:'Poste inutilisé',role_skill:'Computers'}],
    'starwarsffg.initiativeCrewRole': {role_name:'Coordination du capitaine'},
  };
  const context = vm.createContext({console,game:{user:{id:'gm',isGM:true},users:{activeGM:{id:'gm'}},actors:[world],scenes:[{tokens:[token]}],settings:{storage:new Map([['world',{getSetting:key=>{reads.push(key);return {_source:{value:JSON.stringify(old[key])}};}}]])}}});
  const api = (await loadSystemModule('helpers/crew-role-migration.mjs', context)).namespace;
  const first = await api.migrateCrewRoleDefinitions();assert.equal(first.migrated,2);assert.equal(first.failures.length,0);
  assert.equal(JSON.stringify(world.flags.starwarsffg.crew),worldBefore);assert.equal(JSON.stringify(synthetic.flags.starwarsffg.crew),syntheticBefore);
  const worldDefs=world.flags.starwarsffg.crewRoleDefinitions,tokenDefs=synthetic.flags.starwarsffg.crewRoleDefinitions;
  assert.equal(worldDefs.version,1);assert.equal(worldDefs.roles.find(role=>role.role_name==='Pilote').use_handling,true);assert.equal(worldDefs.roles.find(role=>role.role_name==='Coordination du capitaine').kind,'initiative');
  assert.equal(tokenDefs.roles[0].role_skill,'Mechanics');assert.ok(!worldDefs.roles.some(role=>role.role_name==='Poste inutilisé'));
  const snapshot=JSON.stringify([worldDefs,tokenDefs,tokenFlags]);assert.equal((await api.migrateCrewRoleDefinitions()).migrated,0);assert.equal(JSON.stringify([world.flags.starwarsffg.crewRoleDefinitions,synthetic.flags.starwarsffg.crewRoleDefinitions,tokenFlags]),snapshot);
  assert.ok(reads.includes('starwarsffg.arrayCrewRoles'));assert.ok(reads.includes('starwarsffg.initiativeCrewRole'));
});

test('compatibility migration does not write when the current user is not the primary GM', async () => {
  let writes=0;
  const ship=vehicle([{actor_id:'pilot',role:'Pilot'}]);ship.setFlag=async()=>{writes++;};
  for(const user of [{id:'player',isGM:false},{id:'assistant-gm',isGM:true}]){
    const context=vm.createContext({game:{user,users:{activeGM:{id:'primary-gm'}},actors:[ship]}});
    const api=(await loadSystemModule('helpers/crew-role-migration.mjs',context)).namespace;
    const result=await api.migrateCrewRoleDefinitions();assert.equal(result.skipped,true);assert.equal(result.migrated,0);
  }
  assert.equal(writes,0);
});
