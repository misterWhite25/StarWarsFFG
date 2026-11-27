import {localizeSystem, localizedSystemError} from "../helpers/system-localization.mjs";
import {vehicleMinionGroup} from '../helpers/vehicle-minion-group.mjs';
import {isAntiFighterWeapon} from '../helpers/ship-weapon-profile.mjs';
import {vehicleCrew} from '../helpers/crew-gunners.mjs';
import {crewRolesForSkill,crewRoleDefinitions} from '../helpers/crew-role-definitions.mjs';
import {weaponCrewCandidates,crewStationWeapons} from '../helpers/crew.js';
import {canSelectShip,controlsCrewMember,actionRoleReason} from './crew-access.mjs';
import {characterActionState} from './combat-rules.mjs';
import {initiativeReason} from './initiative.mjs';
import {openSelectedCombatRoll} from './combat-controls.mjs';
import {board} from './board.mjs';

function node(tag,className,text){const e=document.createElement(tag);if(className)e.className=className;if(text!=null)e.textContent=String(text);return e;}
function button(label,callback,report){const e=node('button','sc-card-action',label);e.type='button';e.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();Promise.resolve().then(callback).catch(report);});return e;}
const number=value=>Number.isFinite(Number(value))&&value!==''&&value!=null?Number(value).toLocaleString(game.i18n?.lang):'?';

// Keep damaged weapons visible at their posts; firing still checks their actual condition.
export function stationWeapons(vehicle,member){
  if(member.passenger||actionRoleReason(vehicle,member.actor_id,'attack'))return [];
  return crewStationWeapons(vehicle,member,crewRoleDefinitions(vehicle),{disabledWeapons:[]});
}
function availableGunners(ship,actor,weapon,member){
  const group=vehicleMinionGroup(actor);if(group.enabled&&!group.alive)return [];
  return weaponCrewCandidates(weapon,vehicleCrew(actor),crewRolesForSkill(actor,weapon.system.skill?.value)).filter(candidate=>{
    if(member&&(candidate.actor_id!==member.actor_id||candidate.role!==member.role))return false;
    const turn=characterActionState(board().ships,candidate.actor_id,board().round);
    return controlsCrewMember(candidate)&&!initiativeReason(candidate)&&!actionRoleReason(actor,candidate.actor_id,'attack')&&(game.user.isGM||!turn.action&&!turn.ended);
  });
}
export function fireCrewWeapon(ship,actor,selectedWeapon,options={},member){
  if(!canSelectShip(ship))throw localizedSystemError("SWFFG.UI.SpaceCombat.CrewMembershipRequired");
  const weapon=actor.items.get(selectedWeapon.id);if(!weapon)throw localizedSystemError("SWFFG.UI.SpaceCombat.WeaponUnavailable");
  const candidates=availableGunners(ship,actor,weapon,member);
  if(!candidates.length)throw localizedSystemError("SWFFG.UI.SpaceCombat.WeaponCrewUnavailable");
  return openSelectedCombatRoll(ship,candidates[0],weapon,options);
}
export function renderCrewWeapon(ship,actor,item,report,options={},member){
  const row=node("article","sc-card-weapon"),data=item.system;
  row.dataset.itemId=item.id;
  if(actor.testUserPermission(game.user,"OBSERVER"))row.append(button(item.name,()=>item.sheet.render({force:true}),report));
  else row.append(node("strong","sc-card-weapon-name",item.name));
  const damage=Number(data.damage?.adjusted)>0?data.damage.adjusted:data.damage?.value;
  const crit=Number(data.crit?.adjusted)>0?data.crit.adjusted:data.crit?.value;
  const range=data.range?.label??CONFIG.FFG.vehicle_ranges?.[data.range?.value]??data.range?.value??"";
  const arcLabels={fore:localizeSystem("SWFFG.UI.SpaceCombat.Fore"),aft:localizeSystem("SWFFG.UI.SpaceCombat.Aft"),port:localizeSystem("SWFFG.UI.SpaceCombat.Port"),starboard:localizeSystem("SWFFG.UI.SpaceCombat.Starboard"),dorsal:"Dorsal",ventral:"Ventral"};
  const arcs=Object.entries(arcLabels).filter(([key])=>data.firingarc?.[key]).map(([,label])=>label);
  const stats=node("p","sc-weapon-stats",[localizeSystem("SWFFG.UI.SpaceCombat.DamageShort") + " "+number(damage),"Crit. "+number(crit),game.i18n.localize(String(range)),...arcs].filter(Boolean).join(" · "));
  if(isAntiFighterWeapon(item)) {
    const badge=node('span','ffg-anti-fighter-badge',game.i18n.localize('SWFFG.ShipWeapon.AntiFighter'));
    badge.title=game.i18n.localize('SWFFG.ShipWeapon.AntiFighterHint');
    stats.append(' ',badge);
  }
  row.append(stats);
  const qualities=(data.adjusteditemmodifier??data.itemmodifier??[]).filter(quality=>quality?.name).map(quality=>{
    const rank=Number(quality.system?.rank_current??quality.system?.rank??quality.rank);
    return quality.name+(rank>1?" "+rank:"");
  });
  if(data.special?.value)qualities.push(String(data.special.value));
  if(qualities.length)row.append(node("p","sc-card-note",qualities.join(" · ")));
  if(item.flags?.starwarsffg?.config?.enableAmmo)row.append(node("p","sc-card-note","Munitions "+number(data.ammo?.value)+" / "+number(data.ammo?.max)));
  if(canSelectShip(ship)) {
    const shoot=button(localizeSystem("SWFFG.UI.SpaceCombat.AttackShort"),()=>fireCrewWeapon(ship,actor,item,options,member),report);
    const candidates=availableGunners(ship,actor,item,member);
    shoot.disabled=board().round===0||!candidates.length;
    if(shoot.disabled)shoot.title=board().round===0?localizeSystem("SWFFG.UI.SpaceCombat.StartBeforeAttack"):localizeSystem("SWFFG.UI.SpaceCombat.AssignGunner");
    row.append(shoot);
  }
  return row;
}
