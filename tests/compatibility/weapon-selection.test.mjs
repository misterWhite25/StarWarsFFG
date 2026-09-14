import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
const read=file=>readFile(new URL('../../modules/'+file,import.meta.url),'utf8');
async function load(){const m=new vm.SourceTextModule(await read('helpers/weapon-selection.js'));await m.link(()=>{});await m.evaluate();return m.namespace;}
test('weapon selector includes Gunnery and matches owned weapons by skill',async()=>{
 const api=await load();
 for(const key of ['Lightsaber','Melee','Ranged: Light','Ranged: Heavy'])assert.equal(api.supportsWeaponSelection(key),true);
 assert.equal(api.supportsWeaponSelection('Gunnery'),true);assert.equal(api.supportsWeaponSelection('Brawl'),false);
 const gun={id:'gun',type:'weapon',system:{skill:{value:'Ranged: Light'}}};
 const actor={items:{contents:[gun,{type:'weapon',system:{skill:{value:'Melee'}}},{type:'gear',system:{skill:{value:'Ranged: Light'}}}]}};
 assert.equal(api.matchingWeapons(actor,'Ranged: Light').length,1);assert.equal(api.matchingWeapons(actor,'Ranged: Light')[0],gun);
});
test('switching weapons replaces modifiers without accumulating and retains manual dice',async()=>{
 const api=await load(),base={ability:2,proficiency:1,boost:0,setback:0,difficulty:2,advantage:0};
 const gun={...base,boost:2,setback:1},other={...base,boost:1};
 let current={...base,boost:1,difficulty:3}; // manual Boost / difficulty, or accepted aid
 current=api.replaceWeaponPool(current,base,gun);assert.equal(current.boost,3);assert.equal(current.difficulty,3);
 current=api.replaceWeaponPool(current,gun,other);assert.equal(current.boost,2);assert.equal(current.setback,0);
 current=api.replaceWeaponPool(current,other,base);assert.equal(current.boost,1);assert.equal(current.difficulty,3);
 current=api.replaceWeaponPool(current,base,gun);assert.equal(current.boost,3);
});

test('Accurate grants its rank in Boost dice without duplicating configured modifiers',async()=>{
 const api=await load();const q={name:'Accurate Quality',system:{rank:2}};
 assert.equal(api.missingAccurateBoost(q),2);
 assert.equal(api.missingAccurateBoost(q,2),0);
 assert.equal(api.missingAccurateBoost(q,1),1);
 assert.equal(api.missingAccurateBoost({...q,name:'Inaccurate Quality'}),0);
 assert.equal(api.missingAccurateBoost({name:'Précision',system:{rank_current:0,rank:2}}),0);
});

test('quality labels translate and distinguish active, passive and pre-shot settings',async()=>{
 const api=await load();const q=name=>({name,system:{rank:1}});
 assert.equal(api.describeWeaponQuality(q('Accurate Quality'),'fr'),'Précision 1 (passif)');
 assert.equal(api.describeWeaponQuality(q('Auto-Fire Quality'),'fr'),'Tir automatique 1 (choix avant le jet, déclenché après)');
 assert.match(api.describeWeaponQuality(q('Stun Setting Quality'),'fr'),/Réglage étourdissant 1 \(passif/);
 assert.match(api.describeWeaponQuality(q('Stun Quality'),'fr'),/déclenché/);
 assert.match(api.describeWeaponQuality(q('May Select Additional Jury Rigged Option Mod'),'fr'),/modification passive/);
 assert.match(api.describeWeaponQuality(q('Custom quality'),'fr'),/type non identifié/);
 assert.match(api.describeWeaponQuality(q('Accurate Quality'),'en'),/accurate 1 \(passive\)/);
});

test('Auto-fire choice recognizes imports and adds just one Difficulty die without changing Challenge dice',async()=>{
 const api=await load();
 for(const name of ['Auto-fire Quality 1','Auto Fire Quality','Automatique','Tir automatique'])assert.equal(api.hasAutoFire({system:{itemmodifier:[{name}]}}),true);
 assert.equal(api.hasAutoFire({system:{itemmodifier:[{name:'Stun Setting Quality'}]}}),false);
 assert.equal(api.hasAutoFire(null),false);
 const pool={difficulty:2,challenge:1,boost:3};
 api.setAutoFirePool(pool,false,true);assert.equal(pool.difficulty,3);assert.equal(pool.challenge,1);
 api.setAutoFirePool(pool,true,true);assert.equal(pool.difficulty,3);
 pool.difficulty++;api.setAutoFirePool(pool,true,false);assert.equal(pool.difficulty,3);assert.equal(pool.boost,3);
});

test('chat quality names translate without changing names used for import lookup',async()=>{
 const api=await load();
 assert.equal(api.weaponQualityName('Auto-Fire Quality','fr'),'Tir automatique');
 assert.equal(api.weaponQualityName('Stun Setting Quality','fr'),'Réglage étourdissant');
 assert.equal(api.weaponQualityName('Auto-Fire Quality 1','fr'),'Tir automatique');
 assert.equal(api.weaponQualityName('Réglage étourdissant','en'),'stun setting');
 assert.equal(api.weaponQualityName('Custom quality','fr'),'Custom quality');
});

test('vehicle spending context distinguishes Gunnery weapon scale and recognizes piloting labels',async()=>{
 const api=await load();
 for(const skill of ['Piloting: Planetary','Piloting: Space','SWFFG.SkillsNamePilotingSpace','Pilotage : Planétaire'])assert.equal(api.combatModeForRoll(skill,{}),'vehicle');
 assert.equal(api.combatModeForRoll('SWFFG.SkillsNameGunnery',{type:'weapon'}),'personal');
 assert.equal(api.combatModeForRoll('Gunnery',{type:'shipweapon'}),'vehicle');
 assert.equal(api.combatModeForRoll('Gunnery',{crew:{crew_card:true}}),'vehicle');
 assert.equal(api.combatModeForRoll('Gunnery',{type:'weapon'},'vehicle'),'vehicle');
 assert.equal(api.combatModeForRoll('Gunnery',{type:'shipweapon'},'personal'),'personal');
});
