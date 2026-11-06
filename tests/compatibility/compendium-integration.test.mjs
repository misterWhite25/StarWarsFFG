import {loadActorModule, loadSystemModule} from '../load-system-module.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';

test('V2 accepts Item documents and legacy drag data, and protects locked sheets', async () => {
  const calls=[];
  class Legacy { _onDropItem(event,data) {calls.push(data);return this._onDropItemCreate({name:data.uuid});} }
  const context=vm.createContext({foundry:{applications:{sheets:{ActorSheetV2:class {}},api:{HandlebarsApplicationMixin:C=>C}}}});
  const mod = await loadSystemModule('actors/actor-sheet-ffg-v2.js', context, {
    'actors/actor-sheet-ffg.js': {ActorSheetFFG: Legacy}
  });
  const sheet=Object.create(mod.namespace.ActorSheetFFGV2.prototype);
  const created=[];sheet.actor={isOwner:true,createEmbeddedDocuments:(type,data)=>{assert.equal(type,'Item');created.push(...data);return data;}};sheet.isEditable=true;
  await sheet._onDropItem({}, {documentName:'Item',toDragData:()=>({type:'Item',uuid:'Compendium.weapon'})});
  await sheet._onDropItem({}, {type:'Item',uuid:'Compendium.armour'});
  assert.deepEqual(calls.map(x=>x.uuid),['Compendium.weapon','Compendium.armour']);
  assert.deepEqual(created.map(x=>x.name),['Compendium.weapon','Compendium.armour']);
  await sheet._onDropItemCreate([{name:'one'},{name:'two'}]);assert.equal(created.length,4);
  sheet.isEditable=false;await sheet._onDropItem({},{});await sheet._onDropItemCreate({});
  sheet.isEditable=true;sheet.actor.isOwner=false;await sheet._onDropItem({},{});await sheet._onDropItemCreate({});
  assert.equal(calls.length,2);assert.equal(created.length,4);
});

test('actor effects feed weapon damage on every preparation without accumulating bonuses', async () => {
  const context=vm.createContext({Actor:class {}, game: {}});
  const mod = await loadActorModule(context);
  const actor=new mod.namespace.ActorFFG();actor.type='homestead';actor.system={};
  actor._prepareSharedData=()=>{};
  let brawn=3,damage=0,calls=0;
  actor.items=[{type:'weapon',system:{characteristic:{value:'Brawn'}},prepareData(){damage=2+brawn;calls++;}},
    {type:'weapon',system:{},prepareData(){throw Error('Unrelated weapon recomputed');}},
    {type:'gear',system:{characteristic:{value:'Brawn'}},prepareData(){throw Error('Unrelated item recomputed');}}];
  actor.prepareDerivedData();assert.equal(damage,5);
  brawn=4;actor.prepareDerivedData();assert.equal(damage,6);
  actor.prepareDerivedData();assert.equal(damage,6);assert.equal(calls,3);
});

test('actor form preserves derived overrides, invalid numbers and valid zeroes', async () => {
  const context=vm.createContext({foundry:{utils:{flattenObject:x=>x},applications:{sheets:{ActorSheetV2:class {}},api:{HandlebarsApplicationMixin:C=>C}}}});
  const mod = await loadSystemModule('actors/actor-sheet-ffg-v2.js', context, {
    'actors/actor-sheet-ffg.js': {ActorSheetFFG: class {}}
  });
  let saved;
  const form={'data.stats.wounds.value':null,'data.stats.strain.value':0,'data.stats.soak.value':9,'data.stats.wounds.max':NaN,'data.stats.encumbrance.max':12};
  const sheet={isEditable:true,actor:{overrides:{'system.stats.soak.value':9}},form:{querySelectorAll:()=>Object.keys(form).map(name=>({name,disabled:name==='data.stats.encumbrance.max'}))},_updateObject:(_event,data)=>{saved=data;}};
  await mod.namespace.ActorSheetFFGV2._onSubmitForm.call(sheet,{},null,{object:form});
  assert.deepEqual(Object.keys(saved),['data.stats.strain.value']);assert.equal(saved['data.stats.strain.value'],0);
});

