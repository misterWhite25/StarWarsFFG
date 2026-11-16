import test from 'node:test';
import assert from 'node:assert/strict';
import {npcCampInfo,repairCampClaims} from '../../modules/helpers/npc-camps.mjs';
import {claimsAfterRemoval,removeParticipant,removeTrackedCombatant,handleTrackedRemoval,cleanupLegacySlots} from '../../modules/helpers/combatant-removal.mjs';
test('allied NPCs use token disposition, independently of player ownership and actor defaults',()=>{
  assert.equal(npcCampInfo({token:{disposition:1},actor:{prototypeToken:{disposition:-1}}},{player:false}).label,'PNJ allié');
  assert.equal(npcCampInfo({token:{disposition:-1}},{player:true}).key,'hostile');
  assert.equal(npcCampInfo({participant:{token:{disposition:0}}},{player:false}).label,'Neutre');
});
test('ownership of an NPC or vehicle does not turn it into a player character',()=>{
  globalThis.game={users:[{isGM:false,character:{id:'pc',uuid:'Actor.pc'}}]};
  assert.equal(npcCampInfo({token:{disposition:1},actor:{id:'npc',uuid:'Actor.npc',type:'rival',testUserPermission:()=>true}}).label,'PNJ allié');
  assert.equal(npcCampInfo({token:{disposition:1},actor:{id:'pc',uuid:'Actor.pc',type:'character'}}).label,'PJ allié');
});
test('camp changes repair crossed swaps without changing same-camp assignments',()=>{
  const turns=[{id:'a',actor:{},disposition:1},{id:'b',actor:{},disposition:-1},{id:'c',actor:{},disposition:-1}];
  assert.deepEqual(repairCampClaims(turns,{a:'b',b:'a',c:'c'}),{a:'a',b:'b',c:'c'});
  assert.deepEqual(repairCampClaims(turns,{a:'a',b:'c',c:'b'}),{a:'a',b:'c',c:'b'});
});
test('removing the real claimant closes swaps and deletes every stale round reference',()=>{
  const turns=['a','b','c'].map(id=>({id}));
  assert.deepEqual(claimsAfterRemoval({1:{a:'b',b:'a',c:'c'},2:{a:'a',b:'b',c:'c'}},'b',{turns}),{1:{a:'a',c:'c'},2:{a:'a',c:'c'}});
  assert.deepEqual(claimsAfterRemoval({1:{a:'b',b:'a',c:'c'}},'b',{turns,replacementId:'fake'}),{1:{a:'a',c:'c'}});
});
test('removing a member from a longer permutation retains each survivor exactly once',()=>{
  const turns=['a','b','c','d'].map(id=>({id})),next=claimsAfterRemoval({1:{a:'b',b:'c',c:'a',d:'d'}},'b',{turns})[1];
  assert.equal(new Set(Object.values(next)).size,3);assert.deepEqual(new Set(Object.values(next)),new Set(['a','c','d']));assert.ok(!('b' in next));
});
function fixture({started=false,claims={},ids=['a','b','c'],turn=1}={}){
  const actors=ids.map(id=>({id})),tokens=ids.map(id=>({id,uuid:'Token.'+id})),participants=new Map(ids.map((id,index)=>[id,{id,actor:actors[index],token:tokens[index],disposition:-1,initiative:5-index}]));let all=structuredClone(claims),deletedOptions;
  const collection={get:id=>participants.get(id),has:id=>participants.has(id),[Symbol.iterator]:()=>participants.values()};
  const combat={id:'c',started,round:started?1:0,turn,combatants:collection,turns:[...participants.values()],getFlag:()=>all,getSlotClaims:(round,id)=>all[round]?.[id],setupTurns(){this.turns=[...participants.values()].sort((a,b)=>b.initiative-a.initiative);},async deleteEmbeddedDocuments(_type,values,options){deletedOptions=options;const docs=values.map(id=>participants.get(id)).filter(Boolean);for(const id of values)participants.delete(id);return docs;},async update(update){for(const [key,value] of Object.entries(update)){if(key==='turn'){this.turn=value;continue;}const parts=key.split('.'),round=parts[3],id=parts[4];all[round]??={};if(id.startsWith('-='))delete all[round][id.slice(2)];else all[round][id]=value;}},async prepareDerivedData(){},async addExtraSlot(_round,disposition,initiative){participants.set('fake',{id:'fake',disposition,initiative});this.setupTurns();return 'fake';}};
  globalThis.game={user:{isGM:true},settings:{get:(_scope,key)=>key==='useGenericSlots'?true:'last_slot'}};globalThis.ui={combat:{render:async()=>{}}};
  return {combat,actors,tokens,participants,claims:()=>all,options:()=>deletedOptions};
}
test('before combat starts, an unclaimed row can be removed while actors and tokens remain',async()=>{
  const f=fixture();await removeTrackedCombatant(f.combat,{getAttribute:key=>({'data-alt-id':'a','data-combatant-id':''}[key])});
  assert.equal(f.participants.has('a'),false);assert.equal(f.actors.length,3);assert.equal(f.tokens.length,3);assert.equal(f.options().ffgRosterRemoval,true);assert.equal(f.combat._ffgRosterMutation,undefined);
});
test('removing an earlier participant preserves the active slot and all surviving initiative results',async()=>{
  const f=fixture({started:true,claims:{1:{a:'a',b:'b',c:'c'}}});await removeParticipant(f.combat,'a');
  assert.equal(f.combat.turns[f.combat.turn].id,'b');assert.equal(f.participants.get('b').initiative,4);assert.deepEqual(f.claims(),{1:{b:'b',c:'c'}});
});
test('a swapped row deletes its claimant and cannot retain a generic slot',async()=>{
  const f=fixture({started:true,claims:{1:{a:'b',b:'a',c:'c'}},turn:0});await removeParticipant(f.combat,'b',{keepSlot:true});
  assert.equal(f.participants.has('a'),true);assert.equal(f.participants.has('b'),false);assert.equal(f.participants.has('fake'),false);assert.deepEqual(f.claims(),{1:{a:'a',c:'c'}});
});

