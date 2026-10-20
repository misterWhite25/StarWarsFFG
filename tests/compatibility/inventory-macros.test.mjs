import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
const read=file=>readFile(new URL('../../modules/'+file,import.meta.url),'utf8');
async function helpers(actor, warnings) {
 const context=vm.createContext({game:{actors:{get:id=>id==='actor'?actor:undefined},i18n:{localize:key=>key}},ui:{notifications:{warn:message=>warnings.push(message)}}});
 const module=new vm.SourceTextModule(await read('helpers/dice-helpers.js'),{context});
 await module.link(specifier=>new vm.SyntheticModule(specifier.includes('weapon-selection')?['supportsWeaponSelection','missingAccurateBoost','prepareRememberedWeapon']:specifier.includes('pool.js')?['DicePoolFFG']:['default'],function(){
  if(specifier.includes('weapon-selection')){this.setExport('supportsWeaponSelection',()=>false);this.setExport('missingAccurateBoost',()=>0);this.setExport('prepareRememberedWeapon',()=>{});}
  else if(specifier.includes('pool.js'))this.setExport('DicePoolFFG',class{constructor(data){Object.assign(this,data);}upgrade(){}});
  else this.setExport('default',class{});
 },{context}));
 await module.evaluate();return module.namespace.default;
}
test('weapon macros refuse possessions before sheet reads, flag writes or pool calculations; retrieving restores use',async()=>{
 const warnings=[],calls={sheet:0,write:0,pool:0,dialog:0};
 const item={id:'gun',uuid:'Actor.actor.Item.gun',type:'weapon',name:'Blaster',flags:{},system:{skill:{value:'Ranged: Light'}},setFlag:async()=>calls.write++};
 const actor={items:new Map([['gun',item]]),system:{skills:{'Ranged: Light':{rank:1,characteristic:'Agility'}},characteristics:{Agility:{value:2}}},sheet:{getData:async()=>{calls.sheet++;return {};}}};
 const api=await helpers(actor,warnings);
 api.getWeaponStatus=()=>({setback:0,difficulty:0});api.getDefenseDice=()=>0;api.getModifiers=async pool=>{calls.pool++;return pool;};api.displayRollDialog=()=>calls.dialog++;
 await api.rollItem('gun','actor');assert.deepEqual(calls,{sheet:1,write:1,pool:1,dialog:1});
 item.flags={starwarsffg:{inventoryLocation:'possession'}};
 await api.rollItem('gun','actor');assert.deepEqual(calls,{sheet:1,write:1,pool:1,dialog:1});assert.equal(warnings.length,1);assert.match(warnings[0],/Possession/);
 item.flags.starwarsffg.inventoryLocation='carried';
 await api.rollItem('gun','actor');assert.deepEqual(calls,{sheet:2,write:2,pool:2,dialog:2});
 await api.rollItem('deleted','actor');await api.rollItem('gun','deleted');assert.deepEqual(calls,{sheet:2,write:2,pool:2,dialog:2});
});
test('an indeterminate standalone talent cost does not incorrectly require a career',async()=>{
 const module=new vm.SourceTextModule(await read('helpers/creation-guide.js'));await module.link(()=>{});await module.evaluate();
 const api=module.namespace,actor={system:{experience:{available:50}},items:[{type:'career'}]};
 assert.doesNotMatch(api.acquisitionNotice(actor,{type:'talent',name:'Talent'},-1),/ajoutez une carrière/);
 assert.match(api.acquisitionNotice({...actor,items:[]},{type:'specialization',name:'Assassin'},-1),/ajoutez une carrière/);
 assert.match(api.acquisitionNotice(actor,{type:'talent',name:'Talent'},10),/Achat : 10 XP/);
 assert.match(api.acquisitionNotice(actor,{type:'talent',name:'<img onerror=alert(1)>'},-1),/&lt;img/);
});
