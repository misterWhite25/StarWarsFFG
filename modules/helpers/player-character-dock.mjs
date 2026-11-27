import {fieldsAffect,identityFields} from './actor-change-fields.mjs';
import {characterShortcuts,collapsedCharacters,gmShortcutFlag,gmCharacterShortcutKey,gmCharacterShortcut} from './player-character-data.mjs';
import {movableHud,shortcutPositionKey} from './character-shortcut-position.mjs';

const scope='starwarsffg',setting='enablePlayerCharacterPortraits',flag='collapsedCharacterPortraits',id='ffg-player-characters';
const gmSetting='enableGmCharacterShortcuts';
let frame,position,stylesReady=false,writes=Promise.resolve();
const label=key=>game.i18n.localize('SWFFG.UI.PlayerCharacters.'+key);
const gmLabel=key=>game.i18n.localize('SWFFG.UI.GMCharacters.'+key);
const report=error=>{console.error('Star Wars FFG | Character shortcuts',error);ui.notifications.warn(error.message);};

function requestRender(){
  if(frame)return;
  frame=requestAnimationFrame(()=>{frame=null;renderPlayerCharacters();});
}

function shortcut(key){
  return characterShortcuts(game.actors,game.user).find(entry=>entry.key===key);
}

async function openSheet(key){
  const actor=shortcut(key)?.actor;if(!actor)return;
  const sheet=actor.sheet;await sheet.render({force:true});sheet.bringToFront?.();
  if(sheet.minimized)await sheet.maximize();
}

function togglePortrait(key){
  writes=writes.catch(()=>{}).then(async()=>{
    if(!shortcut(key))return;
    const collapsed=collapsedCharacters(game.user.getFlag(scope,flag));
    if(collapsed.has(key))collapsed.delete(key);else collapsed.add(key);
    await game.user.setFlag(scope,flag,[...collapsed]);requestRender();
  }).catch(report);
  return writes;
}

function changeGmShortcut(key,add){
  writes=writes.catch(()=>{}).then(async()=>{
    if(!game.user.isGM)return;
    const pinned=collapsedCharacters(game.user.getFlag(scope,gmShortcutFlag));
    if(add===false)pinned.delete(key);
    else if(gmCharacterShortcut(key,game.user))pinned.add(key);
    else return;
    await game.user.setFlag(scope,gmShortcutFlag,[...pinned]);requestRender();
  }).catch(report);
  return writes;
}

function makeButton(entry){
  const {key,actor}=entry,container=document.createElement('div');container.className='ffg-player-character-entry';container.dataset.shortcutKey=key;
  const button=document.createElement('button');button.type='button';button.className='ffg-player-character';button.dataset.actorId=actor.id;
  const portrait=document.createElement('img');portrait.className='ffg-player-character-image';portrait.alt='';portrait.draggable=false;
  const name=document.createElement('span');name.className='ffg-player-character-name';button.append(portrait,name);
  button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();void openSheet(key).catch(report);});
  button.addEventListener('contextmenu',event=>{event.preventDefault();event.stopPropagation();void togglePortrait(key);});
  container.append(button);
  if(game.user.isGM){
    const remove=document.createElement('button');remove.type='button';remove.className='ffg-character-shortcut-remove';remove.textContent='×';
    remove.title=gmLabel('Unpin');remove.setAttribute('aria-label',gmLabel('Unpin'));
    remove.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();void changeGmShortcut(key,false);});container.append(remove);
  }
  return container;
}

