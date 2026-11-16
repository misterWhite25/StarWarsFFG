import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
test('imported modifications without attributes do not abort weapon pool preparation',async()=>{
 const context=vm.createContext({});
 const source=await readFile(new URL('../../modules/helpers/modifiers.js',import.meta.url),'utf8');
 const module=new vm.SourceTextModule(source,{context});
 await module.link(()=>new vm.SyntheticModule(['default','DicePoolFFG','getActiveEffectChanges','activeEffectChangesUpdate','deleteDataField'],function(){
   for(const name of ['default','DicePoolFFG','getActiveEffectChanges','activeEffectChangesUpdate','deleteDataField'])this.setExport(name,()=>{});
 },{context}));await module.evaluate();
 const helper=module.namespace.default;
 for(const attributes of [undefined,null,{}, {empty:null}]) {
   assert.equal(helper.getCalculatedValueFromCurrentAndArray({system:{attributes}},[],'Add Boost','Roll Modifiers'),0);
 }
 const quality={system:{rank:2,attributes:{empty:null,boost:{mod:'Add Boost',modtype:'Roll Modifiers',value:1}}}};
 assert.equal(helper.getCalculatedValueFromCurrentAndArray(quality,[],'Add Boost','Roll Modifiers'),2);
});
