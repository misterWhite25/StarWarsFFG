import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {loadSystemModule} from '../load-system-module.mjs';
import {DocumentAsyncCache} from '../../modules/helpers/document-async-cache.mjs';
import {changedFields,fieldsAffect,identityFields,passengerFields,ownedVehicleFields} from '../../modules/helpers/actor-change-fields.mjs';

const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const get=(object,path)=>path.split('.').reduce((value,key)=>value?.[key],object);
function hooks(){const events=new Map();return {events,on(name,callback){if(!events.has(name))events.set(name,[]);events.get(name).push(callback);},callAll(name,...args){for(const callback of events.get(name)??[])callback(...args);}};}

test('document cache shares work, evicts old entries, retries failure and cannot republish invalidated work',async()=>{
  const cache=new DocumentAsyncCache(2),document={},first=deferred();let calls=0;
  const load=()=>{calls++;return first.promise;};
  const a=cache.get(document,'a',load),b=cache.get(document,'a',load);assert.equal(a,b);await tick();assert.equal(calls,1);
  cache.invalidate(document);const current=cache.get(document,'a',()=>2);first.resolve(1);assert.equal(await a,1);assert.equal(await current,2);assert.equal(await cache.get(document,'a',()=>99),2);
  await cache.get(document,'b',()=>3);await cache.get(document,'c',()=>4);assert.equal(cache.documents.get(document).size,2);
  await assert.rejects(cache.get(document,'bad',()=>Promise.reject(Error('fail'))));assert.equal(await cache.get(document,'bad',()=>5),5);
});

test('change filters cover nested values, dotted paths, parent replacement and deletion, without reacting to wounds',()=>{
  assert.deepEqual(changedFields({flags:{starwarsffg:{'-=vehicleOwners':null}}}),['flags.starwarsffg.vehicleOwners']);
  assert.equal(fieldsAffect({'system.stats.wounds.value':4},identityFields),false);
  assert.equal(fieldsAffect({system:{stats:{strain:{value:3}}}},passengerFields),false);
  assert.equal(fieldsAffect({system:{skills:{Mechanics:{rank:3}}}},passengerFields),true);
  assert.equal(fieldsAffect({'flags.-=starwarsffg':null},ownedVehicleFields),true);
  assert.equal(fieldsAffect({ownership:{}},identityFields),true);assert.equal(fieldsAffect({},identityFields),true);
});

test('sheet display context copies editable actor data without serializing item trees or token metadata',async()=>{
  const context=vm.createContext({foundry:{utils:{deepClone:structuredClone}}});
  const {actorSheetData,actorSheetContext}=(await loadSystemModule('helpers/actor-sheet-data.mjs',context)).namespace;
  const item={id:'item',name:'Blaster',type:'weapon',img:'img',system:{damage:{value:6}},flags:{},toObject(){assert.fail('Item serialized');}};
  const actor={id:'actor',name:'NPC',type:'rival',img:'portrait',system:{stats:{wounds:{value:2}}},flags:{config:{editable:true}},items:[item],toObject(){assert.fail('Full actor serialized');}};
  const data=actorSheetData(actor);data.system.stats.wounds.value=9;assert.equal(actor.system.stats.wounds.value,2);
  assert.equal(data.items[0].system,item.system);assert.equal(data.items[0]._id,'item');assert.equal(data._id,'actor');
  data.flags.config.editable=false;assert.equal(actor.flags.config.editable,true);
  const metadata=actorSheetContext({actor,isEditable:false,options:{editable:false},title:'NPC'});assert.equal(metadata.document,actor);assert.equal(metadata.editable,false);assert.equal(metadata.cssClass,'locked');
});

test('tree descriptions run concurrently, reuse text, isolate permission and language changes, and bypass dynamic checks',async()=>{
  const hook=hooks(),gate=deferred();let calls=0;
  const context=vm.createContext({Hooks:hook,game:{i18n:{lang:'fr'},user:{id:'gm',role:4}},foundry:{applications:{ux:{TextEditor:{enrichHTML:async text=>{calls++;await gate.promise;return '<p>'+text+'</p>';}}}}}});
  const api=(await loadSystemModule('helpers/sheet-text-cache.mjs',context)).namespace,owner={isOwner:true};
  const nodes=Array.from({length:20},(_,index)=>({description:'Talent '+index}));
  const pending=api.enrichTreeDescriptions(owner,nodes);await tick();assert.equal(calls,20);gate.resolve();await pending;
  await api.enrichTreeDescriptions(owner,nodes);assert.equal(calls,20);assert.equal(nodes[2].enrichedDescription,'<p>Talent 2</p>');
  hook.callAll('updateActor',{}, {'system.stats.wounds.value':4});await api.enrichTreeDescriptions(owner,nodes);assert.equal(calls,20);
  nodes[0].description='Edited';await api.enrichTreeDescriptions(owner,nodes);assert.equal(calls,21);
  context.game.i18n.lang='en';await api.enrichedSheetText(owner,'Edited');assert.equal(calls,22);
  owner.isOwner=false;await api.enrichedSheetText(owner,'Edited');assert.equal(calls,23);
  hook.callAll('updateActor',{}, {ownership:{default:0}});await api.enrichedSheetText(owner,'Edited');assert.equal(calls,24);
  for(let i=0;i<2;i++)await api.enrichedSheetText(owner,'@CustomCheck[test] [[1d6]]');assert.equal(calls,26);
});

