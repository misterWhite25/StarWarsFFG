import test from 'node:test';
import assert from 'node:assert/strict';
import {playerCharacters,collapsedCharacters} from '../../modules/helpers/player-character-data.mjs';
const actor=(id,type,owner,name=id)=>({id,type,name,testUserPermission:(user,level)=>level==='OWNER'&&owner===user.id});
test('a player sees owned personal actors and never vehicles or another player actors',()=>{
  const user={id:'one'},actors=[actor('a','character','one'),actor('npc','rival','one'),actor('ship','vehicle','one'),actor('other','character','two'),actor('observer','nemesis','two')];
  assert.deepEqual(playerCharacters(actors,user).map(a=>a.id),['a','npc']);
});
test('the assigned character leads the list without being duplicated or requiring a selected token',()=>{
  const a=actor('a','character','one','Alpha'),b=actor('b','character','one','Beta'),user={id:'one',character:b};
  assert.deepEqual(playerCharacters([a,b],user),[b,a]);assert.deepEqual(playerCharacters([],user),[]);
});
test('GM and disconnected users have no personal portrait strip',()=>{
  assert.deepEqual(playerCharacters([actor('a','character','gm')],{id:'gm',isGM:true}),[]);
  assert.deepEqual(playerCharacters([actor('a','character','one')],null),[]);
});
test('losing ownership removes access and names remain plain data for DOM textContent',()=>{
  const a=actor('a','nemesis','one','<img src=x onerror=alert(1)>'),user={id:'one'};
  assert.equal(playerCharacters([a],user)[0].name,a.name);a.testUserPermission=()=>false;assert.deepEqual(playerCharacters([a],user),[]);
});
test('collapsed states are per actor, deduplicated and tolerate missing or malformed flags',()=>{
  assert.deepEqual([...collapsedCharacters(['a','b','a',1,null])],['a','b']);
  assert.equal(collapsedCharacters({a:true}).size,0);assert.equal(collapsedCharacters(undefined).size,0);
});
