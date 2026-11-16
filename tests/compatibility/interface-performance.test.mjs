import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {loadSystemModule} from '../load-system-module.mjs';
import {rollContext} from '../../modules/helpers/roll-context.mjs';
import {renderScheduler} from '../../modules/helpers/render-scheduler.mjs';
import {actorAffectsSpaceCombat,combatAffectsSpaceCombat} from '../../modules/space-combat/refresh-policy.mjs';

test('roll context snapshots effective inputs without preparing sheets or copying inventories',()=>{
  const actor={id:'actor',uuid:'Scene.scene.Token.token.Actor.actor',name:'Nom',type:'character',img:'image.webp',system:{skills:{Cool:{rank:2}},characteristics:{Presence:{value:3}},stats:{strain:{value:4}}},getRollData(){return this.system;},toObject(){assert.fail('Full actor copy');},get items(){assert.fail('Inventory copied');},get sheet(){assert.fail('Sheet constructed');}};
  const context=rollContext(actor,{tokenUuid:'Scene.scene.Token.token'});
  assert.equal(context.document,actor);assert.equal(context.rollData(),actor.system);
  assert.equal(context.pilotageTokenUuid,'Scene.scene.Token.token');assert.equal(context.documentUuid,actor.uuid);
  assert.deepEqual(context.data,actor.system);context.data.skills.Cool.rank=0;assert.equal(actor.system.skills.Cool.rank,2);
  const saved=JSON.parse(JSON.stringify(context));assert.equal(saved.document,undefined);assert.equal(saved.token,undefined);assert.equal(saved.actor.items,undefined);assert.equal(saved.actor._id,'actor');
});

test('space refresh includes vessels, crew and passengers, including synthetic token actors',()=>{
  const vessel={id:'vessel',flags:{starwarsffg:{crew:[{actor_id:'pilot'}],vehicleDeck:{passengers:{one:{actorId:'passenger'},two:{tokenUuid:'Scene.scene.Token.token'}}}}}};
  const synthetic={id:'base',uuid:'Scene.scene.Token.token.Actor.base'},state={ships:[{actorId:'vessel'}]},get=id=>id==='vessel'?vessel:null,resolve=()=>({actor:synthetic});
  for(const actor of [vessel,{id:'pilot'},{id:'passenger'},synthetic])assert.equal(actorAffectsSpaceCombat(state,actor,get,resolve),true);
  assert.equal(actorAffectsSpaceCombat(state,{id:'other',uuid:'Actor.other'},get,resolve),false);
  assert.equal(actorAffectsSpaceCombat(state,null,get,resolve),false);
  assert.equal(combatAffectsSpaceCombat({encounterId:'space'},{id:'other'}),false);
  assert.equal(combatAffectsSpaceCombat({encounterId:'space'},{documentName:'Combatant',parent:{id:'space'}}),true);
});

test('render bursts are coalesced and updates arriving during a render are not lost',async()=>{
  const frames=new Map();let next=0,calls=0,release,open=true;
  const errors=[],refresh=renderScheduler({isOpen:()=>open,render:()=>{calls++;return new Promise(resolve=>release=resolve);},onError:error=>errors.push(error),requestFrame:callback=>{frames.set(++next,callback);return next;},cancelFrame:id=>frames.delete(id)});
  const tick=()=>new Promise(resolve=>setImmediate(resolve));
  for(let i=0;i<100;i++)refresh();assert.equal(frames.size,1);
  const flush=()=>{const pending=[...frames.values()];frames.clear();for(const callback of pending)callback();};
  flush();await tick();assert.equal(calls,1);
  for(let i=0;i<20;i++)refresh();assert.equal(frames.size,0);
  release();await tick();assert.equal(frames.size,1);flush();await tick();assert.equal(calls,2);
  release();await tick();refresh();refresh.cancel();assert.equal(frames.size,0);
  open=false;refresh();assert.equal(frames.size,0);assert.deepEqual(errors,[]);
});

test('NPC catalogues and adversary ranks are reused and invalidated on relevant document changes',async()=>{
  const hooks=new Map(),context=vm.createContext({Hooks:{on:(name,fn)=>hooks.set(name,fn)}});
  const api=(await loadSystemModule('helpers/npc-command-data.mjs',context)).namespace;
  const item={id:'talent',type:'talent',name:'Adversary',system:{rank:2}},actor={documentName:'Actor',items:[item],talentList:[]};item.parent=actor;
  const catalogue=api.npcCatalogue(actor);assert.equal(api.npcCatalogue(actor),catalogue);assert.equal(api.npcAdversaryRank(actor),2);
  item.system.rank=3;hooks.get('updateItem')(item);assert.notEqual(api.npcCatalogue(actor),catalogue);assert.equal(api.npcAdversaryRank(actor),3);
  assert.equal(api.npcAdversaryRank(actor,'Opposition'),3);
  actor.items=[];hooks.get('deleteItem')(item);assert.equal(api.npcAdversaryRank(actor),0);
  actor.talentList=[{name:'Adversary',rank:4}];assert.equal(api.npcAdversaryRank(actor),4);
  const retained=api.npcCatalogue(actor);hooks.get('updateItem')({parent:{documentName:'Actor'}});assert.equal(api.npcCatalogue(actor),retained);
  hooks.get('updateActiveEffect')({parent:actor});assert.notEqual(api.npcCatalogue(actor),retained);
});
