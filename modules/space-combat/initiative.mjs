import {actorDirectoryGroup} from "../helpers/actor-directory-group.mjs";
import {npcVehicle} from "../helpers/npc-vehicle.mjs";
import {advanceCombatRound,endShipCombat,expireEffects} from "./combat-rules.mjs";

function trackedSpaceCombat(){
  const state=globalThis.game?.settings?.get("starwarsffg","spaceCombatBoard");
  if(state?.encounterId)return game.combats.get(state.encounterId)??null;
  const combat=state?.initiative?.combatId?game.combats.get(state.initiative.combatId):globalThis.game?.combat;
  return combat&&(combat.getFlag?.("starwarsffg","spaceCombatEncounter")||combat.scene?.getFlag?.("starwarsffg","spaceCombatScene")||state?.initiative?.combatId===combat.id)?combat:null;
}
export function initiativeContext(combat=trackedSpaceCombat()) {
  if(!combat)return {tracked:false,started:false,stamp:null};
  const started=!!combat.started&&Number(combat.round)>0;
  const slot=combat.turns?.[combat.turn]??combat.combatant;
  const generic=!!globalThis.game?.settings?.get("starwarsffg","useGenericSlots");
  const claimantId=started&&slot&&generic?(combat.getSlotClaims?.(combat.round,slot.id)??combat.getFlag?.("starwarsffg","combatClaims")?.[combat.round]?.[slot.id]):null;
  const participant=generic?(claimantId?combat.combatants?.get(claimantId):null):slot;
  return {tracked:true,started,combat,slot,participant,actor:participant?.actor,
    stamp:{combatId:combat.id,round:Number(combat.round)||0,turn:combat.turn??null,slotId:slot?.id??null,claimantId:generic?claimantId??null:slot?.id??null}};
}
export const initiativeStamp=()=>initiativeContext().stamp;
export function sameInitiative(left,right=initiativeStamp()) {
  return JSON.stringify(left??null)===JSON.stringify(right??null);
}
// Initiative is informational: ownership and action costs are checked by the command engine.
export function initiativeReason() { return ""; }
export function initiativeLabel(context, user = game.user) {
  const {started, slot, participant} = context;
  if (!started || !slot || context.combat.turn == null) return "";
  const localize = key => game.i18n.localize("SWFFG.CombatTurn." + key);
  const actor = participant?.actor;
  if (actor && (actorDirectoryGroup(actor) === "npcs" || npcVehicle(actor))) return localize("GM");
  const visible = participant ?? slot;
  if (!user.isGM && (visible.hidden || visible.token?.hidden || visible.visible === false)) {
    return localize("Hidden");
  }
  if (participant) {
    return game.i18n.format("SWFFG.CombatTurn.Named", {name: participant.name});
  }
  if (slot.disposition === CONST.TOKEN_DISPOSITIONS.FRIENDLY) return localize("Allied");
  if (slot.disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE) return localize("Enemy");
  return localize("Unclaimed");
}


// Native initiative advances rounds; turns within one round never reset ship counters.
export function synchronizeInitiative(state,context=initiativeContext()) {
  const previous=state.initiative;
  if(!context.started) {
    if(previous&&(!context.tracked||previous.combatId===context.combat?.id)) {
      state.ships=state.ships.map(endShipCombat);state.round=0;state.epoch=(state.epoch??0)+1;delete state.initiative;
    }
    return state;
  }
  if(!state.ships.length)return state;
  const round=context.stamp.round,combatId=context.combat.id;
  const marker={...context.stamp,actorId:context.actor?.id??null};
  if(previous?.combatId===combatId&&previous.round===round) {
    const changedSlot=previous.turn!==marker.turn||previous.slotId!==marker.slotId;
    for(const ship of state.ships)if(ship.combat) {
      ship.combat.effects??=[];
      const count=ship.combat.effects.length;
      const effectActors=id=>id===ship.actorId?[...(globalThis.game?.actors?.get(ship.actorId)?.flags?.starwarsffg?.crew??[]).filter(member=>member.integrated).map(member=>member.actor_id),...Object.values(globalThis.game?.actors?.get(ship.actorId)?.flags?.starwarsffg?.vehicleDeck?.passengers??{}).filter(member=>member.integrated).map(member=>member.actorId)]:[id];
      if(changedSlot&&previous.actorId)for(const id of effectActors(previous.actorId))expireEffects(ship,round,"end",id);
      if((changedSlot||previous.actorId!==marker.actorId)&&marker.actorId)for(const id of effectActors(marker.actorId))expireEffects(ship,round,"start",id);
      if(count!==ship.combat.effects.length)ship.version=(ship.version??0)+1;
    }
    state.initiative=marker;return state;
  }
  const oldRound=state.round;
  state.ships=state.ships.map(ship=>{
    const version=ship.version??0;
    if(previous?.combatId===combatId) {
      Object.assign(ship,{startSpeed:ship.speed,destination:{x:ship.x,y:ship.y},desiredHeading:ship.heading,turn:0,movementSpent:0,movementTurnSpent:0});
      advanceCombatRound(ship,round-1);
    }
    else if(previous)ship=endShipCombat(ship);
    else if(ship.combat) {
      for(const turn of Object.values(ship.combat.turns??{}))turn.round=round;
      for(const effect of ship.combat.effects??[])if(Number.isFinite(effect.expiresRound))effect.expiresRound+=round-oldRound;
      ship.combat.reservations={};
    }
    return {...ship,version:version+1};
  });
  state.round=round;state.initiative=marker;state.epoch=(state.epoch??0)+1;
  return state;
}
