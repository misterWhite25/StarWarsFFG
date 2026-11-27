import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {loadSystemModule} from '../load-system-module.mjs';
import {cleanPool,canAnswerRequest} from '../../modules/helpers/roll-request-model.mjs';

test('request pools preserve signed fixed results and reject invalid dice counts',()=>{
 const pool=cleanPool({ability:3,success:-1,boost:2,untrusted:'discarded'});
 assert.equal(pool.success,-1);assert.equal(pool.ability,3);assert.equal(pool._ignoreGMDifficulty,true);assert.equal('untrusted' in pool,false);
 for(const invalid of [{ability:-1},{force:Infinity},{difficulty:101},{setback:NaN}])assert.throws(()=>cleanPool(invalid));
});

test('only the intended owner can answer an unresolved GM request',()=>{
 const user={id:'player'},actor={uuid:'Actor.pc',system:{skills:{Perception:{}}},testUserPermission:candidate=>candidate.id==='player'};
 const data={version:1,skillKey:'Perception',recipients:[{userId:'player',actorUuid:'Actor.pc'}],states:{}};
 const message={author:{isGM:true},getFlag:()=>data};
 assert.equal(canAnswerRequest(message,user,actor),true);
 assert.equal(canAnswerRequest(message,{id:'other'},actor),false);
 assert.equal(canAnswerRequest({...message,author:{isGM:false}},user,actor),false);
 data.cancelled=true;assert.equal(canAnswerRequest(message,user,actor),false);data.cancelled=false;
 data.states.player={status:'rolled'};assert.equal(canAnswerRequest(message,user,actor),false);
});

test('opening a requested roll keeps the exact token actor and avoids preparing its sheet', async () => {
  const user = {id: 'player'};
  const token = {uuid: 'Scene.scene.Token.token'};
  const actor = {
    id: 'base', uuid: token.uuid + '.Actor.base', isToken: true, token,
    system: {skills: {Perception: {rank: 2}}},
    testUserPermission: candidate => candidate === user,
    get sheet() { assert.fail('Request prepared the full actor sheet'); }
  };
  class Builder {
    constructor(context, pool) { this.context = context; this.dicePool = pool; }
    addEventListener() {}
    async render() {}
  }
  let subject;
  const context = vm.createContext({
    structuredClone, Hooks: {once() {}}, fromUuid: async uuid => uuid === actor.uuid ? actor : null,
    game: {user, ffg: {DiceHelpers: {
      rollSkillByKey: async reference => { subject = reference; return new Builder(null, {}); }
    }}}
  });
  const {openRequestedRoll} = (await loadSystemModule('helpers/roll-requests.mjs', context, {
    'dice/pool.js': {DicePoolFFG: class { constructor(pool) { Object.assign(this, pool); } }},
    'dice/roll-builder.js': {default: Builder}
  })).namespace;
  const data = {version: 1, skillKey: 'Perception', recipients: [{userId: user.id, actorUuid: actor.uuid}]};
  const message = {id: 'request', author: {isGM: true}, getFlag: () => data};
  await openRequestedRoll(message);
  assert.equal(subject.tokenUuid, token.uuid);
  data.prepared = {pool: {difficulty: 3}};
  const builder = await openRequestedRoll({...message, id: 'prepared'});
  assert.equal(builder.context.document, actor);
  assert.equal(builder.context.pilotageTokenUuid, token.uuid);
  assert.equal(builder.dicePool.difficulty, 3);
});

async function fixture(){
 const users=[{id:'gm',active:true,isGM:true,name:'MJ'},{id:'a',active:true,isGM:false,name:'A'},{id:'b',active:true,isGM:false,name:'B'},{id:'c',active:true,isGM:false,name:'C'}];
 users.get=id=>users.find(user=>user.id===id);users.activeGM=users[0];
 const actors=new Map(['a','b','c'].map(id=>['Actor.'+id,{uuid:'Actor.'+id,name:id,system:{skills:{Perception:{}}},testUserPermission:user=>user.id===id||user.isGM}]));
 const messages=[];
 const context=vm.createContext({
  Hooks:{once(){},callAll(){}},fromUuid:async uuid=>actors.get(uuid),
  document:{createElement:()=>({style:{},dataset:{},append(){},outerHTML:'<div></div>'})},
  game:{user:users[0],users,actors:[],messages:[],settings:{get(){}},i18n:{localize:key=>key,format:key=>key}},
  ChatMessage:{create:async data=>{const message={...data,author:users[0],id:'request'+messages.length,getFlag:(_scope,key)=>data.flags.starwarsffg[key]};messages.push(message);return message;}}});
 const api=(await loadSystemModule('helpers/roll-requests.mjs',context)).namespace;
 return {api,users,messages};
}

test('multi-player requests whisper only to the selected players and GMs, with independent actors',async()=>{
 const f=await fixture();await f.api.sendRollRequest({skillKey:'Perception',dice:{difficulty:3},recipients:[{userId:'a',actorUuid:'Actor.a'},{userId:'b',actorUuid:'Actor.b'}]});
 assert.deepEqual([...f.messages[0].whisper],['gm','a','b']);
 const data=f.messages[0].flags.starwarsffg.rollRequest;assert.equal(data.states.a.status,'pending');assert.equal(data.states.b.status,'pending');assert.equal(data.recipients.length,2);
 await assert.rejects(()=>f.api.sendRollRequest({skillKey:'Perception',recipients:[{userId:'c',actorUuid:'Actor.a'}]}));
 f.users.get('b').active=false;await assert.rejects(()=>f.api.sendRollRequest({skillKey:'Perception',recipients:[{userId:'b',actorUuid:'Actor.b'}]}));
 assert.equal(f.messages.length,1);
});
