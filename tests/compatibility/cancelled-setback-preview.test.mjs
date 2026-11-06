import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
class Element{constructor(tag){this.tag=tag;this.children=[];this.style={};this.attributes={};this.classes=[];this.classList={add:c=>this.classes.push(c)};}appendChild(el){this.children.push(el);}setAttribute(key,value){this.attributes[key]=value;}}
async function load(){
 const context=vm.createContext({document:{createElement:tag=>new Element(tag)},CONFIG:{FFG:{SETBACK_ICON:'black',REMOVESETBACK_ICON:'minus',ABILITY_ICON:'green'}},game:{i18n:{lang:'fr'},settings:{get:()=>true}}});
 const source=await readFile(new URL('../../modules/dice/pool.js',import.meta.url),'utf8');const m=new vm.SourceTextModule(source,{context});await m.link(()=>new vm.SyntheticModule(['effectivePool','gmDifficulty'],function(){this.setExport('effectivePool',p=>p);this.setExport('gmDifficulty',()=>({enabled:false}));},{context}));await m.evaluate();return m.namespace.DicePoolFFG;
}
test('4 original Setback show 2 active and 2 crossed out, while only 2 are rolled',async()=>{
 const Pool=await load(),pool=new Pool({setback:2,ability:1}),root=new Element('div'),before=pool.renderDiceExpression();pool.renderPreview(root,{total:4,cancelled:2});
 assert.equal(root.children.filter(e=>e.tag==='img'&&e.src==='black').length,2);const cancelled=root.children.filter(e=>e.classes.includes('ffg-cancelled-setback'));assert.equal(cancelled.length,2);assert(cancelled.every(e=>e.children[0].src==='black'&&/annulé/.test(e.attributes['aria-label'])));assert.equal(root.children.filter(e=>e.src==='minus').length,0);assert.equal(pool.setback,2);assert.equal(pool.renderDiceExpression(),before);assert.match(before,/2ds/);
});
test('all-cancelled and excessive removal cases show no phantom dice and never change the roll',async()=>{
 const Pool=await load();for(const total of [0,1,4]){const pool=new Pool({setback:0}),root=new Element('div');pool.renderPreview(root,{total,cancelled:20});assert.equal(root.children.length,total);assert.equal(root.children.filter(e=>e.tag==='img').length,0);assert.equal(pool.renderDiceExpression(),'');}
});
test('ordinary previews retain their existing behavior when no cancellation breakdown is supplied',async()=>{
 const Pool=await load(),pool=new Pool({setback:4,remsetback:2}),root=new Element('div');pool.renderPreview(root);assert.equal(root.children.filter(e=>e.src==='black').length,4);assert.equal(root.children.filter(e=>e.src==='minus').length,2);assert.equal(root.children.filter(e=>e.classes.includes('ffg-cancelled-setback')).length,0);assert.equal(pool.renderDiceExpression(),'2ds');
});
