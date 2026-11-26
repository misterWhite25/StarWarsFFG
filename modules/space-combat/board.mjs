import {prepareSpaceEncounter} from "./encounter.mjs";
import {vehicleTokenArtwork} from '../helpers/vehicle-token-artwork.mjs';
import {vehicleMinionGroup} from '../helpers/vehicle-minion-group.mjs';
import { nearestHex } from "./hex.mjs";
import {canPilotShip,canSelectShip,aboardRoster} from "./crew-access.mjs";
import {ensureCombatScene,registerCombatScene} from "./scene-document.mjs";
import {executeCombat,commitCombatUpdates,rollbackCombatUpdates} from "./combat-engine.mjs";
import {advanceCombatRound,endShipCombat} from "./combat-rules.mjs";
import {bringShipToFront} from "./token-order.mjs";
import {initiativeStamp,initiativeContext,synchronizeInitiative} from "./initiative.mjs";

const scope = "starwarsffg";
const setting = "spaceCombatBoard";
const requestKey = "spaceCombatCommand";
const ackKey = "spaceCombatReceipt";
const effectKinds=new Set(["evasive","stay","copilot","plot","jam","boostShields","fireDiscipline","spoof","slice","advantage","blanketBarrage"]);
const pending = new Map();
let queue = Promise.resolve();
let postMessages=async(messages,ship,user)=>{
  const {postCombatMessages}=await import("./combat-rolls.mjs");
  return postCombatMessages(messages,ship,user);
};

export const board = () => game.settings.get(scope, setting);
export function vehicleImage(actor) {
  const token=actor?.prototypeToken?.texture?.src;
  return vehicleTokenArtwork(token&&token!=="icons/svg/mystery-man.svg" ? token : actor?.img||token||"icons/svg/mystery-man.svg");
}
export function shipAppearance(ship) {
  const actor=game.actors.get(ship.actorId);
  return actor?.type==="vehicle" ? {...ship,name:actor.name,image:vehicleImage(actor),minionGroup:vehicleMinionGroup(actor)} : ship;
}
export function retireCatalogPawns(state) {
  return {...state,ships:state.ships.filter(ship=>ship.actorId||!ship.modelId&&!String(ship.image).includes("assets/space-combat/")).map(ship=>{
    const result=structuredClone(shipAppearance(ship));
    if(result.movementMode!=="individual") {
      result.destination={x:result.x,y:result.y};result.movementMode="individual";
      result.movementSpent=0;result.movementTurnSpent=0;result.turn=0;
    }
    delete result.movementSteps;
    if(result.combat){
      delete result.combat.flightOrder;delete result.combat.flightMoves;
      result.combat.effects=(result.combat.effects??[]).filter(effect=>effectKinds.has(effect.kind));
      for(const reservation of Object.values(result.combat.reservations??{}))
        if(reservation.consumed)reservation.consumed=reservation.consumed.filter(effect=>effectKinds.has(effect.kind));
    }
    delete result.modelId;
    if(String(result.image).includes("assets/space-combat/"))result.image="icons/svg/mystery-man.svg";
    if(JSON.stringify(result)!==JSON.stringify(ship))result.version=(ship.version??0)+1;
    return result;
  })};
}
export function canPilot(ship, user = game.user) {
  return canPilotShip(ship,user);
}

function number(value, min, max, label, integer = false) {
  if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    throw Error(label + " doit être compris entre " + min + " et " + max + ".");
  }
  return value;
}

function coordinate(value) {
  return number(value, -1000000, 1000000, "La coordonnée");
}

function readActorNumber(value, fallback, min, max) {
  if (value == null || value === "" || !Number.isFinite(Number(value))) return fallback;
  return Math.max(min, Math.min(max, Math.round(Number(value))));
}

