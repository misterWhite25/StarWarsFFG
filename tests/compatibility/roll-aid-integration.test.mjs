import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
const read=file=>readFile(new URL('../../modules/'+file,import.meta.url),'utf8');
test('real roll builder adds aid once, consumes on posting and restores it on failure',async()=>{
 let aid={pending:[{id:'m:e',message:'m',entry:'e'}],used:[]}, fail=false;const messages=[],errors=[];
 const actor={id:'pc',uuid:'Actor.pc',getEmbeddedCollection:()=>({contents:[]})};
 const context=vm.createContext({Hooks:{on(){return 1;},off(){}},document:{createElement:()=>({})},ChatMessage:{getSpeaker:()=>({actor:'pc'})},ui:{notifications:{error:e=>errors.push(e)}},CONFIG:{logger:{debug(){},warn(){}}},foundry:{utils:{deepClone:v=>structuredClone(v)},applications:{ux:{TextEditor:{enrichHTML:async x=>x}}}},game:{
   user:{id:'p',isGM:false,character:{uuid:'Actor.pc'},getFlag:()=>aid,setFlag:async(_s,_k,v)=>{aid=v;}},settings:{get:()=>false},i18n:{lang:'fr',localize:x=>x},actors:{get:()=>actor},messages:{get:()=>({getFlag:()=>({entries:[{id:'e',kind:'aid',recipient:'p'}]})})},
   ffg:{RollFFG:class {async toMessage(data){if(fail)throw Error('posting failed');messages.push(data);}}}
 }});
 const selection=new vm.SourceTextModule(await read('helpers/weapon-selection.js'),{context});await selection.link(()=>{});await selection.evaluate();
 const customRules=new vm.SourceTextModule(await read('helpers/custom-rules.js'),{context});await customRules.link(()=>{});await customRules.evaluate();
 const helper=new vm.SourceTextModule(await read('helpers/combat-actions.js'),{context});await helper.link(spec=>spec.includes('custom-rules')?customRules:selection);await helper.evaluate();
 const core=new vm.SourceTextModule(await read('helpers/pilotage-core.js'),{context});await core.link(()=>{});await core.evaluate();
 const vitality=new vm.SourceTextModule(await read('helpers/pilotage-vitality.js'),{context});await vitality.link(()=>{});await vitality.evaluate();
 const pilotage=new vm.SourceTextModule(await read('helpers/pilotage-mj.js'),{context});await pilotage.link(spec=>spec.includes('vitality')?vitality:core);await pilotage.evaluate();
 const gm=new vm.SourceTextModule(await read('helpers/gm-difficulty.js'),{context});await gm.link(()=>pilotage);await gm.evaluate();
 const talents=new vm.SourceTextModule(await read('helpers/roll-talents.js'),{context});await talents.link(()=>{});await talents.evaluate();
 const dodge=new vm.SourceTextModule(await read('helpers/dodge-reaction.js'),{context});await dodge.link(()=>talents);await dodge.evaluate();
 const builder=new vm.SourceTextModule(await read('dice/roll-builder.js'),{context});
 const information=new vm.SyntheticModule(['renderSkillInformation'],function(){this.setExport('renderSkillInformation',()=>{});},{context});await information.link(()=>{});await information.evaluate();
 await builder.link(spec=>spec.includes('dodge-reaction')?dodge:spec.includes('pilotage-mj')?pilotage:spec.includes('skill-information-ui')?information:spec.includes('roll-talents')?talents:spec.includes('gm-difficulty')?gm:spec.includes('weapon-selection')?selection:spec.includes('combat-actions')?helper:new vm.SyntheticModule(spec.includes('form-application')?['FormApplicationV2']:['MonteCarlo'],function(){this.setExport(spec.includes('form-application')?'FormApplicationV2':'MonteCarlo',class {activateListeners(){}});},{context}));await builder.evaluate();
 const app=new builder.namespace.default({document:actor,actor:{_id:'pc'}},{boost:0,renderDiceExpression:()=> '1db'},'test','Pilot');
 await app.getData();await app.getData();assert.equal(app.dicePool.boost,1);assert.equal(aid.pending.length,1);
 app._initializeInputs=()=>{};app._activateInputs=()=>{};let click;
 const html={0:{prepend(){},querySelector(){return null;}},find:selector=>({click:callback=>{if(selector==='.btn')click=callback;},on(){}})};
 app.roll.combatMode='vehicle';app.activateListeners(html);fail=true;await click({});assert.equal(messages.length,0);assert.equal(aid.pending.length,1);assert.equal(aid.used.length,0);
 fail=false;await click({});assert.equal(messages.length,1);assert.equal(aid.pending.length,0);assert.equal(aid.used.length,1);assert.equal(messages[0].flags.starwarsffg.usedAid[0],'m:e');assert.equal(messages[0].flags.starwarsffg.combatMode,'vehicle');
 await click({});assert.equal(messages.length,1);assert.equal(errors.length,2);
});
