import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
test('a click on the rendered talent button opens the normal Hard Mechanics dialog despite DialogV2 serialization',async()=>{
 class Element{
  constructor(tag){this.tag=tag;this.children=[];this.attrs=new Map();this.events={};}
  set className(v){this.attrs.set('class',v);}get className(){return this.attrs.get('class')??'';}
  get attributes(){return [...this.attrs];}setAttribute(k,v){this.attrs.set(k,v);}
  append(...nodes){this.children.push(...nodes);}replaceChildren(...nodes){this.children=[...nodes];}
  addEventListener(k,fn){this.events[k]=fn;}querySelectorAll(){return [];}
  clone(){const copy=new Element(this.tag);copy.attrs=new Map(this.attrs);copy.textContent=this.textContent;copy.children=this.children.map(n=>n.clone?n.clone():{...n});return copy;}
 }
 const calls=[],errors=[];
 const context=vm.createContext({console,ui:{notifications:{error:message=>errors.push(message)}},game:{i18n:{localize:k=>k}},document:{createElement:tag=>new Element(tag),createTextNode:text=>({textContent:text})},foundry:{applications:{ux:{TextEditor:{enrichHTML:async text=>text}},api:{DialogV2:class{
  constructor(config){assert.equal(config.content.attributes.length,0);this.host=new Element('div');this.host.children=config.content.children.map(n=>n.clone());this.element={querySelector:selector=>selector==='.dialog-content'?this.host:null};}
  async render(){this.rendered=true;return this;}async close(){this.rendered=false;this.closed=true;}
 }}}}});
 const dice=new vm.SyntheticModule(['default'],function(){this.setExport('default',{rollSkillDirect:async(...args)=>{calls.push(args);return {rendered:true};}});},{context});await dice.link(()=>{});await dice.evaluate();
 const state=new vm.SourceTextModule(await fs.readFile(new URL('../../modules/helpers/reviewed-talent-state.js',import.meta.url),'utf8'),{context});await state.link(()=>{});await state.evaluate();
 const module=new vm.SourceTextModule(await fs.readFile(new URL('../../modules/helpers/triggered-talents.js',import.meta.url),'utf8'),{context,importModuleDynamically:async spec=>{assert.equal(spec,'./dice-helpers.js');return dice;}});await module.link(async spec=>spec.includes('legacy-text-format')?new vm.SourceTextModule(await fs.readFile(new URL('../../modules/helpers/legacy-text-format.js',import.meta.url),'utf8'),{context}):state);await module.evaluate();
 const actor={id:'a',isOwner:true,items:[{id:'bad',type:'talent',name:'Défaut de motivateur',system:{description:'Test de Mécanique Difficile',ranks:{ranked:false}}}],system:{characteristics:{Intellect:{value:3}},skills:{Mechanics:{rank:2,value:'Mechanics',label:'Mécanique',characteristic:'Intellect',boost:1}}}};
 const sheet={actor};await module.namespace.showTriggeredTalents(sheet);
 const body=sheet._triggeredTalentsWindow.host.children[0];
 const button=body.children.find(n=>n.className==='ffg-triggered-talent').children.find(n=>n.tag==='button');
 assert.equal(typeof button.events.click,'function','visible button must retain its click handler after Foundry reparses content');
 await button.events.click({preventDefault(){},stopPropagation(){}});
 assert.deepEqual(errors,[]);assert.equal(calls.length,1);assert.equal(calls[0][0].rank,2);assert.equal(calls[0][0].boost,1);assert.equal(calls[0][1].value,3);assert.equal(calls[0][2],3);assert.equal(calls[0][3].document,actor);assert.equal(calls[0][6].skillKey,'Mechanics');assert.equal(sheet._triggeredTalentsWindow.closed,true);assert.equal(button.disabled,false);
});
