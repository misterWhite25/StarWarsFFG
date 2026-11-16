
/** A linked world actor may survive deletion of its token; a synthetic actor must not fall back to its base. */
export function captureCriticalTarget(token) {
  const actor=token?.actor;
  if(!token?.uuid||!actor?.uuid||typeof token.actorLink!=='boolean')throw Error(game.i18n.localize("SWFFG.UI.Medical.CriticalTarget.IncompleteTargetIdentity"));
  return {tokenUuid:token.uuid,actorUuid:actor.uuid,linked:token.actorLink};
}
export async function locateCriticalTarget(identity,lookup,{requireOwner=true}={}) {
  if(!identity?.tokenUuid||!identity.actorUuid||typeof identity.linked!=='boolean')throw Error(game.i18n.localize("SWFFG.UI.Medical.CriticalTarget.ReviewThisOldCriticalTargetBeforeContinuing"));
  const token=await lookup(identity.tokenUuid);let actor;
  if(token) {
    if(token.actor?.uuid!==identity.actorUuid||token.actorLink!==identity.linked)throw Error(game.i18n.localize("SWFFG.UI.Medical.CriticalTarget.TheTokenActorOrLinkChangedOperationSuspended"));
    actor=token.actor;
  } else {
    if(!identity.linked)throw Error(game.i18n.localize("SWFFG.UI.Medical.CriticalTarget.UnlinkedTokenDeletedItsBaseActorCannotReceive"));
    if(!/^Actor\.[^.]+$/.test(identity.actorUuid))throw Error(game.i18n.localize("SWFFG.UI.Medical.CriticalTarget.InvalidLinkedActorReference"));
    actor=await lookup(identity.actorUuid);
    if(!actor||actor.uuid!==identity.actorUuid)throw Error(game.i18n.localize("SWFFG.UI.Medical.CriticalTarget.TheOriginalTargetActorIsMissing"));
  }
  if(requireOwner&&!actor.isOwner)throw Error(game.i18n.localize("SWFFG.UI.Medical.CriticalTarget.TheActorOwnerOrGMMustHandleThis"));
  return actor;
}
export function criticalItemForUndo(actor,resolution) {
  const item=actor.items.get(resolution.itemId);
  if(!item)return null;
  const expected=resolution.data?.flags?.starwarsffg?.criticalOrigin,origin=item.getFlag?.('starwarsffg','criticalOrigin');
  if(!expected||origin?.message!==expected.message||origin?.group!==expected.group)throw Error(game.i18n.localize("SWFFG.UI.Medical.CriticalTarget.ThisInjuryNoLongerMatchesTheOriginalCritical"));
  if(item.name!==resolution.snapshot?.name||JSON.stringify(item.toObject().system)!==JSON.stringify(resolution.snapshot?.system))throw Error(game.i18n.localize("SWFFG.UI.Medical.CriticalTarget.TheCriticalInjuryWasChangedCheckTheSheet"));
  return item;
}
