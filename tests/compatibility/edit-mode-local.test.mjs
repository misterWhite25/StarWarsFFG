import test from 'node:test';
import assert from 'node:assert/strict';
import {loadSystemModule} from '../load-system-module.mjs';
import vm from 'node:vm';

test('manual editing is a local sheet choice and never disables shared actor effects', async()=>{
 const updates=[];
 const effect={disabled:false,updateSource(){throw Error('Must not suspend effects');},update(){throw Error('Must not persist effect changes');}};
 const actor={name:'Travis',system:{stats:{soak:{value:7}}},effects:[effect],items:[],update:async data=>updates.push(data),sheet:{render(){}}};
 const sheet={actor,object:actor},otherSheet={actor,object:actor};
 const control={id:'enableEditMode',name:'config.enableEditMode',dataset:{dtype:'Boolean'},checked:true};
 const context=vm.createContext({document:{createElement:()=>({})},game:{user:{id:'gm'},i18n:{localize:s=>s}},
 foundry:{applications:{handlebars:{renderTemplate:async()=>''},api:{DialogV2:{wait:async options=>options.buttons[0].callback(null,null,{element:{querySelectorAll:()=>[control]}})}}}}});
 const module = await loadSystemModule('actors/actor-ffg-options.js',context);
 const options=new module.namespace.default(sheet); options.options.enableEditMode={};
 await options.handler();assert.equal(sheet._manualEditMode,true);assert.equal(otherSheet._manualEditMode,undefined);
 assert.equal(effect.disabled,false);assert.equal(actor.system.stats.soak.value,7);
 assert.ok(updates.every(update=>!('flags.starwarsffg.config.enableEditMode' in update)));
 control.checked=false;await options.handler();assert.equal(sheet._manualEditMode,false);assert.equal(effect.disabled,false);
});

test('actor and item options use defaults without writes and preserve stored false and zero', async () => {
  const context = vm.createContext({foundry:{applications:{api:{}}}});
  for (const path of ['actors/actor-ffg-options.js','items/item-ffg-options.js']) {
    const module = await loadSystemModule(path,context);
    const object = {flags:{},setFlag:assert.fail,update:assert.fail};
    const options = new module.namespace.default({object});
    await options.register('active',{default:true});
    assert.equal(options.options.active.value,true);
    object.flags.starwarsffg = {config:{active:false,limit:0}};
    await options.register('active',{default:true});
    await options.register('limit',{default:3});
    assert.equal(options.options.active.value,false);
    assert.equal(options.options.limit.value,0);
  }
});

test('the item dialog saves all selected options in one document update', async () => {
  const updates=[], controls=[
    {id:'active',name:'config.active',dataset:{dtype:'Boolean'},checked:false},
    {id:'mode',name:'config.mode',dataset:{},value:'2'}
  ];
  const item={uuid:'Item.test',name:'Test',flags:{},getFlag:()=>undefined,update:async data=>updates.push({...data}),sheet:{render(){}}};
  const context=vm.createContext({game:{i18n:{localize:key=>key}},fromUuid:async()=>item,
    document:{createElement:()=>({})},foundry:{applications:{handlebars:{renderTemplate:async()=>''},
    api:{DialogV2:{wait:async options=>options.buttons[0].callback(null,null,{element:{querySelectorAll:()=>controls}})}}}}});
  const module=await loadSystemModule('items/item-ffg-options.js',context);
  const options=new module.namespace.default({object:item,item});
  options.registerMany([{name:'active',options:{default:true}},{name:'mode',options:{default:'0'}}]);
  await options.handler();
  assert.deepEqual(updates,[{'flags.starwarsffg.config.active':false,'flags.starwarsffg.config.mode':'2'}]);
});
