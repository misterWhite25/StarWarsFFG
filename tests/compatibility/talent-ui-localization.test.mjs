import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {loadSystemModule} from '../load-system-module.mjs';
import {systemI18n} from '../system-i18n.mjs';

for(const lang of ['en','fr']){
 test(`${lang}: talent skill choices are localized without changing selected skill identifiers`,async()=>{
  const i18n=await systemI18n(lang);let prompt;
  const actor={items:[],system:{skills:{Charm:{label:'SWFFG.SkillsNameCharm',type:'Social'},Coercion:{label:'SWFFG.SkillsNameCoercion',type:'Social'}}}};
  const context=vm.createContext({game:{i18n},foundry:{applications:{api:{DialogV2:{prompt:async options=>{prompt=options;return null;}}}}}});
  const ui=(await loadSystemModule('helpers/reviewed-talent-ui.js',context)).namespace;
  assert.equal(await ui.chooseTalentSkills(actor,'wellRounded'),null);
  assert.equal(prompt.window.title,lang==='en'?'Well Rounded - career skills':'Accompli - compétences de carrière');
  assert.match(prompt.content,/name="skill0"/);assert.match(prompt.content,/name="skill1"/);
  assert.match(prompt.content,/value="Charm"/);assert.match(prompt.content,/value="Coercion"/);
  const state=(await loadSystemModule('helpers/reviewed-talent-state.js',context)).namespace;
  assert.throws(()=>state.validateTalentChoice(actor,'wellRounded',['Charm','Charm']),lang==='en'?/Invalid skill choice/:/Choix de compétences invalide/);
  const choice=state.validateTalentChoice(actor,'wellRounded',['Charm','Coercion']);
  assert.deepEqual(Array.from(choice.skills),['Charm','Coercion']);assert.equal(choice.kind,'wellRounded');
 });

 test(`${lang}: empty choice markup and talent summary totals use the selected catalog`,async()=>{
  const i18n=await systemI18n(lang),context=vm.createContext({game:{i18n}});
  const state=(await loadSystemModule('helpers/reviewed-talent-state.js',context)).namespace;
  const talent={id:'t',type:'talent',name:'Well Rounded',system:{},flags:{}};
  const actor={items:new Map([['t',talent]]),system:{skills:{}},talentList:[{name:'Toughened',isRanked:true,rank:2,activation:'Passive'},{name:'Grit',isRanked:true,rank:3,activation:'Passive'}]};
  const markup=state.talentChoiceDescription(actor,'t');
  assert.match(markup,lang==='en'?/Selected skill: <strong class="ffg-talent-choice-empty">none<\/strong>\./:/Compétence choisie : <strong class="ffg-talent-choice-empty">aucune<\/strong>\./);
  const summary=(await loadSystemModule('helpers/talent-summary.js',context)).namespace;
  const rows=summary.summaryTalents(actor);
  assert.equal(rows.find(row=>row.name==='Toughened').total,lang==='en'?'Total bonus: +2 to wound threshold.':'Bonus total : +2 au seuil de blessures.');
  assert.equal(rows.find(row=>row.name==='Grit').total,lang==='en'?'Total bonus: +3 to strain threshold.':'Bonus total : +3 au seuil de stress.');
  assert.equal(actor.talentList[0].total,undefined);
 });

 test(`${lang}: a used talent keeps its identifier and blocked state while explaining the block in the selected language`,async()=>{
  const i18n=await systemI18n(lang),context=vm.createContext({game:{i18n,user:{isGM:true,targets:new Set()},combat:null}});
  const {rollTalentOptions}=(await loadSystemModule('helpers/roll-talents.js',context)).namespace;
  const actor={type:'character',system:{stats:{strain:{max:10,value:0}},skills:{Perception:{}}},items:new Map([['t',{system:{active:true}}]]),talentList:[{itemId:'t',name:'Sense Danger',rank:1,isRanked:false}],getFlag:(_scope,key)=>key==='talentSessionUsage'?{'sense-danger':true}:null};
  const option=rollTalentOptions(actor,'Perception').find(option=>option.id==='sense-danger');
  assert.equal(option.blocked,true);assert.equal(option.id,'sense-danger');assert.equal(option.maxAmount,1);
  assert.match(option.blockedReason,lang==='en'?/Already used this session/:/Déjà utilisé cette session/);
 });

 test(`${lang}: calculation details deduplicate the recorded-base note using its localized value`,async()=>{
  const i18n=await systemI18n(lang),created=[];let dialog;
  const element=tag=>({tag,children:[],style:{},append(...nodes){this.children.push(...nodes);}});
  const rows=[{path:'stats.wounds',label:'Wounds',total:10,sources:[{operation:'Base',operationLabel:'Base',name:'R2-D2',value:10}],notes:[i18n.localize('SWFFG.UI.Calculation.RecordedBaseNote')]}];
  const before=JSON.stringify(rows);
  const context=vm.createContext({game:{i18n},document:{createElement:tag=>{const node=element(tag);created.push(node);return node;}},foundry:{applications:{api:{DialogV2:{wait:async options=>{dialog=options;}}}}}});
  const api=(await loadSystemModule('helpers/stat-calculation-dialog.js',context,{'helpers/stat-explanations.js':{explainStats:()=>rows}})).namespace;
  await api.showCalculationDetails({name:'R2-D2'});
  const texts=created.map(node=>node.textContent).filter(Boolean);
  assert.equal(texts.filter(text=>text===i18n.localize('SWFFG.UI.Calculation.RecordedBaseExplanation')).length,1);
  assert.equal(texts.includes(i18n.localize('SWFFG.UI.Calculation.RecordedBaseNote')),false);
  assert.equal(dialog.buttons[0].label,lang==='en'?'Close':'Fermer');assert.match(dialog.window.title,/R2-D2/);
  assert.equal(JSON.stringify(rows),before);
 });
}
