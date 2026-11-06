const t=(fr,en)=>game.i18n.lang==='fr'?fr:en;
/** A linked world actor may survive deletion of its token; a synthetic actor must not fall back to its base. */
export function captureCriticalTarget(token) {
  const actor=token?.actor;
  if(!token?.uuid||!actor?.uuid||typeof token.actorLink!=='boolean')throw Error(t('Identité de cible incomplète.','Incomplete target identity.'));
  return {tokenUuid:token.uuid,actorUuid:actor.uuid,linked:token.actorLink};
}
export async function locateCriticalTarget(identity,lookup,{requireOwner=true}={}) {
  if(!identity?.tokenUuid||!identity.actorUuid||typeof identity.linked!=='boolean')throw Error(t('Vérifie la cible de cet ancien critique avant de continuer.','Review this old critical target before continuing.'));
  const token=await lookup(identity.tokenUuid);let actor;
  if(token) {
    if(token.actor?.uuid!==identity.actorUuid||token.actorLink!==identity.linked)throw Error(t('Le pion a changé d’acteur ou de liaison : opération suspendue.','The token actor or link changed: operation suspended.'));
    actor=token.actor;
  } else {
    if(!identity.linked)throw Error(t('Pion non lié supprimé : sa fiche de base ne peut pas recevoir ce critique.','Unlinked token deleted: its base actor cannot receive this critical.'));
    if(!/^Actor\.[^.]+$/.test(identity.actorUuid))throw Error(t('Référence de fiche liée invalide.','Invalid linked actor reference.'));
    actor=await lookup(identity.actorUuid);
    if(!actor||actor.uuid!==identity.actorUuid)throw Error(t('La fiche cible d’origine est introuvable.','The original target actor is missing.'));
  }
  if(requireOwner&&!actor.isOwner)throw Error(t('Le propriétaire ou le MJ doit intervenir sur ce critique.','The actor owner or GM must handle this critical.'));
  return actor;
}
export function criticalItemForUndo(actor,resolution) {
  const item=actor.items.get(resolution.itemId);
  if(!item)return null;
  const expected=resolution.data?.flags?.starwarsffg?.criticalOrigin,origin=item.getFlag?.('starwarsffg','criticalOrigin');
  if(!expected||origin?.message!==expected.message||origin?.group!==expected.group)throw Error(t('Cette blessure ne correspond plus au critique d’origine.','This injury no longer matches the original critical.'));
  if(item.name!==resolution.snapshot?.name||JSON.stringify(item.toObject().system)!==JSON.stringify(resolution.snapshot?.system))throw Error(t('La blessure critique a été modifiée depuis. Vérifie la fiche avant d’annuler.','The critical injury was changed. Check the sheet before undoing.'));
  return item;
}