test('equipment catalogue shares bilingual loads, separates languages, respects permission and invalidates pack edits',async()=>{
  const hook=hooks();let indices=0,downloads=0,permitted=true,network=true;
  const id='swffg-compendium-bilingual-steelers-equipment.en-items';
  const pack={documentName:'Item',collection:id,testUserPermission:()=>permitted,getIndex:async()=>{indices++;return [{_id:'one',type:'weapon',name:'English',img:'image'}];}};
  const context=vm.createContext({Hooks:hook,foundry:{applications:{api:{ApplicationV2:class{}}}},game:{modules:{get:()=>({active:true})},packs:{get:()=>pack},i18n:{lang:'fr',localize:key=>key}},fetch:async()=>{downloads++;if(!network)throw Error('offline');return {ok:true,json:async()=>[{uuid:'Compendium.'+id+'.Item.one',names:{fr:'Français',en:'English'}}]};}});
  const api=(await loadSystemModule('helpers/equipment-picker.mjs',context,{'helpers/inventory-location.js':{possessionData:value=>value},'helpers/medical-item-type.mjs':{medicalItemType:()=>null}})).namespace;
  const [first,second]=await Promise.all([api.equipmentEntries(),api.equipmentEntries()]);assert.equal(first,second);assert.equal(first[0].name,'Français');assert.equal(indices,1);assert.equal(downloads,1);
  context.game.i18n.lang='en';assert.equal((await api.equipmentEntries())[0].name,'English');assert.equal(downloads,2);
  permitted=false;await assert.rejects(api.equipmentEntries());assert.equal(downloads,2);permitted=true;
  hook.callAll('updateItem',{pack:id});await api.equipmentEntries();assert.equal(downloads,3);
  network=false;api.invalidateEquipmentEntries(pack);assert.equal((await api.equipmentEntries())[0].name,'English');assert.equal(downloads,4);
  network=true;await api.equipmentEntries();assert.equal(downloads,5);
});

test('combat scalar updates preserve the sheet and focused draft; minion losses refresh only changed skill dice',async()=>{
  const hook=hooks(),context=vm.createContext({game:{user:{}},Hooks:hook,foundry:{utils:{getProperty:get}}});
  const api=(await loadSystemModule('helpers/combat-sheet-refresh.mjs',context)).namespace;
  const actor={type:'minion',testUserPermission:()=>true,system:{stats:{wounds:{value:0,max:15},strain:{value:1}},quantity:{max:3,value:3},skills:{Gunnery:{rank:2,characteristic:'Agility'},Athletics:{rank:0,characteristic:'Brawn'}},characteristics:{Agility:{value:3},Brawn:{value:2}}}};
  const wound={name:'data.stats.wounds.value',value:'0',defaultValue:'0'},draft={name:'data.stats.strain.value',value:'7',defaultValue:'1'},alive={name:'data.quantity.value',value:'3',defaultValue:'3'};
  const rows=['Gunnery','Athletics'].map(key=>({dataset:{ability:key},querySelector:()=>({replaceChildren(){}})}));
  const root={isConnected:true,ownerDocument:{activeElement:draft},querySelectorAll:selector=>selector==='input[name]'?[wound,draft,alive]:rows};
  const sheet={_ffgCombatMode:true,rendered:true,isEditable:true,element:root,actor};api.captureCombatRefresh(sheet);
  actor.system.stats.wounds.value=6;actor.system.quantity.value=2;actor.system.skills.Gunnery.rank=1;
  const changed=[],helpers={addSkillDicePool:async(data,row)=>changed.push([row.dataset.ability,data.data.skills[row.dataset.ability].rank])};
  const options={renderContext:'updateActor',renderData:{_id:'actor',_stats:{modifiedTime:1},system:{stats:{wounds:{value:6}}}}};
  await api.refreshCombatStats(sheet,options,helpers);assert.equal(wound.value,'6');assert.equal(alive.value,'2');assert.equal(draft.value,'7');assert.deepEqual(changed,[['Gunnery',1]]);
  changed.length=0;await api.refreshCombatStats(sheet,options,helpers);assert.deepEqual(changed,[]);
  for(const settings of [{force:true,...options},{renderContext:'updateItem',renderData:{system:{description:'new'}}},{renderContext:'updateActor',renderData:{ownership:{default:0}}},{renderContext:'updateActor',renderData:{'system.characteristics.Agility.value':4}}])assert.equal(api.canRefreshCombatStats(sheet,settings),false);
  root.isConnected=false;assert.equal(api.canRefreshCombatStats(sheet,options),false);
  root.isConnected=true;actor.type='vehicle';actor.flags={starwarsffg:{vehicleMinionGroup:{enabled:true}}};api.captureCombatRefresh(sheet);assert.equal(api.canRefreshCombatStats(sheet,{renderContext:'updateActor',renderData:{'system.stats.hullTrauma.value':4}}),false);
});
