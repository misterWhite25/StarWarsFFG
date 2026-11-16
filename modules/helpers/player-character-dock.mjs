import {fieldsAffect,identityFields} from './actor-change-fields.mjs';
import {playerCharacters,collapsedCharacters} from './player-character-data.mjs';

const scope='starwarsffg',setting='enablePlayerCharacterPortraits',flag='collapsedCharacterPortraits',id='ffg-player-characters';
let frame,stylesReady=false,writes=Promise.resolve();
const label=key=>game.i18n.localize('SWFFG.UI.PlayerCharacters.'+key);
const report=error=>{console.error('Star Wars FFG | Player character portraits',error);ui.notifications.warn(error.message);};

function requestRender(){
  if(frame)return;
  frame=requestAnimationFrame(()=>{frame=null;renderPlayerCharacters();});
}

function controlledActor(actorId){
  return playerCharacters(game.actors,game.user).find(actor=>actor.id===actorId);
}

async function openSheet(actorId){
  const actor=controlledActor(actorId);if(!actor)return;
  const sheet=actor.sheet;await sheet.render({force:true});sheet.bringToFront?.();
}

function togglePortrait(actorId){
  writes=writes.catch(()=>{}).then(async()=>{
    if(!controlledActor(actorId))return;
    const collapsed=collapsedCharacters(game.user.getFlag(scope,flag));
    if(collapsed.has(actorId))collapsed.delete(actorId);else collapsed.add(actorId);
    await game.user.setFlag(scope,flag,[...collapsed]);requestRender();
  }).catch(report);
}

function makeButton(actor){
  const button=document.createElement('button');button.type='button';button.className='ffg-player-character';button.dataset.actorId=actor.id;
  const portrait=document.createElement('img');portrait.className='ffg-player-character-image';portrait.alt='';portrait.draggable=false;
  const name=document.createElement('span');name.className='ffg-player-character-name';button.append(portrait,name);
  button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();void openSheet(actor.id).catch(report);});
  button.addEventListener('contextmenu',event=>{event.preventDefault();event.stopPropagation();togglePortrait(actor.id);});
  return button;
}

export function renderPlayerCharacters(){
  let dock=document.getElementById(id);
  if(!game.ready||!stylesReady||game.user.isGM||!game.settings.get(scope,setting)){
    dock?.remove();return;
  }
  const actors=playerCharacters(game.actors,game.user),input=document.getElementById('chat-message');
  if(!actors.length||!input?.isConnected){dock?.remove();return;}
  if(!dock){dock=document.createElement('nav');dock.id=id;dock.setAttribute('aria-label',label('Label'));}
  const collapsed=collapsedCharacters(game.user.getFlag(scope,flag)),existing=new Map([...dock.children].map(button=>[button.dataset.actorId,button]));
  for(const actor of actors){
    const button=existing.get(actor.id)??makeButton(actor);existing.delete(actor.id);
    const reduced=collapsed.has(actor.id),portrait=button.querySelector('img'),name=button.querySelector('.ffg-player-character-name');
    button.classList.toggle('is-collapsed',reduced);button.dataset.collapsed=String(reduced);portrait.hidden=reduced;
    const source=actor.img||'icons/svg/mystery-man.svg';if(portrait.getAttribute('src')!==source)portrait.src=source;
    if(name.textContent!==actor.name)name.textContent=actor.name;
    const title=game.i18n.format('SWFFG.UI.PlayerCharacters.OpenSheet',{name:actor.name});
    button.setAttribute('aria-label',title);button.title=title+'\n'+label(reduced?'ExpandHint':'CollapseHint');
    dock.append(button);
  }
  for(const button of existing.values())button.remove();
  if(dock.nextElementSibling!==input)input.before(dock);
}

Hooks.once('init',()=>{
  game.settings.register(scope,setting,{
    name:'SWFFG.UI.PlayerCharacters.SettingName',hint:'SWFFG.UI.PlayerCharacters.SettingHint',
    scope:'world',config:true,restricted:true,type:Boolean,default:true,onChange:requestRender
  });
  const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('../../styles/player-character-dock.css',import.meta.url).href;
  link.addEventListener('load',()=>{stylesReady=true;requestRender();},{once:true});document.head.append(link);
});
Hooks.once('ready',requestRender);
Hooks.on('renderChatInput',requestRender);
for(const hook of ['createActor','deleteActor'])Hooks.on(hook,actor=>{if(['character','minion','rival','nemesis'].includes(actor.type))requestRender();});
Hooks.on('updateActor',(_actor,changes)=>{if(fieldsAffect(changes,identityFields))requestRender();});
Hooks.on('updateUser',user=>{if(user.id===game.user.id)requestRender();});
