const pending = new Map();

// The active GM serializes preview creation and cleanup for each open wizard.
export function updateWizardPreview(player, sessionId, removeOnly = false) {
  const key = `${player.id}:${sessionId}`;
  const previous = pending.get(key) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(async () => {
    const previews = game.actors.filter(actor =>
      actor.getFlag("starwarsffg", "wizardPreviewOwner") === player.id &&
      actor.getFlag("starwarsffg", "wizardId") === sessionId);
    for (const preview of previews) await preview.delete();
    if (removeOnly) return;
    return Actor.create({
      name: `temp actor - ${player.name}`,
      type: "character",
      flags: {starwarsffg: {wizardPreviewOwner: player.id, wizardId: sessionId, speciesWizardManaged: true}},
      ownership: {[player.id]: foundry.CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER},
    }, {renderSheet: false});
  });
  pending.set(key, next);
  return next.finally(() => {
    if (pending.get(key) === next) pending.delete(key);
  });
}
