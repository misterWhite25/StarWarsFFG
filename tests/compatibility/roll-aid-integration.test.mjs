import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
const read=file=>readFile(new URL('../../modules/'+file,import.meta.url),'utf8');
test('real roll builder adds aid once, consumes on posting and restores it on failure',async()=>{
 let aid={pending:[{id:'m:e',message:'m',entry:'e'}],used:[]}, fail=false;const messages=[],errors=[];
 const actor={id:'pc',getEmbeddedCollection:()=>({contents:[]})};
 const context=vm.createContext({document:{createElement:()=>({})},ChatMessage:{getSpeaker:()=>({actor:'pc'})},ui:{notifications:{error:e=>errors.push(e)}},CONFIG:{logger:{debug(){},warn(){}}},foundry:{utils:{deepClone:v=>structuredClone(v)},applications:{ux:{TextEditor:{enrichHTML:async x=>x}}}},game:{
   user:{id:'p',isGM:false,getFlag:()=>aid,setFlag:async(_s,_k,v)=>{aid=v;}},settings:{get:()=>false},i18n:{lang:'fr',localize:x=>x},actors:{get:()=>actor},messages:{get:()=>({getFlag:()=>({entries:[{id:'e',kind:'aid',recipient:'p'}]})})},
   ffg:{RollFFG:class {async toMessage(data){if(fail)throw Error('posting failed');messages.push(data);}}}
 }});
 const selection=new vm.SourceTextModule(await read('helpers/weapon-selection.js'),{context});await selection.link(()=>{});await selection.evaluate();
 const helper=new vm.SourceTextModule(await read('helpers/combat-actions.js'),{context});await helper.link(()=>selection);await helper.evaluate();
 const builder=new vm.SourceTextModule(await read('dice/roll-builder.js'),{context});
 await builder.link(spec=>spec.includes('weapon-selection')?selection:spec.includes('combat-actions')?helper:new vm.SyntheticModule(spec.includes('form-application')?['FormApplicationV2']:['MonteCarlo'],function(){this.setExport(spec.includes('form-application')?'FormApplicationV2':'MonteCarlo',class {activateListeners(){}});},{context}));await builder.evaluate();
 const app=new builder.namespace.default({document:actor,actor:{_id:'pc'}},{boost:0,renderDiceExpression:()=> '1db'},'test','Pilot');
 await app.getData();await app.getData();assert.equal(app.dicePool.boost,1);assert.equal(aid.pending.length,1);
 app._initializeInputs=()=>{};app._activateInputs=()=>{};let click;
 const html={0:{prepend(){},querySelector(){return null;}},find:selector=>({click:callback=>{if(selector==='.btn')click=callback;},on(){}})};
 app.roll.combatMode='vehicle';app.activateListeners(html);fail=true;await click({});assert.equal(messages.length,0);assert.equal(aid.pending.length,1);assert.equal(aid.used.length,0);
 fail=false;await click({});assert.equal(messages.length,1);assert.equal(aid.pending.length,0);assert.equal(aid.used.length,1);assert.equal(messages[0].flags.starwarsffg.usedAid[0],'m:e');assert.equal(messages[0].flags.starwarsffg.combatMode,'vehicle');
 await click({});assert.equal(messages.length,1);assert.equal(errors.length,2);
});
