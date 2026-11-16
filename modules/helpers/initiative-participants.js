export function initiativeIdentity(c) {
  return {actor:c.actor.uuid,token:c.token.uuid};
}
export function prepareInitiativeParticipants(combat,initialIds) {
  const ids=typeof initialIds==='string'?[initialIds]:initialIds;
  if(!Array.isArray(ids))throw Error(game.i18n.localize("SWFFG.UI.CombatSheet.InitiativeListInvalid"));
  const selected=[],skipped=[],seen=new Set();
  for(const id of ids) {
    if(seen.has(id)){skipped.push({id,reason:'duplicate'});continue;}seen.add(id);
    const c=combat.combatants.get(id);
    const reason=!c?'removed':!c.isOwner?'not-owner':!c.actor?'missing-actor':!c.token?'tokenless':null;
    if(reason)skipped.push({id,reason});else selected.push(c);
  }
  return {selected,skipped};
}
export function revalidateInitiativeParticipant(combat,id,identity) {
  const plan=prepareInitiativeParticipants(combat,[id]),c=plan.selected[0];
  if(!c)return {reason:plan.skipped[0].reason};
  if(c.actor.uuid!==identity.actor||c.token.uuid!==identity.token)return {reason:'changed'};
  return {combatant:c};
}
export function initiativeSkipSummary(skipped,_fr=false) {
  const labels={"removed":game.i18n.localize("SWFFG.UI.CombatSheet.InitiativeRemoved"),"not-owner":game.i18n.localize("SWFFG.UI.CombatSheet.InitiativeNotOwned"),"missing-actor":game.i18n.localize("SWFFG.UI.CombatSheet.InitiativeMissingActor"),"tokenless":game.i18n.localize("SWFFG.UI.CombatSheet.InitiativeTokenless"),"duplicate":game.i18n.localize("SWFFG.UI.CombatSheet.InitiativeDuplicate"),"changed":game.i18n.localize("SWFFG.UI.CombatSheet.InitiativeChanged"),"failed":game.i18n.localize("SWFFG.UI.CombatSheet.InitiativeFailed")};
  const counts=new Map();for(const entry of skipped)counts.set(entry.reason,(counts.get(entry.reason)??0)+1);
  return (game.i18n.localize("SWFFG.UI.Combat.InitiativeParticipants.InitiativeSkippedEntries"))+[...counts].map(([reason,n])=>`${n} ${labels[reason]??reason}`).join(' ; ');
}
