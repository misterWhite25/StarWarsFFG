import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import {systemI18n} from '../system-i18n.mjs';
import {loadSystemModule} from '../load-system-module.mjs';
const read=file=>readFile(new URL('../../modules/'+file,import.meta.url),'utf8');
test('real roll builder adds aid once, consumes on posting and restores it on failure',async()=>{
 let aid={pending:[{id:'m:e',message:'m',entry:'e'}],used:[]}, fail=false;const messages=[],errors=[];
 const actor={id:'pc',uuid:'Actor.pc',getEmbeddedCollection:()=>({contents:[]})};
 const context=vm.createContext({Hooks:{on(){return 1;},off(){}},document:{createElement:()=>({})},ChatMessage:{getSpeaker:()=>({actor:'pc'})},ui:{notifications:{error:e=>errors.push(e)}},CONFIG:{logger:{debug(){},warn(){}}},foundry:{utils:{deepClone:v=>structuredClone(v)},applications:{ux:{TextEditor:{enrichHTML:async x=>x}}}},game:{
   user:{id:'p',isGM:false,character:{uuid:'Actor.pc'},getFlag:()=>aid,setFlag:async(_s,_k,v)=>{aid=v;}},settings:{get:()=>false},i18n:await systemI18n('fr'),actors:{get:()=>actor},messages:{get:()=>({getFlag:()=>({entries:[{id:'e',kind:'aid',recipient:'p'}]})})},
   ffg:{RollFFG:class {async toMessage(data){if(fail)throw Error('posting failed');messages.push(data);}}}
 }});
 const selection=new vm.SourceTextModule(await read('helpers/weapon-selection.js'),{context});await selection.link(()=>{});await selection.evaluate();
 const customRules=new vm.SourceTextModule(await read('helpers/custom-rules.js'),{context});await customRules.link(()=>{});await customRules.evaluate();
 const picker=new vm.SourceTextModule(await read('helpers/token-target-picker.js'),{context});await picker.link(()=>{});await picker.evaluate();
 const vehicleGroups=new vm.SourceTextModule(await read('helpers/vehicle-minion-group.mjs'),{context});await vehicleGroups.link(()=>{});await vehicleGroups.evaluate();
 const helper=new vm.SourceTextModule(await read('helpers/combat-actions.js'),{context});await helper.link(spec=>spec.endsWith('vehicle-minion-group.mjs')?vehicleGroups:spec.includes('token-target-picker')?picker:spec.includes('custom-rules')?customRules:selection);await helper.evaluate();
 const pilotage=await loadSystemModule('helpers/pilotage-mj.js',context,{
  'helpers/pilotage-assets.mjs':{setupPilotageAssets(){}},
  'helpers/pilotage-tabs.mjs':{setupPilotageTabs(){}}
 });
 const gm=new vm.SourceTextModule(await read('helpers/gm-difficulty.js'),{context});await gm.link(()=>pilotage);await gm.evaluate();
 const talents=new vm.SourceTextModule(await read('helpers/roll-talents.js'),{context});await talents.link(()=>{});await talents.evaluate();
 // Load the real new rule dependencies. Creating integrated crew is outside
 // this ordinary character roll, so fail loudly if that boundary is crossed.
 const integrated=await loadSystemModule('helpers/integrated-crew.mjs',context,{
  'data-models/system-data-models.js':{getSystemDataDefaults(){throw Error('Unexpected integrated crew creation in aid roll');}}
 });
 const adversary=await loadSystemModule('helpers/target-adversary.mjs',context);
 const builder=new vm.SourceTextModule(await read('dice/roll-builder.js'),{context});
 const information=new vm.SyntheticModule(['renderSkillInformation'],function(){this.setExport('renderSkillInformation',()=>{});},{context});await information.link(()=>{});await information.evaluate();
 const setbacks=new vm.SourceTextModule(await read('helpers/setback-removal.mjs'),{context});await setbacks.link(()=>{});await setbacks.evaluate();
 // This noncombat Pilot check has no target UI. Keep its boundary explicit.
 const targets=new vm.SyntheticModule(['activateRollTargets','closeRollTargets'],function(){this.setExport('activateRollTargets',()=>{});this.setExport('closeRollTargets',()=>{});},{context});await targets.link(()=>{});await targets.evaluate();
 const form=new vm.SyntheticModule(['FormApplicationV2'],function(){this.setExport('FormApplicationV2',class {activateListeners(){}});},{context});await form.link(()=>{});await form.evaluate();
 const simulation=new vm.SyntheticModule(['MonteCarlo'],function(){this.setExport('MonteCarlo',class {});},{context});await simulation.link(()=>{});await simulation.evaluate();
 const dependencies={
  '../helpers/integrated-crew.mjs':integrated,'../helpers/vehicle-minion-group.mjs':vehicleGroups,'../helpers/target-adversary.mjs':adversary,
  '../helpers/roll-target-selection.mjs':targets,'../helpers/setback-removal.mjs':setbacks,
  '../helpers/pilotage-mj.js':pilotage,'../helpers/skill-information-ui.js':information,
  '../helpers/roll-talents.js':talents,'../helpers/gm-difficulty.js':gm,
  '../helpers/weapon-selection.js':selection,'../helpers/combat-actions.js':helper,
  '../applications/form-application-v2.js':form,'../../lib/@swrpg-online/monte-carlo/dist/index.esm.js':simulation
 };
 await builder.link(spec=>{assert.ok(dependencies[spec],'Unexpected roll-builder import: '+spec);return dependencies[spec];});await builder.evaluate();
 const app=new builder.namespace.default({document:actor,actor:{_id:'pc'}},{boost:0,renderDiceExpression:()=> '1db'},'test','SWFFG.SkillsNameAthletics');
 await app.getData();await app.getData();assert.equal(app.dicePool.boost,1);assert.equal(aid.pending.length,1);
 app._initializeInputs=()=>{};app._activateInputs=()=>{};let click;
 const html={0:{prepend(){},querySelector(){return null;}},find:selector=>({click:callback=>{if(selector==='.btn')click=callback;},on(){}})};
 app.roll.combatMode='vehicle';app.activateListeners(html);fail=true;await click({});assert.equal(messages.length,0);assert.equal(aid.pending.length,1);assert.equal(aid.used.length,0);
 fail=false;await click({});assert.equal(messages.length,1);assert.equal(aid.pending.length,0);assert.equal(aid.used.length,1);assert.equal(messages[0].flags.starwarsffg.usedAid[0],'m:e');assert.equal(messages[0].flags.starwarsffg.combatMode,'vehicle');
 await click({});assert.equal(messages.length,1);assert.equal(errors.length,2);
});
