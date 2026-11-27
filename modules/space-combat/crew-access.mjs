import {localizeSystem} from "../helpers/system-localization.mjs";
import {isBarrage} from './barrage-rules.mjs';
import {resolveCrewActor} from '../helpers/integrated-crew.mjs';
export function crewRoster(vehicle) {
  const crew=vehicle?.getFlag?.("starwarsffg","crew")??vehicle?.flags?.starwarsffg?.crew;
  return Array.isArray(crew)?crew.map(member=>member.npcStation?{...member,vehicle_uuid:vehicle.uuid}:member):[];
}
export function crewActor(member) {
  return resolveCrewActor(member);
}
export function aboardRoster(vehicle) {
  const crew=crewRoster(vehicle),members=[...crew],seen=new Set(crew.map(member=>member.actor_id));
  const deck=vehicle?.getFlag?.("starwarsffg","vehicleDeck")??vehicle?.flags?.starwarsffg?.vehicleDeck;
  for(const passenger of Object.values(deck?.passengers??{})) {
    const id=passenger?.tokenUuid??passenger?.actorId;
    if(!id||seen.has(id))continue;
    const member={actor_id:id,actor_name:passenger.name,role:passenger.role??"Passager",tokenUuid:passenger.tokenUuid,passenger:true,integrated:!!passenger.integrated,vehicle_id:passenger.vehicle_id??vehicle.id,vehicle_uuid:vehicle.uuid};
    if(!crewActor(member))continue;
    seen.add(id);members.push(member);
  }
  return members;
}

export function controlsCrewMember(member,user=game.user) {
  if(!user)return false;
  if(user.isGM)return true;
  if(member?.integrated)return false;
  const actor=crewActor(member);
  return !!actor&&(actor.id===user.character?.id||actor.testUserPermission(user,"OWNER"));
}

export function isPilotRole(member) {
  return /^(pilot|pilote)$/i.test(String(member?.role??"").trim());
}
export function isNavigationRole(member) {
  return /^(pilot|pilote|copilot|copilote)$/.test(String(member?.role??"").normalize("NFD").replace(/[\u0300-\u036f\s_-]/g,"").toLowerCase());
}
export function isGunnerRole(member) {
  return /^(gunner|artilleur)$/i.test(String(member?.role??"").trim());
}
export function actionRoleReason(vehicle,actorId,actionId) {
  const assignments=crewRoster(vehicle).filter(member=>member.actor_id===actorId);
  if(isBarrage(actionId))return assignments.some(isGunnerRole)?"":localizeSystem("SWFFG.UI.SpaceCombat.GunnersOnly");
  if(actionId==="advantage")return assignments.some(isPilotRole)?"":localizeSystem("SWFFG.UI.SpaceCombat.AdvantagePilotOnly");
  if(actionId==="copilot")return assignments.some(member=>isNavigationRole(member)&&!isPilotRole(member))?"":localizeSystem("SWFFG.UI.SpaceCombat.CopilotOnly");
  if(actionId==="attack")return assignments.some(member=>isNavigationRole(member)||isGunnerRole(member))?"":localizeSystem("SWFFG.UI.SpaceCombat.GunneryRoles");
  const crew=assignments.some(member=>{
    const role=String(member.role??"").trim();
    return role&&!isNavigationRole(member)&&!isGunnerRole(member)&&!/^(initiative|passager|passenger)$/i.test(role);
  });
  const passenger=aboardRoster(vehicle).some(member=>member.actor_id===actorId&&member.passenger&&!isNavigationRole(member)&&!isGunnerRole(member));
  return crew||passenger?"":localizeSystem("SWFFG.UI.SpaceCombat.SupportRoles");
}
export function canRedirectShields(member) {
  const role=String(member?.role??"").normalize("NFD").replace(/[\u0300-\u036f\s_-]/g,"").toLowerCase();
  return !!role&&!/^(gunner|artilleur)$/.test(role);
}

export function canSelectShip(ship,user=game.user) {
  if(user?.isGM)return true;
  return aboardRoster(game.actors.get(ship?.actorId)).some(member=>controlsCrewMember(member,user));
}

export function canPilotShip(ship,user=game.user) {
  if(user?.isGM)return true;
  return crewRoster(game.actors.get(ship?.actorId)).some(member=>isPilotRole(member)&&controlsCrewMember(member,user));
}
