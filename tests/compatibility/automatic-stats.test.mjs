import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source = await readFile(new URL('../../modules/helpers/automatic-stats.js', import.meta.url),'utf8');
const {calculateStats, default:AutomaticStats} = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
function fixture() {
 const species={documentName:'Item',type:'species',name:'Humain',system:{attributes:{Wounds:{value:10},Strain:{value:10}}}};
 const armour={documentName:'Item',type:'armour',name:'Armure',system:{soak:{adjusted:3},defence:{adjusted:1},equippable:{equipped:true}}};
 const a={type:'character',flags:{starwarsffg:{automaticStats:{enabled:true,creationBrawn:3,creationWillpower:2}}},
 system:{characteristics:{Brawn:{value:4}},stats:{wounds:{max:99,value:6},strain:{max:99,value:2},soak:{value:99},defence:{melee:99,ranged:99},encumbrance:{max:99,value:11}}},
 items:[species,armour],effects:[],allApplicableEffects(){return this.effects;}};
 return {a,species,armour};
}
const totals = result => Object.fromEntries(result.rows.map(r=>[r.id,r.total]));
test('derives totals from creation history and worn equipment, preserving current damage',()=>{
 const {a}=fixture();AutomaticStats.apply(a);
 assert.equal(a.system.stats.wounds.max,13);assert.equal(a.system.stats.strain.max,12);
 assert.equal(a.system.stats.soak.value,7);assert.equal(a.system.stats.defence.melee,1);
 assert.equal(a.system.stats.encumbrance.max,9);assert.equal(a.system.stats.encumbrance.value,11);
 assert.equal(a.system.stats.wounds.value,6);assert.equal(a.system.stats.strain.value,2);
 const first=JSON.stringify(a.system);AutomaticStats.apply(a);assert.equal(JSON.stringify(a.system),first);
 a.system.characteristics.Brawn.value=5;AutomaticStats.apply(a);
 assert.equal(a.system.stats.wounds.max,13);assert.equal(a.system.stats.soak.value,8);
});
test('does not double species/armour effects and reacts to unequipping',()=>{
 const {a,species,armour}=fixture();
 a.effects=[species,armour].map(parent=>({active:true,name:'(inherent)',parent,system:{changes:[{key:'system.stats.soak.value',value:3,type:'add'},{key:'system.stats.wounds.max',value:13,type:'add'}]}}));
 assert.equal(totals(calculateStats(a)).soak,7);assert.equal(totals(calculateStats(a)).wounds,13);
 armour.system.equippable.equipped=false;assert.equal(totals(calculateStats(a)).soak,4);
});
test('effects and adjustments apply once and defense is capped',()=>{
 const {a}=fixture();a.effects=[{active:true,name:'Talent',system:{changes:[{key:'system.stats.wounds.max',value:2,type:'add'},{key:'system.stats.defence.melee',value:6,type:'add'}]}}];
 a.flags.starwarsffg.automaticStats.adjustments={wounds:1};
 assert.equal(totals(calculateStats(a)).wounds,16);assert.equal(totals(calculateStats(a)).melee,4);
 a.effects[0].active=false;assert.equal(totals(calculateStats(a)).wounds,14);
});
test('incomplete histories and unsupported effects block activation instead of guessing',()=>{
 const {a}=fixture();delete a.flags.starwarsffg.automaticStats.creationBrawn;
 assert.ok(calculateStats(a).errors.length);AutomaticStats.apply(a);assert.equal(a.system.stats.wounds.max,99);
 a.flags.starwarsffg.automaticStats.creationBrawn=3;a.effects=[{active:true,name:'Formula',system:{changes:[{key:'system.stats.soak.value',value:'@foo',type:'add'}]}}];
 assert.ok(calculateStats(a).errors.some(e=>e.includes('Formula')));
});
test('flags suspect weapon effects and missing talent effects without changing documents',()=>{
 const {a}=fixture();const weapon={documentName:'Item',type:'weapon',name:'Fusil',system:{attributes:{}}};
 a.effects=[{active:true,name:'attr-old',parent:weapon,system:{changes:[{key:'system.stats.wounds.max',type:'add',value:1}]}}];
 a.items.push({type:'talent',name:'Talent',system:{attributes:{foo:{mod:'Strain'}}},effects:[]});
 const before=JSON.stringify(a),result=calculateStats(a);assert.equal(JSON.stringify(a),before);
 assert.equal(totals(result).wounds,14);assert.ok(result.warnings.length>=3);
});