function createShip(command) {
  const actor = command.actorId ? game.actors.get(command.actorId) : null;
  if (actor?.type !== "vehicle") throw Error("Choisissez une fiche de véhicule du monde.");
  const stats = actor.system.stats;
  const maxSpeed = readActorNumber(stats?.speed?.max,4,0,20);
  const silhouette = readActorNumber(stats?.silhouette?.value,4,1,20);
  const initialSpeed = readActorNumber(stats?.speed?.value,0,0,maxSpeed);
  const {x,y} = nearestHex({x:coordinate(command.x),y:coordinate(command.y)});
  return {
    id: foundry.utils.randomID(), version: 0, actorId: actor.id,
    name: actor.name, image: vehicleImage(actor),minionGroup:vehicleMinionGroup(actor),
    silhouette, maxSpeed, speed: initialSpeed, startSpeed: initialSpeed,
    x,y, destination:{x,y},movementMode:"individual",movementSpent:0,movementTurnSpent:0,z: coordinate(command.z ?? 0),
    heading: number(command.heading ?? 90, 0, 360, "Le cap") % 360, turn: 0
  };
}

async function apply(command, user) {
  if (game.users.activeGM?.id !== game.user.id) throw Error("Le MJ chargé du plateau a changé. Réessayez.");
  if(command.action==="scene")return ensureCombatScene();
  if(command.action==="participants") {
    if(!user.isGM)throw Error("Seul le MJ peut préparer la rencontre spatiale.");
    const next=structuredClone(board());
    if(next.round===0||!next.ships.length||game.combats.has(next.encounterId))return next.encounterId??null;
    const encounter=await prepareSpaceEncounter(next);
    if(encounter){next.encounterId=encounter.id;if(next.initiative?.combatId!==encounter.id)delete next.initiative;await game.settings.set(scope,setting,next);}
    return encounter?.id??null;
  }
  await syncInitiative();
  const next = structuredClone(board());
  if((command.epoch??0)!==(next.epoch??0))throw Error("Le combat a changé. Vérifiez la carte avant de rejouer cette commande.");
  if (command.round !== next.round) throw Error("Le round a changé. Vérifiez la nouvelle position.");
  if (!["plan","combat","front"].includes(command.action) && !user.isGM) throw Error("Cette commande est réservée au MJ.");
  let selected = null;
  let combatWork=null,combatShip=null;
  if (command.action === "add") {
    const ship = createShip(command);
    ship.sort=next.ships.reduce((highest,entry)=>Math.max(highest,Number.isSafeInteger(entry.sort)?entry.sort:0),-1)+1;
    next.ships.push(ship);
    if(next.round>0){const encounter=await prepareSpaceEncounter(next);if(encounter){next.encounterId=encounter.id;if(next.initiative?.combatId!==encounter.id)delete next.initiative;}}
    selected = ship.id;
  } else if (command.action === "advance") {
    if(initiativeContext().started)throw Error("Avancez le round depuis le suivi d’initiative Foundry.");
    if(next.round===0)throw Error("Commencez un nouveau combat avant d’avancer le round.");
    if (!next.ships.length) throw Error("Placez un vaisseau avant d’avancer le round.");
    next.ships = next.ships.map(ship => advanceCombatRound({...ship,startSpeed:ship.speed,version:ship.version+1,
      destination:{x:ship.x,y:ship.y},desiredHeading:ship.heading,turn:0,movementSpent:0,movementTurnSpent:0},next.round));
    next.round++;
  } else if(command.action==="endCombat") {
    if(next.round===0)throw Error("Le combat est déjà terminé.");
    next.ships=next.ships.map(endShipCombat);next.round=0;next.epoch=(next.epoch??0)+1;
  } else if(command.action==="startCombat") {
    if(next.round!==0)throw Error("Un combat est déjà en cours.");
    if(!next.ships.length)throw Error("Placez un vaisseau avant de commencer le combat.");
    next.ships=next.ships.map(endShipCombat);next.round=1;next.epoch=(next.epoch??0)+1;
    const encounter=await prepareSpaceEncounter(next);
    if(encounter){next.encounterId=encounter.id;if(next.initiative?.combatId!==encounter.id)delete next.initiative;synchronizeInitiative(next,initiativeContext(encounter));}
  } else {
    const ship = next.ships.find(item => item.id === command.shipId);
    if (!ship) throw Error("Ce pion a quitté le plateau.");
    if(command.action!=="front"&&ship.version!==command.version)throw Error("Le pion a changé. Vérifiez son nouvel ordre.");
    switch (command.action) {
      case "front":
        if(!canSelectShip(ship,user))throw Error("Vous pouvez mettre au premier plan les vaisseaux de votre équipage.");
        next.ships=bringShipToFront(next.ships,ship.id);
        break;
      case "combat":
        if(next.round===0)throw Error("Le combat est terminé. Le MJ doit commencer un nouveau combat.");
        combatWork=await executeCombat(next,ship,command,user);
        combatShip=ship;
        selected=combatWork.value;
        break;
      case "link": {
        const actor=game.actors.get(command.actorId);
        if(actor?.type!=="vehicle")throw Error("Choisissez une fiche de véhicule du monde.");
        ship.actorId=actor.id;
        ship.name=actor.name;
        ship.image=vehicleImage(actor);
        ship.silhouette=readActorNumber(actor.system.stats?.silhouette?.value,ship.silhouette,1,20);
        ship.maxSpeed=readActorNumber(actor.system.stats?.speed?.max,ship.maxSpeed,0,20);
        ship.speed=Math.min(ship.speed,ship.maxSpeed);
        ship.startSpeed=ship.speed;
        ship.turn=0;
        delete ship.desiredHeading;
        break;
      }
      case "plan": {
        throw Error("Utilisez la manœuvre Voler / Conduire pour déplacer ce vaisseau.");
      }
      case "move": {
        const {x,y} = nearestHex({x:coordinate(command.x),y:coordinate(command.y)});
        ship.x = x;
        ship.y = y;
        if(ship.destination)ship.destination={x,y};
        break;
      }
      case "speed":
        // GM setup changes the pawn's baseline without spending a maneuver.
        ship.speed=number(command.speed,0,ship.maxSpeed,"La vitesse",true);
        ship.startSpeed=ship.speed;
        break;
      case "configure":
        ship.name = String(command.name || ship.name).trim().slice(0, 90) || ship.name;
        ship.silhouette = number(command.silhouette, 1, 20, "Le gabarit", true);
        ship.maxSpeed = number(command.maxSpeed, 0, 20, "La vitesse maximale", true);
        ship.startSpeed = number(command.startSpeed, 0, ship.maxSpeed, "La vitesse en début de round", true);
        ship.speed = ship.startSpeed;
        ship.heading = number(command.heading, 0, 360, "Le cap") % 360;
        ship.z = coordinate(command.z);
        ship.turn = 0;
        delete ship.desiredHeading;
        break;
      case "remove":
        next.ships = next.ships.filter(item => item.id !== ship.id);
        break;
      default: throw Error("Commande de vol inconnue.");
    }
    if(command.action!=="front")ship.version++;
  }
  if(combatWork)await commitCombatUpdates(combatWork.updates);
  try {await game.settings.set(scope, setting, next);}
  catch(error) {if(combatWork)await rollbackCombatUpdates(combatWork.updates);throw error;}
  if(combatWork?.messages.length) {
    await postMessages(combatWork.messages,combatShip,user).catch(error=>{
      console.error("Star Wars FFG | Combat spatial",error);
      ui.notifications.warn("L’action est enregistrée, mais son message n’a pas pu être publié dans la discussion.");
    });
  }
  return selected;
}

