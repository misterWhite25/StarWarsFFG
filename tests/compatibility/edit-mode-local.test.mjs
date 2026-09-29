import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

test('manual editing is a local sheet choice and never disables shared actor effects', async()=>{
 const updates=[];
 const effect={disabled:false,updateSource(){throw Error('Must not suspend effects');},update(){throw Error('Must not persist effect changes');}};
 const actor={name:'Travis',system:{stats:{soak:{value:7}}},effects:[effect],items:[],update:async data=>updates.push(data),sheet:{render(){}}};
 const sheet={actor,object:actor},otherSheet={actor,object:actor};
 const control={id:'enableEditMode',name:'config.enableEditMode',dataset:{dtype:'Boolean'},checked:true};
 const context=vm.createContext({document:{createElement:()=>({})},game:{user:{id:'gm'},i18n:{localize:s=>s}},
 $:()=>({find:()=>[control]}),foundry:{applications:{handlebars:{renderTemplate:async()=>''},api:{DialogV2:{wait:async options=>options.buttons[0].callback(null,null,{element:{}})}}}}});
 const module=new vm.SourceTextModule(await readFile(new URL('../../modules/actors/actor-ffg-options.js',import.meta.url),'utf8'),{context});
 await module.link(()=>{throw Error('Unexpected import');});await module.evaluate();
 const options=new module.namespace.default(sheet); options.options.enableEditMode={};
 await options.handler();assert.equal(sheet._manualEditMode,true);assert.equal(otherSheet._manualEditMode,undefined);
 assert.equal(effect.disabled,false);assert.equal(actor.system.stats.soak.value,7);
 assert.ok(updates.every(update=>!('flags.starwarsffg.config.enableEditMode' in update)));
 control.checked=false;await options.handler();assert.equal(sheet._manualEditMode,false);assert.equal(effect.disabled,false);
});
