import {cancelSummaryRenders,renderSummary,summaryDialog} from './summary-render.mjs';
import {rollContext} from './roll-context.mjs';
import {hasSummaryTalents} from './talent-summary.js';
import {equippedItems} from './equipment-summary.js';
import {rosterFilters,npcRosterFilter,npcRosterMatches,npcFavorites,toggleNpcFavorite} from './npc-roster-filters.mjs';
import DiceHelpers from './dice-helpers.js';
import {isPossession} from './inventory-location.js';
import {installNpcCamps,npcCampInfo} from './npc-camps.mjs';
import {DicePoolFFG} from '../dice/pool.js';
import {npcCatalogue,npcAbilityKind,normalizeNpc,npcAdversaryRank,npcSkillVisible} from './npc-command-data.mjs';
import {installNpcInitiative,hasActed} from './npc-initiative.mjs';
import {npcTurnReason,attachNpcBudget,reserveNpcAction,restoreNpcAction} from './npc-command-budget.mjs';
import {initiativeStamp} from '../space-combat/initiative.mjs';
import {stateFor,selectGroundSheetToken,requestMovementCommand} from './ground-movement-state.mjs';
import {board,command} from '../space-combat/board.mjs';
import {crewRoster,crewActor,actionRoleReason} from '../space-combat/crew-access.mjs';
import {ACTIONS,SECTORS,characterActionState} from '../space-combat/combat-rules.mjs';
import {openCombatRoll} from '../space-combat/combat-rolls.mjs';
import {weaponCrewCandidates} from './crew.js';
import {crewRolesForSkill} from './crew-role-definitions.mjs';
import {malfunctionNavigation} from './vehicle-malfunction-engine.js';
const scope='starwarsffg',personal=new Set(['character','minion','rival','nemesis','vehicle']),panels=new Map();
let sessionModel;
const labels={ability:'Capacité',forcepower:'Pouvoir de la Force','force-upgrade':'Amélioration de la Force',signatureability:'Capacité signature'};
const kinds={passive:'Passif',maneuver:'Manœuvre',reaction:'Broutille / réaction',action:'Action',manual:'Résolution manuelle'};
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const number=value=>Math.max(0,Number(value)||0);
const playerOwned=actor=>game.users.some(user=>!user.isGM&&actor.testUserPermission(user,'OWNER'));
const button=(label,cmd,attributes='')=>`<button type="button" data-npc-cmd="${cmd}" ${attributes}>${label}</button>`;
function stylesheet(){if(document.querySelector('link[data-npc-command]'))return;const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('../../styles/npc-command.css',import.meta.url).href;link.dataset.npcCommand='';document.head.append(link);}
export function npcRoster({includePlayers=false}={}) {
  const entries=[],seen=new Set();
  const boarded=new Set((board().ships??[]).flatMap(ship=>crewRoster(game.actors.get(ship.actorId)).map(member=>member.actor_id)));
  const add=(token,participant=null)=>{const actor=token?.actor;if(!actor||!personal.has(actor.type)||token.getFlag(scope,'npcInitiativeShadow')&&boarded.has(actor.id)||(!includePlayers&&playerOwned(actor))||seen.has(token.uuid))return;seen.add(token.uuid);entries.push({key:token.uuid,name:token.name,actor,token,participant,mode:'ground',group:actor.type==='minion'?'Groupe de sbires':actor.type==='nemesis'?'Némésis':actor.type==='rival'?'Rival':'Personnage'});};
  for(const participant of game.combat?.combatants??[])add(participant.token,participant);
  for(const token of canvas.scene?.tokens??[])add(token);
  for(const ship of board().ships??[]){const vehicle=game.actors.get(ship.actorId),members=new Map();for(const member of crewRoster(vehicle)){const actor=crewActor(member);if(member.integrated||!actor||(!includePlayers&&playerOwned(actor)))continue;const old=members.get(actor.id);if(old){old.roles.push(member.role);continue;}const entry={key:'space:'+ship.id+':'+actor.id,name:actor.name,actor,member,roles:[member.role],ship,vehicle,mode:'space',participant:game.combat?.combatants.find(p=>p.actor?.uuid===actor.uuid),group:ship.name};members.set(actor.id,entry);entries.push(entry);}}
  return entries;
}
function skillLabel(actor,key){const value=actor.system.skills?.[key];return game.i18n.localize(value?.label??key);}
function targets(entry){return entry.mode==='space'?(board().ships??[]).filter(ship=>ship.id!==entry.ship.id).map(ship=>({id:ship.id,name:ship.name})):[...game.user.targets].map(token=>({id:token.document.uuid,name:token.name}));}
function choiceForItem(item){return {kind:item.type==='forcepower'||item.type==='signatureability'?'force':'weapon',id:item.id,type:item.type,name:item.name};}
function currentEntry(model){return npcRoster(model).find(entry=>entry.key===model.selected);}
function reasonFor(entry,choice){
  if(!entry)return 'Sélectionnez un PNJ.';
  const reason=npcTurnReason(entry);if(reason)return reason;
  if(entry.mode==='space'){
    const used=characterActionState(board().ships,entry.actor.id,board().round);if(!game.user.isGM&&(used.action||used.ended))return 'Action déjà utilisée ou tour terminé.';
    if(choice?.kind==='space-action')return actionRoleReason(entry.vehicle,entry.actor.id,choice.id);
    if(choice?.kind==='ship-weapon')return actionRoleReason(entry.vehicle,entry.actor.id,'attack');
  }
  return '';
}
async function nativeGroundRoll(entry,choice,difficulty) {
  const actor=entry.actor;selectGroundSheetToken(actor,entry.token);
  let builder;
  if(choice.kind==='weapon')builder=await DiceHelpers.rollItem(choice.id,actor.id,undefined,undefined,{actor,tokenUuid:entry.token?.uuid});
  else {
    const data=rollContext(actor,{tokenUuid:entry.token?.uuid});
    if(choice.kind==='force'){
      const item=actor.items.get(choice.id);if(!item)throw Error('Ce pouvoir n’existe plus.');
      const force=Math.max(0,number(actor.system.stats.forcePool?.max)-number(actor.system.stats.forcePool?.value));
      if(!force)throw Error('Aucun dé de Force disponible.');
      builder=await DiceHelpers.displayRollDialog(data,new DicePoolFFG({force}),item.name,item.name,item);
    }else {
      const skill=actor.system.skills?.[choice.id],characteristic=actor.system.characteristics?.[skill?.characteristic];
      if(!skill||!characteristic)throw Error('Compétence introuvable.');
      const combat=skill.type==='Combat'||skill.combat===true||['Brawl','Melee','Lightsaber','Gunnery','Ranged: Heavy','Ranged: Light'].includes(choice.id);
      builder=await DiceHelpers.rollSkillDirect(skill,characteristic,difficulty,data,undefined,undefined,{actor,skillKey:choice.id,nonAttack:!combat});
    }
  }
  return attachNpcBudget(builder,entry);
}
async function execute(model,choice,entry) {
  if(!choice)throw Error('Choisissez une compétence, une arme ou une action.');
  const reason=reasonFor(entry,choice);if(reason)throw Error(reason);
  const {targetId,sector,difficulty}=model;
  if(entry.mode==='space'){
    const ship=board().ships.find(ship=>ship.id===entry.ship.id);
    if(choice.kind==='ship-weapon'){
      const weapon=entry.vehicle.items.get(choice.id),member=weaponMember(entry,weapon);if(!member)throw Error('Cette arme n’est pas accessible à ce poste.');
      return openCombatRoll(ship,member,{weapon,targetId,sector});
    }
    if(choice.kind==='space-action'){
      if(choice.id==='attack')throw Error('Choisissez une arme de vaisseau.');
      const def=ACTIONS.find(a=>a.id===choice.id),request={shipId:ship.id,version:ship.version,crewId:entry.actor.id,combatAction:choice.id,targetId,sector};
      if(def.skills||choice.id==='repairCritical'){
        const body=document.createElement('div');
        if(def.skills)body.innerHTML=`<label>Compétence<select name="skill">${def.skills.map(key=>`<option value="${esc(key)}">${esc(skillLabel(entry.actor,key))}</option>`).join('')}</select></label>`;
        else body.innerHTML=`<label>Dégât critique<select name="critical">${[...entry.vehicle.items].filter(i=>i.type==='criticaldamage').map(i=>`<option value="${i.id}">${esc(i.name)}</option>`).join('')}</select></label>`;
        const result=await foundry.applications.api.DialogV2.wait({window:{title:def.label},content:body,rejectClose:false,buttons:[{action:'confirm',label:'Effectuer l’action',callback:(_event,button)=>({skill:button.form.elements.skill?.value,criticalId:button.form.elements.critical?.value})},{action:'cancel',label:'Annuler',callback:()=>null}]});if(!result)return;Object.assign(request,result);
      }
      return command('combat',request);
    }
  }
  return nativeGroundRoll(entry,choice,difficulty);
}
function weaponMember(entry,weapon){if(!weapon)return null;return weaponCrewCandidates(weapon,crewRoster(entry.vehicle).filter(m=>m.actor_id===entry.actor.id),crewRolesForSkill(entry.vehicle,weapon.system.skill?.value),malfunctionNavigation(entry.vehicle))[0];}
async function manualAbility(entry,catalogueEntry){
  const kind=npcAbilityKind(catalogueEntry),reaction=kind==='reaction'||kind==='passive';
  const body=document.createElement('div');body.innerHTML=`<p>Résolvez les effets décrits dans le catalogue. Les effets rédigés en texte libre ne sont pas appliqués automatiquement.</p><label>Type d’utilisation<select name="kind"><option value="action">Action</option><option value="maneuver">Manœuvre</option><option value="reaction">Broutille / réaction</option></select></label><label>Stress personnel à payer<input type="number" name="strain" min="0" max="99" value="0"></label>`;
  body.querySelector('[name=kind]').value=reaction?'reaction':kind==='maneuver'?'maneuver':'action';
  const chosen=await foundry.applications.api.DialogV2.wait({window:{title:catalogueEntry.name},content:body,rejectClose:false,buttons:[{action:'use',label:'Confirmer l’utilisation',callback:(_event,button)=>({kind:button.form.elements.kind.value,strain:number(button.form.elements.strain.value)})},{action:'cancel',label:'Annuler',callback:()=>null}]});if(!chosen)return;
  const reason=npcTurnReason(entry,{reaction:chosen.kind==='reaction',maneuver:chosen.kind==='maneuver'});if(reason)throw Error(reason);
  if(chosen.strain&&entry.actor.type==='minion')throw Error('Un groupe de sbires ne peut pas payer de stress personnel.');
  if(chosen.kind==='maneuver'&&entry.token){const state=stateFor(entry.token);await requestMovementCommand({kind:'other',tokenUuid:entry.token.uuid,context:state.context,revision:state.revision,payment:'strain'});}
  const transaction=chosen.kind==='action'?await reserveNpcAction(entry,initiativeStamp()):null;
  try{if(chosen.strain){const resource=entry.actor.type==='rival'?'wounds':'strain';await entry.actor.update({['system.stats.'+resource+'.value']:number(entry.actor.system.stats[resource]?.value)+chosen.strain});}}
  catch(error){await restoreNpcAction(transaction);throw error;}
  await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor:entry.actor,token:entry.token}),content:`<p>${esc(entry.name)} : ${esc(catalogueEntry.name)} (${esc(kinds[chosen.kind])}${chosen.strain?', '+chosen.strain+' stress':''}). Effets résolus par le MJ.</p>`,whisper:[game.user.id]});
}
function headerHtml(model){
  return `<div class="nc-toolbar nc-filter"><input type="search" data-npc-field="search" aria-label="Filtrer les PNJ" placeholder="Rechercher un personnage" value="${esc(model.search)}"></div>`;
}
function rosterTypeBadge(actor){
  const type=actor.type,quantity=actor.system.quantity;
  const label=type==='minion'?(number(quantity?.value)===1?'Sbire : 1':'Sbires : '+number(quantity?.value)):{character:'Personnage',rival:'Rival',nemesis:'Némésis',vehicle:'Véhicule'}[type]??type;
  const title=type==='minion'?number(quantity?.value)+' sbire(s) présent(s) sur '+number(quantity?.max):label;
  return `<small class="nc-roster-type" data-npc-type="${esc(type)}" title="${esc(title)}">${esc(label)}</small>`;
}
function adversaryBadge(actor){
  const rank=npcAdversaryRank(actor,game.settings.get(scope,'adversaryItemName'));
  return rank?`<small class="nc-roster-adversary" title="Rang du talent Adversaire : ${rank}">Adversaire <span>${rank}</span></small>`:'';
}
function rosterSide(entry){
  const camp=npcCampInfo(entry).key;
  if(camp==='hostile')return 'enemies';if(camp==='friendly')return 'allies';
  if(game.users.some(user=>!user.isGM&&user.character&&(user.character.uuid===entry.actor.uuid||entry.actor.type==='character'&&user.character.id===entry.actor.id)))return 'allies';
  return null;
}
function matchingRoster(model,entries){
  const query=normalizeNpc(model.search),filter=npcRosterFilter(model),favorites=npcFavorites();
  return entries.filter(e=>npcRosterMatches(e,filter,{favorites})&&(!query||normalizeNpc(e.name+e.group+e.roles?.join(' ')).includes(query)));
}
function rosterHtml(model,entries,matching=matchingRoster(model,entries)){
  const favorites=npcFavorites(),filter=npcRosterFilter(model);
  const main=matching.filter(e=>rosterSide(e)===model.side),neutral=matching.filter(e=>!rosterSide(e));
  const row=e=>`<div class="nc-person ${model.selected===e.key?'selected':''}" data-npc-entry="${esc(e.key)}" data-npc-camp="${npcCampInfo(e).key}"><button type="button" data-npc-select="${esc(e.key)}"><img src="${esc(e.token?.texture?.src??e.actor.img)}" alt=""><span class="nc-roster-info"><span class="nc-roster-name"><strong>${esc(e.name)}</strong>${rosterTypeBadge(e.actor)}${adversaryBadge(e.actor)}</span><small class="nc-roster-camp">${esc(npcCampInfo(e).label)}</small><small>${hasActed(game.combat,e.participant)?'Action utilisée':e.participant?.isDefeated?'Neutralisé':e.participant?'Dans l’initiative':'Hors initiative'}</small></span></button><button type="button" class="nc-favorite" data-npc-favorite="${esc(e.key)}" aria-pressed="${favorites.has(e.key)}" aria-label="${esc((favorites.has(e.key)?'Retirer des favoris : ':'Ajouter aux favoris : ')+e.name)}" title="${favorites.has(e.key)?'Retirer des favoris':'Ajouter aux favoris'}"><i class="${favorites.has(e.key)?'fa-solid':'fa-regular'} fa-star" aria-hidden="true"></i></button></div>`;
  const listId=model.panelId+'-roster-'+model.side;
  return `<h3>PNJ et équipages</h3><nav class="nc-roster-tabs" role="tablist" aria-label="Camps du combat">${[['allies','Joueurs et alliés'],['enemies','Ennemis']].map(([side,label])=>`<button type="button" role="tab" class="nc-side-tab" data-npc-side="${side}" id="${esc(model.panelId)}-side-${side}" aria-selected="${model.side===side}" aria-controls="${esc(model.panelId)}-roster-${side}" tabindex="${model.side===side?0:-1}">${label} <span>(${matching.filter(e=>rosterSide(e)===side).length})</span></button>`).join('')}</nav><label class="nc-roster-filter"><span>Afficher</span><select data-npc-roster-filter aria-label="Filtrer les personnages affichés">${rosterFilters.map(([key,label])=>`<option value="${key}" ${filter===key?'selected':''}>${label}</option>`).join('')}</select></label><div class="nc-roster" id="${esc(listId)}" role="tabpanel" aria-labelledby="${esc(model.panelId)}-side-${model.side}">${main.map(row).join('')||'<p class="nc-roster-empty">Aucun personnage.</p>'}${neutral.length?`<h4 class="nc-neutral-heading">Neutres / camp masqué</h4>${neutral.map(row).join('')}`:''}</div>`;
}
function statsHtml(entry){
  const stats=entry.actor.system.stats??{},fields=[['wounds','Blessures'],['strain','Stress'],['soak','Encaissement']];
  const defence=stats.defence&&(number(stats.defence.melee)||number(stats.defence.ranged))?`<label class="nc-defence">Défense<span class="nc-defence-values"><span class="nc-defence-value"><strong>${number(stats.defence.melee)}</strong><small>Mêlée</small></span><span class="nc-defence-value"><strong>${number(stats.defence.ranged)}</strong><small>Distance</small></span></span></label>`:'';
  return `<div class="nc-stats">${fields.filter(([key])=>stats[key]&&(key!=='strain'||number(stats.strain.max)>0)).map(([key,label])=>`<label>${label}${['wounds','strain'].includes(key)?`<span><input type="number" min="0" data-npc-resource="${key}" value="${number(stats[key].value)}"> / ${number(stats[key].max)}</span>`:`<strong>${esc(stats[key].value??0)}</strong>`}</label>`).join('')}${defence}</div>`;
}
function commandCatalogue(actor){return npcCatalogue(actor).filter(item=>['ability','forcepower','force-upgrade','signatureability'].includes(item.type));}
function catalogueRank(item){
  const raw=item.system.ranks?.current??item.system.rank,value=Number(raw?.value??raw);
  return raw!==undefined&&raw!==null&&raw!==''&&Number.isFinite(value)?Math.max(0,value):null;
}
function catalogueItemHtml(item){
  const type=item.type,kind=npcAbilityKind(item),rank=catalogueRank(item);
  const actions=[
    ['forcepower','signatureability'].includes(type)?button('Préparer le pouvoir','power',`data-key="${esc(item.key)}"`):'',
    ['ability','force-upgrade','signatureability'].includes(type)&&kind!=='passive'?button('Résoudre un effet manuel','manual',`data-key="${esc(item.key)}"`):''
  ].join('');
  return `<article class="nc-catalogue-card" data-npc-catalogue="${esc(item.key)}">
    <header class="nc-capability-heading"><span class="nc-catalogue-title">${esc(item.name)}</span><span class="nc-catalogue-tags"><span class="nc-catalogue-kind" data-kind="${kind}">${esc(kinds[kind])}</span>${rank!==null?`<span class="nc-catalogue-rank">${esc(game.i18n.format('SWFFG.UI.Talent.RankNumber',{rank}))}</span>`:''}</span></header>
    <div class="nc-catalogue-body">${item.source?`<small class="nc-catalogue-source">${esc(item.source)}</small>`:''}<div class="nc-description" data-npc-description="${esc(item.key)}"></div><div class="nc-item-buttons">${actions}</div>${item.system.quantity!==undefined?`<small class="nc-catalogue-quantity">Quantité : ${esc(item.system.quantity?.value??item.system.quantity)}</small>`:''}</div>
  </article>`;
}
function catalogueHtml(model,entry,all=commandCatalogue(entry.actor)){
  const query=normalizeNpc(model.catalogueSearch),filtered=all.filter(item=>!query||normalizeNpc(item.name+item.source+(labels[item.type]??item.type)).includes(query));
  const types=[...new Set(filtered.map(e=>e.type))];
  return `<section class="nc-catalogue"><input type="search" aria-label="Rechercher dans le catalogue" data-npc-field="catalogueSearch" placeholder="Pouvoir, capacité..." value="${esc(model.catalogueSearch)}">${types.map(type=>{
    const items=filtered.filter(item=>item.type===type);
    return `<section class="nc-category" data-npc-category="${esc(type)}"><h3 class="nc-capability-category"><span>${esc(labels[type]??type)}</span><span class="nc-category-count">${items.length}</span></h3>${items.map(catalogueItemHtml).join('')}</section>`;
  }).join('')}</section>`;
}
const essentialSkills=new Set(['cool','vigilance','perception','discipline','athletics','coordination','resilience','brawl','melee','rangedlight','rangedheavy','gunnery','lightsaber']);
const spaceSkills=new Set(['astrogation','pilotingplanetary','pilotingspace','mechanics','computers']);
function principalSkills(entry){
  const isNpc=entry.actor.type!=='character'||!playerOwned(entry.actor);
  const priority=([,skill])=>(skill.type==='Combat'?2:0)+(skill.useForInitiative?1:0);
  return Object.entries(entry.actor.system.skills??{})
    .filter(([key,skill])=>skill?.characteristic&&npcSkillVisible(entry.actor,key,isNpc))
    .filter(([key,skill])=>number(skill.rank)>0||skill.useForInitiative||essentialSkills.has(normalizeNpc(key))||entry.mode==='space'&&spaceSkills.has(normalizeNpc(key)))
    .sort((a,b)=>number(b[1].rank)-number(a[1].rank)||priority(b)-priority(a)||skillLabel(entry.actor,a[0]).localeCompare(skillLabel(entry.actor,b[0]),'fr')).slice(0,8);
}
function controlsHtml(model,entry,main){
  if(!entry)return '<p>Sélectionnez un personnage.</p>';
  if(entry.actor.type==='vehicle')return `<header class="nc-actor-title"><h3>${esc(entry.name)}</h3>${button('<i class="fa-solid fa-address-card" aria-hidden="true"></i> Fiche Combat','combat-sheet','class="nc-combat-sheet"')}</header>`;
  const actor=entry.actor,availableTargets=targets(entry),reason=npcTurnReason(entry),weapons=[...actor.items].filter(i=>i.type==='weapon'&&!isPossession(i)&&i.system.equippable?.equipped===true),shipWeapons=entry.mode==='space'?[...entry.vehicle.items].filter(i=>i.type==='shipweapon'&&weaponMember(entry,i)):[];
  const weaponButton=(item,cmd)=>button(esc(item.name),cmd,`data-item="${item.id}" ${item.flags?.starwarsffg?.inventoryLocation==='possession'?'disabled title="Objet non porté"':''}`);
  return `<header class="nc-actor-title"><h3>${esc(entry.name)}</h3>${button('<i class="fa-solid fa-address-card" aria-hidden="true"></i> Fiche Combat','combat-sheet','class="nc-combat-sheet"')}</header>${statsHtml(entry)}<div class="nc-roll-config">${entry.mode==='space'?`<label>Cible<select data-npc-field="targetId"><option value="">Choisir un vaisseau</option>${availableTargets.map(t=>`<option value="${esc(t.id)}" ${model.targetId===t.id?'selected':''}>${esc(t.name)}</option>`).join('')}</select></label><label>Secteur<select data-npc-field="sector">${Object.entries(SECTORS).map(([key,label])=>`<option value="${key}" ${model.sector===key?'selected':''}>${label}</option>`).join('')}</select></label>`:availableTargets.length?`<span class="nc-target">Cible : ${esc(availableTargets.map(t=>t.name).join(', '))}</span>`:''}</div>${weapons.length||shipWeapons.length?`<h3>Armes</h3><div class="nc-command-grid">${weapons.map(item=>weaponButton(item,'weapon')).join('')}${shipWeapons.map(item=>weaponButton(item,'ship-weapon')).join('')}</div>`:''}${entry.mode==='space'?`<h3>Actions à bord</h3><div class="nc-command-grid">${ACTIONS.filter(def=>def.id!=='attack'&&!actionRoleReason(entry.vehicle,actor.id,def.id)).map(def=>button(esc(def.label),'space-action',`data-id="${def.id}"`)).join('')}${button('Vaisseau et manœuvres','ship')}</div>`:''}<h3>Compétences principales</h3><div class="nc-main-skills">${main.map(([key])=>button(`<span class="nc-skill-name">${esc(skillLabel(actor,key))}</span><span class="roll-button dice-pool nc-skill-pool"></span>`,'skill',`class="nc-skill" data-ability="${esc(key)}" title="Préparer ${esc(skillLabel(actor,key))}"`)).join('')}</div>${reason?`<p class="nc-note nc-turn-reason">${esc(reason)}</p>`:''}<div class="nc-summary-actions">${button('<i class="fa-solid fa-list-check" aria-hidden="true"></i> '+esc(game.i18n.localize('SWFFG.TabTalents')),'talent-summary',hasSummaryTalents(actor)?'':'disabled title="Aucun talent"')}${button('<i class="fa-solid fa-suitcase" aria-hidden="true"></i> '+esc(game.i18n.localize('SWFFG.UI.Pilotage.Equipment')),'equipment-summary',equippedItems(actor).length?'':'disabled title="Aucun équipement porté"')}${commandCatalogue(actor).length?button('<i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i> Pouvoirs et capacités','powers-summary'):''}</div>`;
}
async function enrichDescription(details,entry){
  const holder=details.querySelector('.nc-description');if(!holder||holder.dataset.loaded)return;holder.dataset.loaded='true';
  const unwrap=value=>typeof value==='object'?value?.value:value;
  const parts=[...new Set([unwrap(entry.system.description),entry.system.longDesc,entry.system.desc].filter(value=>typeof value==='string'&&value.trim()))];
  const facts=[];for(const [key,label] of [['damage','Dégâts'],['crit','Critique'],['range','Portée'],['soak','Encaissement'],['defence','Défense'],['encumbrance','Encombrement'],['hardpoints','Points d’accroche'],['special','Propriétés'],['quantity','Quantité'],['required_force_rating','Valeur de Force requise']]){
    const value=unwrap(entry.system[key]);if(value!==undefined&&value!==null&&value!=='')facts.push([label,value]);
  }
  if(entry.system.ammo)facts.push(['Munitions',number(entry.system.ammo.value)+' / '+number(entry.system.ammo.max)]);
  if(entry.system.equippable?.value)facts.push(['Équipé',entry.system.equippable.equipped?'Oui':'Non']);
  if(entry.system.active!==undefined)facts.push(['Modification active',entry.system.active?'Oui':'Non']);
  const html=await foundry.applications.ux.TextEditor.enrichHTML(parts.join('<hr>')||'<p>Aucune description enregistrée.</p>',{secrets:true,async:true});
  if(!holder.isConnected)return;
  holder.innerHTML=`${facts.length?'<dl class="nc-item-facts">'+facts.map(([label,value])=>`<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')+'</dl>':''}<div class="nc-description-text">${html}</div>`;
}
const summaryKeys=['_talentSummary','_equipmentSummary','_npcPowerSummary'];
function closeNpcSummaries(model){
  const dialogs=new Set(model.summaryDialogs??[]),sheet=model.summarySheet;
  if(sheet)cancelSummaryRenders(sheet);
  for(const key of summaryKeys)if(sheet?.[key]){dialogs.add(sheet[key]);sheet[key]=undefined;}
  model.summaryDialogs=new Set();
  for(const dialog of dialogs)void Promise.resolve().then(()=>dialog.close()).catch(error=>console.error('Star Wars FFG | Close NPC summary',error));
}
function rememberNpcSummary(model,dialog,selection){
  if(!dialog)return;
  if(selection!==model.selected){void dialog.close();return;}
  (model.summaryDialogs??=new Set()).add(dialog);
}
function render(panel,model,{force=false,rosterOnly=false}={}){
  if(!panel.isConnected)return;
  if(!force&&panel.contains(document.activeElement)&&['INPUT','SELECT'].includes(document.activeElement.tagName)){model.needsRefresh=true;return;}
  if(model.rendering)return;model.rendering=true;
  try{
    if(!rosterOnly)model.needsRefresh=false;
    const entries=rosterOnly&&model.entries?model.entries:npcRoster(model);model.entries=entries;
    const visible=matchingRoster(model,entries);
    if(!visible.some(e=>e.key===model.selected)){model.selected=visible.find(e=>rosterSide(e)===model.side)?.key??visible.find(e=>!rosterSide(e))?.key??null;}
    const entry=entries.find(e=>e.key===model.selected),switched=model.renderedSelection!==model.selected;
    if(entry)model.side=rosterSide(entry)??model.side;
    if(switched){closeNpcSummaries(model);model.summarySheet=entry?.actor.sheet;}
    model.renderedSelection=model.selected;
    let root=panel.querySelector('.npc-command');
    if(!root){
      panel.innerHTML=`<div class="npc-command">${headerHtml(model)}<p class="nc-message" role="status" hidden></p><div class="nc-layout"><aside data-scroll="roster"></aside><section class="nc-card"><div class="nc-card-body" data-scroll="card"></div></section></div></div>`;
      root=panel.querySelector('.npc-command');model.rosterHtml=null;model.cardHtml=null;
    }
    const search=root.querySelector('[data-npc-field="search"]');
    if(search.value!==model.search)search.value=model.search;
    const message=root.querySelector('.nc-message');message.hidden=!model.message;message.textContent=model.message??'';
    const roster=root.querySelector('[data-scroll="roster"]'),rosterMarkup=rosterHtml(model,entries,visible);
    if(model.rosterHtml!==rosterMarkup){const top=roster.scrollTop;roster.innerHTML=rosterMarkup;roster.scrollTop=top;model.rosterHtml=rosterMarkup;}
    const card=root.querySelector('[data-scroll="card"]');
    const editor=model.integration?.modifierEditor;
    if(editor&&!root.contains(editor)){
      const section=document.createElement('section');section.className='nc-more nc-modifier-details';section.setAttribute('aria-label','Bonus et malus');section.innerHTML='<h3>Bonus et malus</h3>';section.append(editor);root.querySelector('.nc-card').append(section);
    }
    if(!rosterOnly||switched||model.cardHtml===null){
        const main=entry&&entry.actor.type!=='vehicle'?principalSkills(entry):[];
      const markup=controlsHtml(model,entry,main);
      const changed=switched||model.cardHtml!==markup;
      if(changed){
        const top=switched?0:card.scrollTop;
        card.innerHTML=markup;model.cardHtml=markup;card.scrollTop=top;
      }
      const poolKey=entry?JSON.stringify(main.map(([key,skill])=>[key,skill,entry.actor.system.characteristics?.[skill.characteristic]])):null;
      if(changed||poolKey!==model.poolKey){
        model.poolKey=poolKey;
        if(entry)for(const row of card.querySelectorAll('.nc-skill')){
          row.querySelector('.roll-button')?.replaceChildren();
          void DiceHelpers.addSkillDicePool({data:entry.actor.system},row).catch(error=>CONFIG.logger.error(error));
        }
      }
      model.integration?.onSelect?.(entry);
    }
  }finally{model.rendering=false;}
}

