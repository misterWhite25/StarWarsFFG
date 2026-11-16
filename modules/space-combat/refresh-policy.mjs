/** Test membership without resolving integrated NPC actors or preparing crew sheets. */
export function actorAffectsSpaceCombat(state,actor,getActor=id=>game.actors.get(id),resolve=globalThis.fromUuidSync) {
  if(!actor)return false;
  const matches=value=>{
    if(!value)return false;
    if(value===actor.id||value===actor.uuid)return true;
    if(typeof value!=='string'||!value.includes('.')||!resolve)return false;
    const document=resolve(value),member=document?.actor??document;
    return member===actor||!!actor.uuid&&member?.uuid===actor.uuid;
  };
  for(const ship of state?.ships??[]) {
    if(matches(ship.actorId))return true;
    const flags=getActor(ship.actorId)?.flags?.starwarsffg;
    if(flags?.crew?.some(member=>matches(member.actor_id)||matches(member.tokenUuid)))return true;
    if(Object.values(flags?.vehicleDeck?.passengers??{}).some(member=>matches(member.actorId)||matches(member.tokenUuid)))return true;
  }
  return false;
}

export function combatAffectsSpaceCombat(state,document) {
  if(!state?.encounterId)return true;
  const combat=document?.documentName==='Combatant'?document.parent:document?.viewed??document;
  return combat?.id===state.encounterId;
}
