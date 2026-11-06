import test from 'node:test';
import assert from 'node:assert/strict';
import {brawlAttackProfile,isBrawlSkill,supportsWeaponSelection} from '../../modules/helpers/weapon-selection.js';
import {calculateDamage,spendingOptions,weaponEffects} from '../../modules/helpers/combat-actions.js';
const actor=value=>({system:{characteristics:{Brawn:{value}}}});
test('unarmed Brawl uses current derived Brawn, never skill rank, and persists a per-roll snapshot',()=>{
 globalThis.game={i18n:{lang:'fr'}};const a=actor(3);a.system.skills={Brawl:{rank:5}};
 const item=brawlAttackProfile(a,'Brawl',{});assert.equal(item.system.damage.adjusted,3);assert.equal(item.system.crit.adjusted,5);assert.equal(item.system.range.value,'Engaged');assert.equal(item.type,'weapon');assert(!item.id);assert(!item.uuid);
 a.system.characteristics.Brawn.value=6;assert.equal(JSON.parse(JSON.stringify(item)).system.damage.adjusted,3);assert.equal(brawlAttackProfile(a,'SWFFG.SkillsNameBrawl',{}).system.damage.adjusted,6);
});
test('unarmed damage respects net successes, soak, zero floor and existing Tonio first-success option',()=>{
 const item=brawlAttackProfile(actor(3),'Brawl',{});
 assert.deepEqual(calculateDamage({base:item.system.damage.adjusted,successes:2,soak:2}),{raw:5,reduction:2,wounds:3});
 assert.deepEqual(calculateDamage({base:item.system.damage.adjusted,successes:2,soak:2,tonioRules:true}),{raw:4,reduction:2,wounds:2});
 assert.equal(calculateDamage({base:3,successes:1,soak:9}).wounds,0);
 assert.equal(calculateDamage({base:3,successes:1,soak:0,tonioRules:true}).raw,3);
});
test('Brawl weapon prepared damage remains absolute and Brawn is never added twice',()=>{
 const weapon={id:'gloves',type:'weapon',name:'Gants',system:{damage:{value:1,adjusted:4},crit:{value:3,adjusted:3},adjusteditemmodifier:[{name:'Disorient',system:{rank_current:3}}]}};
 const before=structuredClone(weapon),item=brawlAttackProfile(actor(3),'Brawl',weapon);
 assert.equal(item.system.damage.adjusted,4);assert.equal(item.system.crit.adjusted,3);assert.equal(item.system.adjusteditemmodifier.find(q=>q.name==='Disorient').system.rank_current,3);assert.deepEqual(weapon,before);
 assert.equal(brawlAttackProfile(actor(3),'Brawl',item).system.adjusteditemmodifier.length,2);
});
test('natural weapon damage is preserved and non-Brawl rolls are not converted',()=>{
 const bite={id:'bite',type:'weapon',name:'Morsure',system:{damage:{value:8,adjusted:8},crit:{value:4},characteristic:{value:''}}};
 assert.equal(brawlAttackProfile(actor(3),'Brawl',bite).system.damage.adjusted,8);
 for(const key of ['Melee','RangedLight','Medicine'])assert.equal(brawlAttackProfile(actor(3),key,bite),bite);
 assert.equal(supportsWeaponSelection('Brawl'),true);assert.equal(isBrawlSkill('Pugilat'),true);assert.equal(isBrawlSkill('SWFFG.SkillsNameBrawl'),true);
});
test('unarmed critical and qualities are available after success only, without implicit activation',()=>{
 globalThis.game={i18n:{lang:'fr'}};const item=brawlAttackProfile(actor(3),'Brawl',{});
 assert.equal(spendingOptions(item,{success:1}).find(o=>o.id==='critical').payments.advantage,5);
 assert(!spendingOptions(item,{success:0}).some(o=>o.id==='critical'));
 const effects=weaponEffects(item,true);assert(effects.some(e=>e.name==='Disorient'&&e.rank===1&&e.cost===2));assert(effects.some(e=>e.name==='Knockdown'&&e.cost===2));assert.equal(weaponEffects(item,false).length,0);
});
test('missing Brawn is rejected and zero Brawn is a valid starting damage',()=>{
 assert.throws(()=>brawlAttackProfile({},'Brawl',{}));assert.equal(brawlAttackProfile(actor(0),'Brawl',{}).system.damage.adjusted,0);
});
