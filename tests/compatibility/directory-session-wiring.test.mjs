import {systemI18n} from '../system-i18n.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {loadSystemModule} from '../load-system-module.mjs';

const tabs=['scenes','actors','npcs','vehicles','items','journal','tables','macros','compendium'];

async function fixture(){
  const hooks=[],registered=new Map(),values=new Map([['directorySessionFavorites',{scenes:['saved-scene']}],['npcSessionFavorites',['saved-npc']]]),folderSheets=[],actorUpdates=[],renders=[];
  const ui={};
  class Base {
    static tabName='actors';
    get tabName(){return this.constructor.tabName;}
    async _prepareDirectoryContext(context){context.tree=this.tree;}
    _getEntryContextOptions(){return [{label:'native'}];}
    _getFolderContextOptions(){return [{label:'native-folder'}];}
    render(){renders.push(this.tabName);}
  }
  const interfaces={sidebar:class {static TABS={chat:{},actors:{},items:{}};}};
  for(const tab of tabs){class Directory extends Base {};Object.defineProperty(Directory,'tabName',{value:tab});interfaces[tab]=Directory;}
  const actors=[],scenes=[];actors.contents=actors;actors.get=id=>actors.find(actor=>actor.id===id);scenes.contents=scenes;scenes.has=id=>scenes.some(scene=>scene.id===id);scenes.get=id=>scenes.find(scene=>scene.id===id);
  const game={user:{id:'gm',isGM:true,isActiveGM:true},ready:true,actors,scenes,i18n:await systemI18n('fr'),settings:{
    register(_scope,key,config){assert.equal(registered.has(key),false,'duplicate setting '+key);registered.set(key,config);if(!values.has(key))values.set(key,structuredClone(config.default));},
    registerMenu(){},get(_scope,key){assert.ok(registered.has(key),'unregistered setting '+key);return values.get(key);},
    async set(_scope,key,value){values.set(key,value);registered.get(key)?.onChange?.(value);}
  }};
  const context=vm.createContext({game,ui,structuredClone,queueMicrotask,console,
    URL:class extends URL {constructor(path,base){super(path,base??'https://foundry.invalid/systems/starwarsffg/modules/helpers/scene-storage.mjs');}},
    Hooks:{on:(name,callback)=>hooks.push({name,callback}),once:(name,callback)=>hooks.push({name,callback})},
    CONFIG:{ui:interfaces,Folder:{documentClass:class {}}},
    Actor:{implementation:{updateDocuments:async updates=>actorUpdates.push(JSON.parse(JSON.stringify(updates)))}},
    document:{createElement:()=>({}),head:{append(){}}},
    foundry:{utils:{debounce:callback=>callback},applications:{sheets:{FolderConfig:class {}},apps:{DocumentSheetConfig:{registerSheet:(...args)=>folderSheets.push(args)}}}}
  });
  const api=(await loadSystemModule('helpers/vehicle-directory.js',context)).namespace;
  const settings=(await loadSystemModule('settings/settings-helpers.js',context,{'settings/ui-settings.js':Object.fromEntries(['rulesetSettings','combatSettings','actorSettings','xpSpendingSettings','localizationSettings','groupManagerSettings'].map(key=>[key,class {}]))})).namespace;
  settings.default.initLevelSettings();
  for(const hook of hooks.filter(hook=>hook.name==='init'))await hook.callback();
  api.registerVehicleDirectory();
  return {api,game,ui,interfaces,hooks,registered,values,folderSheets,actors,scenes,actorUpdates,renders,
    async call(name,...args){for(const hook of [...hooks])if(hook.name===name)await hook.callback(...args);}};
}

