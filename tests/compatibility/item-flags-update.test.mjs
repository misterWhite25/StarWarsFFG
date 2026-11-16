import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import {possessionUpdate} from '../../modules/helpers/inventory-location.js';
async function load(){
 let utils;try{utils=await import('/home/tonio2581/foundry-v14/common/utils/helpers.mjs');}catch{return null;}
 const {expandObject,mergeObject}=utils;
 class Item {
  constructor(){this._source={flags:{custom:{preserve:true},clickfromparent:'legacy'},system:{quantity:{value:5},equippable:{equipped:true}}};this.flags=this._source.flags;this.system=this._source.system;}
  async update(data,options){this.received=expandObject(data);this.options=options;mergeObject(this._source,this.received);return this;}
 }
 const context=vm.createContext({Item,structuredClone,foundry:{utils:{deepClone:structuredClone,mergeObject}}});
 const helper=new vm.SourceTextModule(await fs.readFile(new URL('../../modules/helpers/item-helpers.js',import.meta.url),'utf8'),{context});
 await helper.link(()=>new vm.SyntheticModule(['default','getActiveEffectChanges','activeEffectChangesUpdate','deleteDataField'],function(){for(const key of ['default','getActiveEffectChanges','activeEffectChangesUpdate','deleteDataField'])this.setExport(key,()=>{});},{context}));await helper.evaluate();
 const module=new vm.SourceTextModule(await fs.readFile(new URL('../../modules/items/itembase-ffg.js',import.meta.url),'utf8'),{context});await module.link(()=>helper);await module.evaluate();
 return {ItemBase:module.namespace.default,expandObject};
}
test('real Foundry expansion demonstrates why an appended empty flags block discards a possession update',async(t)=>{
 const runtime=await load();if(!runtime)return t.skip('Local Foundry runtime unavailable');
 const broken=runtime.expandObject({...possessionUpdate(true),flags:{}});
 assert.equal(broken.flags.starwarsffg,undefined);
});
test('real item wrapper preserves flattened possession flags, quantities, metadata and update return value',async(t)=>{
 const runtime=await load();if(!runtime)return t.skip('Local Foundry runtime unavailable');
 const item=new runtime.ItemBase(),data=possessionUpdate(true),before=structuredClone(data),options={render:false};
 assert.equal(await item.update(data,options),item);
 assert.equal(item.flags.starwarsffg.inventoryLocation,'possession');assert.equal(item.system.equippable.equipped,false);assert.equal(item.system.quantity.value,5);
 assert.equal(item.flags.clickfromparent,'legacy');assert.equal(item.flags.custom.preserve,true);assert.equal(item.options,options);assert.deepEqual(data,before);
 await item.update(possessionUpdate(false));assert.equal(item.flags.starwarsffg.inventoryLocation,'carried');assert.equal(item.system.quantity.value,5);
});
test('talent and other dotted flags survive the same wrapper without overwriting an explicit click flag',async(t)=>{
 const runtime=await load();if(!runtime)return t.skip('Local Foundry runtime unavailable');
 const item=new runtime.ItemBase();
 await item.update({'flags.starwarsffg.juryRigged':{effect:'damage'},'flags.clickfromparent':false});
 assert.equal(item.flags.starwarsffg.juryRigged.effect,'damage');assert.equal(item.flags.clickfromparent,false);
 await item.update({flags:{starwarsffg:{reviewedTalentChoices:{_self:{skills:['Charm']}}}}});
 assert.deepEqual(item.flags.starwarsffg.reviewedTalentChoices._self.skills,['Charm']);assert.equal(item.flags.custom.preserve,true);
 await item.update({'system.quantity.value':4});assert.equal(item.system.quantity.value,4);assert.equal(item.flags.starwarsffg.juryRigged.effect,'damage');
});
