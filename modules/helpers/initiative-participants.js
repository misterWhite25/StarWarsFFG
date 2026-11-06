export function initiativeIdentity(c) {
  return {actor:c.actor.uuid,token:c.token.uuid};
}
export function prepareInitiativeParticipants(combat,initialIds) {
  const ids=typeof initialIds==='string'?[initialIds]:initialIds;
  if(!Array.isArray(ids))throw Error('Invalid initiative participant list');
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
export function initiativeSkipSummary(skipped,fr=false) {
  const labels=fr?{'removed':'retiré du combat','not-owner':'droits insuffisants','missing-actor':'fiche introuvable','tokenless':'sans pion pris en charge','duplicate':'doublon','changed':'pion ou fiche remplacé','failed':'jet impossible'}:{'removed':'removed from combat','not-owner':'not owned','missing-actor':'missing actor','tokenless':'unsupported tokenless entry','duplicate':'duplicate','changed':'token or actor replaced','failed':'roll failed'};
  const counts=new Map();for(const entry of skipped)counts.set(entry.reason,(counts.get(entry.reason)??0)+1);
  return (fr?'Initiative - entrées ignorées : ':'Initiative - skipped entries: ')+[...counts].map(([reason,n])=>`${n} ${labels[reason]??reason}`).join(' ; ');
}