test('saved legacy removal preferences can never leave an empty slot',async()=>{
  for(const mode of ['combatant_only','last_slot','prompt']){
    const f=fixture({started:true,claims:{1:{a:'a',b:'b',c:'c'}}});game.settings.get=()=>mode;
    await handleTrackedRemoval(f.combat,f.participants.get('b'));assert.equal(f.participants.size,2);assert.equal(f.participants.has('fake'),false);assert.deepEqual(f.claims(),{1:{a:'a',c:'c'}});
  }
});
test('legacy slot cleanup rehomes its claimant and preserves the character whose turn it is',async()=>{
  const f=fixture({started:true,ids:['ghost','a','c'],turn:0,claims:{1:{ghost:'a',c:'c'}}});
  const ghost=f.participants.get('ghost');ghost.actor=null;ghost.flags={fake:true};ghost.name='__GENERIC_SLOT__';
  assert.equal(await cleanupLegacySlots(f.combat),1);assert.equal(f.participants.has('ghost'),false);assert.equal(f.combat.turns[f.combat.turn].id,'a');assert.equal(f.combat.round,1);
  assert.deepEqual(f.claims(),{1:{a:'a',c:'c'}});assert.equal(f.participants.get('a').initiative,4);assert.equal(await cleanupLegacySlots(f.combat),0);
});
test('cleanup never deletes real combatants or arbitrary tokenless entries',async()=>{
  const f=fixture({ids:['real','unrelated'],turn:0});f.participants.get('real').flags={fake:true};f.participants.get('unrelated').actor=null;
  assert.equal(await cleanupLegacySlots(f.combat),0);assert.equal(f.participants.size,2);
});
test('removing the final combatant leaves no placeholder and preserves its actor and token',async()=>{
  const f=fixture({started:true,ids:['a'],turn:0,claims:{1:{a:'a'}}});await removeParticipant(f.combat,'a');
  assert.equal(f.participants.size,0);assert.equal(f.combat.turn,null);assert.equal(f.combat.round,1);assert.deepEqual(f.claims(),{1:{}});assert.equal(f.actors.length,1);assert.equal(f.tokens.length,1);
});