test('configured directories retain classification and expose working personal favorites once',async()=>{
  const f=await fixture(),identities=tabs.map(tab=>f.interfaces[tab]),hookCount=f.hooks.length;
  f.api.registerVehicleDirectory();
  assert.deepEqual(tabs.map(tab=>f.interfaces[tab]),identities);assert.equal(f.hooks.length,hookCount);assert.equal(f.folderSheets.length,1);
  for(const key of ['npcSessionFavorites','directorySessionFavorites','npcFolderIcons']){
    const config=f.registered.get(key);assert.equal(config.scope,'user');assert.equal(config.config,false);
  }
  assert.deepEqual(f.values.get('npcSessionFavorites'),['saved-npc']);
  const pc={id:'pc',type:'character',visible:true,getFlag:()=>undefined},ship={id:'ship',type:'vehicle',visible:true,getFlag:()=>false};f.actors.push(pc,ship);
  const app=new f.interfaces.actors();app.collection=f.actors;app.tree={root:true,visible:true,entries:[pc,ship],children:[]};f.ui.actors=app;
  const context={};await app._prepareDirectoryContext(context,{});
  assert.deepEqual(Array.from(context.tree.entries),[pc]);
  const pin=app.constructor.DEFAULT_OPTIONS.actions.ffgNpcPin;
  await pin.call(app,{stopPropagation(){}},{closest:()=>({dataset:{entryId:'pc'}})});
  assert.deepEqual(Array.from(f.values.get('directorySessionFavorites').actors),['pc']);
  assert.deepEqual(f.values.get('directorySessionFavorites').scenes,['saved-scene']);
  const menu=app._getEntryContextOptions();assert.equal(menu.some(option=>option.label==='SWFFG.NpcSession.LinkScenes'||option.label===f.game.i18n.localize('SWFFG.NpcSession.LinkScenes')),false);
  app.rendered=false;app.popout={rendered:true};f.registered.get('directorySessionFavorites').onChange();
  assert.deepEqual(f.renders,['actors']);
});

test('the actual scene directory exposes optional GM storage menus and keeps settings scopes',async()=>{
  const f=await fixture(),app=new f.interfaces.scenes();
  assert.equal(f.registered.get('enableSceneStorage').scope,'world');assert.equal(f.values.get('enableSceneStorage'),false);
  const scene={id:'scene',uuid:'Scene.scene',documentName:'Scene'};f.scenes.push(scene);
  const row={closest:()=>({dataset:{entryId:'scene'}})},menus=app._getEntryContextOptions().filter(option=>option.label==='Ranger pour plus tard');
  assert.equal(menus.length,1);assert.equal(menus[0].visible(row),false);
  f.values.set('enableSceneStorage',true);f.game.user.getFlag=()=>({});
  assert.equal(menus[0].visible(row),true);
  f.game.user.isGM=false;assert.equal(menus[0].visible(row),false);
  assert.ok(app._getFolderContextOptions().some(option=>option.label==='Ranger pour plus tard'));
});

test('the restored scene cleanup patches only stale links and runs under the active GM',async()=>{
  const f=await fixture();f.scenes.push({id:'present'});
  f.actors.push({id:'actor',getFlag:()=>({present:true,deleted:true})});
  await f.call('deleteScene',{});
  assert.deepEqual(f.actorUpdates,[[{_id:'actor','flags.starwarsffg.directorySceneLinks.-=deleted':null}]]);
  f.game.user.isActiveGM=false;await f.call('deleteScene',{});
  assert.equal(f.actorUpdates.length,1);
});

test('French and English labels cover directory views, favorites, links and folder configuration',async()=>{
  for(const language of ['fr','en']){
    const labels=JSON.parse(await readFile(new URL('../../lang/'+language+'.json',import.meta.url),'utf8'));
    for(const name of ['All','Session','Pin','Unpin','Empty','Scene','SceneEmpty','NoViewedScene','LinkScenes','LinkScenesTitle','ViewedScene','LinkScenesHint','NoVisibleScenes','SceneLinkError','Views','Error','FolderIconLabel','FolderIconError','Icon.none','Icon.folder-open','Icon.robot','Icon.rebel-alliance']){
      assert.equal(typeof labels['SWFFG.NpcSession.'+name],'string',language+': '+name);
      assert.ok(labels['SWFFG.NpcSession.'+name].length);
    }
  }
});

test('scene membership follows placed tokens immediately and ignores old manual links',async()=>{
  const f=await fixture(),actor={id:'pc',type:'character',visible:true,getFlag:()=>({viewed:true})};f.actors.push(actor);
  const scene={id:'viewed',visible:true,tokens:[]};f.scenes.push(scene);f.scenes.viewed=scene;
  const app=new f.interfaces.actors();app.collection=f.actors;app.tree={root:true,visible:true,entries:[actor],children:[]};
  await app.constructor.DEFAULT_OPTIONS.actions.ffgNpcView.call(app,{stopPropagation(){}},{dataset:{view:'scene'}});
  const first={};await app._prepareDirectoryContext(first,{});assert.equal(first.tree.entries.length,0);
  scene.tokens.push({actorId:'pc',actor,hidden:false});
  const second={};await app._prepareDirectoryContext(second,{});assert.deepEqual(Array.from(second.tree.entries),[actor]);
  scene.tokens=[];const third={};await app._prepareDirectoryContext(third,{});assert.equal(third.tree.entries.length,0);
});
