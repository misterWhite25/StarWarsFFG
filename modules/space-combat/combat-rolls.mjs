import {BARRAGES,barrageConfiguration} from './barrage-rules.mjs';
import {resolveCrewActor,resolveCrewDocument,integratedCrewVehicle} from '../helpers/integrated-crew.mjs';
import {requireLivingVehicleGroup,vehicleMinionGroup} from '../helpers/vehicle-minion-group.mjs';
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
  const effects=ship.combat?.effects??[];
  if(assist) {
    pool.upgradeDifficulty(-effects.filter(e=>e.kind==="copilot").reduce((sum,e)=>sum+e.value,0));
    terrain=Math.max(0,terrain-effects.filter(e=>e.kind==="plot").reduce((sum,e)=>sum+e.value,0));
  }
  pool.setback+=terrain;
}
export async function rollCombatCheck({ship,vehicle,actor,key,difficulty,user,label,piloting=false,terrain=0}) {
  requireLivingVehicleGroup(vehicle);
  let pool=get_dice_pool(actor,key,new DicePoolFFG({difficulty}));
  pool.upgrade(pool.upgrades);
  if(piloting)pilotModifiers(pool,ship,vehicle,terrain,{assist:label!=="Assister pilotage"});
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
    if(context.groupSignature!==groupSignature(vehicle))throw Error('L’effectif du groupe a changé. Rouvrez le jet pour recalculer les dés.');
    const current=board().ships.find(s=>s.id===context.ship.id);
    const target=board().ships.find(s=>s.id===context.target?.id);
    if(current?.version!==context.ship.version||target?.version!==context.target?.version)
      throw Error("Le combat a changé. Rouvrez le jet pour recalculer les effets.");
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

export async function openCombatRoll(ship,member,{weapon,targetId,sector,terrain=0,barrage}={}) {
  if(board().round===0)throw Error("Le combat est terminé. Le MJ doit commencer un nouveau combat.");
  // Read the authoritative current counter instead of a rendered card snapshot.
  ship=board().ships.find(entry=>entry.id===ship.id);
  const vehicle=game.actors.get(ship?.actorId),actor=resolveCrewActor(member,vehicle);
  requireLivingVehicleGroup(vehicle);
  const current=vehicle&&vehicleCrew(vehicle).find(m=>m.actor_id===member.actor_id&&m.role===member.role);
  if(!current||!controlsCrewMember(current))throw Error("Ce poste n’est pas accessible à votre personnage.");
  const reason=initiativeReason(current);if(reason)throw Error(reason);
  const turn=characterActionState(board().ships,member.actor_id,board().round);
  if(!game.user.isGM&&(turn.action||turn.ended))throw Error("Ce personnage a déjà utilisé son action ou terminé son tour.");
  const attack=!!weapon;
  if(attack){const reason=actionRoleReason(vehicle,member.actor_id,"attack");if(reason)throw Error(reason);}
  if(!attack&&!game.user.isGM&&!isNavigationRole(current))throw Error("Ce jet de pilotage est réservé au pilote et au copilote.");
  const target=board().ships.find(entry=>entry.id===targetId&&entry.id!==ship.id);
  const barrageData=barrage?barrageConfiguration(ship,vehicle,BARRAGES.find(action=>action.id===barrage.id),{...barrage,weaponId:weapon?.id}):null;
  if(barrageData&&!isGunnerRole(current))throw Error("Les barrages sont réservés aux artilleurs.");
  if(barrageData?.id==="concentratedBarrage"&&target?.silhouette<5)throw Error("Le barrage concentré exige une cible de gabarit 5 ou plus.");
  let key=pilotSkill(vehicle,game.settings.get("starwarsffg","skilltheme"));
  let pool;
  const crew={name:vehicle.name,img:vehicle.img,crew_card:true,role:current.role};
  let guided=false;
  if(attack) {
    if(!target)throw Error("Choisissez un vaisseau cible pour préparer le tir.");
    weapon=vehicle.items.get(weapon.id);
    key=weapon?.system.skill?.value;
    const malfunctions=malfunctionNavigation(vehicle);
    if(malfunctions.disabledWeapons.includes(weapon?.id))throw Error("Cette arme est hors service.");
    if(!weapon||!weaponCrewCandidates(weapon,[current],crewRolesForSkill(vehicle,key),malfunctions).length)throw Error("Cette arme est indisponible à ce poste.");
    const range=rangeBetween(ship,target);
    const allowed=weaponRangeIndex(weapon);
    const band=["Proche","Courte","Moyenne","Longue","Extrême"].indexOf(range.band);
    if(allowed>=0&&band>allowed)throw Error("La cible est hors de portée de cette arme.");
    const difference=target.silhouette-ship.silhouette;
    const difficulty=difference>=2?1:difference<=-4?5:difference===-3?4:difference===-2?3:2;
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
  const builder=new CombatRollBuilder(data,pool,barrageData?barrageData.label:attack?"Tir - "+weapon.name:"Test de pilotage",key,item,
    attack?"Combat spatial contre "+game.actors.get(target.actorId)?.name:"Combat spatial");
  builder.roll.crew=crew;builder.roll.combatMode="vehicle";
  builder.spaceCombat={groupSignature:groupSignature(vehicle),ship:structuredClone(ship),target:target&&structuredClone(target),member:current,attack,sector,guided,rollId,barrage:barrageData,initiative:initiativeStamp()};
  return builder.render(true);
}