function serialize(work) {
  const result = queue.then(work);
  queue = result.catch(() => {});
  return result;
}
async function syncInitiative() {
  if(game.users.activeGM?.id!==game.user.id)return;
  const previous = board();
  const context = initiativeContext();
  if (context.started ? !previous.ships.length : !previous.initiative) return;
  const next = synchronizeInitiative(structuredClone(previous), context);
  if(JSON.stringify(previous)!==JSON.stringify(next))await game.settings.set(scope,setting,next);
}

export function registerBoard(refresh, report,services={}) {
  if(services.postMessages)postMessages=services.postMessages;
  Hooks.once("init", () => {
    registerCombatScene();
    game.settings.register(scope, setting, {
      scope: "world", config: false, restricted: true, type: Object, default: { round: 1, ships: [] }, onChange: refresh
    });
    game.settings.register(scope,"spaceCombatRetiredBoard",{
      scope:"world",config:false,restricted:true,type:Object,default:{}
    });
  });
  const migrate=()=>serialize(async()=>{
    if(game.users.activeGM?.id!==game.user.id)return;
    const previous=structuredClone(board()),next=retireCatalogPawns(previous);
    if(JSON.stringify(previous)===JSON.stringify(next))return;
    if(!Object.keys(game.settings.get(scope,"spaceCombatRetiredBoard")).length)
      await game.settings.set(scope,"spaceCombatRetiredBoard",previous);
    await game.settings.set(scope,setting,next);
  }).catch(report);
  Hooks.once("ready",migrate);
  Hooks.on("userConnected",migrate);
  const sync=()=>serialize(syncInitiative).catch(report);
  Hooks.once("ready",sync);
  for(const hook of ["createCombat","updateCombat","deleteCombat","createCombatant","updateCombatant","deleteCombatant"])Hooks.on(hook,sync);
  Hooks.on("createChatMessage",(message,_options,author)=>{
    if(game.users.activeGM?.id!==game.user.id||message.author?.id!==author)return;
    const roll=message.rolls?.find(roll=>roll.data?.flags?.starwarsffg?.spaceCombatRoll);
    const marker=roll?.data?.flags?.starwarsffg?.spaceCombatRoll;
    if(!marker)return;
    serialize(async()=>{
      const next=structuredClone(board()),ship=next.ships.find(s=>s.id===marker.shipId);
      const reservations=ship?.combat?.reservations??{};
      const found=Object.entries(reservations).find(([,entry])=>entry.rollId===marker.rollId&&entry.userId===author&&entry.actorId===marker.crewId);
      if(!found)return;
      // Integrated stations publish with their parent vehicle as the speaker.
      const member=aboardRoster(game.actors.get(ship.actorId)).find(entry=>entry.actor_id===marker.crewId);
      const speakerId=member?.integrated?ship.actorId:marker.crewId;
      if(message.speaker.actor!==speakerId)return;
      ship.combat.lastRoll={label:roll.data.name??"Test de pilotage",actorId:marker.crewId,
        success:Math.max(0,Number(roll.ffg?.success)||0),advantage:Math.max(0,Number(roll.ffg?.advantage)||0),threat:Math.max(0,Number(roll.ffg?.threat)||0)};
      delete reservations[found[0]];ship.version++;
      await game.settings.set(scope,setting,next);
    }).catch(report);
  });
  Hooks.on("updateUser", (user, changes, _options, author) => {
    const flags = changes.flags?.[scope];
    if (flags?.[ackKey] && user.id === game.user.id && game.users.get(author)?.isGM) {
      const receipt = user.getFlag(scope, ackKey);
      const waiter = pending.get(receipt.id);
      if (waiter) {
        if (receipt.error) waiter.reject(Error(receipt.error));
        else waiter.resolve(receipt.selected);
      }
    }
    if (!flags?.[requestKey] || user.id !== author || !user.active || game.users.activeGM?.id !== game.user.id) return;
    // A string keeps Foundry from merging attributes of two successive commands.
    let command;
    try { command = JSON.parse(user.getFlag(scope, requestKey)); }
    catch { return; }
    if (!command?.id || command.authority !== game.user.id) return;
    serialize(async () => {
      if (user.getFlag(scope, ackKey)?.id === command.id) return;
      let selected = null, error = "";
      try { selected = await apply(command, user); }
      catch (failure) { error = failure.message; }
      await user.setFlag(scope, ackKey, { id: command.id, selected, error });
    }).catch(report);
  });
}

export async function command(action, values = {}) {
  const gm = game.users.activeGM;
  if (!gm) throw Error("Un MJ doit être connecté pour enregistrer les ordres du plateau.");
  const payload = { action, round: board().round,epoch:board().epoch??0,initiative:initiativeStamp(), ...values };
  if (gm.id === game.user.id) return serialize(() => apply(payload, game.user));
  const id = foundry.utils.randomID();
  let timer;
  const result = new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    timer = setTimeout(() => reject(Error("Le MJ n’a pas confirmé la commande. Vérifiez le plateau.")), 10000);
  });
  result.catch(() => {});
  try {
    await game.user.setFlag(scope, requestKey, JSON.stringify({ ...payload, id, authority: gm.id }));
    return await result;
  } finally {
    clearTimeout(timer);
    pending.delete(id);
  }
}
