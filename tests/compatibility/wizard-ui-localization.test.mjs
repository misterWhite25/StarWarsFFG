import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {loadSystemModule} from '../load-system-module.mjs';
import {systemI18n} from '../system-i18n.mjs';

async function fixture(lang){
 const i18n=await systemI18n(lang),tables=[],selects=[],warnings=[];
 class Base{async _onRender(){} _prepareTabs(){return {};}}
 class DataTable{constructor(selector,options){tables.push({selector,options});}on(){return this;}buttons(){return {trigger(){}};}}
 class SlimSelect{constructor(options){selects.push(options);}setSelected(){}}
 const chain={on(){return this;},off(){return this;},next(){return this;},show(){return this;},find(){return this;},each(){return this;}};
 const game={i18n,user:{name:'R2-D2',isGM:true},users:[{active:true,isGM:true}],settings:{get:()=>0},socket:{on(){}},modules:new Map()};
 const context=vm.createContext({game,DataTable,SlimSelect,$:()=>chain,CONFIG:{FFG:{}},ui:{notifications:{warn:message=>warnings.push(message)}}});
 context.foundry={utils:{escapeHTML:value=>value},applications:{api:{ApplicationV2:Base,HandlebarsApplicationMixin:C=>C}}};
 const {CharacterCreator}=(await loadSystemModule('helpers/character-creator.js',context,{
  'items/item-sheet-ffg-v2.js':{ItemSheetFFGV2:class{}},
    'popout-editor.js':{default:class{}},
    'applications/legacy-dialog-v2.js':{LegacyDialogV2:class{}},'helpers/effects.js':{default:{}},
  'helpers/actor-helpers.js':{xpLogEarn(){},xpLogSpend(){}},'helpers/dice-helpers.js':{default:{}},
  'actors/actor-sheet-ffg.js':{sortDataBy(){},addIfNotExist(){}},
 })).namespace;
 return {wizard:new CharacterCreator(),CharacterCreator,i18n,tables,selects,context,warnings};
}

for(const lang of ['en','fr']){
 test(`${lang}: wizard table and select controls are localized while shop filters retain their identifiers`,async()=>{
  const f=await fixture(lang);
  const section={querySelector:id=>id};
  for (const id of ['culture','hook','force_attitude','startingBonus']) f.wizard.createStepSelect(section,id,null,()=>{});
  f.wizard.createGearTable(section);
  assert.equal(f.tables.length,1);assert.equal(f.selects.length,4);
  for(const {options}of f.tables){
   assert.equal(options.language.search,lang==='en'?'Search:':'Rechercher :');
   assert.match(options.language.info,/_START_/);assert.match(options.language.info,/_END_/);assert.match(options.language.info,/_TOTAL_/);
   assert.equal(options.language.paginate.next,lang==='en'?'Next':'Suivante');
  }
  for(const selector of f.selects)assert.equal(selector.settings.searchPlaceholder,lang==='en'?'Search':'Rechercher');
  assert.deepEqual(f.selects.map(selector=>selector.select),['#culture','#hook','#force_attitude','#startingBonus']);
  const buttons=f.tables.find(table=>table.selector==='#buy_gear').options.layout.topStart.buttons;
  assert.deepEqual(Array.from(buttons,button=>button.text.replace(/^.*<\/i> /,'')),['SWFFG.ItemsWeapons','SWFFG.ItemsArmor','SWFFG.ItemsGear','TYPES.Item.itemattachment','TYPES.Item.itemmodifier'].map(f.i18n.localize));
  const filters=[];
  for (const button of buttons) {
   const set = {attr(){}};
   const group = {active(){return this;},nodes(){return set;},node(){return set;}};
   const dt = {column:()=>({visible(){},search:value=>({draw(){filters.push(value);}})}),columns:{adjust(){}},buttons:()=>group,button:()=>group};
   await button.action(null,dt);
  }
  assert.deepEqual(filters,['weapon','armour','gear','itemattachment','itemmod']);
  assert.deepEqual(Array.from(f.CharacterCreator.TABS.primary.tabs,tab=>tab.id),['background','species','career','specialization','xp_spend','motivation','gear','review']);
  assert.equal(f.i18n.localize(f.CharacterCreator.TABS.primary.tabs[0].label),lang==='en'?'Background and Starting Choices':'Historique et choix de départ');
 });

 test(`${lang}: wizard obligation label is translated separately from its storage key`,async()=>{
  const f=await fixture(lang);f.wizard.tabGroups={primary:'background'};f.wizard.compendiumData={availableBackgrounds:{}};f.wizard.startingBonusForHTML=()=>[];
  const context=await f.wizard._prepareContext();
  assert.equal(context.obligationKey,'morality');assert.equal(context.obligationLabel,lang==='en'?'Morality':'Moralité');
 });

 test(`${lang}: creation guide and acquisition notice preserve escaped names and XP values`,async()=>{
  const i18n=await systemI18n(lang),context=vm.createContext({game:{i18n}});
  const api=(await loadSystemModule('helpers/creation-guide.js',context)).namespace;
  const actor={name:'<R2-D2>',system:{experience:{available:50,total:100}},items:[{name:'<Human>',type:'species'}]};
  const before=JSON.stringify(actor),html=api.creationGuideHTML(actor);
  assert.match(html,/&lt;R2-D2&gt;/);assert.match(html,/&lt;Human&gt;/);assert.doesNotMatch(html,/<R2-D2>|<Human>|\u2014/);
  assert.match(html,lang==='en'?/Available XP: <strong>50<\/strong>/:/XP disponibles : <strong>50<\/strong>/);
  assert.match(html,/20 XP/);assert.match(html,/30 XP/);
  const notice=api.acquisitionNotice(actor,{name:'<Assassin>',type:'specialization'},20);
  assert.match(notice,/&lt;Assassin&gt;/);assert.match(notice,lang==='en'?/Purchase: 20 XP. Available: 50 XP./:/Achat : 20 XP. Disponibles : 50 XP./);
  const blocked=api.acquisitionNotice(actor,{name:'Assassin',type:'specialization'},NaN);
  assert.match(blocked,lang==='en'?/add a career/:/ajoutez une carrière/);
  assert.equal(JSON.stringify(actor),before);
 });
}
