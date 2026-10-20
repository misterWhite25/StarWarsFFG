import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
async function load() {
 const actors=new Map(),messages=[];
 const context=vm.createContext({game:{user:{id:'gm',isGM:true},i18n:{lang:'fr'},actors:{get:id=>actors.get(id)},tables:{contents:[]},packs:[]},
 foundry:{utils:{deepClone:structuredClone}},fromUuid:async id=>({actor:actors.get(id)}),
 CONST:{CHAT_MESSAGE_STYLES:{ROLL:5}},ChatMessage:{create:async data=>messages.push(data)},Roll:{fromJSON:json=>JSON.parse(json)},ui:{notifications:{warn(){}}}});
 const talent=new vm.SourceTextModule(await readFile(new URL('../../modules/helpers/roll-talents.js',import.meta.url),'utf8'),{context});await talent.link(()=>{});await talent.evaluate();
 const module=new vm.SourceTextModule(await readFile(new URL('../../modules/helpers/critical-actions.js',import.meta.url),'utf8'),{context});await module.link(()=>talent);await module.evaluate();
 return {api:module.namespace,actors,messages,game:context.game};
}
function message() {
 return {id:'m',uuid:'ChatMessage.m',author:{id:'gm'},whisper:['gm'],blind:true,flags:{entries:[{id:'a',batch:'b',effect:'critical',quantity:1},{id:'t',batch:'b',effect:'critical',quantity:1}]},
 getFlag(){return this.flags;},async setFlag(_s,_k,value){this.flags=value;}};
}
test('critical modifier includes existing injuries, Vicious, talent ranks and extra activations without vehicle injury talents',async()=>{
 const {api}=await load();
 const target={type:'character',items:{contents:[{type:'criticalinjury'},{type:'criticalinjury'},{type:'weapon'}]},talentList:[{name:'Durable',isRanked:true,rank:2}]};
 const attacker={talentList:[{name:'Lethal Blows',isRanked:true,rank:2}]};
 const item={system:{itemmodifier:[{name:'Vicious Quality',system:{rank_current:2}}]}};
 const mods=api.criticalModifiers(target,attacker,item,3,-5);
 assert.equal(mods.total,55);assert.equal(mods.durable,-20);assert.equal(mods.additional,20);
 target.type='vehicle';target.items.contents=[{type:'criticaldamage'}];assert.equal(api.criticalModifiers(target,attacker,item,1).total,30);
});
test('table result preserves name, description, range and severity and rejects incomplete custom data',async()=>{
 const {api}=await load();
 const data=api.criticalItemData({name:'Injury',description:'<p>Rule</p>',range:[151,999999],flags:{starwarsffg:{severity:4}}},170,{message:'ChatMessage.m',group:'a:t',kind:'character'});
 assert.equal(data.type,'criticalinjury');assert.equal(data.system.severity,4);assert.equal(data.system.max,999999);assert.equal(data.flags.starwarsffg.criticalOrigin.total,170);
 assert.throws(()=>api.criticalItemData({name:'Bad',range:[1,5]},1,{kind:'character'}));
});
test('a saved critical creates one injury, supports safe undo and keeps original roll privacy',async()=>{
 const {api,actors,messages}=await load(),msg=message();let creates=0;
 const items=[];
 const target={uuid:'Actor.target',type:'character',isOwner:true,items:{contents:items,get:id=>items.find(item=>item.id===id)},
 async createEmbeddedDocuments(_type,data){creates++;const item={...structuredClone(data[0]),id:'injury',getFlag(_s,k){return this.flags.starwarsffg[k];},toObject(){return {name:this.name,system:this.system};}};items.push(item);return [item];},
 async deleteEmbeddedDocuments(_type,ids){for(const id of ids){items.splice(items.findIndex(item=>item.id===id),1);}}};actors.set('Token.target',target);
 const data=api.criticalItemData({name:'Injury',description:'Rule',range:[1,5],flags:{starwarsffg:{severity:1}}},3,{message:msg.uuid,group:'a:t',kind:'character'});
 const saved={status:'rolled',target:'Token.target',data,roll:'{"total":3}',summary:'Injury (3)'};
 const applied=await api.applyRolledCritical(msg,['a','t'],saved);assert.equal(creates,1);assert.equal(items.length,1);
 assert.deepEqual(messages[0].whisper,['gm']);assert.equal(messages[0].blind,true);
 // Simulate retry after Actor creation succeeded but the ChatMessage save failed.
 await api.applyRolledCritical(msg,['a','t'],saved);assert.equal(creates,1);assert.equal(items.length,1);
 items[0].system.description='edited';await assert.rejects(()=>api.undoCritical(msg,msg.flags.entries[0]));assert.equal(items.length,1);
 items[0].system.description='Rule';await api.undoCritical(msg,msg.flags.entries[0]);assert.equal(items.length,0);assert.equal(msg.flags.entries.every(entry=>entry.undone),true);
});
test('non-owners cannot apply and minion undo preserves later damage',async()=>{
 const {api,actors}=await load(),msg=message();
 const target={uuid:'Actor.target',isOwner:false,system:{stats:{wounds:{value:0}}},async update(data){this.system.stats.wounds.value=data['system.stats.wounds.value'];}};actors.set('Token.target',target);
 const saved={status:'rolled',target:'Token.target',minion:true,change:{path:'system.stats.wounds.value',before:0,after:6}};
 await assert.rejects(()=>api.applyRolledCritical(msg,['a','t'],saved));assert.equal(target.system.stats.wounds.value,0);
 target.isOwner=true;await api.applyRolledCritical(msg,['a','t'],saved);assert.equal(target.system.stats.wounds.value,6);
 target.system.stats.wounds.value=7;await assert.rejects(()=>api.undoCritical(msg,msg.flags.entries[0]));assert.equal(target.system.stats.wounds.value,7);
 target.system.stats.wounds.value=6;await api.undoCritical(msg,msg.flags.entries[0]);assert.equal(target.system.stats.wounds.value,0);
});

test('French compendium Coup mortel and Dur au Mal contribute their acquired ranks to critical modifiers',async()=>{
 const {api}=await load();
 const target={type:'character',items:{contents:[]},talentList:[{name:'Dur au Mal',isRanked:true,rank:2}]};
 const attacker={talentList:[{name:'Coup mortel',isRanked:true,rank:1}]};
 const modifiers=api.criticalModifiers(target,attacker,{},1);
 assert.equal(modifiers.lethal,10);assert.equal(modifiers.durable,-20);assert.equal(modifiers.total,-10);
});
