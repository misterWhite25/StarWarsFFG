import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {loadSystemModule} from '../load-system-module.mjs';
import {sheetUiBoundaries} from '../sheet-ui-boundaries.mjs';

const formBoundary = {'applications/form-application-v2.js': {FormApplicationV2: class {}}};

test('settings dialogs preserve numeric field types, booleans, choices and ranges', async () => {
  const definitions = new Map([
    ['starwarsffg.maxSkill', {namespace:'starwarsffg',key:'maxSkill',type:Number}],
    ['starwarsffg.maxAttribute', {namespace:'starwarsffg',key:'maxAttribute',type:Number,range:{min:1,max:10,step:1}}],
    ['starwarsffg.enableSoakCalc', {namespace:'starwarsffg',key:'enableSoakCalc',type:Boolean}],
    ['starwarsffg.talentSorting', {namespace:'starwarsffg',key:'talentSorting',type:String,choices:{a:'A'}}],
    ['other.maxSkill', {namespace:'other',key:'maxSkill',type:Number}],
  ]);
  const context = vm.createContext({Number,Boolean,String,game:{user:{can:()=>true},system:{title:'Star Wars FFG'},i18n:{localize:key=>key},settings:{settings:definitions,get:()=>3}},foundry:{utils:{duplicate:value=>({...value})}}});
  const {actorSettings} = (await loadSystemModule('settings/ui-settings.js',context,formBoundary)).namespace;
  const settings = new actorSettings().getData({}).data.system.settings;
  assert.equal(settings.find(row=>row.key==='maxSkill').type,'Number');
  assert.equal(settings.find(row=>row.key==='maxAttribute').isRange,definitions.get('starwarsffg.maxAttribute').range);
  assert.equal(settings.find(row=>row.key==='enableSoakCalc').isCheckbox,true);
  assert.equal(settings.find(row=>row.key==='talentSorting').isSelect,true);
  assert.equal(settings.length,4);
  assert.equal(definitions.get('starwarsffg.maxSkill').type,Number);
});

test('Destiny setting updates work when the tracker is absent and refresh it when present', async () => {
  const registry = new Map(), values = new Map([['dPoolLight',2],['dPoolDark',3]]);
  let display = null, refreshes = 0;
  const context = vm.createContext({window:{location:{reload(){}}},canvas:{groupmanager:{window:{render(){refreshes++;}}}},document:{getElementById:()=>display},game:{i18n:{localize:key=>key},settings:{register:(_scope,key,options)=>registry.set(key,options),registerMenu(){},get:(_scope,key)=>values.get(key)??key}},foundry:{utils:{debounce:fn=>fn}}});
  const SettingsHelpers = (await loadSystemModule('settings/settings-helpers.js',context,formBoundary)).namespace.default;
  SettingsHelpers.initLevelSettings();
  SettingsHelpers.readyLevelSetting();
  assert.equal(registry.has('consumeHealingItem'),false);
  assert.equal(registry.has('HealingItemAction'),false);
  for (const key of ['dPoolLight','dPoolDark']) {
    assert.doesNotThrow(()=>registry.get(key).onChange());
    display = {setAttribute(name,value){this[name]=value;},innerHTML:''};
    registry.get(key).onChange();
    assert.equal(display['data-value'],values.get(key));
    assert.match(display.innerHTML,new RegExp('^'+values.get(key)+'<span>'));
    display = null;
  }
  assert.equal(refreshes,4);
});

for (const kind of ['actor','item']) test(`${kind} header menu collects module controls once and preserves action groups`, async () => {
  class Base {
    *_headerControlButtons() {
      this.hookCalls = (this.hookCalls??0)+1;
      yield {action:'ffgSystem',label:'System '+this.hookCalls,onClick:()=>this.clicked='system'};
      yield {action:'moduleAction',label:'Module '+this.hookCalls,onClick:()=>this.clicked='module'};
    }
    *_headerControlContextEntries() {
      for (const {label,onClick} of this._headerControlButtons()) yield {label,onClick};
    }
  }
  const name = kind==='actor'?'Actor':'Item';
  const context = vm.createContext({foundry:{applications:{sheets:{[name+'SheetV2']:Base},api:{HandlebarsApplicationMixin:C=>C}}}});
  const entry = (kind==='actor'?'actors/':'items/')+kind+'-sheet-ffg';
  const mod = await loadSystemModule(entry+'-v2.js',context,{...sheetUiBoundaries,[entry+'.js']:{[name+'SheetFFG']:class {}}});
  const sheet = Object.create(mod.namespace[name+'SheetFFGV2'].prototype);
  const entries = Array.from(sheet._headerControlContextEntries());
  assert.equal(sheet.hookCalls,1);
  assert.deepEqual(entries.map(row=>row.label),['Module 1','System 1']);
  assert.deepEqual(entries.map(row=>row.group),['standard-header','starwarsffg-header']);
  entries[0].onClick();assert.equal(sheet.clicked,'module');
  entries[1].onClick();assert.equal(sheet.clicked,'system');
});
