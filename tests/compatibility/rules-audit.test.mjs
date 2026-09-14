import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
const read=file=>readFile(new URL('../../modules/'+file,import.meta.url),'utf8');
async function actorClass(){
 const context=vm.createContext({Actor:class {},CONFIG:{FFG:{theme:'starwars'},logger:{error:e=>{throw e;}}}});
 const mod=new vm.SourceTextModule(await read('actors/actor-ffg.js'),{context});
 await mod.link(()=>new vm.SyntheticModule(['default','getPreparedActiveEffectChanges'],function(){this.setExport('default',class {});this.setExport('getPreparedActiveEffectChanges',()=>[]);},{context}));
 await mod.evaluate();return mod.namespace.ActorFFG;
}
test('carried and worn armour counts all copies and respects adjusted zero',async()=>{
 const ActorFFG=await actorClass();const actor=new ActorFFG();actor.system={stats:{encumbrance:{}}};
 const armour={type:'armour',system:{encumbrance:{value:5},quantity:{value:2},equippable:{equipped:true}}};actor.items=[armour];
 actor._calculateDerivedValues(actor);assert.equal(actor.system.stats.encumbrance.value,7);
 armour.system.equippable.equipped=false;actor._calculateDerivedValues(actor);assert.equal(actor.system.stats.encumbrance.value,10);
 armour.system.equippable.equipped=true;armour.system.encumbrance.adjusted=0;actor._calculateDerivedValues(actor);assert.equal(actor.system.stats.encumbrance.value,0);
 armour.system.quantity.value=0;delete armour.system.encumbrance.adjusted;actor._calculateDerivedValues(actor);assert.equal(actor.system.stats.encumbrance.value,0);
 actor.items=[{type:'gear',system:{encumbrance:{value:4,adjusted:2},quantity:{value:3}}}];actor._calculateDerivedValues(actor);assert.equal(actor.system.stats.encumbrance.value,6);
});
test('minions fall only above each threshold and incomplete groups stay finite',async()=>{
 const ActorFFG=await actorClass();const actor=new ActorFFG();actor.items=[];
 actor.system={unit_wounds:{value:5},quantity:{max:3},stats:{wounds:{value:5}},skills:{Ranged:{groupskill:true}}};
 actor._prepareMinionData(actor);assert.equal(actor.system.quantity.value,3);assert.equal(actor.system.skills.Ranged.rank,2);
 actor.system.stats.wounds.value=6;actor._prepareMinionData(actor);assert.equal(actor.system.quantity.value,2);assert.equal(actor.system.skills.Ranged.rank,1);
 actor.system.stats.wounds.value=16;actor._prepareMinionData(actor);assert.equal(actor.system.quantity.value,0);assert.equal(actor.system.skills.Ranged.rank,0);assert.equal(actor.system.stats.woundsOverThreshold,1);
 actor.system.unit_wounds.value=0;actor.system.stats.wounds.value=1;actor._prepareMinionData(actor);assert.equal(Number.isFinite(actor.system.quantity.value),true);
});
test('skill and situational setback removals add together',async()=>{
 const actor={system:{skills:{Pilot:{rank:2,characteristic:'Agility',remsetback:1}},characteristics:{Agility:{value:3}}}};
 const context=vm.createContext({game:{actors:{get:()=>actor},i18n:{localize:s=>s}},CONFIG:{logger:{debug(){}},FFG:{skills:{Pilot:{label:'Pilot'}}}}});
 const pool=new vm.SourceTextModule(await read('dice/pool.js'),{context});await pool.link(()=>{});await pool.evaluate();
 const selection=new vm.SourceTextModule(await read('helpers/weapon-selection.js'),{context});await selection.link(()=>{});await selection.evaluate();
 const mod=new vm.SourceTextModule(await read('helpers/dice-helpers.js'),{context});
 await mod.link(spec=>spec.includes('weapon-selection')?selection:spec.endsWith('/pool.js')?pool:new vm.SyntheticModule(['default'],function(){this.setExport('default',class {});},{context}));await mod.evaluate();
 const result=mod.namespace.get_dice_pool('actor','Pilot',new pool.namespace.DicePoolFFG({remsetback:2,difficulty:1,challenge:2}));
 assert.equal(result.remsetback,3);assert.equal(result.ability,1);assert.equal(result.proficiency,2);assert.equal(result.challenge,2);
});
