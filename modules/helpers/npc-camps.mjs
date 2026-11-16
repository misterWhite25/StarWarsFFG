import {installLegacySlotCleanup} from './combatant-removal.mjs';
import {installActorCampSheet} from './actor-camp-sheet.mjs';
import {installDirectoryCamps} from './directory-camps.mjs';
const scope='starwarsffg';
let queue=Promise.resolve();
const serial=fn=>{const next=queue.catch(()=>{}).then(fn);queue=next;return next;};
export function npcDisposition(entry){return Number(entry.token?.disposition??entry.participant?.token?.disposition??entry.actor?.prototypeToken?.disposition??0);}
export function npcCampInfo(entry,{player=null}={}){
  if(player===null)player=globalThis.game?.users?.some(user=>!user.isGM&&user.character&&(user.character.uuid===entry.actor?.uuid||entry.actor?.type==='character'&&user.character.id===entry.actor.id))??false;
  const value=npcDisposition(entry),key=value===1?'friendly':value===-1?'hostile':value===-2?'secret':'neutral';
  const label=key==='friendly'?(player?'PJ allié':'PNJ allié'):key==='hostile'?(player?'PJ adverse':'Adversaire'):key==='secret'?'Camp masqué':'Neutre';
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
  if(!game.user.isGM)throw Error('Seul le MJ peut changer le camp.');
  if(![-2,-1,0,1].includes(Number(value)))throw Error('Camp invalide.');
  const token=entry.token??entry.participant?.token,actor=token?game.actors.get(token.actorId):entry.actor;
  if(!token&&!actor)throw Error('Ce personnage n’est plus disponible.');
  if(token)await token.update({disposition:Number(value)});
  if((future||!token)&&actor)await actor.update({'prototypeToken.disposition':Number(value)});
  for(const combat of game.combats)if(token&&combat.combatants.some(p=>p.token?.uuid===token.uuid))await repairCombatCamps(combat);
  Hooks.callAll('ffgNpcCampChanged');return npcCampInfo({...entry,token});
}
export async function chooseNpcCamp(entry){
  if(!game.user.isGM)return;
  const body=document.createElement('div'),label=document.createElement('label'),select=document.createElement('select');label.textContent='Camp';select.name='camp';
  for(const [value,text] of [[1,'Allié des joueurs'],[-1,'Adversaire'],[0,'Neutre'],[-2,'Masqué']]){const option=document.createElement('option');option.value=String(value);option.textContent=text;option.defaultSelected=value===npcDisposition(entry);select.append(option);}select.value=String(npcDisposition(entry));label.append(select);body.append(label);
  const defaults=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.name='future';check.defaultChecked=true;check.checked=true;defaults.append(check,' Utiliser aussi ce camp pour les futurs pions de cette fiche');body.append(defaults);
  const chosen=await foundry.applications.api.DialogV2.wait({window:{title:'Camp de '+(entry.name??entry.actor?.name??'ce personnage')},content:body,rejectClose:false,buttons:[{action:'save',label:'Appliquer le camp',callback:(_event,button)=>({value:Number(button.form.elements.camp.value),future:button.form.elements.future.checked})},{action:'cancel',label:'Annuler',callback:()=>null}]});
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
    if(!game.user.isGM&&participant.hidden)continue;
    const info=npcCampInfo({actor:participant.actor,token:participant.token});row.dataset.npcCamp=info.key;heading.title=participant.name;
    if(name.querySelector('[data-npc-camp-control]'))continue;
    const badge=document.createElement(game.user.isGM?'button':'span');badge.className='nc-camp-label';badge.dataset.npcCampControl='';badge.textContent=info.label;badge.title=info.label+(game.user.isGM?' - changer le camp':'');
    if(game.user.isGM){badge.type='button';badge.setAttribute('aria-label','Camp de '+participant.name+' : '+info.label);badge.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();chooseNpcCamp({actor:participant.actor,token:participant.token,name:participant.name,participant}).catch(error=>ui.notifications.warn(error.message));});}
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