test('the vehicle sheet reads past voyages when the travel package is disabled', async () => {
  const scope = 'swffg-compendium-bilingual-steelers-core_rule';
  const actor = {uuid:'Actor.ship', type:'vehicle', isOwner:true, items:[], system:{stats:{consumables:{value:3,duration:'days'}}},
    flags:{[scope]:{voyageResources:{resources:{hours:24},history:{a:{id:'a',cost:{maintenance:50},
      breakdown:{title:'Damaged panel',description:'Panel offline',repair:{total:10}}}}}}},
    getFlag(key, flag) {
      assert.equal(key, 'starwarsffg');
      return this.flags[key]?.[flag];
    }};
  const context = vm.createContext({structuredClone, game:{user:{isGM:true}, i18n:{localize:k=>k,lang:'fr'},
    settings:{settings:new Map(), get(){throw Error('Unregistered setting');}}},
    foundry:{utils:{deepClone:structuredClone},applications:{sheets:{ActorSheetV2:class{}},
      api:{HandlebarsApplicationMixin:C=>C},ux:{TextEditor:{implementation:{enrichHTML:async value=>value}}}}}});
  const mod = await loadSystemModule('actors/actor-sheet-ffg-v2.js', context, {
    'actors/actor-sheet-ffg.js': {ActorSheetFFG:class {async getData(){return {};}}}
  });
  const sheet = Object.create(mod.namespace.ActorSheetFFGV2.prototype);
  Object.assign(sheet,{actor, isEditable:true, position:{width:900,height:700}, id:'test-ship'});
  const data = await sheet._prepareContext({});
  assert.equal(data.vehicleConsumables.currentAmount, 1);
  assert.equal(data.vehicleMalfunctions[0].id, 'trip:a');
  assert.equal(data.vehicleJourneys[0].id, 'trip:a');
  assert.equal(data.vehicleMaintenance.amount, 60);
});

test('vehicle stock edits write only their ledger, and a stale revision cannot overwrite it', async () => {
  const scope = 'swffg-compendium-bilingual-steelers-core_rule';
  const saved = [], warnings = [];
  const context = vm.createContext({structuredClone, game:{user:{isGM:true}},
    ui:{notifications:{warn:m=>warnings.push(m)}}, foundry:{utils:{flattenObject:x=>x},applications:{sheets:{ActorSheetV2:class{}},api:{HandlebarsApplicationMixin:C=>C}}}});
  const mod = await loadSystemModule('actors/actor-sheet-ffg-v2.js', context, {
    'actors/actor-sheet-ffg.js': {ActorSheetFFG:class {}}
  });
  const actor = {type:'vehicle', overrides:{}, system:{stats:{consumables:{value:4,duration:'days'}}},
    flags:{[scope]:{voyageResources:{revision:1,resources:{hours:24,fuel:8}}}}, update:async data=>saved.push(data)};
  const sheet = {actor,isEditable:true,render(){}};
  const submit = (name,revision) => mod.namespace.ActorSheetFFGV2._onSubmitForm.call(sheet,{target:{name}},null,{object:{
    name:'Old ship name', vehicleConsumablesAmount:'2', vehicleFuelCurrent:'5', vehicleConsumablesRevision:revision, vehicleFuelRevision:revision}});
  await submit('vehicleConsumablesAmount',1);
  await submit('vehicleFuelCurrent',1);
  await submit('vehicleFuelCurrent',0);
  assert.equal(saved.length,2);
  assert.equal(warnings.length,1);
  const ledger = 'flags.' + scope + '.voyageResources';
  assert.deepEqual({...saved[0]},{[ledger+'.resources.hours']:48,[ledger+'.revision']:2});
  assert.deepEqual({...saved[1]},{[ledger+'.resources.fuel']:5,[ledger+'.revision']:2});
});
