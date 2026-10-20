import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
async function fixture(){
 const dialogs=[],notices=[],actors=[];let userFlags={pending:[],used:[]};
 const entry={id:'e',kind:'aid',recipient:'p'},message={id:'m'};
 for(const id of ['a','b'])actors.push({uuid:`Actor.${id}`,isOwner:true,effects:[],getFlag(){return this.effects;},async setFlag(_s,_k,value){this.effects=value;}});
 const tokens=actors.map((actor,index)=>({uuid:`Scene.s.Token.${index}`,id:`token-${index}`,name:`NPC${index}`,actor,object:{visible:true},x:index,y:0}));
 const contents=[...tokens];contents.find=Array.prototype.find.bind(contents);
 const canvas={scene:{tokens:{contents,find:contents.find.bind(contents)}},tokens:{controlled:[]}};
 const game={user:{id:'p',isGM:false,character:null,getFlag:()=>userFlags,setFlag:async(_s,_k,value)=>{userFlags=value;}},messages:{get:()=>({getFlag:()=>({entries:[entry]})})}};
 const context=vm.createContext({game,canvas,structuredClone,Hooks:{on(){}},ui:{notifications:{info:text=>notices.push(text)}},foundry:{applications:{api:{DialogV2:{wait:()=>new Promise(resolve=>dialogs.push(resolve))}}}}});
 const core=new vm.SourceTextModule(await readFile(new URL('../../modules/helpers/pilotage-core.js',import.meta.url),'utf8'),{context});await core.link(()=>{});await core.evaluate();
 const vitality=new vm.SourceTextModule(await readFile(new URL('../../modules/helpers/pilotage-vitality.js',import.meta.url),'utf8'),{context});await vitality.link(()=>{});await vitality.evaluate();
 const module=new vm.SourceTextModule(await readFile(new URL('../../modules/helpers/pilotage-mj.js',import.meta.url),'utf8'),{context});await module.link(spec=>spec.includes('vitality')?vitality:core);await module.evaluate();
 return {api:module.namespace,dialogs,actors,notices,entry,message,userFlags:()=>userFlags};
}
test('two rapid accept clicks cannot assign the same assistance to two characters',async()=>{
 const f=await fixture();const first=f.api.acceptPilotageAid(f.message,f.entry),second=f.api.acceptPilotageAid(f.message,f.entry);
 assert.equal(f.dialogs.length,1);
 f.dialogs[0]('Scene.s.Token.0');await Promise.all([first,second]);
 assert.equal(f.actors[0].effects.length,1);assert.equal(f.actors[1].effects.length,0);
 assert.deepEqual(Array.from(f.userFlags().used),['m:e']);
 await f.api.acceptPilotageAid(f.message,f.entry);assert.equal(f.dialogs.length,1);
});
test('cancelling the recipient choice releases the aid lock without consuming it',async()=>{
 const f=await fixture();const first=f.api.acceptPilotageAid(f.message,f.entry);
 f.dialogs[0](null);await first;
 assert.equal(f.actors[0].effects.length,0);assert.equal(f.userFlags().used.length,0);
 const second=f.api.acceptPilotageAid(f.message,f.entry);assert.equal(f.dialogs.length,2);
 f.dialogs[1]('Scene.s.Token.1');await second;
 assert.equal(f.actors[1].effects.length,1);
});
