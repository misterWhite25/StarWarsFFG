import {localizeSystem, localizedSystemError} from "../helpers/system-localization.mjs";
import {BARRAGES} from './barrage-rules.mjs';
// Vehicle maneuvers, actions and their costs. Voler / Conduire commits map movement.
export const MANEUVERS = [
  {id:"speed",get label(){return localizeSystem("SWFFG.UI.SpaceCombat.Speed");},pilot:true,get description(){return localizeSystem("SWFFG.UI.SpaceCombat.SpeedDescription");}},
  {id:"fly",get label(){return localizeSystem("SWFFG.UI.SpaceCombat.Fly");},pilot:true,minSpeed:1,get description(){return localizeSystem("SWFFG.UI.SpaceCombat.FlyDescription");}},
  {id:"evasive",get label(){return localizeSystem("SWFFG.UI.SpaceCombat.Evasive");},pilot:true,maxSize:4,minSpeed:3,get description(){return localizeSystem("SWFFG.UI.SpaceCombat.EvasiveDescription");}},
  {id:"stay",get label(){return localizeSystem("SWFFG.UI.SpaceCombat.Stay");},pilot:true,maxSize:4,minSpeed:3,get description(){return localizeSystem("SWFFG.UI.SpaceCombat.StayDescription");}},
  {id:"punch",get label(){return localizeSystem("SWFFG.UI.SpaceCombat.Punch");},pilot:true,maxSize:4,get description(){return localizeSystem("SWFFG.UI.SpaceCombat.PunchDescription");}},
  {id:"shields",get label(){return localizeSystem("SWFFG.UI.SpaceCombat.Shields");},get description(){return localizeSystem("SWFFG.UI.SpaceCombat.ShieldsDescription");}}
];
export const ACTIONS = [
  {id:"attack",get label(){return localizeSystem("SWFFG.UI.SpaceCombat.Attack");},target:true,get description(){return localizeSystem("SWFFG.UI.SpaceCombat.AttackDescription");}},
  {id:"advantage",get label(){return localizeSystem("SWFFG.UI.SpaceCombat.Advantage");},pilot:true,maxSize:4,minSpeed:4,target:true,skill:"pilot",get description(){return localizeSystem("SWFFG.UI.SpaceCombat.AdvantageDescription");}},
  {id:"repairStrain",get label(){return localizeSystem("SWFFG.UI.SpaceCombat.RepairStrain");},skill:"Mechanics",get description(){return localizeSystem("SWFFG.UI.SpaceCombat.RepairStrainDescription");}},
  {id:"repairHull",get label(){return localizeSystem("SWFFG.UI.SpaceCombat.RepairHull");},skill:"Mechanics",get description(){return localizeSystem("SWFFG.UI.SpaceCombat.RepairHullDescription");}},
  {id:"repairCritical",get label(){return localizeSystem("SWFFG.UI.SpaceCombat.RepairCritical");},skill:"Mechanics",get description(){return localizeSystem("SWFFG.UI.SpaceCombat.RepairCriticalDescription");}},
  {id:"manualRepair",get label(){return localizeSystem("SWFFG.UI.SpaceCombat.ManualRepair");},skill:"Athletics",difficulty:3,get description(){return localizeSystem("SWFFG.UI.SpaceCombat.ManualRepairDescription");}},
  {id:"copilot",get label(){return localizeSystem("SWFFG.UI.SpaceCombat.Copilot");},skill:"pilot",difficulty:2,get description(){return localizeSystem("SWFFG.UI.SpaceCombat.CopilotDescription");}},
  {id:"plot",get label(){return localizeSystem("SWFFG.UI.SpaceCombat.Plot");},skills:["Astrogation","Perception"],get description(){return localizeSystem("SWFFG.UI.SpaceCombat.PlotDescription");}},
  {id:"jam",get label(){return localizeSystem("SWFFG.UI.SpaceCombat.Jam");},skill:"Computers",difficulty:2,target:true,get description(){return localizeSystem("SWFFG.UI.SpaceCombat.JamDescription");}},
  {id:"boostShields",get label(){return localizeSystem("SWFFG.UI.SpaceCombat.BoostShields");},skill:"Mechanics",difficulty:3,get description(){return localizeSystem("SWFFG.UI.SpaceCombat.BoostShieldsDescription");}},
  {id:"fireDiscipline",get label(){return localizeSystem("SWFFG.UI.SpaceCombat.FireDiscipline");},skills:["Leadership","Discipline"],difficulty:3,get description(){return localizeSystem("SWFFG.UI.SpaceCombat.FireDisciplineDescription");}},
  {id:"scan",get label(){return localizeSystem("SWFFG.UI.SpaceCombat.Scan");},skill:"Perception",difficulty:3,target:true,get description(){return localizeSystem("SWFFG.UI.SpaceCombat.ScanDescription");}},
  {id:"slice",get label(){return localizeSystem("SWFFG.UI.SpaceCombat.Slice");},skill:"Computers",difficulty:3,target:true,get description(){return localizeSystem("SWFFG.UI.SpaceCombat.SliceDescription");}},
  {id:"spoof",get label(){return localizeSystem("SWFFG.UI.SpaceCombat.Spoof");},skills:["Computers","Vigilance"],get description(){return localizeSystem("SWFFG.UI.SpaceCombat.SpoofDescription");}},
  ...BARRAGES,
  {id:"communicate",get label(){return localizeSystem("SWFFG.UI.SpaceCombat.Communicate");},skill:"Computers",get description(){return localizeSystem("SWFFG.UI.SpaceCombat.CommunicateDescription");}}
];
export const SECTORS = {get fore(){return localizeSystem("SWFFG.UI.SpaceCombat.Fore");},get aft(){return localizeSystem("SWFFG.UI.SpaceCombat.Aft");},get port(){return localizeSystem("SWFFG.UI.SpaceCombat.Port");},get starboard(){return localizeSystem("SWFFG.UI.SpaceCombat.Starboard");}};
export const normalizeSkill = key => String(key??"").toLowerCase().replace(/[^a-z]/g,"");
export function pilotSkill(vehicle,theme="starwars") {
  return theme==="starwars"?(vehicle.system.spaceShip?"Piloting: Space":"Piloting: Planetary"):(vehicle.system.spaceShip?"Piloting":"Driving");
}
export function combatState(ship) {
  return ship.combat??={turns:{},effects:[],pilotManeuvers:0,pilotAction:false,hullRepairUsed:false,advantageCounts:{}};
}
export function turnState(ship,actorId,round) {
  const state=combatState(ship);
  if(state.turns[actorId]?.round!==round)state.turns[actorId]={round,maneuvers:0,action:false,ended:false};
  return state.turns[actorId];
}
// Rendering reads counters without cloning the ship or creating combat state.
export function readTurnState(ship,actorId,round) {
  const turn=ship.combat?.turns?.[actorId];
  return turn?.round===round?turn:{round,maneuvers:0,action:false,ended:false};
}
export function characterActionState(ships,actorId,round) {
  const turns=ships.map(ship=>ship.combat?.turns?.[actorId]).filter(turn=>turn?.round===round);
  return {action:turns.some(turn=>turn.action),ended:turns.some(turn=>turn.ended)};
}
export const pilotManeuverLimit=ship=>Number(ship.silhouette)>=5?1:2;
export function maneuverCost(ship,actorId,round,pilot=false) {
  const turn=readTurnState(ship,actorId,round);
  return {personal:turn.maneuvers===1?2:0,system:pilot&&pilotManeuverLimit(ship)>1&&(ship.combat?.pilotManeuvers??0)===1?2:0,
    available:!turn.ended&&turn.maneuvers<2&&(!pilot||(ship.combat?.pilotManeuvers??0)<pilotManeuverLimit(ship))};
}
export function maneuverCostLabel(cost,systemLabel=localizeSystem("SWFFG.UI.SpaceCombat.SystemStrainLower")) {
  if(!cost.personal&&cost.system)return localizeSystem("SWFFG.UI.SpaceCombat.NoPersonalStrain", {stat:systemLabel});
  return [cost.personal?localizeSystem("SWFFG.UI.SpaceCombat.PersonalStrainTwo"):"",cost.system?"+2 "+systemLabel:""].filter(Boolean).join(" · ")||localizeSystem("SWFFG.UI.SpaceCombat.NoStrainCost");
}
export function maneuverPerformer(ship,members,round,preferredId="") {
  const unique=[...new Map(members.map(member=>[member.actor_id,member])).values()];
  const available=unique.filter(member=>maneuverCost(ship,member.actor_id,round,true).available);
  if(preferredId)return available.find(member=>member.actor_id===preferredId);
  return available.sort((a,b)=>maneuverCost(ship,a.actor_id,round,true).personal-maneuverCost(ship,b.actor_id,round,true).personal)[0];
}
export function maneuverReason(def,ship,pilot) {
  if(def.pilot&&!pilot)return ACTIONS.some(action=>action.id===def.id)?localizeSystem("SWFFG.UI.SpaceCombat.PilotOnlyAction"):localizeSystem("SWFFG.UI.SpaceCombat.PilotAndCopilotManeuver");
  if(def.minSize&&ship.silhouette<def.minSize)return localizeSystem("SWFFG.UI.SpaceCombat.MinSilhouette", {min:def.minSize});
  if(def.maxSpeed!==undefined&&ship.speed>def.maxSpeed)return localizeSystem("SWFFG.UI.SpaceCombat.MaxActionSpeed", {max:def.maxSpeed});
  if(def.maxSize&&ship.silhouette>def.maxSize)return localizeSystem("SWFFG.UI.SpaceCombat.MaxSilhouette", {max:def.maxSize});
  if(def.minSpeed&&ship.speed<def.minSpeed)return localizeSystem("SWFFG.UI.SpaceCombat.MinActionSpeed", {min:def.minSpeed});
  if(def.id==="shields"&&!Object.values(globalThis.game?.actors?.get(ship.actorId)?.system.stats?.shields??{}).some(value=>Number(value)>0))
    return localizeSystem("SWFFG.UI.SpaceCombat.NoShieldDefense");
  if(def.id==="speed"&&ship.maxSpeed<=0)return localizeSystem("SWFFG.UI.SpaceCombat.NoSpeedChange");
  if((def.id==="accelerate"||def.id==="punch")&&ship.speed>=ship.maxSpeed)return localizeSystem("SWFFG.UI.SpaceCombat.AtMaximumSpeed");
  if(def.id==="decelerate"&&ship.speed<=0)return localizeSystem("SWFFG.UI.SpaceCombat.AlreadyStopped");
  return "";
}
export function repairDifficulty(resource) {
  const value=Number(resource?.value),max=Number(resource?.max);
  if(!Number.isFinite(value)||!Number.isFinite(max)||max<=0)throw localizedSystemError("SWFFG.UI.SpaceCombat.ResourceThresholdRequired");
  return value>max?3:value>=max/2?2:1;
}
export function advantageDifficulty(ship,target) {
  const delta=ship.speed-target.speed;
  return (delta>0?1:delta===0?2:delta===-1?3:4)+(ship.combat?.advantageCounts?.[target.id]??0)+(target.combat?.advantageCounts?.[ship.id]??0);
}
export function effectiveDefense(ship,vehicle,sector) {
  const base=Number(vehicle?.system.stats?.shields?.[sector])||0;
  const modifier=(ship.combat?.effects??[]).filter(e=>e.sector===sector&&["boostShields","slice"].includes(e.kind)).reduce((sum,e)=>sum+e.value,0);
  return Math.max(0,Math.min(4,base+modifier));
}
export function attackSector(ship,target,actorId,requested="fore") {
  if(ship.combat?.effects?.some(e=>e.kind==="advantage"&&e.actorId===actorId&&e.targetId===target.id))return Object.hasOwn(SECTORS,requested)?requested:"fore";
  const bearing=Math.atan2(ship.y-target.y,ship.x-target.x)*180/Math.PI;
  const relative=((bearing-target.heading+540)%360)-180;
  return Math.abs(relative)<=45?"fore":Math.abs(relative)>=135?"aft":relative>0?"port":"starboard";
}
export function attackModifiers(ship,target,actorId,{guided=false}={}) {
  const own=ship.combat?.effects??[],enemy=target?.combat?.effects??[];
  const advantage=own.some(e=>e.kind==="advantage"&&e.actorId===actorId&&e.targetId===target?.id);
  const modifiers={boost:0,abilityUpgrades:0,difficultyUpgrades:0,consume:[]};
  const discipline=own.find(e=>e.kind==="fireDiscipline");
  if(discipline){modifiers.boost++;modifiers.consume.push(discipline.id);}
  modifiers.abilityUpgrades=own.filter(e=>e.kind==="stay").length+enemy.filter(e=>e.kind==="stay").length;
  const covered=ship.silhouette<=4?enemy.filter(e=>e.kind==="blanketBarrage"&&(e.arcs??[e.arc]).includes(attackSector(ship,target,null))).reduce((sum,e)=>sum+e.value,0):0;
  modifiers.difficultyUpgrades=covered+(advantage?0:own.filter(e=>e.kind==="evasive").length+enemy.filter(e=>e.kind==="evasive").length)+
    (guided?enemy.filter(e=>e.kind==="spoof").reduce((sum,e)=>sum+e.value,0):0);
  return modifiers;
}
export function expireEffects(ship,round,phase,actorId) {
  const state=combatState(ship);
  state.effects=state.effects.filter(effect=>!(effect.expiresRound<=round&&effect.phase===phase&&(!actorId||effect.actorId===actorId)));
}
export function advanceCombatRound(ship,oldRound) {
  const state=combatState(ship);
  expireEffects(ship,oldRound,"end");
  expireEffects(ship,oldRound,"round");
  expireEffects(ship,oldRound+1,"start");
  state.pilotManeuvers=0;state.pilotAction=false;state.turns={};
  delete state.flightOrder;delete state.flightMoves;
  state.accelerated=false;
  state.reservations={};
  return ship;
}
export function endShipCombat(ship) {
  return {...ship,version:(ship.version??0)+1,startSpeed:ship.speed,destination:{x:ship.x,y:ship.y},
    desiredHeading:ship.heading,turn:0,movementSpent:0,movementTurnSpent:0,
    combat:{turns:{},effects:[],pilotManeuvers:0,pilotAction:false,hullRepairUsed:false,advantageCounts:{},reservations:{}}};
}
