const LINK_FLAG = "directorySceneLinks";
const LINK_PATH = "flags.starwarsffg." + LINK_FLAG;

// Remove individual keys, so a cleanup cannot overwrite a link to another scene.
export function danglingSceneLinkUpdates(actors, scenes) {
  const updates = [];
  for (const actor of actors) {
    const links = actor?.getFlag("starwarsffg", LINK_FLAG);
    if (!links || typeof links !== "object" || Array.isArray(links)) continue;
    const absent = Object.keys(links).filter(id => /^[a-z0-9_-]+$/i.test(id) && !scenes.has(id));
    if (!absent.length) continue;
    const update = {_id: actor.id};
    for (const id of absent) update[LINK_PATH + ".-=" + id] = null;
    updates.push(update);
  }
  return updates;
}

export function registerSceneLinkCleanup() {
  let queue = Promise.resolve();
  let fullScanQueued = false;
  const actorsQueued = new Set();

  function schedule(id) {
    if (!game.ready || !game.user?.isActiveGM || fullScanQueued || actorsQueued.has(id)) return;
    if (id) actorsQueued.add(id);
    else fullScanQueued = true;
    queue = queue.then(async () => {
      if (id) actorsQueued.delete(id);
      else fullScanQueued = false;
      if (!game.user?.isActiveGM) return;
      const actors = id ? [game.actors.get(id)].filter(Boolean) : game.actors.contents;
      const updates = danglingSceneLinkUpdates(actors, game.scenes);
      if (updates.length) {
        await Actor.implementation.updateDocuments(updates, {swffgSceneLinkCleanup: true});
      }
    }).catch(error => {
      console.error("Star Wars FFG | Failed to clean up actor scene links.", error);
    });
    return queue;
  }

  const checkActor = actor => {
    if (!game.user?.isActiveGM || game.actors.get(actor.id) !== actor) return;
    if (danglingSceneLinkUpdates([actor], game.scenes).length) return schedule(actor.id);
  };

  Hooks.on("deleteScene", scene => {
    if (!scene.pack && !scene.parent) return schedule();
  });
  // Repair links from imported actors, or a competing write arriving after deletion.
  Hooks.on("createActor", checkActor);
  Hooks.on("updateActor", (actor, changes, options) => {
    if (options?.swffgSceneLinkCleanup) return;
    if (!changes.flags && !Object.keys(changes).some(key => key === LINK_PATH || key.startsWith(LINK_PATH + "."))) return;
    return checkActor(actor);
  });
  Hooks.once("ready", () => schedule());
  Hooks.on("userConnected", user => {
    if (user.isGM) return schedule();
  });
}