async function showNpcPowers(panel,model,entry){
  const sheet=entry.actor.sheet;
  if(sheet._npcPowerSummary?.rendered){sheet._npcPowerSummary.bringToFront();return;}
  return renderSummary(sheet,'_npcPowerSummary',false,async current=>{
    const wrapper=document.createElement('div'),content=document.createElement('div');content.className='npc-command nc-power-summary';content.style.cssText='max-height:min(360px,42vh);overflow:auto';wrapper.append(content);
    const pinned={...model,selected:entry.key,catalogueSearch:''};
    const fillDescriptions=()=>{
      const byKey=new Map(commandCatalogue(entry.actor).map(item=>[item.key,item]));
      for(const card of content.querySelectorAll('[data-npc-catalogue]')){const item=byKey.get(card.dataset.npcCatalogue);if(item)void enrichDescription(card,item).catch(error=>CONFIG.logger.error(error));}
    };
    const draw=(descriptions=true)=>{
      const catalogue=commandCatalogue(entry.actor);
      content.innerHTML=catalogueHtml(pinned,entry,catalogue);
      if(descriptions)fillDescriptions();
    };draw(false);
    const bounds=(panel.closest('.application')??panel).getBoundingClientRect(),width=Math.min(360,innerWidth-24);
    const right=bounds.right+8,left=right+width<=innerWidth?right:Math.max(0,bounds.left-width-8);
    if(!current())return;
    sheet._npcPowerSummary=summaryDialog({
      classes:['starwarsffg','themed','nc-powers-dialog'],window:{title:'Pouvoirs et capacités - '+entry.name,resizable:true},
      position:{width,left,top:Math.max(0,Math.min(bounds.top,innerHeight-200))},content:wrapper,
      buttons:[{action:'close',label:game.i18n.localize('SWFFG.ButtonClose')}]
    });
    await sheet._npcPowerSummary.render({force:true});
    if(!current())return;
    fillDescriptions();
    content.addEventListener('input',event=>{
      if(event.target.dataset.npcField!=='catalogueSearch')return;
      const start=event.target.selectionStart;pinned.catalogueSearch=event.target.value;draw();
      const input=content.querySelector('input');input.focus({preventScroll:true});input.setSelectionRange(start,start);
    });
    content.addEventListener('click',async event=>{
      const control=event.target.closest('[data-npc-cmd]');if(!control)return;
      event.preventDefault();event.stopPropagation();control.disabled=true;
      try{await handle(panel,pinned,control.dataset.npcCmd,control);}catch(error){ui.notifications.warn(error.message);}
      finally{control.disabled=false;}
    });
  });
}

