import test from 'node:test';
import assert from 'node:assert/strict';
import {npcSkillVisible} from '../../modules/helpers/npc-command-data.mjs';
const npc=(type='rival')=>({type,items:[],system:{stats:{forcePool:{max:0}},skills:{Lightsaber:{rank:3}}}});
test('ordinary NPCs hide Lightsaber even when the imported skill has ranks',()=>{
  for(const type of ['minion','rival','nemesis'])assert.equal(npcSkillVisible(npc(type),'Lightsaber'),false);
  assert.equal(npcSkillVisible(npc(),'RangedLight'),true);
  assert.equal(npcSkillVisible(npc('character'),'Lightsaber'),true);
  assert.equal(npcSkillVisible(npc('character'),'Lightsaber',true),false);
});
test('a positive Force rating or an owned Force power retains Lightsaber',()=>{
  const actor=npc();actor.system.stats.forcePool={max:2,value:2};assert.equal(npcSkillVisible(actor,'Lightsaber'),true);
  actor.system.stats.forcePool.max=0;actor.items=[{type:'forcepower',system:{}}];assert.equal(npcSkillVisible(actor,'Lightsaber'),true);
});
test('weapon skill identifies renamed and unequipped lightsabers without mistaking blasters or gear',()=>{
  const actor=npc();actor.items=[{type:'weapon',name:'Arme personnelle',system:{skill:{value:'Lightsaber'},quantity:{value:1},equippable:{equipped:false}}}];
  assert.equal(npcSkillVisible(actor,'Sabre laser'),true);
  actor.items[0].system.quantity.value=0;assert.equal(npcSkillVisible(actor,'Lightsaber'),false);
  actor.items=[{type:'weapon',system:{skill:'RangedLight'}},{type:'gear',name:'Cristal',system:{skill:'Lightsaber'}}];assert.equal(npcSkillVisible(actor,'Lightsaber'),false);
});
