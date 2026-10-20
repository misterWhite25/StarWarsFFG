import {fileURLToPath} from 'node:url';
import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile} from 'node:fs/promises';
const root=fileURLToPath(new URL('../../modules/helpers/',import.meta.url));
async function load(skill='Ranged: Light',journals){
 const seen={dialogs:[],descriptions:0};
 const element=()=>({children:[],style:{},append(e){this.children.push(e);},addEventListener(){},classList:{add(){}},setAttribute(k,v){this[k]=v;},after(e){this.children.push(e);},getBoundingClientRect:()=>({height:300,left:100,top:30,right:450,width:350}),querySelector(selector){return selector==='.window-title'?this:null;},querySelectorAll:()=>[]});
 const pages=['6-1','6-4','6-2','6-3','6-7'].map(id=>({type:'text',name:id+' · Table',text:{content:'<table><tr><td>'+id+'</td></tr></table>'},testUserPermission:()=>true,getFlag:()=>[],isOwner:false}));
 const game={modules:new Map([['swffg-compendium-bilingual',{active:true}]]),user:{},packs:new Map(),journal:journals??[{name:'Tables de combat et soins',flags:{},pages,testUserPermission:()=>true,getFlag:()=>false}]};
 const context=vm.createContext({game,window:{innerWidth:1500,innerHeight:900},document:{createElement:element},requestAnimationFrame:fn=>fn(),foundry:{applications:{ux:{TextEditor:{enrichHTML:async html=>html}},api:{DialogV2:class {
  constructor(options){seen.dialogs.push(options);this.element=element();}async render(){}async close(){}setPosition(){}
 }}}}});
 const mapping=new vm.SourceTextModule(await readFile(root+'skill-reference-mapping.js','utf8'),{context});await mapping.link(()=>{});await mapping.evaluate();
 const module=new vm.SourceTextModule(await readFile(root+'skill-information-ui.js','utf8'),{context});
 await module.link(spec=>spec.includes('mapping')?mapping:new vm.SyntheticModule(spec.includes('pilotage-core')?['adjacentPlacement']:['skillDescriptor','skillDescription'],function(){
  if(spec.includes('pilotage-core'))this.setExport('adjacentPlacement',()=>({left:500,top:30,width:600}));
  else{this.setExport('skillDescriptor',()=>skill?{key:skill,label:skill}:null);this.setExport('skillDescription',async()=>{seen.descriptions++;return {html:'<p>DESCRIPTION_SEULE</p>'};});}
 },{context}));await module.evaluate();
 const appRoot=element();appRoot.ownerDocument={};const builder={element:element(),roll:{combatMode:'personal'},dicePool:{boost:1,difficulty:2},setPosition(){}};
 return {api:module.namespace,seen,builder,appRoot};
}
test('combat skill displays two accessible header icons',async()=>{const {api,builder,appRoot}=await load();api.renderSkillInformation(builder,{0:appRoot});const group=appRoot.children[0];assert.equal(group.children.length,2);assert.deepEqual(group.children.map(b=>b['aria-label']),['Informations de la compétence','Tables de références']);assert(group.children.every(b=>b.textContent===undefined));});
test('skill without associated tables displays only information button',async()=>{const {api,builder,appRoot}=await load('Negotiation',[]);api.renderSkillInformation(builder,{0:appRoot});assert.equal(appRoot.children[0].children.length,1);assert.equal(api.hasSkillReferenceTables(builder),false);});
test('generic roller has neither button',async()=>{const {api,builder,appRoot}=await load(null);api.renderSkillInformation(builder,{0:appRoot});assert.equal(appRoot.children.length,0);});
test('information reads description without tables and preserves dice',async()=>{const {api,builder,seen}=await load();await api.openSkillInformation(builder);const html=seen.dialogs[0].content.innerHTML;assert(html.includes('DESCRIPTION_SEULE'));assert(!html.includes('<table>'));assert.equal(seen.descriptions,1);assert.deepEqual(builder.dicePool,{boost:1,difficulty:2});});
test('references reads associated tables without description and preserves dice',async()=>{const {api,builder,seen}=await load();await api.openSkillReferences(builder);const html=seen.dialogs[0].content.innerHTML;assert(html.includes('<table>'));assert(!html.includes('DESCRIPTION_SEULE'));assert.equal(seen.descriptions,0);assert.equal((html.match(/data-reference-id=/g)??[]).length,5);assert.deepEqual(builder.dicePool,{boost:1,difficulty:2});});
test('custom reference associations respect journal visibility',async()=>{
 const journal=accessible=>({pages:[{type:'text',testUserPermission:()=>accessible,getFlag:()=>['Negotiation']}],testUserPermission:()=>accessible});
 const a=await load('Negotiation',[journal(false)]);assert.equal(a.api.hasSkillReferenceTables(a.builder),false);
 const b=await load('Negotiation',[journal(true)]);assert.equal(b.api.hasSkillReferenceTables(b.builder),true);
});
