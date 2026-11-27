import {localizeSystem, localizedSystemError} from "../helpers/system-localization.mjs";
import {BARRAGES,barrageConfiguration} from './barrage-rules.mjs';
import {resolveCrewActor,resolveCrewDocument,integratedCrewVehicle} from '../helpers/integrated-crew.mjs';
import {requireLivingVehicleGroup,vehicleMinionGroup} from '../helpers/vehicle-minion-group.mjs';
import {shipWeaponAttackProfile} from '../helpers/ship-weapon-profile.mjs';
const groupSignature=vehicle=>{const group=vehicleMinionGroup(vehicle);return JSON.stringify([group.enabled,group.count,group.alive,group.hullPerVehicle]);};
import DiceHelpers,{get_dice_pool} from "../helpers/dice-helpers.js";
import {DicePoolFFG} from "../dice/pool.js";
import {effectivePool} from "../helpers/gm-difficulty.js";
import RollBuilderFFG from "../dice/roll-builder.js";
import {malfunctionNavigation} from "../helpers/vehicle-malfunction-engine.js";
import {weaponCrewCandidates} from "../helpers/crew.js";
import {crewRolesForSkill} from "../helpers/crew-role-definitions.mjs";
import {vehicleCrew} from "../helpers/crew-gunners.mjs";
import {controlsCrewMember,isPilotRole,isNavigationRole,actionRoleReason,isGunnerRole} from "./crew-access.mjs";
import {attackModifiers,attackSector,SECTORS,effectiveDefense,pilotSkill,characterActionState} from "./combat-rules.mjs";
import {rangeBetween} from "./flight.mjs";
import {board,command} from "./board.mjs";
import {weaponRangeIndex} from "./ranges.mjs";
import {initiativeStamp,initiativeReason} from "./initiative.mjs";

function pilotModifiers(pool,ship,vehicle,terrain=0,{assist=true}={}) {
  const handling=Number(vehicle.system.stats.handling?.value)||0;
  pool.boost+=Math.max(0,handling);pool.setback+=Math.max(0,-handling);
  pool.upgradeDifficulty(malfunctionNavigation(vehicle).pilotUpgrade??0);
  if(!assist) {
    pool.setback+=terrain;
    return;
  }
  const effects=ship.combat?.effects??[];
  pool.upgradeDifficulty(-effects.filter(e=>e.kind==="copilot").reduce((sum,e)=>sum+e.value,0));
  const plotted=effects.filter(e=>e.kind==="plot").reduce((sum,e)=>sum+e.value,0);
  pool.setback+=Math.max(0,terrain-plotted);
}
export async function rollCombatCheck({ship,vehicle,actor,key,difficulty,user,label,piloting=false,terrain=0}) {
  requireLivingVehicleGroup(vehicle);
  let pool=get_dice_pool(actor,key,new DicePoolFFG({difficulty}));
  pool.upgrade(pool.upgrades);
  if(piloting)pilotModifiers(pool,ship,vehicle,terrain,{assist:label!==localizeSystem("SWFFG.UI.SpaceCombat.Copilot")});
  pool=effectivePool(pool);
  const crew={name:vehicle.name,img:vehicle.img,crew_card:true,role:label};
  const roll=new game.ffg.RollFFG(pool.renderDiceExpression()||"0",{crew},pool,label);
  await roll.evaluate();
  return {success:roll.ffg.success,advantage:roll.ffg.advantage,threat:roll.ffg.threat,triumph:roll.ffg.triumph,
    message:{roll,actorId:actor.id,actorUuid:actor.uuid,label,key,userId:user.id}};
}
function escape(value) {
  return String(value??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
}
export async function postCombatMessages(messages,ship,user) {
  for(const entry of messages.filter(Boolean)) {
    const actor=(entry.actorUuid&&(resolveCrewDocument(entry.actorUuid)??globalThis.fromUuidSync?.(entry.actorUuid)))??resolveCrewActor(entry.actorId);
    const flags={starwarsffg:{...(entry.barrage?{spaceBarrage:entry.barrage}:{}),spaceCombat:true,shipId:ship.id,actingUserId:user.id,combatMode:"vehicle",combatSkill:entry.key}};
    if(entry.roll)await entry.roll.toMessage({speaker:ChatMessage.getSpeaker({actor:integratedCrewVehicle(actor)??actor,alias:actor?.name}),flavor:entry.label,flags});
    else await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor:integratedCrewVehicle(actor)??actor,alias:actor?.name}),content:"<p>"+escape(actor?.name??ship.name)+" - "+escape(entry.text)+"</p>",flags});
  }
}

