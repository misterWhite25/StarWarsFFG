import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {loadSystemModule} from '../load-system-module.mjs';
import {characterShortcuts,gmCharacterShortcutKey} from '../../modules/helpers/player-character-data.mjs';

const actor=(id,type='rival')=>({id,uuid:'Actor.'+id,type,name:id,img:'portrait.webp'});
const user=(id,flags={})=>({id,isGM:true,getFlag:(_scope,key)=>flags[key],async setFlag(_scope,key,value){await Promise.resolve();flags[key]=value;}});

test('each GM only sees their pinned actors and preserves their chosen order',()=>{
  const a=actor('a'),b=actor('b'),resolve=key=>[a,b].find(doc=>doc.uuid===key);
  const one=user('one',{pinnedCharacterShortcuts:[b.uuid,a.uuid,b.uuid,'Actor.deleted',null,'Compendium.pack.actor']});
  const two=user('two',{pinnedCharacterShortcuts:[a.uuid]});
  assert.deepEqual(characterShortcuts([a,b],one,resolve).map(entry=>entry.key),[b.uuid,a.uuid]);
  assert.deepEqual(characterShortcuts([a,b],two,resolve).map(entry=>entry.key),[a.uuid]);
  assert.deepEqual(characterShortcuts([a,b],user('new'),resolve),[]);
});

test('a pinned scene group opens its synthetic actor rather than the world template',()=>{
  const base=actor('template','minion');
  const token={documentName:'Token',uuid:'Scene.scene.Token.group',name:'Patrouille de trois'};
  const synthetic={...base,isToken:true,token};token.actor=synthetic;
  assert.equal(gmCharacterShortcutKey(synthetic),token.uuid);
  const gm=user('gm',{pinnedCharacterShortcuts:[base.uuid,token.uuid]});
  const entries=characterShortcuts([base],gm,key=>key===base.uuid?base:key===token.uuid?token:null);
  assert.equal(entries.length,2);assert.equal(entries[1].actor,synthetic);assert.equal(entries[1].name,token.name);
  assert.deepEqual(characterShortcuts([base],gm,key=>key===base.uuid?base:null).map(entry=>entry.actor),[base]);
});

test('compendium entries, invalid flags and unrelated actor types cannot become shortcuts',()=>{
  const pack={...actor('pack'),pack:'adversaries'},ship=actor('ship','vehicle');
  assert.equal(gmCharacterShortcutKey(pack),null);assert.equal(gmCharacterShortcutKey(ship),null);
  assert.equal(gmCharacterShortcutKey(null),null);
  const gm=user('gm',{pinnedCharacterShortcuts:['Actor.pack','Actor.ship']});
  assert.deepEqual(characterShortcuts([],gm,key=>key==='Actor.pack'?pack:ship),[]);
  assert.deepEqual(characterShortcuts([],user('gm',{pinnedCharacterShortcuts:{bad:true}})),[]);
});

async function fixture(){
  const callbacks=new Map(),settings=new Map(),a=actor('a'),b=actor('b'),flags={};
  const gm=user('gm',flags),actors=[a,b];actors.get=id=>actors.find(doc=>doc.id===id);
  let frames=0;
  const game={user:gm,ready:true,actors,i18n:{localize:key=>key},settings:{
    register:(_scope,key,value)=>settings.set(key,value),get:(_scope,key)=>settings.get(key)?.default
  }};
  const context=vm.createContext({game,console,URL:class extends URL{constructor(url,base){super(url,base??'https://foundry.invalid/systems/starwarsffg/modules/helpers/player-character-dock.mjs');}},requestAnimationFrame:()=>++frames,
    fromUuidSync:key=>actors.find(doc=>doc.uuid===key),
    ui:{notifications:{warn:message=>assert.fail(message)}},
    document:{createElement:()=>({addEventListener(){}}),head:{append(){}}},
    Hooks:{on(name,callback){if(!callbacks.has(name))callbacks.set(name,[]);callbacks.get(name).push(callback);},
      once(name,callback){this.on(name,callback);}}
  });
  await loadSystemModule('helpers/player-character-dock.mjs',context);
  const call=async(name,...args)=>{for(const callback of callbacks.get(name)??[])await callback(...args);};
  await call('init');
  const options=[];await call('getActorContextOptions',{collection:actors},options);
  const row=id=>({dataset:{entryId:id},closest:()=>null});
  return {game,gm,flags,settings,options,row,call,get frames(){return frames;}};
}

test('directory pinning is GM-only, personal and safe when several entries are added quickly',async()=>{
  const f=await fixture(),pin=f.options.find(option=>option.label.endsWith('.Pin'));
  const unpin=f.options.find(option=>option.label.endsWith('.Unpin'));
  assert.equal(f.settings.get('enableGmCharacterShortcuts').scope,'user');
  assert.equal(pin.visible(f.row('a')),true);assert.equal(unpin.visible(f.row('a')),false);
  await Promise.all([pin.onClick(null,f.row('a')),pin.onClick(null,f.row('b')),pin.onClick(null,f.row('a'))]);
  assert.deepEqual(Array.from(f.flags.pinnedCharacterShortcuts),['Actor.a','Actor.b']);
  assert.equal(pin.visible(f.row('a')),false);assert.equal(unpin.visible(f.row('a')),true);
  await unpin.onClick(null,f.row('a'));
  assert.deepEqual(Array.from(f.flags.pinnedCharacterShortcuts),['Actor.b']);
  f.gm.isGM=false;assert.equal(pin.visible(f.row('a')),false);assert.equal(unpin.visible(f.row('b')),false);
});

test('the dock ignores token movement and refreshes token names and deletion',async()=>{
  const f=await fixture();
  await f.call('updateToken',{}, {x:12,y:20,rotation:30});assert.equal(f.frames,0);
  await f.call('updateToken',{}, {name:'New group'});assert.equal(f.frames,1);
  const deleted=await fixture();await deleted.call('deleteScene',{});assert.equal(deleted.frames,1);
});
