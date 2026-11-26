import {CREW_ACTION_ORDER,REPAIR_ACTIONS,DAMAGE_CONTROL} from './barrage-rules.mjs';
import {performBarrage} from './barrage-dialog.mjs';
import {vehicleMinionGroup} from '../helpers/vehicle-minion-group.mjs';
import {board,command} from "./board.mjs";
import {aboardRoster,crewActor,controlsCrewMember,isPilotRole,isNavigationRole,canRedirectShields,actionRoleReason} from "./crew-access.mjs";
import {MANEUVERS,ACTIONS,SECTORS,maneuverReason,readTurnState,characterActionState,pilotSkill,maneuverCost,maneuverCostLabel,maneuverPerformer,pilotManeuverLimit} from "./combat-rules.mjs";
import {initiativeContext,initiativeReason} from "./initiative.mjs";
import {openCombatRoll} from "./combat-rolls.mjs";
import {chooseShotTarget} from "./shot-target.mjs";
import {chooseDamageControl,chooseCombatAction} from "./action-choice.mjs";
import {crewRoleDefinitions} from "../helpers/crew-role-definitions.mjs";

const pending=new Set();
const preferences=new Map();
const labels=new Map([...MANEUVERS,...ACTIONS].map(def=>[def.id,def.label]));
Object.entries({copilot:"Assistance au pilote",plot:"Itinéraire tracé",jam:"Communications brouillées",spoof:"Leurres antimissiles",slice:"Défense piratée",boostShields:"Boucliers renforcés",advantage:"Avantage de position"}).forEach(([key,value])=>labels.set(key,value));
function node(tag,className,text) {
  const element=document.createElement(tag);if(className)element.className=className;if(text!=null)element.textContent=text;return element;
}
export function combatPreferences(ship) {return preferences.get(ship.id)??{};}
async function chooseShieldTransfer(vehicle,prefs,candidates,ship) {
  const stats=vehicle.system.stats?.shields??{};
  const content=node("div"),fields=node("div","sc-shield-choice");content.append(fields);
  fields.append(node("p","","Transférer 1 point de défense du secteur source vers le secteur à renforcer."));
  const field=(label,name,entries,value)=>{
    const wrap=node("label","form-group stacked"),input=node("select");input.name=name;input.required=true;
    wrap.append(node("span","",label),input);
    for(const [id,text,disabled] of entries){const option=node("option","",text);option.value=id;option.disabled=!!disabled;if(id===value)option.setAttribute("selected","");input.append(option);}
    input.value=value;fields.append(wrap);return input;
  };
  const sourceEntries=Object.entries(SECTORS).filter(([key])=>Number.isFinite(Number(stats[key]))&&Number(stats[key])>0).map(([key,label])=>[key,label+" ("+stats[key]+")"]);
  if(!sourceEntries.length)throw Error("Ce vaisseau ne possède aucun point de défense à réorienter.");
  const roles=crewRoleDefinitions(vehicle);
  field("Personnage","shieldCrew",candidates.map(member=>[member.actor_id,(crewActor(member)?.name??member.actor_name)+" · "+(roles.find(role=>role.role_name===member.role)?.label??member.role)+" · "+maneuverCostLabel(maneuverCost(ship,member.actor_id,board().round))]),candidates[0].actor_id);
  field("Secteur source","shieldSource",sourceEntries,sourceEntries.some(([key])=>key===prefs.fromSector)?prefs.fromSector:sourceEntries[0][0]);
  field("Secteur à renforcer","shieldTarget",Object.entries(SECTORS).map(([key,label])=>[key,label+" ("+(stats[key]??"?")+")"]),prefs.shieldTarget??"fore");
  return foundry.applications.api.DialogV2.wait({classes:["sc-shield-dialog"],window:{title:"Réorienter les boucliers"},position:{width:400},modal:true,content,rejectClose:false,
    buttons:[{action:"redirect",label:"Réorienter",default:true,callback:(_event,button)=>({crewId:button.form.elements.shieldCrew.value,fromSector:button.form.elements.shieldSource.value,sector:button.form.elements.shieldTarget.value})},
      {action:"cancel",label:"Annuler",callback:()=>null}],
    render:(_event,dialog)=>{
      const source=dialog.element.querySelector('[name="shieldSource"]'),target=dialog.element.querySelector('[name="shieldTarget"]'),confirm=dialog.element.querySelector('[data-action="redirect"]');
      const update=()=>{
        for(const option of target.options)option.disabled=option.value===source.value||!Number.isFinite(Number(stats[option.value]))||Number(stats[option.value])>=4;
        if(!target.value||target.selectedOptions[0]?.disabled)target.value=[...target.options].find(option=>!option.disabled)?.value??"";
        confirm.disabled=!target.value;
      };
      source.addEventListener("change",update);update();
    }
  });
}
export function renderCombatControls(ship,report,{targetId,onTarget,onFly}={}) {
  const section=node("section","sc-card-section sc-combat-controls");
  if(board().round===0){section.append(node("p","","Combat terminé. Le MJ peut commencer un nouveau combat depuis le menu Round 0."));return section;}
  const vehicle=game.actors.get(ship.actorId),group=vehicleMinionGroup(vehicle);
  const description=definition=>group.enabled?definition.description.replaceAll("1 stress système","1 dégât de coque").replaceAll("stress système","dégâts de coque"):definition.description;
  if(group.enabled&&!group.alive){section.append(node("p","","Aucun appareil de ce groupe n’est encore en état de combattre."));return section;}
  const crew=aboardRoster(vehicle).filter(member=>crewActor(member)&&controlsCrewMember(member));
  const shieldCrew=crew.filter(canRedirectShields);
  const unique=[...new Set(crew.map(member=>member.actor_id))].map(id=>crew.find(member=>member.actor_id===id&&isPilotRole(member))??crew.find(member=>member.actor_id===id&&isNavigationRole(member))??crew.find(member=>member.actor_id===id));
  if(!unique.length&&!shieldCrew.length) {
    section.append(node("p","","Affectez un personnage à l’équipage pour jouer ses manœuvres et ses actions."));return section;
  }
  const prefs=preferences.get(ship.id)??{sector:"fore",fromSector:"aft",terrain:0};
  preferences.set(ship.id,prefs);
  const pilot=crew.some(isPilotRole),navigator=crew.some(isNavigationRole),initiative=initiativeContext();
  const availableMembers=(id,includeSpent=false)=>{
    if(id==="damageControl")return [...new Map(REPAIR_ACTIONS.flatMap(action=>availableMembers(action,includeSpent)).map(member=>[member.actor_id,member])).values()];
    const maneuver=MANEUVERS.find(def=>def.id===id),definition=maneuver??ACTIONS.find(def=>def.id===id);
    const members=id==="shields"?[...new Map(shieldCrew.map(member=>[member.actor_id,member])).values()]:unique;
    return members.filter(member=>{
      if(["allowRepairs","resetEncounter"].includes(id))return game.user.isGM;
      if(initiativeReason(member,initiative))return false;
      if(!maneuver&&ACTIONS.some(action=>action.id===id)&&actionRoleReason(vehicle,member.actor_id,id))return false;
      const turn=readTurnState(ship,member.actor_id,board().round);
      const personal=characterActionState(board().ships,member.actor_id,board().round);
      if(!includeSpent&&!game.user.isGM&&(turn.ended||personal.ended))return false;
      if(definition?.pilot&&!crew.some(entry=>entry.actor_id===member.actor_id&&(maneuver?isNavigationRole(entry):isPilotRole(entry))))return false;
      const character=crewActor(member),skills=definition?.skills??(definition?.skill?[definition.skill==="pilot"?pilotSkill(vehicle,game.settings.get("starwarsffg","skilltheme")):definition.skill]:[]);
      if(skills.length&&!skills.some(key=>character?.system.skills?.[key]))return false;
      return includeSpent|| (maneuver?turn.maneuvers<2:game.user.isGM||id==="endTurn"||!personal.action);
    });
  };
  const personalPerformer=candidates=>[...candidates].sort((a,b)=>maneuverCost(ship,a.actor_id,board().round).personal-maneuverCost(ship,b.actor_id,board().round).personal)[0];
  const perform=async(id,extra={})=>{
    if(pending.has(ship.id))return;
    pending.add(ship.id);
    section.querySelectorAll("button").forEach(button=>button.disabled=true);
    try {
      if(id==="damageControl") {
        const choices=REPAIR_ACTIONS.map(id=>({definition:ACTIONS.find(action=>action.id===id),reason:actionReason(ACTIONS.find(action=>action.id===id))}));
        const selected=await chooseDamageControl(choices);
        if(!REPAIR_ACTIONS.includes(selected))return;
        pending.delete(ship.id);return await perform(selected);
      }
      const definition=[...MANEUVERS,...ACTIONS].find(entry=>entry.id===id);
      const candidates=availableMembers(id);
      const maneuver=MANEUVERS.find(entry=>entry.id===id);
      if (definition?.barrage) {
        const target = await performBarrage(ship, definition, candidates, prefs.terrain);
        if (target) onTarget?.(target);
        return;
      }
      const automaticManeuver=maneuver ? personalPerformer(candidates) : null;
      let member;
      if(id==="shields") {
        if(!automaticManeuver)return;
        const ordered=[automaticManeuver,...candidates.filter(member=>member.actor_id!==automaticManeuver.actor_id)];
        const transfer=await chooseShieldTransfer(game.actors.get(ship.actorId),prefs,ordered,ship);
        if(!transfer)return;
        member=candidates.find(entry=>entry.actor_id===transfer.crewId);
        prefs.fromSector=transfer.fromSector;prefs.shieldTarget=transfer.sector;
        extra={...extra,fromSector:transfer.fromSector,sector:transfer.sector};
      } else if(maneuver)member=maneuver.pilot?maneuverPerformer(board().ships.find(entry=>entry.id===ship.id),candidates,board().round):automaticManeuver;
      else {
        const choice=await chooseCombatAction(ship,definition,candidates,description(definition));
        if(!choice)return;
        member=candidates.find(entry=>entry.actor_id===choice.crewId);
        extra={...extra,...choice};
      }
      if(!member)return;
      const current=board().ships.find(entry=>entry.id===ship.id);
      if(id==="fly") {
        if(!onFly)throw Error("Choisissez la destination depuis la carte de combat spatial.");
        await onFly(member);return;
      }
      if(id==="speed") {
        const options=[];
        if(current.speed<current.maxSpeed)options.push({action:"accelerate",label:"Accélérer (+1)",callback:()=>1});
        if(current.speed>0)options.push({action:"decelerate",label:"Décélérer (-1)",callback:()=>-1});
        const delta=await foundry.applications.api.DialogV2.wait({window:{title:"Accélérer / Décélérer"},
          content:"<p>Vitesse actuelle : "+current.speed+" / "+current.maxSpeed+".</p>",rejectClose:false,
          buttons:[...options,{action:"cancel",label:"Annuler",callback:()=>null}]});
        if(delta!==1&&delta!==-1)return;
        extra={...extra,speedDelta:delta};
      }
      await command("combat",{shipId:ship.id,version:current.version,crewId:member.actor_id,combatAction:id,sector:prefs.sector,
        fromSector:prefs.fromSector,secondCost:prefs.secondCost??"strain",terrain:prefs.terrain,...extra});
      if(!maneuver&&extra.targetId)onTarget?.(extra.targetId);
    } catch(error) {report(error);}
    finally {
      pending.delete(ship.id);
      const current=board().ships.find(entry=>entry.id===ship.id);
      if(current&&section.isConnected)section.replaceWith(renderCombatControls(current,report,{targetId,onTarget,onFly}));
      Hooks.callAll("ffgSpaceCombatControlsReady");
    }
  };
  const button=(text,id,extra)=>{
    const control=node("button","sc-card-action",text);control.type="button";
    control.disabled=pending.has(ship.id)||!availableMembers(id).length;
    control.addEventListener("click",event=>{event.stopPropagation();void perform(id,extra);});
    return control;
  };
  const maneuvers=node("div","sc-maneuver-buttons");
  section.append(node("h5","","Manœuvres"));
  const navigationCrew=unique.filter(member=>crew.some(entry=>entry.actor_id===member.actor_id&&isNavigationRole(entry)));
  const maneuverMember=maneuverPerformer(ship,navigationCrew.filter(member=>!initiativeReason(member,initiative)),board().round);
  if(navigationCrew.length) {
    const used=ship.combat?.pilotManeuvers??0,limit=pilotManeuverLimit(ship);
    const progress=node("div","sc-maneuver-progress");progress.dataset.pilotManeuvers=used;
    progress.append(node("span",used>=limit?"is-used":"","Manœuvres de pilotage : "+used+" / "+limit));
    section.append(progress);
  }
  for(const definition of MANEUVERS) {
    const reason=maneuverReason(definition,ship,navigator||game.user.isGM);
    const control=button(definition.label,definition.id);
    control.dataset.maneuver=definition.id;
    control.disabled||=!!reason||(definition.pilot&&!maneuverMember);
    control.title=reason||(!availableMembers(definition.id).length&&definition.id==="shields"?"Aucun pilote, copilote, passager ou membre d’équipage hors artilleurs ne dispose d’une manœuvre.":description(definition));
    if(definition.pilot&&!reason&&!maneuverMember&&(ship.combat?.pilotManeuvers??0)>=pilotManeuverLimit(ship))control.title="Limite de "+pilotManeuverLimit(ship)+" manœuvre(s) de pilotage atteinte pour ce round.";
    const costMember=definition.pilot?maneuverMember:definition.id==="shields"?personalPerformer(availableMembers(definition.id)):null;
    if(costMember) {
      const cost=maneuverCost(ship,costMember.actor_id,board().round,!!definition.pilot);
      if(cost.personal||cost.system) {
        control.classList.add("sc-paid-maneuver");
        control.append(node("small","sc-maneuver-cost",maneuverCostLabel(cost,group.enabled?"dégâts de coque":"stress système")));
        control.title+=" Coût : "+maneuverCostLabel(cost,group.enabled?"dégâts de coque":"stress système")+".";
      }
    }
    maneuvers.append(control);
  }
  section.append(maneuvers);
  const actionReason=definition=>{
    if(group.enabled&&definition.id==="repairStrain")return "Les véhicules sbires ne possèdent pas de stress mécanique.";
    let reason=maneuverReason(definition,ship,pilot);
    if(!reason&&!availableMembers(definition.id).length)reason="Aucun membre embarqué disponible pour cette action.";
    if(!reason&&definition.target&&!board().ships.some(entry=>entry.id!==ship.id&&(definition.id!=="concentratedBarrage"||entry.silhouette>=5)))reason="Aucun vaisseau cible compatible sur la carte.";
    if(!reason&&definition.id==="repairCritical"&&!vehicle.items.some(item=>item.type==="criticaldamage"))reason="Aucun dégât critique à réparer.";
    if(!reason&&["repairHull","manualRepair"].includes(definition.id)) {
      if(!game.user.isGM&&!ship.combat?.repairAllowed)reason="Le MJ doit autoriser cette réparation.";
      else if(ship.combat?.hullRepairUsed)reason="Réparation de coque déjà tentée pendant cette rencontre.";
    }
    return reason;
  };
  section.append(node("h5","","Actions"));
  const displayed=[DAMAGE_CONTROL,...ACTIONS.filter(def=>def.id!=="attack"&&!REPAIR_ACTIONS.includes(def.id)&&def.id!=="communicate"&&(!def.minSize||ship.silhouette>=def.minSize))];
  for(const [label,belongs] of [["Actions pilote",def=>!!def.pilot],["Actions co-pilote",def=>def.id==="copilot"],["Actions équipage",def=>CREW_ACTION_ORDER.includes(def.id)]]) {
    const actions=node("div","sc-action-buttons");
    for(const definition of displayed.filter(belongs).sort((a,b)=>CREW_ACTION_ORDER.indexOf(a.id)-CREW_ACTION_ORDER.indexOf(b.id))) {
      const control=button(definition.label,definition.id);control.dataset.combatAction=definition.id;
      const reason=definition.id==="damageControl"?(REPAIR_ACTIONS.every(id=>actionReason(ACTIONS.find(action=>action.id===id)))?"Aucune réparation disponible.":""):actionReason(definition);
      control.disabled||=!!reason;control.title=reason||description(definition);actions.append(control);
    }
    if(actions.children.length)section.append(node("h6","sc-action-group-title",label),actions);
  }
  if(ship.combat?.lastRoll) {
    const roll=ship.combat.lastRoll;
    section.append(node("p","sc-last-combat-roll",roll.label+" · "+roll.success+" succès · "+roll.advantage+" avantages · "+roll.threat+" menaces"));
  }
  const effects=ship.combat?.effects??[];
  if(effects.length) {
    const list=node("ul","sc-combat-effects");
    for(const entry of effects) {
      const duration=entry.expiresRound?entry.phase==="round"?" · fin du round "+entry.expiresRound:" · "+(entry.phase==="end"?"fin":"début")+" du tour, round "+entry.expiresRound:entry.kind==="jam"?" · communications perturbées":" · jusqu’à utilisation";
      list.append(node("li","",(labels.get(entry.kind)??entry.kind)+(entry.value?" ("+entry.value+")":"")+(entry.sector?" · "+SECTORS[entry.sector]:"")+duration));
    }
    section.append(node("h5","","Effets actifs"),list);
  }
  return section;
}
export async function openSelectedCombatRoll(ship,member,weapon,options={}) {
  const prefs=combatPreferences(ship);
  const target=weapon?await chooseShotTarget(ship,member,weapon):null;
  if(weapon&&!target)return;
  const result=await openCombatRoll(ship,member,{weapon,targetId:target?.targetId??options.targetId,sector:target?.sector,terrain:prefs.terrain??0});
  if(target)options.onTarget?.(target.targetId);
  return result;
}
