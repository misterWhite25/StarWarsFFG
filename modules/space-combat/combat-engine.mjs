import {localizeSystem, localizedSystemError} from "../helpers/system-localization.mjs";
import {BARRAGES,barrageConfiguration} from './barrage-rules.mjs';
import {requireLivingVehicleGroup,vehicleGroupRepairValue,vehicleMinionGroup,vehicleDamageResource} from '../helpers/vehicle-minion-group.mjs';
import {crewRoster,aboardRoster,crewActor,controlsCrewMember,isPilotRole,isNavigationRole,canRedirectShields,actionRoleReason} from "./crew-access.mjs";
import {MANEUVERS,ACTIONS,SECTORS,combatState,turnState,characterActionState,pilotManeuverLimit,maneuverReason,repairDifficulty,advantageDifficulty,pilotSkill,attackModifiers,expireEffects} from "./combat-rules.mjs";
import {initiativeReason} from "./initiative.mjs";
import {resolveMovement} from "./movement.mjs";

function memberFor(ship,actorId,user,includePassengers=false) {
  const vehicle=game.actors.get(ship.actorId);
  const assignments=(includePassengers?aboardRoster(vehicle):crewRoster(vehicle)).filter(m=>m.actor_id===actorId),actor=crewActor(assignments[0]);
  if(!vehicle||!actor||!assignments.length||!controlsCrewMember(assignments[0],user))throw localizedSystemError("SWFFG.UI.SpaceCombat.SelectOwnCrew");
  return {vehicle,actor,member:assignments[0],pilot:assignments.some(isPilotRole),navigator:assignments.some(isNavigationRole),shieldOperator:assignments.some(canRedirectShields)};
}
function sector(value) {
  if(!Object.hasOwn(SECTORS,value))throw localizedSystemError("SWFFG.UI.SpaceCombat.SelectDefenseSector");
  return value;
}
function integer(value,min,max,label) {
  if(!Number.isInteger(value)||value<min||value>max)throw Error(label+" invalide.");
  return value;
}
export async function executeCombat(state,ship,request,user,services={}) {
  const {vehicle,actor,member,pilot,navigator,shieldOperator}=memberFor(ship,request.crewId,user,true);
  const combat=combatState(ship),turn=turnState(ship,request.crewId,state.round);
  const previousAction=!!turn.action,previousActionLabel=turn.actionLabel;
  const updates=[],messages=[];
  const resource=(document,requestedKey,delta)=>{
    const convertStrain=document===vehicle&&requestedKey==="systemStrain"&&vehicleMinionGroup(vehicle).enabled;
    if(convertStrain&&delta<=0)return;
    const key=convertStrain?vehicleDamageResource(vehicle,requestedKey):requestedKey;
    const path="system.stats."+key+".value";
    const current=Number(document.system.stats?.[key]?.value);
    if(!Number.isFinite(current))throw Error(localizeSystem("SWFFG.UI.SpaceCombat.ResourceValueRequired", {key, name:document.name}));
    const existing=updates.find(entry=>entry.document===document&&entry.path===path);
    const adjusted=value=>document===vehicle&&key==='hullTrauma'&&delta<0?vehicleGroupRepairValue(vehicle,value):Math.max(0,value);
    if(existing)existing.after=adjusted(existing.after+delta);
    else updates.push({document,path,before:current,after:adjusted(current+delta)});
  };
  const effect=(kind,fields={},on=ship)=>{
    const entry={id:foundry.utils.randomID(),kind,actorId:actor.id,...fields};
    combatState(on).effects.push(entry);return entry;
  };
  const assertTurn=()=>{
    const reason=initiativeReason(member);if(reason)throw Error(reason);
    if(!user.isGM&&(turn.ended||characterActionState(state.ships,request.crewId,state.round).ended))throw localizedSystemError("SWFFG.UI.SpaceCombat.CharacterTurnEnded");
  };
  const spendAction=()=>{assertTurn();if(!user.isGM&&characterActionState(state.ships,request.crewId,state.round).action)throw localizedSystemError("SWFFG.UI.SpaceCombat.AlreadyActed");turn.action=true;};
  const spendManeuver=def=>{
    assertTurn();
    const reason=maneuverReason(def,ship,navigator);
    if(reason)throw Error(reason);
    if(turn.maneuvers>=2)throw localizedSystemError("SWFFG.UI.SpaceCombat.TwoManeuverLimit");
    if(def.pilot&&combat.pilotManeuvers>=pilotManeuverLimit(ship))throw Error(pilotManeuverLimit(ship)===1?localizeSystem("SWFFG.UI.SpaceCombat.HeavyPilotLimit"):localizeSystem("SWFFG.UI.SpaceCombat.PilotLimit"));
    const personal=turn.maneuvers===1&&request.secondCost!=="action"?2:0,system=def.pilot&&combat.pilotManeuvers===1?2:0;
    if(turn.maneuvers===1) {
      if(request.secondCost==="action")spendAction();
      else if(request.secondCost==="strain")resource(actor,"strain",2);
      else throw localizedSystemError("SWFFG.UI.SpaceCombat.SelectSecondManeuverCost");
    }
    if(def.pilot&&combat.pilotManeuvers===1)resource(vehicle,"systemStrain",2);
    turn.maneuvers++;
    (turn.maneuverLog??=[]).push({id:def.id,label:def.label,personal,system});
    if(def.pilot)combat.pilotManeuvers++;
  };
  const target=state.ships.find(s=>s.id===request.targetId&&s.id!==ship.id);
  const targetActor=target&&game.actors.get(target.actorId);
  const untilEnd={expiresRound:state.round+1,phase:"end"};
  const roll=async(key,difficulty,options={})=>{
    if(!actor.system.skills?.[key])throw localizedSystemError("SWFFG.UI.SpaceCombat.CharacterSkillUnavailable");
    const runner=services.rollCheck??(await import("./combat-rolls.mjs")).rollCombatCheck;
    const result=await runner({ship,vehicle,actor,key,difficulty,user,label:options.label,...options});
    messages.push(result.message);
    return {success:Math.max(0,Number(result.success)||0),...result};
  };
  const announce=text=>messages.push({text,actorId:actor.id,actorUuid:actor.uuid});
  const id=request.combatAction==="speed"?(integer(request.speedDelta,-1,1,localizeSystem("SWFFG.UI.SpaceCombat.SpeedChange"))===1?"accelerate":request.speedDelta===-1?"decelerate":null):request.combatAction;
  if(!id)throw localizedSystemError("SWFFG.UI.SpaceCombat.ChooseAcceleration");
  if(id==="repairStrain"&&vehicleMinionGroup(vehicle).enabled)throw localizedSystemError("SWFFG.UI.SpaceCombat.MinionsCannotRepairStrain");
  if(!["rollbackRoll","resetEncounter","endTurn","allowRepairs"].includes(id))requireLivingVehicleGroup(vehicle);
  if(id==="allowRepairs") {
    if(!user.isGM)throw localizedSystemError("SWFFG.UI.SpaceCombat.HullRepairGMOnly");
    combat.repairAllowed=!combat.repairAllowed;
  } else if(id==="endTurn") {
    assertTurn();turn.ended=true;expireEffects(ship,state.round,"end",actor.id);
    announce(localizeSystem("SWFFG.UI.SpaceCombat.TurnEnded"));
  } else if(id==="resetEncounter") {
    if(!user.isGM)throw localizedSystemError("SWFFG.UI.SpaceCombat.StartEncounterGMOnly");
    ship.combat={turns:{},effects:[],pilotManeuvers:0,pilotAction:false,hullRepairUsed:false,advantageCounts:{}};
    ship.destination={x:ship.x,y:ship.y};delete ship.movementSteps;
    ship.movementSpent=0;ship.movementTurnSpent=0;
    announce(localizeSystem("SWFFG.UI.SpaceCombat.NewShipEncounter"));
  } else if(id==="attackReserve"||id==="pilotReserve") {
    assertTurn();
    const isAttack=id==="attackReserve";
    if(isAttack){const reason=actionRoleReason(vehicle,request.crewId,"attack");if(reason)throw Error(reason);}
    if(!isAttack&&!navigator)throw localizedSystemError("SWFFG.UI.SpaceCombat.PilotingRoleRestriction");
    const weapon=isAttack?vehicle.items.get(request.weaponId):null;
    if(isAttack) {
      const {weaponCrewCandidates}=await import("../helpers/crew.js");
      const {crewRolesForSkill}=await import("../helpers/crew-role-definitions.mjs");
      const {vehicleCrew}=await import("../helpers/crew-gunners.mjs");
      if(!weapon||!weaponCrewCandidates(weapon,vehicleCrew(vehicle).filter(m=>m.actor_id===actor.id),crewRolesForSkill(vehicle,weapon.system.skill?.value)).length)
        throw localizedSystemError("SWFFG.UI.SpaceCombat.WeaponForbidden");
      if(!target||target.version!==request.targetVersion)throw localizedSystemError("SWFFG.UI.SpaceCombat.TargetChanged");
      if(request.barrage){
        const reason=actionRoleReason(vehicle,request.crewId,request.barrage.id);if(reason)throw Error(reason);
        barrageConfiguration(ship,vehicle,BARRAGES.find(def=>def.id===request.barrage.id),{...request.barrage,weaponId:weapon.id});
        if(request.barrage.id==="concentratedBarrage"&&target.silhouette<5)throw localizedSystemError("SWFFG.UI.SpaceCombat.ConcentratedTarget");
      }
      const {malfunctionNavigation}=await import("../helpers/vehicle-malfunction-engine.js");
      if(malfunctionNavigation(vehicle).disabledWeapons.includes(weapon.id))throw localizedSystemError("SWFFG.UI.SpaceCombat.WeaponDisabled");
    }
    const consumed=[];
    if(isAttack) {
      spendAction();
      turn.actionLabel="Tir - "+weapon.name;
      const modifiers=attackModifiers(ship,target,actor.id);
      for(const effectId of modifiers.consume) {
        const entry=combat.effects.find(e=>e.id===effectId);
        if(entry.kind==="fireDiscipline"&&entry.value>1){entry.value--;consumed.push({...entry,value:1});}
        else {consumed.push(entry);combat.effects=combat.effects.filter(e=>e.id!==effectId);}
      }
    } else {
      spendAction();
      turn.actionLabel=localizeSystem("SWFFG.UI.SpaceCombat.PilotingCheck");
      for(const entry of combat.effects.filter(e=>pilot&&["copilot","plot"].includes(e.kind)))consumed.push(entry);
      combat.effects=combat.effects.filter(e=>!consumed.includes(e));
    }
    const reservation=foundry.utils.randomID();
    combat.reservations??={};
    if(typeof request.rollId!=="string"||request.rollId.length>100)throw localizedSystemError("SWFFG.UI.SpaceCombat.InvalidRollId");
    combat.reservations[reservation]={userId:user.id,actorId:actor.id,action:true,previousAction,previousActionLabel,consumed,weaponId:weapon?.id??null,rollId:request.rollId};
    if(weapon?.getFlag("starwarsffg","config.enableAmmo")) {
      const before=Number(weapon.system.ammo?.value);
      if(!Number.isFinite(before)||before<=0)throw localizedSystemError("SWFFG.UI.SpaceCombat.NoAmmunition");
      updates.push({document:weapon,path:"system.ammo.value",before,after:before-1});
      combat.reservations[reservation].ammo={before,after:before-1};
    }
    return {updates,messages,value:reservation};
  } else if(id==="rollbackRoll") {
    const reservation=combat.reservations?.[request.reservation];
    if(!reservation||reservation.actorId!==actor.id||reservation.userId!==user.id)throw localizedSystemError("SWFFG.UI.SpaceCombat.RollReservationMissing");
    if(reservation.action){turn.action=!!reservation.previousAction;if(reservation.previousActionLabel===undefined)delete turn.actionLabel;else turn.actionLabel=reservation.previousActionLabel;}
    for(const entry of reservation.consumed) {
      const existing=combat.effects.find(e=>e.id===entry.id);
      if(existing)existing.value+=entry.value;
      else combat.effects.push(entry);
    }
    if(reservation.ammo) {
      const weapon=vehicle.items.get(reservation.weaponId);
      if(Number(weapon?.system.ammo?.value)!==reservation.ammo.after)throw localizedSystemError("SWFFG.UI.SpaceCombat.AmmunitionChanged");
      updates.push({document:weapon,path:"system.ammo.value",before:reservation.ammo.after,after:reservation.ammo.before});
    }
    delete combat.reservations[request.reservation];
  } else {
    const maneuver=MANEUVERS.find(def=>def.id===id)??(["accelerate","decelerate"].includes(id)?{...MANEUVERS.find(def=>def.id==="speed"),id,label:id==="accelerate"?localizeSystem("SWFFG.UI.SpaceCombat.Accelerate"):localizeSystem("SWFFG.UI.SpaceCombat.Decelerate")}:undefined);
    const action=ACTIONS.find(def=>def.id===id);
    if(!maneuver&&!action)throw localizedSystemError("SWFFG.UI.SpaceCombat.UnknownAction");
    const definition=maneuver??action;
    if(action){assertTurn();const reason=actionRoleReason(vehicle,request.crewId,id);if(reason)throw Error(reason);}
    if(id==="shields"&&!shieldOperator)throw localizedSystemError("SWFFG.UI.SpaceCombat.ShieldRoleRestriction");
    if(id==="attack")throw localizedSystemError("SWFFG.UI.SpaceCombat.PrepareWithWeaponDice");
    if(definition.target&&(!target||!targetActor))throw localizedSystemError("SWFFG.UI.SpaceCombat.ChooseMapTarget");
    const reason=maneuverReason(definition,ship,maneuver?navigator:pilot);
    if(reason)throw Error(reason);
    let barrage;
    if(definition.barrage){
      barrage=barrageConfiguration(ship,vehicle,definition,request);
      const {crewStationWeapons}=await import("../helpers/crew.js");
      const {crewRoleDefinitions}=await import("../helpers/crew-role-definitions.mjs");
      if(!crewStationWeapons(vehicle,member,crewRoleDefinitions(vehicle)).some(weapon=>weapon.id===barrage.weaponId))throw localizedSystemError("SWFFG.UI.SpaceCombat.BatteryForbidden");
      if(definition.id!=="blanketBarrage")throw localizedSystemError("SWFFG.UI.SpaceCombat.PrepareBarrage");
    }
    if(maneuver)spendManeuver(maneuver);
    else {
      spendAction();
      turn.actionLabel=action.label;
      if(action.pilot) {
        if(combat.pilotAction)throw localizedSystemError("SWFFG.UI.SpaceCombat.PilotActionUsed");
        combat.pilotAction=true;
      }
    }
    if(["repairHull","manualRepair"].includes(id)) {
      if(combat.hullRepairUsed)throw localizedSystemError("SWFFG.UI.SpaceCombat.HullRepairAttempted");
      if(!user.isGM&&!combat.repairAllowed)throw localizedSystemError("SWFFG.UI.SpaceCombat.GMAllowHullRepair");
      combat.hullRepairUsed=true;
    }
    if(id==="accelerate"||id==="decelerate") {
      ship.speed+=id==="accelerate"?1:-1;ship.startSpeed=ship.speed;
      if(ship.destination)ship.destination={x:ship.x,y:ship.y};
      if(ship.silhouette>=5){ship.turn=0;combat.accelerated=true;}
    } else if(id==="punch") {
      resource(vehicle,"systemStrain",ship.maxSpeed-ship.speed);ship.speed=ship.maxSpeed;ship.startSpeed=ship.speed;
      if(ship.destination)ship.destination={x:ship.x,y:ship.y};
    } else if(id==="fly") {
      Object.assign(ship,resolveMovement(ship,request.destination??{x:ship.x,y:ship.y}));
    } else if(id==="evasive"||id==="stay") {
      const existing=combat.effects.find(e=>e.kind===id);
      if(existing)Object.assign(existing,untilEnd,{actorId:actor.id});else effect(id,untilEnd);
    } else if(id==="shields") {
      const from=sector(request.fromSector),to=sector(request.sector),stats=vehicle.system.stats.shields;
      if(from===to||!Number.isFinite(Number(stats?.[from]))||!Number.isFinite(Number(stats?.[to]))||Number(stats[from])<1||Number(stats[to])>=4)throw localizedSystemError("SWFFG.UI.SpaceCombat.DifferentSectors");
      for(const [key,delta] of [[from,-1],[to,1]])updates.push({document:vehicle,path:"system.stats.shields."+key,before:Number(stats[key]),after:Number(stats[key])+delta});
    } else {
      const theme=game.settings.get("starwarsffg","skilltheme");
      let key=action.skill==="pilot"?pilotSkill(vehicle,theme):action.skill;
      if(action.skills) {
        if(!action.skills.includes(request.skill))throw localizedSystemError("SWFFG.UI.SpaceCombat.ChooseAllowedSkill");
        key=request.skill;
      }
      let difficulty=action.difficulty??2;
      if(id==="advantage")difficulty=advantageDifficulty(ship,target);
      if(id==="repairStrain")difficulty=repairDifficulty(vehicle.system.stats.systemStrain);
      if(id==="repairHull"){const group=vehicleMinionGroup(vehicle);difficulty=repairDifficulty({...vehicle.system.stats.hullTrauma,max:group.enabled?group.totalHull:vehicle.system.stats.hullTrauma.max});}
      const critical=id==="repairCritical"?vehicle.items.get(request.criticalId):null;
      if(id==="repairCritical") {
        if(critical?.type!=="criticaldamage")throw localizedSystemError("SWFFG.UI.SpaceCombat.ChooseCriticalHit");
        difficulty=integer(Number(critical.system.severity),1,5,localizeSystem("SWFFG.UI.SpaceCombat.CriticalSeverity"));
      }
      if(id==="plot")difficulty=key==="Astrogation"?2:3;
      if(id==="spoof")difficulty=key==="Computers"?2:3;
      if(id==="communicate")difficulty=Math.max(0,...combat.effects.filter(e=>e.kind==="jam").map(e=>e.value));
      if(id==="communicate"&&!difficulty)throw localizedSystemError("SWFFG.UI.SpaceCombat.NoJamming");
      if(id==="boostShields"&&!Object.values(vehicle.system.stats.shields??{}).some(v=>Number(v)>0))throw localizedSystemError("SWFFG.UI.SpaceCombat.DefenseRequired");
      const selectedSector=["boostShields","slice"].includes(id)?sector(request.sector):null;
      if(id==="slice"&&Number(targetActor.system.stats.shields?.[selectedSector])<=0)throw localizedSystemError("SWFFG.UI.SpaceCombat.NoSectorDefense");
      // The GM may add contextual terrain dice; a course only removes those dice.
      const terrain=integer(request.terrain??0,0,20,localizeSystem("SWFFG.UI.SpaceCombat.TerrainDiceCount"));
      const result=await roll(key,difficulty,{label:action.label,piloting:action.skill==="pilot",terrain});
      combat.lastRoll={actionId:action.id,label:action.label,actorId:actor.id,success:Math.max(0,Number(result.success)||0),advantage:Number(result.advantage)||0,threat:Number(result.threat)||0};
      const successes=Math.max(0,Number(result.success)||0);
      if(id==="blanketBarrage") {
        const last=messages.at(-1);if(last)last.barrage=barrage;
        combat.effects=combat.effects.filter(effect=>effect.kind!==id);
        effect(id,{value:1+Math.floor(Math.max(0,Number(result.advantage)||0)/2),arc:barrage.arc,arcs:barrage.arcs,weaponId:barrage.weaponId,damage:barrage.damage,expiresRound:state.round+1,phase:"end"});
      }
      if(action.skill==="pilot"&&id!=="copilot")combat.effects=combat.effects.filter(e=>!["copilot","plot"].includes(e.kind));
      if(successes>0) {
        if(id==="repairStrain")resource(vehicle,"systemStrain",-1);
        if(id==="repairHull"||id==="manualRepair")resource(vehicle,"hullTrauma",-successes);
        if(id==="repairCritical")updates.push({kind:"delete",document:critical,parent:vehicle,snapshot:critical.toObject()});
        if(id==="advantage") {
          combat.effects=combat.effects.filter(e=>!(e.kind==="advantage"&&e.targetId===target.id));
          combatState(target).effects=combatState(target).effects.filter(e=>!(e.kind==="advantage"&&e.targetId===ship.id));
          combat.advantageCounts[target.id]=(combat.advantageCounts[target.id]??0)+1;
          effect(id,{targetId:target.id,expiresRound:state.round+1,phase:"round"});target.version++;
        }
        if(id==="copilot"||id==="plot") {
          combat.effects=combat.effects.filter(e=>e.kind!==id);effect(id,{value:successes});
        }
        if(id==="jam") {
          const enemy=combatState(target);enemy.effects=enemy.effects.filter(e=>!(e.kind===id&&e.sourceId===ship.id));
          effect(id,{value:successes+1,sourceId:ship.id},target);target.version++;
        }
        if(id==="boostShields") {
          resource(vehicle,"systemStrain",1);effect(id,{sector:selectedSector,value:1,expiresRound:state.round+successes,phase:"start"});
        }
        if(id==="fireDiscipline")effect(id,{value:1+Math.floor((successes-1)/2)});
        if(id==="spoof")effect(id,{value:1,expiresRound:state.round+1,phase:"start"});
        if(id==="slice") {effect(id,{sector:selectedSector,value:-1,sourceId:ship.id,expiresRound:state.round+successes,phase:"start"},target);target.version++;}
        if(id==="scan") {
          const names=targetActor.items.filter(item=>item.type==="shipweapon"||item.type==="shipattachment").map(item=>item.name).join(", ");
          const targetGroup=vehicleMinionGroup(targetActor);
          announce(localizeSystem(targetGroup.enabled?"SWFFG.UI.SpaceCombat.ScanGroup":"SWFFG.UI.SpaceCombat.ScanShip", {name:targetActor.name, hull:targetGroup.enabled?targetGroup.totalHull:targetActor.system.stats.hullTrauma?.max, strain:targetActor.system.stats.systemStrain?.max, equipment:names||localizeSystem("SWFFG.UI.SpaceCombat.ScanNoEquipment")}));
        }
        if(id==="communicate")announce(localizeSystem("SWFFG.UI.SpaceCombat.CommsRestored"));
      }
      announce(action.label+" : "+(successes?localizeSystem("SWFFG.UI.SpaceCombat.AppliedEffect", {successes}):localizeSystem("SWFFG.UI.SpaceCombat.NoEffect")));
    }
    if(maneuver)announce(maneuver.label+". "+maneuver.description);
  }
  return {updates,messages,value:null};
}

export async function commitCombatUpdates(updates) {
  const done=[];
  try {
    for(const entry of updates) {
      if(entry.kind==="delete") {
        if(entry.parent.items.get(entry.document.id)!==entry.document)throw localizedSystemError("SWFFG.UI.SpaceCombat.CriticalChanged");
        await entry.document.delete();
      } else {
        if(Number(foundry.utils.getProperty(entry.document,entry.path))!==entry.before)throw localizedSystemError("SWFFG.UI.SpaceCombat.ResourceChanged");
        await entry.document.update({[entry.path]:entry.after});
      }
      done.push(entry);
    }
  } catch(error) {await rollbackCombatUpdates(done);throw error;}
}
export async function rollbackCombatUpdates(updates) {
  for(const entry of [...updates].reverse()) {
    if(entry.kind==="delete") {
      if(!entry.parent.items.has(entry.snapshot._id))await entry.parent.createEmbeddedDocuments("Item",[entry.snapshot],{keepId:true});
    } else if(Number(foundry.utils.getProperty(entry.document,entry.path))===entry.after)await entry.document.update({[entry.path]:entry.before});
  }
}