class CombatRollBuilder extends RollBuilderFFG {
  async _reserveRollResources(transaction) {
    const context=this.spaceCombat;
    const vehicle=game.actors.get(context.ship.actorId);requireLivingVehicleGroup(vehicle);
    if(context.groupSignature!==groupSignature(vehicle))throw localizedSystemError("SWFFG.UI.SpaceCombat.GroupChanged");
    const current=board().ships.find(s=>s.id===context.ship.id);
    const target=board().ships.find(s=>s.id===context.target?.id);
    if(current?.version!==context.ship.version||target?.version!==context.target?.version)
      throw localizedSystemError("SWFFG.UI.SpaceCombat.CombatRollChanged");
    if(context.attack) {
      const weapon=vehicle.items.get(this.roll.item?.id);
      const profile=shipWeaponAttackProfile({...current,spaceShip:vehicle.system.spaceShip},weapon,target.silhouette);
      if(!weapon||profile.effectiveSilhouette!==context.attackProfile.effectiveSilhouette)
        throw Error(game.i18n.localize('SWFFG.ShipWeapon.ProfileChanged'));
    }
    transaction.spaceCombat=await command("combat",{shipId:current.id,version:current.version,
      crewId:context.member.actor_id,combatAction:context.attack?"attackReserve":"pilotReserve",
      targetId:target?.id,targetVersion:target?.version,weaponId:this.roll.item?.id,rollId:context.rollId,barrage:context.barrage?{id:context.barrage.id,weaponId:this.roll.item?.id,barrageArc:context.barrage.arc,barrageArcs:context.barrage.arcs,barrageCount:context.barrage.count}:undefined});
    try {
      await super._reserveRollResources(transaction);
      if(context.barrage)this.roll.item=this.roll.item.clone({"flags.starwarsffg.spaceCombatRoll":{shipId:current.id,crewId:context.member.actor_id,rollId:context.rollId,barrage:context.barrage}},{keepId:true});
    }
    catch(error) {await this._restoreRollResources(transaction);throw error;}
  }
  async _restoreRollResources(transaction) {
    try {await super._restoreRollResources(transaction);}
    finally {
      if(transaction.spaceCombat) {
        const ship=board().ships.find(s=>s.id===this.spaceCombat.ship.id);
        const reservation=transaction.spaceCombat;transaction.spaceCombat=null;
        await command("combat",{shipId:ship.id,version:ship.version,crewId:this.spaceCombat.member.actor_id,combatAction:"rollbackRoll",reservation});
      }
    }
  }
}

