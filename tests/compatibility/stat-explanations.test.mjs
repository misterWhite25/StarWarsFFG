import test from 'node:test';
import assert from 'node:assert/strict';
import {explainStats} from '../../modules/helpers/stat-explanations.js';
import {calculateStats} from '../../modules/helpers/automatic-stats.js';
import {systemI18n} from '../system-i18n.mjs';
const french=await systemI18n('fr');

test('explains actual totals and characteristics without inventing history or mutating data',()=>{
 const source={stats:{wounds:{max:17},strain:{max:15},soak:{value:3},defence:{melee:0,ranged:0},encumbrance:{max:8}},characteristics:{Brawn:{value:2},Agility:{value:3}}};
 const system=structuredClone(source);system.stats.soak.value=5;system.stats.defence.melee=1;system.stats.defence.ranged=1;system.characteristics.Brawn.value=3;
 const effects=[{active:true,name:'Armure',parent:{documentName:'Item',name:'Armure de combat'},system:{changes:[{key:'system.stats.soak.value',value:2,type:'add'},{key:'system.stats.defence.melee',value:1,type:'add'},{key:'system.stats.defence.ranged',value:1,type:'add'}]}},
 {active:true,name:'Vigueur',system:{changes:[{key:'system.characteristics.Brawn.value',value:1,type:'add'}]}},
 {active:false,name:'Ancienne armure',system:{changes:[{key:'system.stats.soak.value',value:9,type:'add'}]}}];
 const actor={system,_source:{system:source},allApplicableEffects:()=>effects};const before=JSON.stringify(actor);
 const rows=explainStats(actor,french);assert.equal(rows.length,12);
 const wounds=rows.find(r=>r.id==='wounds');assert.equal(wounds.total,17);assert.equal(wounds.sources.length,1);
 const soak=rows.find(r=>r.id==='soak');assert.deepEqual(soak.sources.map(s=>s.value),[3,2]);assert.equal(soak.sources[1].name,'Armure de combat');
 assert.equal(rows.find(r=>r.label==='Vigueur').sources[1].value,1);
 assert.equal(JSON.stringify(actor),before);
});
test('reports unexplained differences instead of manufacturing a bonus',()=>{
 const row=explainStats({system:{stats:{soak:{value:8}}},_source:{system:{stats:{soak:{value:3}}}},allApplicableEffects:()=>[]},french).find(r=>r.id==='soak');
 assert.equal(row.total,8);assert.equal(row.sources.length,1);assert.ok(row.notes.some(n=>n.includes('calcul supplémentaire')));
});

test('calculation diagnostics and explanations are bilingual without changing numbers or input',async()=>{
 const actor={items:[],system:{stats:{soak:{value:3}},characteristics:{Brawn:{value:3}}},_source:{system:{stats:{soak:{value:3}}}},allApplicableEffects:()=>[]};
 const before=JSON.stringify(actor),english=await systemI18n('en');
 const pure=calculateStats(actor),en=calculateStats(actor,undefined,english),fr=calculateStats(actor,undefined,french);
 assert.match(pure.errors[0],/^SWFFG\.UI\.Calculation/);
 assert.equal(en.errors[0],'Exactly one species is required.');assert.equal(fr.errors[0],'Une seule espèce renseignée est nécessaire.');
 assert.deepEqual(en.rows.map(row=>row.total),fr.rows.map(row=>row.total));assert.deepEqual(en.rows.map(row=>row.total),pure.rows.map(row=>row.total));
 const englishRows=explainStats(actor,english),frenchRows=explainStats(actor,french);
 assert.equal(englishRows[0].label,'Wound threshold');assert.equal(frenchRows[0].label,'Seuil de blessures');
 assert.equal(englishRows[0].sources[0].operation,'Base');assert.equal(englishRows[0].sources[0].operationLabel,'Base');
 assert.equal(JSON.stringify(actor),before);
});
