import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
const read = file => readFile(new URL('../../modules/'+file,import.meta.url),'utf8');

test('V2 accepts Item documents and legacy drag data, and protects locked sheets', async () => {
  const calls=[];
  class Legacy { _onDropItem(event,data) {calls.push(data);return this._onDropItemCreate({name:data.uuid});} }
  const context=vm.createContext({foundry:{applications:{sheets:{ActorSheetV2:class {}},api:{HandlebarsApplicationMixin:C=>C}}}});
  const mod=new vm.SourceTextModule(await read('actors/actor-sheet-ffg-v2.js'),{context});
  await mod.link(async spec => spec.includes('sheet-portrait') ? new vm.SourceTextModule(await read('helpers/sheet-portrait.js'),{context}) : new vm.SyntheticModule(['ActorSheetFFG'],function(){this.setExport('ActorSheetFFG',Legacy);},{context}));
  await mod.evaluate();
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
  const context=vm.createContext({Actor:class {}});
  const mod=new vm.SourceTextModule(await read('actors/actor-ffg.js'),{context});
  await mod.link(()=>new vm.SyntheticModule(['default','getPreparedActiveEffectChanges'],function(){this.setExport('default',class {});this.setExport('getPreparedActiveEffectChanges',()=>[]);},{context}));
  await mod.evaluate();
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
  const mod=new vm.SourceTextModule(await read('actors/actor-sheet-ffg-v2.js'),{context});
  await mod.link(async spec=>spec.includes('sheet-portrait')?new vm.SourceTextModule(await read('helpers/sheet-portrait.js'),{context}):new vm.SyntheticModule(['ActorSheetFFG'],function(){this.setExport('ActorSheetFFG',class {});},{context}));
  await mod.evaluate();
  let saved;
  const form={'data.stats.wounds.value':null,'data.stats.strain.value':0,'data.stats.soak.value':9,'data.stats.wounds.max':NaN,'data.stats.encumbrance.max':12};
  const sheet={isEditable:true,actor:{overrides:{'system.stats.soak.value':9}},form:{querySelectorAll:()=>Object.keys(form).map(name=>({name,disabled:name==='data.stats.encumbrance.max'}))},_updateObject:(_event,data)=>{saved=data;}};
  await mod.namespace.ActorSheetFFGV2._onSubmitForm.call(sheet,{},null,{object:form});
  assert.deepEqual(Object.keys(saved),['data.stats.strain.value']);assert.equal(saved['data.stats.strain.value'],0);
});
