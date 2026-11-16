import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import {npcCatalogue,npcAbilityKind} from '../../modules/helpers/npc-command-data.mjs';
async function initiative(){
  const ctx=vm.createContext({console,structuredClone,game:{},CONFIG:{},ui:{},Hooks:{},document:{}});
  const source=await fs.readFile(new URL('../../modules/helpers/npc-initiative.mjs',import.meta.url),'utf8');
  const mod=new vm.SourceTextModule(source,{context:ctx});
  await mod.link(()=>new vm.SyntheticModule(['initiativeContext'],function(){this.setExport('initiativeContext',()=>({}));},{context:ctx}));await mod.evaluate();return mod.namespace;
}
test('default slots use the roller and preserve swaps and intentional unclaims',async()=>{
  const {seedClaims,swapClaims}=await initiative(),turns=[{id:'a',actor:{}},{id:'b',actor:{}}];
  let result=seedClaims(turns);assert.deepEqual({...result.claims},{a:'a',b:'b'});
  const swapped=swapClaims(result.claims,'a','b');assert.deepEqual({...swapped},{a:'b',b:'a'});
  result=seedClaims(turns,swapped,result.seeded);assert.deepEqual({...result.claims},{a:'b',b:'a'});
  delete result.claims.a;assert.deepEqual({...seedClaims(turns,result.claims,result.seeded).claims},{b:'a'});
});
test('new participants get a default without duplicating an existing claimant',async()=>{
  const {seedClaims,swapClaims}=await initiative();assert.deepEqual({...seedClaims([{id:'a',actor:{}},{id:'b',actor:{}},{id:'c',actor:{}}],{a:'b'},['a']).claims},{a:'b',c:'c'});
  assert.deepEqual({...swapClaims({a:'a',b:'b'},'c','a')},{c:'a',b:'b'});
});
test('catalogue retains every item plus learned specialization and Force upgrades',()=>{
  const actor={items:[{id:'s',name:'Spécialisation',type:'specialization',system:{talents:{a:{name:'Talent acquis',islearned:true},b:{name:'Non acquis',islearned:false}}}},{id:'p',name:'Influence',type:'forcepower',system:{upgrades:{a:{name:'Portée',islearned:true}}}},{id:'g',name:'Médipac',type:'gear',system:{quantity:{value:2}}},{id:'x',name:'Objet personnalisé',type:'custom',system:{}}],talentList:[{name:'Talent acquis'},{name:'Talent dérivé'}]};
  const entries=npcCatalogue(actor);assert.deepEqual(entries.map(e=>e.name),['Spécialisation','Talent acquis','Influence','Portée','Médipac','Objet personnalisé','Talent dérivé']);
});
test('catalogue validates owned item references and folds derived talent names without dropping learned nodes',()=>{
  const actor={items:[{id:'s',name:'Spécialisation',type:'specialization',system:{talents:{a:{name:'Détermination',islearned:true,itemId:'missing'},b:{name:'DETERMINATION',islearned:true,itemId:'g'}}}},{id:'g',name:'Objet',type:'gear',system:{}}],talentList:[{name:'determination'},{name:'Autre',itemId:'missing'},{name:'AUTRE'}]};
  const entries=npcCatalogue(actor);
  assert.deepEqual(entries.map(entry=>[entry.name,entry.itemId]),[['Spécialisation','s'],['Détermination',null],['DETERMINATION','g'],['Objet','g'],['Autre',null]]);
});
test('nested attachments and weapon qualities are included with their full descriptions',()=>{
  const entries=npcCatalogue({items:[{id:'w',name:'Fusil',type:'weapon',system:{itemattachment:[{name:'Viseur',system:{description:'Accessoire complet',itemmodifier:[{name:'Précis',system:{description:'Qualité complète',active:true}}]}}]}}]});
  assert.deepEqual(entries.map(e=>e.name),['Fusil','Viseur','Précis']);assert.equal(entries[2].system.description,'Qualité complète');
});
test('ability classifications retain reactions, passive talents and manual capabilities',()=>{
  assert.equal(npcAbilityKind({system:{activation:{value:'Incidental'}}}),'reaction');
  assert.equal(npcAbilityKind({system:{activation:'Passive'}}),'passive');
  assert.equal(npcAbilityKind({system:{}}),'manual');
});

async function budget(){
  let flags={},ground=null,turn=0;
  const token={uuid:'Scene.a.Token.x',getFlag:()=>ground,setFlag:async(_scope,_key,value)=>{ground=structuredClone(value);},unsetFlag:async()=>{ground=null;}};
  const actor={id:'npc'},participant={id:'p',actor,token},combat={id:'c',round:1,getFlag:(_scope,key)=>flags[key],setFlag:async(_scope,key,value)=>{const [field,id]=key.split('.');if(id)(flags[field]??={})[id]=structuredClone(value);else flags[field]=value;},unsetFlag:async(_scope,key)=>{const [field,id]=key.split('.');delete flags[field]?.[id];}};
  const stamp=()=>({combatId:'c',round:1,turn}),context=()=>({tracked:true,started:true,actor,participant,combat,stamp:stamp()});
  const ctx=vm.createContext({console,structuredClone,game:{user:{isGM:true}},foundry:{utils:{randomID:()=>String(Math.random())}}});
  const mod=new vm.SourceTextModule(await fs.readFile(new URL('../../modules/helpers/npc-command-budget.mjs',import.meta.url),'utf8'),{context:ctx});
  await mod.link(name=>name.includes('initiative')?new vm.SyntheticModule(['initiativeContext','initiativeStamp','sameInitiative'],function(){this.setExport('initiativeContext',context);this.setExport('initiativeStamp',stamp);this.setExport('sameInitiative',left=>JSON.stringify(left)===JSON.stringify(stamp()));},{context:ctx}):new vm.SyntheticModule(['stateFor'],function(){this.setExport('stateFor',()=>({...ground,context:'c:1',revision:ground?.revision??0,actionUsed:ground?.actionUsed??false}));},{context:ctx}));await mod.evaluate();
  return {api:mod.namespace,entry:{actor,token,mode:'ground'},stamp,advance:()=>{turn++;},ground:()=>ground,flags:()=>flags,setGM:value=>{ctx.game.user.isGM=value;}};
}
test('GM preparations are free of initiative and action counters',async()=>{
  const {api,entry,stamp,ground,flags}=await budget();
  assert.equal(await api.reserveNpcAction(entry,stamp()),null);assert.equal(await api.reserveNpcAction(entry,stamp()),null);
  assert.equal(ground(),null);assert.deepEqual(flags(),{});assert.equal(api.npcTurnReason(entry),'');
});
test('an initiative change never blocks the GM, while players cannot use GM commands',async()=>{
  const {api,entry,stamp,advance,ground,setGM}=await budget();const old=stamp();advance();
  assert.equal(await api.reserveNpcAction(entry,old),null);assert.equal(ground(),null);
  setGM(false);assert.match(api.npcTurnReason(entry),/réservée au MJ/);await assert.rejects(api.reserveNpcAction(entry,old),/réservée au MJ/);
});
test('native resource rejection refunds the NPC action and successful preparation does not spend it',async()=>{
  const {api,entry,ground}=await budget();const builder={_reserveRollResources:async()=>{throw Error('ammo');},_restoreRollResources:async()=>{}};
  api.attachNpcBudget(builder,entry);assert.equal(ground(),null);await assert.rejects(builder._reserveRollResources({}),/ammo/);assert.equal(ground(),null);
});