export function renderPlayerCharacters(){
  let dock=document.getElementById(id);
  if(!game.ready||!stylesReady||!game.settings.get(scope,game.user.isGM?gmSetting:setting)){
    removeDock(dock);return;
  }
  const entries=characterShortcuts(game.actors,game.user),input=document.getElementById('chat-message');
  if(!entries.length||(!input?.isConnected&&!position?.floating)){removeDock(dock);return;}
  if(!dock){
    position?.destroy();position=null;dock=document.createElement('nav');dock.id=id;
    const handle=document.createElement('button');handle.type='button';handle.className='ffg-character-shortcut-handle';
    handle.title=label('MoveHint');handle.setAttribute('aria-label',label('Move'));
    const icon=document.createElement('i');icon.className='fas fa-grip-horizontal';icon.setAttribute('aria-hidden','true');handle.append(icon);
    const list=document.createElement('div');list.className='ffg-player-character-list';dock.append(handle,list);
  }
  dock.classList.toggle('is-gm',game.user.isGM);dock.setAttribute('aria-label',game.user.isGM?gmLabel('Label'):label('Label'));
  const list=dock.querySelector('.ffg-player-character-list');
  const collapsed=collapsedCharacters(game.user.getFlag(scope,flag)),existing=new Map([...list.children].map(entry=>[entry.dataset.shortcutKey,entry]));
  for(const entry of entries){
    const container=existing.get(entry.key)??makeButton(entry);existing.delete(entry.key);
    const button=container.querySelector('.ffg-player-character'),reduced=collapsed.has(entry.key),portrait=button.querySelector('img'),name=button.querySelector('.ffg-player-character-name');
    container.classList.toggle('is-collapsed',reduced);button.classList.toggle('is-collapsed',reduced);button.dataset.collapsed=String(reduced);portrait.hidden=reduced;
    const source=entry.img||'icons/svg/mystery-man.svg';if(portrait.getAttribute('src')!==source)portrait.src=source;
    if(name.textContent!==entry.name)name.textContent=entry.name;
    const title=game.i18n.format('SWFFG.UI.PlayerCharacters.OpenSheet',{name:entry.name});
    button.setAttribute('aria-label',title);button.title=title+'\n'+label(reduced?'ExpandHint':'CollapseHint');
    list.append(container);
  }
  for(const button of existing.values())button.remove();
  if(!position?.floating&&dock.nextElementSibling!==input)input.before(dock);
  position??=movableHud(dock,dock.querySelector('.ffg-character-shortcut-handle'),{
    key:shortcutPositionKey(game.world.id,game.user.id),anchor:()=>document.getElementById('chat-message')
  });
  position.refresh();
}

function removeDock(dock){position?.destroy();position=null;dock?.remove();}

Hooks.once('init',()=>{
  game.settings.register(scope,setting,{
    name:'SWFFG.UI.PlayerCharacters.SettingName',hint:'SWFFG.UI.PlayerCharacters.SettingHint',
    scope:'world',config:true,restricted:true,type:Boolean,default:true,onChange:requestRender
  });
  game.settings.register(scope,gmSetting,{
    name:'SWFFG.UI.GMCharacters.SettingName',hint:'SWFFG.UI.GMCharacters.SettingHint',
    scope:'user',config:true,restricted:true,type:Boolean,default:true,onChange:requestRender
  });
  const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('../../styles/player-character-dock.css',import.meta.url).href;
  link.addEventListener('load',()=>{stylesReady=true;requestRender();},{once:true});document.head.append(link);
});
Hooks.once('ready',requestRender);
Hooks.on('renderChatInput',requestRender);
for(const hook of ['createActor','deleteActor'])Hooks.on(hook,actor=>{if(['character','minion','rival','nemesis'].includes(actor.type))requestRender();});
Hooks.on('updateActor',(_actor,changes)=>{if(fieldsAffect(changes,identityFields))requestRender();});
Hooks.on('updateUser',user=>{if(user.id===game.user.id)requestRender();});
function rowActor(app,row){
  const token=row.closest?.('[data-ffg-scene-token]')?.dataset.ffgSceneToken;
  return token?fromUuidSync(token)?.actor:app.collection.get(row.dataset.entryId);
}
Hooks.on('getActorContextOptions',(app,options)=>{
  for(const pinned of [false,true])options.push({
    group:'starwarsffg',label:gmLabel(pinned?'Unpin':'Pin'),icon:pinned?'fa-solid fa-xmark':'fa-solid fa-thumbtack',
    visible:row=>{
      if(!game.user.isGM||!game.settings.get(scope,gmSetting))return false;
      const key=gmCharacterShortcutKey(rowActor(app,row));
      return !!key&&collapsedCharacters(game.user.getFlag(scope,gmShortcutFlag)).has(key)===pinned;
    },
    onClick:(_event,row)=>changeGmShortcut(gmCharacterShortcutKey(rowActor(app,row)),!pinned)
  });
});
Hooks.on('updateToken',(_token,changes)=>{if(game.user.isGM&&fieldsAffect(changes,['name','texture','actorId','actorLink','delta.name','delta.img','delta.type']))requestRender();});
for(const hook of ['deleteToken','deleteScene'])Hooks.on(hook,()=>{if(game.user.isGM)requestRender();});