export async function openCombatRoll(shipSnapshot,member,{weapon:selectedWeapon,targetId,sector:selectedSector,terrain=0,barrage}={}) {
  if(board().round===0)throw localizedSystemError("SWFFG.UI.SpaceCombat.CombatEnded");
  // Read the authoritative current counter instead of a rendered card snapshot.
  const ship=board().ships.find(entry=>entry.id===shipSnapshot.id);
  const vehicle=game.actors.get(ship?.actorId),actor=resolveCrewActor(member,vehicle);
  requireLivingVehicleGroup(vehicle);
  const current=vehicle&&vehicleCrew(vehicle).find(m=>m.actor_id===member.actor_id&&m.role===member.role);
  if(!current||!controlsCrewMember(current))throw localizedSystemError("SWFFG.UI.SpaceCombat.StationForbidden");
  const reason=initiativeReason(current);if(reason)throw Error(reason);
  const turn=characterActionState(board().ships,member.actor_id,board().round);
  if(!game.user.isGM&&(turn.action||turn.ended))throw localizedSystemError("SWFFG.UI.SpaceCombat.TurnAlreadyUsed");
  const attack=!!selectedWeapon;
  if(attack){const reason=actionRoleReason(vehicle,member.actor_id,"attack");if(reason)throw Error(reason);}
  if(!attack&&!game.user.isGM&&!isNavigationRole(current))throw localizedSystemError("SWFFG.UI.SpaceCombat.PilotingRoleRestriction");
  const target=board().ships.find(entry=>entry.id===targetId&&entry.id!==ship.id);
  const barrageData=barrage?barrageConfiguration(ship,vehicle,BARRAGES.find(action=>action.id===barrage.id),{...barrage,weaponId:selectedWeapon?.id}):null;
  if(barrageData&&!isGunnerRole(current))throw localizedSystemError("SWFFG.UI.SpaceCombat.GunnersOnly");
  if(barrageData?.id==="concentratedBarrage"&&target?.silhouette<5)throw localizedSystemError("SWFFG.UI.SpaceCombat.ConcentratedTarget");
  let key=pilotSkill(vehicle,game.settings.get("starwarsffg","skilltheme"));
  let pool,attackProfile,weapon;
  let sector=selectedSector;
  const crew={name:vehicle.name,img:vehicle.img,crew_card:true,role:current.role};
  let guided=false;
  if(attack) {
    if(!target)throw localizedSystemError("SWFFG.UI.SpaceCombat.ChooseAttackTarget");
    weapon=vehicle.items.get(selectedWeapon.id);
    key=weapon?.system.skill?.value;
    const malfunctions=malfunctionNavigation(vehicle);
    if(malfunctions.disabledWeapons.includes(weapon?.id))throw localizedSystemError("SWFFG.UI.SpaceCombat.WeaponDisabled");
    if(!weapon||!weaponCrewCandidates(weapon,[current],crewRolesForSkill(vehicle,key),malfunctions).length)throw localizedSystemError("SWFFG.UI.SpaceCombat.WeaponUnavailableAtStation");
    const range=rangeBetween(ship,target);
    const allowed=weaponRangeIndex(weapon);
    const band=range.index;
    if(allowed>=0&&band>allowed)throw localizedSystemError("SWFFG.UI.SpaceCombat.TargetOutOfRange");
    attackProfile=shipWeaponAttackProfile({...ship,spaceShip:vehicle.system.spaceShip},weapon,target.silhouette);
    const {difficulty}=attackProfile;
    pool=get_dice_pool(actor,key,new DicePoolFFG({difficulty,setback:malfunctions.weaponSetbacks[weapon.id]??0}));
    pool=await DiceHelpers.getModifiers(pool,weapon);
    sector=Object.hasOwn(SECTORS,sector)?sector:attackSector(ship,target,actor.id);
    pool.setback+=effectiveDefense(target,game.actors.get(target.actorId),sector);
    guided=(weapon.system.adjusteditemmodifier??weapon.system.itemmodifier??[]).some(q=>/guided|guidage|guidée/i.test(q.name));
    const modifiers=attackModifiers(ship,target,actor.id,{guided,sector});
    pool.boost+=modifiers.boost;pool.upgrade(modifiers.abilityUpgrades);pool.upgradeDifficulty(modifiers.difficultyUpgrades);
  } else {
    const challenge=Math.min(ship.speed,ship.silhouette),difficulty=Math.max(ship.speed,ship.silhouette)-challenge;
    pool=get_dice_pool(actor,key,new DicePoolFFG({difficulty,challenge}));
    pilotModifiers(pool,ship,vehicle,terrain,{assist:isPilotRole(current)});
  }
  const data=await actor.sheet.getData();data.document=actor;data.documentUuid=actor.uuid;
  const rollId=foundry.utils.randomID();
  const marker={shipId:ship.id,crewId:actor.id,rollId,...(barrageData?{barrage:barrageData}:{})};
  const item=weapon?weapon.clone({"flags.starwarsffg.spaceCombatRoll":marker,"flags.starwarsffg.uuid":weapon.uuid},{keepId:true}):{crew,flags:{starwarsffg:{spaceCombatRoll:marker}}};
  const builder=new CombatRollBuilder(data,pool,barrageData?barrageData.label:attack?localizeSystem("SWFFG.UI.SpaceCombat.ShotTitle", {name:weapon.name}):localizeSystem("SWFFG.UI.SpaceCombat.PilotingCheck"),key,item,
    attack?localizeSystem("SWFFG.UI.SpaceCombat.TargetFlavor", {name:game.actors.get(target.actorId)?.name ?? target.name}):localizeSystem("SWFFG.UI.SpaceCombat.Title"));
  builder.roll.crew=crew;builder.roll.combatMode="vehicle";
  builder.spaceCombat={groupSignature:groupSignature(vehicle),ship:structuredClone(ship),target:target&&structuredClone(target),member:current,attack,attackProfile,sector,guided,rollId,barrage:barrageData,initiative:initiativeStamp()};
  return builder.render(true);
}
