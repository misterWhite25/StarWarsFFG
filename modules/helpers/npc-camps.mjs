import {installLegacySlotCleanup} from './combatant-removal.mjs';
import {installActorCampSheet} from './actor-camp-sheet.mjs';
import {installDirectoryCamps} from './directory-camps.mjs';
const scope='starwarsffg';
const campLabel = key => game.i18n.localize('SWFFG.Combats.Camp.' + key);
let queue=Promise.resolve();
const serial=fn=>{const next=queue.catch(()=>{}).then(fn);queue=next;return next;};
export function npcDisposition(entry){return Number(entry.token?.disposition??entry.participant?.token?.disposition??entry.actor?.prototypeToken?.disposition??0);}
export function npcCampInfo(entry,{player=null}={}){
  if(player===null)player=globalThis.game?.users?.some(user=>!user.isGM&&user.character&&(user.character.uuid===entry.actor?.uuid||entry.actor?.type==='character'&&user.character.id===entry.actor.id))??false;
  const value=npcDisposition(entry),key=value===1?'friendly':value===-1?'hostile':value===-2?'secret':'neutral';
  const label = campLabel({friendly: player ? 'AlliedPC' : 'AlliedNPC', hostile: player ? 'OpposingPC' : 'Enemy', secret: 'Secret', neutral: 'Neutral'}[key]);
  return {value,key,label};
}
export function repairCampClaims(turns,claims={}){
  const byId=new Map(turns.map(turn=>[turn.id,turn])),affected=new Set();
  for(const [slot,id] of Object.entries(claims)){const source=byId.get(slot),actor=byId.get(id);if(source&&actor&&Number(source.token?.disposition??source.disposition)!==Number(actor.token?.disposition??actor.disposition)){affected.add(slot);affected.add(id);}}
  let changed=true;while(changed){changed=false;for(const [slot,id] of Object.entries(claims))if(affected.has(slot)||affected.has(id)){if(!affected.has(slot)||!affected.has(id))changed=true;affected.add(slot);affected.add(id);}}
  const next={...claims};for(const id of affected){if(byId.get(id)?.actor)next[id]=id;else delete next[id];}return next;
}
export async function repairCombatCamps(combat){
  if(!game.user.isGM||game.users.activeGM?.id!==game.user.id||!combat?.started||combat._ffgRosterMutation)return;
  return serial(async()=>{if(combat._ffgRosterMutation)return;const all=combat.getFlag(scope,'combatClaims')??{},claims=all[combat.round]??{},next=repairCampClaims(combat.turns,claims),update={};for(const id of new Set([...Object.keys(claims),...Object.keys(next)]))if(claims[id]!==next[id])update['flags.starwarsffg.combatClaims.'+combat.round+'.'+(next[id]===undefined?'-=':'')+id]=next[id]??null;if(Object.keys(update).length)await combat.update(update);});
}
export async function setNpcCamp(entry,value,{future=true}={}){
  if(!game.user.isGM)throw Error(campLabel('GMOnly'));
  if(![-2,-1,0,1].includes(Number(value)))throw Error(campLabel('Invalid'));
  const token=entry.token??entry.participant?.token,actor=token?game.actors.get(token.actorId):entry.actor;
  if(!token&&!actor)throw Error(campLabel('Missing'));
  if(token)await token.update({disposition:Number(value)});
  if((future||!token)&&actor)await actor.update({'prototypeToken.disposition':Number(value)});
  for(const combat of game.combats)if(token&&combat.combatants.some(p=>p.token?.uuid===token.uuid))await repairCombatCamps(combat);
  Hooks.callAll('ffgNpcCampChanged');return npcCampInfo({...entry,token});
}
export async function chooseNpcCamp(entry){
  if(!game.user.isGM)return;
  const body=document.createElement('div'),label=document.createElement('label'),select=document.createElement('select');label.textContent=campLabel('Side');select.name='camp';
  for(const [value,text] of [[1,'Ally'],[-1,'Enemy'],[0,'Neutral'],[-2,'Hidden']]){const option=document.createElement('option');option.value=String(value);option.textContent=campLabel(text);option.defaultSelected=value===npcDisposition(entry);select.append(option);}select.value=String(npcDisposition(entry));label.append(select);body.append(label);
  const defaults=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.name='future';check.defaultChecked=true;check.checked=true;defaults.append(check,' '+campLabel('Future'));body.append(defaults);
  const chosen=await foundry.applications.api.DialogV2.wait({window:{title:game.i18n.format('SWFFG.Combats.Camp.Title',{name:entry.name??entry.actor?.name??campLabel('Character')})},content:body,rejectClose:false,buttons:[{action:'save',label:campLabel('Apply'),callback:(_event,button)=>({value:Number(button.form.elements.camp.value),future:button.form.elements.future.checked})},{action:'cancel',label:'Cancel',callback:()=>false}]});
  if(chosen)await setNpcCamp(entry,chosen.value,{future:chosen.future});
}
function markCurrentTurn(root,combat){
  for(const row of root.querySelectorAll('li.combatant[data-slot-index]')){
    const current=!!combat.started&&row.classList.contains('active'),name=row.querySelector('.token-name');
    row.classList.toggle('nc-current-turn',current);
    if(current)row.setAttribute('aria-current','step');else row.removeAttribute('aria-current');
    const badges=name?.querySelector('.nc-turn-badges');
    if(badges){const camp=badges.querySelector('[data-npc-camp-control]');if(camp)name.append(camp);badges.remove();}
  }
}
export function compactTracker(tracker,html){
  const root=html?.querySelector?html:html?.[0],combat=tracker.viewed;if(!root||!combat)return;markCurrentTurn(root,combat);
  for(const row of root.querySelectorAll('li.combatant.claimed[data-slot-index]')){
    const participant=combat.combatants.get(row.dataset.combatantId||row.dataset.altId);
    if(!participant?.actor)continue;
    const name=row.querySelector('.token-name'),heading=name?.querySelector('h4'),controls=name?.querySelector('.combatant-controls')??row.querySelector(':scope>.combatant-controls');if(!name||!heading)continue;
    if(controls&&controls.parentElement!==row)row.insertBefore(controls,row.querySelector('.token-initiative'));
    const marker=heading.querySelector('.ffg-combat-talent-marker');if(marker&&controls)controls.prepend(marker);
    row.classList.add('nc-compact-combatant');
    if(!game.user.isGM&&(participant.hidden||participant.token?.hidden))continue;
    const info=npcCampInfo({actor:participant.actor,token:participant.token});row.dataset.npcCamp=info.key;heading.title=participant.name;
    if(name.querySelector('[data-npc-camp-control]'))continue;
    const badge=document.createElement(game.user.isGM?'button':'span');badge.className='nc-camp-label';badge.dataset.npcCampControl='';badge.textContent=info.label;badge.title=game.user.isGM ? info.label+' - '+campLabel('Change') : info.label;
    if(game.user.isGM){badge.type='button';badge.setAttribute('aria-label',game.i18n.format('SWFFG.Combats.Camp.Badge',{name:participant.name,side:info.label}));badge.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();chooseNpcCamp({actor:participant.actor,token:participant.token,name:participant.name,participant}).catch(error=>ui.notifications.warn(error.message));});}
    name.append(badge);
  }
}
export function installNpcCamps(){
  installDirectoryCamps();
  installActorCampSheet();
  installLegacySlotCleanup();
  Hooks.on('renderCombatTracker',compactTracker);
  Hooks.on('updateToken',(token,changes)=>{if(changes.disposition===undefined)return;for(const combat of game.combats)if(combat.combatants.some(p=>p.token?.uuid===token.uuid))void repairCombatCamps(combat).then(()=>ui.combat?.render()).catch(error=>ui.notifications.warn(error.message));});
  Hooks.on('ffgNpcCampChanged',()=>{ui.combat?.render();});
}