async function waitForMap(){
  for(let i=0;i<300;i++){if(!canvas.loading)return;await new Promise(resolve=>setTimeout(resolve,50));}
  throw Error('La carte est encore en cours de chargement.');
}
async function handle(panel,model,cmd,element){
  const entry=currentEntry(model);
  if(!entry)throw Error('Sélectionnez un PNJ.');
  if(cmd==='weapon'||cmd==='ship-weapon'){const item=(cmd==='ship-weapon'?entry.vehicle:entry.actor).items.get(element.dataset.item);await execute(model,{...choiceForItem(item),kind:cmd},entry);return;}
  if(cmd==='space-action'){const def=ACTIONS.find(a=>a.id===element.dataset.id);await execute(model,{kind:'space-action',id:def.id,name:def.label},entry);return;}
  if(cmd==='power'){const item=npcCatalogue(entry.actor).find(e=>e.key===element.dataset.key);await execute(model,choiceForItem(entry.actor.items.get(item.itemId)),entry);return;}
  if(cmd==='skill'){await execute(model,{kind:'skill',id:element.dataset.ability,name:skillLabel(entry.actor,element.dataset.ability)},entry);return;}
  if(cmd==='powers-summary'){const selection=model.selected,sheet=entry.actor.sheet;await showNpcPowers(panel,model,entry);rememberNpcSummary(model,sheet._npcPowerSummary,selection);return;}
  if(cmd==='talent-summary'||cmd==='equipment-summary'){
    const selection=model.selected,sheet=entry.actor.sheet,anchor=panel.closest('.application')??panel;
    if(cmd==='talent-summary'){const {showTalentSummary}=await import('./talent-summary.js');await showTalentSummary(sheet,false,anchor);}
    else{const {showEquipmentSummary}=await import('./equipment-summary.js');await showEquipmentSummary(sheet,false,anchor);}
    rememberNpcSummary(model,sheet[cmd==='talent-summary'?'_talentSummary':'_equipmentSummary'],selection);
    return;
  }
  if(cmd==='combat-sheet'){
    const {setCombatSheetMode,fitCombatSheet}=await import('./combat-sheet.mjs'),sheet=entry.actor.sheet;
    if(!sheet.rendered){sheet._ffgCombatMode=true;await sheet.render({force:true});await fitCombatSheet(sheet);}
    else await setCombatSheetMode(sheet,true);
    sheet.bringToFront();return;
  }
  if(cmd==='focus'){if(entry.mode==='space'){await handle(panel,model,'ship',element);}else{await waitForMap();if(canvas.scene?.id!==entry.token.parent.id)await entry.token.parent.view();await waitForMap();
      if(!canvas.ready||canvas.scene?.id!==entry.token.parent.id)throw Error('La carte de ce pion n’est pas disponible.');
      canvas.tokens.activate();entry.token.object?.control({releaseOthers:true});const point=entry.token.getCenterPoint();
      const modal=panel.closest('.application')?.getBoundingClientRect(),sidebar=document.querySelector('#sidebar')?.getBoundingClientRect(),right=sidebar?.width>100?sidebar.left:innerWidth;
      const gaps=modal?[[80,modal.left-20],[modal.right+20,right-20]].filter(([a,b])=>b-a>120).sort((a,b)=>(b[1]-b[0])-(a[1]-a[0])):[];
      const screen=canvas.stage.toGlobal(point),targetX=gaps.length?(gaps[0][0]+gaps[0][1])/2:innerWidth/2,scale=canvas.stage.scale.x;
      await canvas.animatePan({x:canvas.stage.pivot.x+(screen.x-targetX)/scale,y:canvas.stage.pivot.y+(screen.y-innerHeight/2)/scale,duration:250});}return;}
  if(cmd==='ship'){
    let app=foundry.applications.instances.get('ffg-space-combat');
    if(!app?.rendered){document.querySelector('[data-open-space-combat]')?.click();for(let i=0;i<100;i++){await new Promise(resolve=>setTimeout(resolve,50));app=foundry.applications.instances.get('ffg-space-combat');if(app?.rendered)break;}}
    if(!app?.rendered)throw Error('Ouvrez la carte spatiale depuis les commandes de scène.');app.camera={...app.camera,x:entry.ship.x,y:entry.ship.y};await app.selectShip(entry.ship.id);return;
  }
  if(cmd==='manual'){await manualAbility(entry,npcCatalogue(entry.actor).find(e=>e.key===element.dataset.key));return;}

}
export function setupNpcCommandPanel(panel,integration={}){
  if(!game.user.isGM||panels.has(panel))return;stylesheet();
  const model={selected:null,search:'',rosterFilters:game.user.getFlag(scope,'npcCommandRosterFilters')??{},catalogueSearch:'',side:'allies',difficulty:2,targetId:'',sector:'fore',message:'',...sessionModel,includePlayers:true,integration,panelId:panel.id};sessionModel=model;panels.set(panel,model);
  panel.addEventListener('click',async event=>{
    const favorite=event.target.closest('[data-npc-favorite]');if(favorite){event.preventDefault();event.stopPropagation();favorite.disabled=true;try{await toggleNpcFavorite(game.user,favorite.dataset.npcFavorite);}catch(error){ui.notifications.warn(error.message);}finally{render(panel,model,{force:true});}return;}
    const side=event.target.closest('[data-npc-side]');if(side){event.preventDefault();model.side=side.dataset.npcSide;model.selected=null;model.message='';render(panel,model,{force:true});return;}
    const select=event.target.closest('[data-npc-select]');if(select){model.selected=select.dataset.npcSelect;model.message='';model.catalogueSearch='';render(panel,model,{force:true});event.preventDefault();try{await handle(panel,model,'focus',select);if(npcRosterFilter(model)==='scene'&&currentEntry(model)?.mode==='ground')await handle(panel,model,'combat-sheet',select);}catch(error){model.message=error.message;ui.notifications.warn(error.message);render(panel,model,{force:true});}return;}
    const element=event.target.closest('[data-npc-cmd]');if(!element)return;event.preventDefault();element.disabled=true;
    try{await handle(panel,model,element.dataset.npcCmd,element);}catch(error){model.message=error.message;ui.notifications.warn(error.message);}finally{render(panel,model,{force:true});}
  });
  panel.addEventListener('keydown',event=>{
    const tab=event.target.closest('[data-npc-side]');if(!tab||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();const side=event.key==='Home'?'allies':event.key==='End'?'enemies':tab.dataset.npcSide==='allies'?'enemies':'allies';
    panel.querySelector('[data-npc-side="'+side+'"]').click();panel.querySelector('[data-npc-side="'+side+'"]').focus();
  });
  panel.addEventListener('change',async event=>{
    const node=event.target;
    if(node.hasAttribute('data-npc-roster-filter')){
      model.rosterFilters={...model.rosterFilters,[model.side]:node.value};model.message='';
      try{await game.user.setFlag(scope,'npcCommandRosterFilters',model.rosterFilters);}catch(error){ui.notifications.warn(error.message);}
      render(panel,model,{force:true});return;
    }
    if(!node.dataset.npcField&&!node.dataset.npcResource)return;
    if(node.dataset.npcField){const key=node.dataset.npcField;model[key]=node.type==='checkbox'?node.checked:node.type==='number'?number(node.value):node.value;}
    if(node.dataset.npcResource){const entry=currentEntry(model);try{await entry.actor.update({['system.stats.'+node.dataset.npcResource+'.value']:number(node.value)});}catch(error){model.message=error.message;}}
    render(panel,model,{force:true});
  });
  panel.addEventListener('input',event=>{const node=event.target,key=node.dataset.npcField;if(!['search','catalogueSearch'].includes(key))return;model[key]=node.value;render(panel,model,{force:true,rosterOnly:key==='search'});});
  panel.addEventListener('focusout',()=>queueMicrotask(()=>{if(model.needsRefresh)render(panel,model);}));
  render(panel,model,{force:true});
}
export async function openNpcCommand(key=null){
  if(!game.user.isGM)return;const {showGMDifficulty}=await import('./gm-difficulty.js'),app=await showGMDifficulty();
  app.element.querySelector('[aria-controls$="-panel-npcs"]')?.click();app.setPosition({width:Math.min(860,innerWidth-40),height:Math.min(800,innerHeight-50)});
  const panel=app.element.querySelector('[data-pilotage-panel="npcs"]'),model=panels.get(panel);if(key&&model){
    const token=fromUuidSync(key),actor=token?.actor;if(actor&&playerOwned(actor))model.includePlayers=true;
    const aboard=foundry.applications.instances.get('ffg-space-combat')?.rendered&&npcRoster(model).find(entry=>entry.mode==='space'&&entry.actor.id===actor?.id);
    model.selected=aboard?.key??key;model.search='';
    const chosen=npcRoster(model).find(entry=>entry.key===model.selected);if(chosen){model.side=rosterSide(chosen)??model.side;if(!npcRosterMatches(chosen,npcRosterFilter(model)))model.rosterFilters={...model.rosterFilters,[model.side]:'all'};}
    render(panel,model,{force:true});if(currentEntry(model))await handle(panel,model,'focus',panel);}return app;
}
let timer;
const dirtyPanels=new Set();
function refresh(affected=()=>true){
  for(const [panel,model]of panels){
    if(!panel.isConnected){closeNpcSummaries(model);panels.delete(panel);dirtyPanels.delete(panel);continue;}
    if(affected(model))dirtyPanels.add(panel);
  }
  if(timer||!dirtyPanels.size)return;
  timer=setTimeout(()=>{
    timer=null;const targets=[...dirtyPanels];dirtyPanels.clear();
    for(const panel of targets){const model=panels.get(panel);if(model)render(panel,model);}
  },120);
}
if(typeof Hooks!=='undefined'){
  Hooks.once('init',()=>game.settings.register(scope,'npcAutoInitiative',{name:'Attribuer automatiquement les créneaux d’initiative',hint:'Attribue chaque créneau au personnage qui l’a obtenu. L’icône d’échange du suivi permet de changer l’attribution sans modifier le jet.',scope:'world',config:true,type:Boolean,default:true}));
  Hooks.once('ready',()=>{installNpcInitiative();installNpcCamps();stylesheet();});
  for(const name of ['updateCombat','createCombatant','deleteCombatant','updateCombatant','updateToken','createToken','deleteToken','canvasReady','targetToken','updateUser'])Hooks.on(name,()=>refresh());
  Hooks.on('updateActor',actor=>refresh(model=>model.entries?.some(entry=>entry.actor===actor||entry.actor.id===actor.id||entry.vehicle?.id===actor.id)));
  for(const name of ['createItem','updateItem','deleteItem'])Hooks.on(name,item=>{const actor=item.parent;if(actor?.documentName==='Actor')refresh(model=>model.entries?.some(entry=>entry.actor===actor||entry.actor.id===actor.id||entry.vehicle?.id===actor.id));});
  Hooks.on('updateSetting',setting=>{if(String(setting.key).startsWith('starwarsffg.'))refresh();});
  Hooks.on('controlToken',(token,controlled)=>{
    if(!controlled)return;
    for(const [panel,model]of panels)if(panel.isConnected&&model.selected!==token.document.uuid)closeNpcSummaries(model);
  });
  Hooks.on('renderCombatTracker',(tracker,html)=>{
    if(!game.user.isGM)return;const root=html?.querySelector?html:html?.[0];if(!root)return;
    const header=root.querySelector('.combat-tracker-header')??root.querySelector('.combat-tracker');if(header&&!root.querySelector('[data-npc-open]')){const btn=document.createElement('button');btn.type='button';btn.dataset.npcOpen='';btn.className='npc-open-command';btn.textContent='Pilotage PNJ';btn.addEventListener('click',()=>openNpcCommand());header.prepend(btn);}
    for(const row of root.querySelectorAll('li.combatant[data-slot-index]')){if(row.querySelector('[data-npc-quick]'))continue;const combat=tracker.viewed,slot=combat?.turns[Number(row.dataset.slotIndex)],id=combat?.getSlotClaims?.(combat.round,slot?.id)??slot?.id,participant=combat?.combatants.get(row.dataset.combatantId||row.dataset.altId)??combat?.combatants.get(id);if(!participant?.actor)continue;const btn=document.createElement('button');btn.type='button';btn.dataset.npcQuick='';btn.className='npc-slot-change';btn.title='Commandes de ce personnage';btn.setAttribute('aria-label',btn.title);btn.innerHTML='<i class="fa-solid fa-bolt" aria-hidden="true"></i>';btn.addEventListener('click',event=>{event.stopPropagation();void openNpcCommand(participant.token?.uuid);});(row.querySelector('.combatant-controls')??row).append(btn);}
  });
}
