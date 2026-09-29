import test from 'node:test';
import assert from 'node:assert/strict';
import {explainStats} from '../../modules/helpers/stat-explanations.js';

test('explains actual totals and characteristics without inventing history or mutating data',()=>{
 const source={stats:{wounds:{max:17},strain:{max:15},soak:{value:3},defence:{melee:0,ranged:0},encumbrance:{max:8}},characteristics:{Brawn:{value:2},Agility:{value:3}}};
 const system=structuredClone(source);system.stats.soak.value=5;system.stats.defence.melee=1;system.stats.defence.ranged=1;system.characteristics.Brawn.value=3;
 const effects=[{active:true,name:'Armure',parent:{documentName:'Item',name:'Armure de combat'},system:{changes:[{key:'system.stats.soak.value',value:2,type:'add'},{key:'system.stats.defence.melee',value:1,type:'add'},{key:'system.stats.defence.ranged',value:1,type:'add'}]}},
 {active:true,name:'Vigueur',system:{changes:[{key:'system.characteristics.Brawn.value',value:1,type:'add'}]}},
 {active:false,name:'Ancienne armure',system:{changes:[{key:'system.stats.soak.value',value:9,type:'add'}]}}];
 const actor={system,_source:{system:source},allApplicableEffects:()=>effects};const before=JSON.stringify(actor);
 const rows=explainStats(actor);assert.equal(rows.length,12);
 const wounds=rows.find(r=>r.id==='wounds');assert.equal(wounds.total,17);assert.equal(wounds.sources.length,1);
 const soak=rows.find(r=>r.id==='soak');assert.deepEqual(soak.sources.map(s=>s.value),[3,2]);assert.equal(soak.sources[1].name,'Armure de combat');
 assert.equal(rows.find(r=>r.label==='Vigueur').sources[1].value,1);
 assert.equal(JSON.stringify(actor),before);
});
test('reports unexplained differences instead of manufacturing a bonus',()=>{
 const row=explainStats({system:{stats:{soak:{value:8}}},_source:{system:{stats:{soak:{value:3}}}},allApplicableEffects:()=>[]}).find(r=>r.id==='soak');
 assert.equal(row.total,8);assert.equal(row.sources.length,1);assert.ok(row.notes.some(n=>n.includes('calcul supplémentaire')));
});
