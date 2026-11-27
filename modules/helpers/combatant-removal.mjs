import {localizeSystem, localizedSystemError} from "./system-localization.mjs";
const scope='starwarsffg',queues=new Map(),cleanups=new Map();
let cleanupInstalled=false;
const serial=(combat,fn)=>{const next=(queues.get(combat.id)??Promise.resolve()).catch(()=>{}).then(fn);queues.set(combat.id,next);return next;};
export function claimsAfterRemoval(all,removedId,{turns=[]}={}){
  const alive=new Set(turns.filter(p=>p.id!==removedId).map(p=>p.id)),next={};
  for(const [round,claims] of Object.entries(all??{})){
    const result={},displaced=[];
    for(const [slot,id] of Object.entries(claims??{})){
      if(id===removedId||!alive.has(id))continue;
      if(slot===removedId)displaced.push(id);
      else if(alive.has(slot))result[slot]=id;
    }
    for(const id of displaced){let cursor=id,visited=new Set();while(cursor&&!visited.has(cursor)&&alive.has(cursor)){visited.add(cursor);const old=result[cursor];for(const key of Object.keys(result))if(result[key]===cursor)delete result[key];result[cursor]=cursor;cursor=old;}}
    next[round]=result;
  }
  return next;
}
function claimUpdates(before,after){const update={};for(const round of new Set([...Object.keys(before),...Object.keys(after)]))for(const id of new Set([...Object.keys(before[round]??{}),...Object.keys(after[round]??{})])){const old=before[round]?.[id],next=after[round]?.[id];if(old!==next)update['flags.starwarsffg.combatClaims.'+round+'.'+(next===undefined?'-=':'')+id]=next??null;}return update;}
export async function removeParticipant(combat,id){
  if(!game.user.isGM)throw localizedSystemError("SWFFG.UI.Operations.GMRemoveCombatant");
  return serial(combat,async()=>{
    const participant=combat.combatants.get(id);if(!participant)return false;
    const before=combat.getFlag(scope,'combatClaims')??{},currentSlot=combat.turns?.[combat.turn]?.id,currentClaimant=before[combat.round]?.[currentSlot]??currentSlot,oldTurn=combat.turn??0,started=!!combat.started;
    combat._ffgRosterMutation=true;
    try{
      const deleted=await combat.deleteEmbeddedDocuments('Combatant',[id],{ffgRosterRemoval:true});
      if(!deleted.length||combat.combatants.has(id))throw localizedSystemError("SWFFG.UI.Operations.RemoveCanceled");
      const after=claimsAfterRemoval(before,id,{turns:[...combat.combatants]});
      combat.setupTurns();
      const claimantSurvives=combat.combatants.has(currentClaimant),assignedSlot=claimantSurvives?Object.keys(after[combat.round]??{}).find(slot=>after[combat.round][slot]===currentClaimant):null;
      const desired=assignedSlot??(claimantSurvives&&combat.combatants.has(currentSlot)?currentSlot:null),index=desired?combat.turns.findIndex(p=>p.id===desired):-1;
      const turn=combat.turns.length?(index>=0?index:Math.min(oldTurn,combat.turns.length-1)):null;
      await combat.update({...claimUpdates(before,after),...(started?{turn}:{})});
      await combat.prepareDerivedData();combat.setupTurns();await ui.combat?.render();return true;
    }finally{delete combat._ffgRosterMutation;}
  });
}
export async function handleTrackedRemoval(combat,participant){
  if(!participant||!combat.combatants.has(participant.id))return;
  return removeParticipant(combat,participant.id);
}
export async function removeTrackedCombatant(combat,element){
  const row=element?.getAttribute?element:element?.[0],slotId=row?.getAttribute('data-alt-id')||row?.getAttribute('data-combatant-id');
  const id=combat.started?(combat.getSlotClaims(combat.round,slotId)||row?.getAttribute('data-combatant-id')||slotId):row?.getAttribute('data-combatant-id')||slotId;
  const participant=combat.combatants.get(id);if(!participant?.actor)throw localizedSystemError("SWFFG.UI.Operations.EmptyCombatSlot");
  return handleTrackedRemoval(combat,participant);
}
export function isLegacyEmptySlot(participant){
  return !participant.actor&&!participant.actorId&&!participant.tokenId&&(participant.getFlag?.(scope,'fake')===true||participant.flags?.fake===true||participant.name==='__GENERIC_SLOT__');
}
export async function cleanupLegacySlots(combat){
  if(cleanups.has(combat.id))return cleanups.get(combat.id);
  if(!game.user.isGM||combat._ffgRosterMutation)return 0;
  const ids=[...combat.combatants].filter(isLegacyEmptySlot).map(participant=>participant.id);if(!ids.length)return 0;
  const task=(async()=>{let count=0;for(const id of ids)if(await removeParticipant(combat,id))count++;return count;})();cleanups.set(combat.id,task);
  try{return await task;}finally{if(cleanups.get(combat.id)===task)cleanups.delete(combat.id);}
}
export function installLegacySlotCleanup(){
  if(cleanupInstalled)return;cleanupInstalled=true;
  if(!game.user.isGM||game.users.activeGM&&game.users.activeGM.id!==game.user.id)return;
  void (async()=>{
    const {flushDirectoryCamps}=await import('./directory-camps.mjs');await flushDirectoryCamps();
    for(const combat of game.combats)await cleanupLegacySlots(combat);
  })().catch(error=>ui.notifications.error(localizeSystem("SWFFG.UI.Operations.CleanupSlots") + " "+error.message));
}
