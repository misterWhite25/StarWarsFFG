import {localizeSystem, localizedSystemError} from "../helpers/system-localization.mjs";
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
const effectKeys={copilot:"SWFFG.UI.SpaceCombat.PilotAssistance",plot:"SWFFG.UI.SpaceCombat.CoursePlotted",jam:"SWFFG.UI.SpaceCombat.CommsJammed",spoof:"SWFFG.UI.SpaceCombat.MissileDecoys",slice:"SWFFG.UI.SpaceCombat.DefenseSliced",boostShields:"SWFFG.UI.SpaceCombat.ShieldsBoosted",advantage:"SWFFG.UI.SpaceCombat.PositionalAdvantage"};
function node(tag,className,text) {
  const element=document.createElement(tag);if(className)element.className=className;if(text!=null)element.textContent=text;return element;
}
export function combatPreferences(ship) {return preferences.get(ship.id)??{};}
async function chooseShieldTransfer(vehicle,prefs,candidates,ship) {
  const stats=vehicle.system.stats?.shields??{};
  const content=node("div"),fields=node("div","sc-shield-choice");content.append(fields);
  fields.append(node("p","",localizeSystem("SWFFG.UI.SpaceCombat.TransferDefense")));
  const field=(label,name,entries,value)=>{
    const wrap=node("label","form-group stacked"),input=node("select");input.name=name;input.required=true;
    wrap.append(node("span","",label),input);
    for(const [id,text,disabled] of entries){const option=node("option","",text);option.value=id;option.disabled=!!disabled;if(id===value)option.setAttribute("selected","");input.append(option);}
    input.value=value;fields.append(wrap);return input;
  };
  const sourceEntries=Object.entries(SECTORS).filter(([key])=>Number.isFinite(Number(stats[key]))&&Number(stats[key])>0).map(([key,label])=>[key,label+" ("+stats[key]+")"]);
  if(!sourceEntries.length)throw localizedSystemError("SWFFG.UI.SpaceCombat.NoShieldDefense");
  const roles=crewRoleDefinitions(vehicle);
  field("Personnage","shieldCrew",candidates.map(member=>[member.actor_id,(crewActor(member)?.name??member.actor_name)+" · "+(roles.find(role=>role.role_name===member.role)?.label??member.role)+" · "+maneuverCostLabel(maneuverCost(ship,member.actor_id,board().round))]),candidates[0].actor_id);
  field(localizeSystem("SWFFG.UI.SpaceCombat.SourceSector"),"shieldSource",sourceEntries,sourceEntries.some(([key])=>key===prefs.fromSector)?prefs.fromSector:sourceEntries[0][0]);
  field(localizeSystem("SWFFG.UI.SpaceCombat.ShieldSector"),"shieldTarget",Object.entries(SECTORS).map(([key,label])=>[key,label+" ("+(stats[key]??"?")+")"]),prefs.shieldTarget??"fore");
  return foundry.applications.api.DialogV2.wait({classes:["sc-shield-dialog"],window:{title:localizeSystem("SWFFG.UI.SpaceCombat.Shields")},position:{width:400},modal:true,content,rejectClose:false,
    buttons:[{action:"redirect",label:localizeSystem("SWFFG.UI.SpaceCombat.Redirect"),default:true,callback:(_event,button)=>({crewId:button.form.elements.shieldCrew.value,fromSector:button.form.elements.shieldSource.value,sector:button.form.elements.shieldTarget.value})},
      {action:"cancel",label:localizeSystem("SWFFG.Cancel"),callback:()=>null}],
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
  if(board().round===0){section.append(node("p","",localizeSystem("SWFFG.UI.SpaceCombat.EndedRoundZero")));return section;}
  const vehicle=game.actors.get(ship.actorId),group=vehicleMinionGroup(vehicle);
  const description=definition=>group.enabled?definition.description.replaceAll(localizeSystem("SWFFG.UI.SpaceCombat.OneSystemStrain"),localizeSystem("SWFFG.UI.SpaceCombat.OneHullTrauma")).replaceAll(localizeSystem("SWFFG.UI.SpaceCombat.SystemStrainLower"),localizeSystem("SWFFG.UI.SpaceCombat.HullTraumaLower")):definition.description;
  if(group.enabled&&!group.alive){section.append(node("p","",localizeSystem("SWFFG.UI.SpaceCombat.GroupDestroyed")));return section;}
  const crew=aboardRoster(vehicle).filter(member=>crewActor(member)&&controlsCrewMember(member));
  const shieldCrew=crew.filter(canRedirectShields);
  const unique=[...new Set(crew.map(member=>member.actor_id))].map(id=>crew.find(member=>member.actor_id===id&&isPilotRole(member))??crew.find(member=>member.actor_id===id&&isNavigationRole(member))??crew.find(member=>member.actor_id===id));
  if(!unique.length&&!shieldCrew.length) {
    section.append(node("p","",localizeSystem("SWFFG.UI.SpaceCombat.AssignCrewBeforeActing")));return section;
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
  const perform=async(id,options={})=>{
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
      let extra=options;
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
        if(!onFly)throw localizedSystemError("SWFFG.UI.SpaceCombat.SelectMapDestination");
        await onFly(member);return;
      }
      if(id==="speed") {
        const speedOptions=[];
        if(current.speed<current.maxSpeed)speedOptions.push({action:"accelerate",label:localizeSystem("SWFFG.UI.SpaceCombat.AccelerateOne"),callback:()=>1});
        if(current.speed>0)speedOptions.push({action:"decelerate",label:localizeSystem("SWFFG.UI.SpaceCombat.DecelerateOne"),callback:()=>-1});
        const delta=await foundry.applications.api.DialogV2.wait({window:{title:localizeSystem("SWFFG.UI.SpaceCombat.Speed")},
          content:`<p>${localizeSystem("SWFFG.UI.SpaceCombat.CurrentSpeed")} `+current.speed+" / "+current.maxSpeed+".</p>",rejectClose:false,
          buttons:[...speedOptions,{action:"cancel",label:localizeSystem("SWFFG.Cancel"),callback:()=>null}]});
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
  section.append(node("h5","",localizeSystem("SWFFG.UI.SpaceCombat.Maneuvers")));
  const navigationCrew=unique.filter(member=>crew.some(entry=>entry.actor_id===member.actor_id&&isNavigationRole(entry)));
  const maneuverMember=maneuverPerformer(ship,navigationCrew.filter(member=>!initiativeReason(member,initiative)),board().round);
  if(navigationCrew.length) {
    const used=ship.combat?.pilotManeuvers??0,limit=pilotManeuverLimit(ship);
    const progress=node("div","sc-maneuver-progress");progress.dataset.pilotManeuvers=used;
    progress.append(node("span",used>=limit?"is-used":"",localizeSystem("SWFFG.UI.SpaceCombat.PilotManeuvers") + " "+used+" / "+limit));
    section.append(progress);
  }
  for(const definition of MANEUVERS) {
    const reason=maneuverReason(definition,ship,navigator||game.user.isGM);
    const control=button(definition.label,definition.id);
    control.dataset.maneuver=definition.id;
    control.disabled||=!!reason||(definition.pilot&&!maneuverMember);
    control.title=reason||(!availableMembers(definition.id).length&&definition.id==="shields"?localizeSystem("SWFFG.UI.SpaceCombat.NoManeuverAvailable"):description(definition));
    if(definition.pilot&&!reason&&!maneuverMember&&(ship.combat?.pilotManeuvers??0)>=pilotManeuverLimit(ship))control.title=localizeSystem("SWFFG.UI.SpaceCombat.ManeuverLimit", {limit:pilotManeuverLimit(ship)});
    const costMember=definition.pilot?maneuverMember:definition.id==="shields"?personalPerformer(availableMembers(definition.id)):null;
    if(costMember) {
      const cost=maneuverCost(ship,costMember.actor_id,board().round,!!definition.pilot);
      if(cost.personal||cost.system) {
        control.classList.add("sc-paid-maneuver");
        control.append(node("small","sc-maneuver-cost",maneuverCostLabel(cost,group.enabled?localizeSystem("SWFFG.UI.SpaceCombat.HullTraumaLower"):localizeSystem("SWFFG.UI.SpaceCombat.SystemStrainLower"))));
        control.title+=" " + localizeSystem("SWFFG.UI.SpaceCombat.Cost") + " "+maneuverCostLabel(cost,group.enabled?localizeSystem("SWFFG.UI.SpaceCombat.HullTraumaLower"):localizeSystem("SWFFG.UI.SpaceCombat.SystemStrainLower"))+".";
      }
    }
    maneuvers.append(control);
  }
  section.append(maneuvers);
  const actionReason=definition=>{
    if(group.enabled&&definition.id==="repairStrain")return localizeSystem("SWFFG.UI.SpaceCombat.MinionsNoSystemStrain");
    let reason=maneuverReason(definition,ship,pilot);
    if(!reason&&!availableMembers(definition.id).length)reason=localizeSystem("SWFFG.UI.SpaceCombat.NoCrewForAction");
    if(!reason&&definition.target&&!board().ships.some(entry=>entry.id!==ship.id&&(definition.id!=="concentratedBarrage"||entry.silhouette>=5)))reason=localizeSystem("SWFFG.UI.SpaceCombat.NoCompatibleTarget");
    if(!reason&&definition.id==="repairCritical"&&!vehicle.items.some(item=>item.type==="criticaldamage"))reason=localizeSystem("SWFFG.UI.SpaceCombat.NoRepairableCritical");
    if(!reason&&["repairHull","manualRepair"].includes(definition.id)) {
      if(!game.user.isGM&&!ship.combat?.repairAllowed)reason=localizeSystem("SWFFG.UI.SpaceCombat.GMRepairApproval");
      else if(ship.combat?.hullRepairUsed)reason=localizeSystem("SWFFG.UI.SpaceCombat.RepairAlreadyTried");
    }
    return reason;
  };
  section.append(node("h5","",localizeSystem("SWFFG.UI.SpaceCombat.Actions")));
  const displayed=[DAMAGE_CONTROL,...ACTIONS.filter(def=>def.id!=="attack"&&!REPAIR_ACTIONS.includes(def.id)&&def.id!=="communicate"&&(!def.minSize||ship.silhouette>=def.minSize))];
  for(const [label,belongs] of [[localizeSystem("SWFFG.UI.SpaceCombat.PilotActions"),def=>!!def.pilot],[localizeSystem("SWFFG.UI.SpaceCombat.CopilotActions"),def=>def.id==="copilot"],[localizeSystem("SWFFG.UI.SpaceCombat.CrewActions"),def=>CREW_ACTION_ORDER.includes(def.id)]]) {
    const actions=node("div","sc-action-buttons");
    for(const definition of displayed.filter(belongs).sort((a,b)=>CREW_ACTION_ORDER.indexOf(a.id)-CREW_ACTION_ORDER.indexOf(b.id))) {
      const control=button(definition.label,definition.id);control.dataset.combatAction=definition.id;
      const reason=definition.id==="damageControl"?(REPAIR_ACTIONS.every(id=>actionReason(ACTIONS.find(action=>action.id===id)))?localizeSystem("SWFFG.UI.SpaceCombat.NoRepairs"):""):actionReason(definition);
      control.disabled||=!!reason;control.title=reason||description(definition);actions.append(control);
    }
    if(actions.children.length)section.append(node("h6","sc-action-group-title",label),actions);
  }
  if(ship.combat?.lastRoll) {
    const roll=ship.combat.lastRoll;
    section.append(node("p","sc-last-combat-roll",localizeSystem("SWFFG.UI.SpaceCombat.LastRoll", {...roll,label:ACTIONS.find(action=>action.id===roll.actionId)?.label??(roll.labelKey?localizeSystem(roll.labelKey):roll.label)})));
  }
  const effects=ship.combat?.effects??[];
  if(effects.length) {
    const list=node("ul","sc-combat-effects");
    for(const entry of effects) {
      const duration=entry.expiresRound?entry.phase==="round"?" · "+ localizeSystem("SWFFG.UI.SpaceCombat.EndOfRound", {round:entry.expiresRound}):" · "+localizeSystem(entry.phase==="end"?"SWFFG.UI.SpaceCombat.EndTurnRound":"SWFFG.UI.SpaceCombat.StartTurnRound", {round:entry.expiresRound}):entry.kind==="jam"?" · "+localizeSystem("SWFFG.UI.SpaceCombat.CommsDisrupted"):" · "+localizeSystem("SWFFG.UI.SpaceCombat.UntilUsed");
      list.append(node("li","",(effectKeys[entry.kind]?localizeSystem(effectKeys[entry.kind]):ACTIONS.find(action=>action.id===entry.kind)?.label??MANEUVERS.find(action=>action.id===entry.kind)?.label??entry.kind)+(entry.value?" ("+entry.value+")":"")+(entry.sector?" · "+SECTORS[entry.sector]:"")+duration));
    }
    section.append(node("h5","",localizeSystem("SWFFG.UI.SpaceCombat.ActiveEffects")),list);
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
