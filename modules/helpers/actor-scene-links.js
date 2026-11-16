const SYSTEM = "starwarsffg";
const FLAG = "directorySceneLinks";
const ACTOR_TABS = new Set(["actors", "npcs", "vehicles"]);

function editableWorldActor(app, id) {
  if (!game.user?.isGM || !ACTOR_TABS.has(app.tabName) || app.collection !== game.actors || !id) return null;
  const actor = game.actors.get(id);
  if (actor?.documentName !== "Actor" || actor.pack || actor.parent || actor.isToken) return null;
  return actor.canUserModify(game.user, "update") ? actor : null;
}

function sceneChoices(scenes, initial, viewedId) {
  // DialogV2 serializes the inner HTML of an attribute-free div.
  const content = document.createElement("div");
  const choices = document.createElement("fieldset");
  choices.className = "ffg-scene-link-choices";
  const legend = document.createElement("legend");
  legend.textContent = game.i18n.localize("SWFFG.NpcSession.LinkScenesHint");
  choices.append(legend);
  for (const scene of scenes) {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.name = "sceneId";
    input.value = scene.id;
    input.defaultChecked = initial.has(scene.id);
    const label = document.createElement("label");
    label.append(input, document.createTextNode(scene.name));
    if (scene.id === viewedId) {
      const current = document.createElement("small");
      current.textContent = game.i18n.localize("SWFFG.NpcSession.ViewedScene");
      label.append(current);
    }
    choices.append(label);
  }
  if (!scenes.length) {
    const empty = document.createElement("p");
    empty.textContent = game.i18n.localize("SWFFG.NpcSession.NoVisibleScenes");
    choices.append(empty);
  }
  content.append(choices);
  return content;
}

async function editSceneLinks(app, actor) {
  const viewedId = game.scenes.viewed?.id;
  const scenes = game.scenes.contents.filter(scene => scene.visible)
    .sort((left, right) => Number(right.id === viewedId) - Number(left.id === viewedId)
      || left.name.localeCompare(right.name, undefined, {numeric: true}));
  const links = actor.getFlag(SYSTEM, FLAG) ?? {};
  const initial = new Set(scenes.filter(scene => links[scene.id] === true).map(scene => scene.id));
  const selected = await foundry.applications.api.DialogV2.wait({
    window: {title: game.i18n.format("SWFFG.NpcSession.LinkScenesTitle", {name: actor.name})},
    content: sceneChoices(scenes, initial, viewedId),
    buttons: [
      {action: "save", label: "SETTINGS.Save", icon: "fa-solid fa-floppy-disk", default: true,
        callback: (_event, button) => new FormData(button.form).getAll("sceneId")},
      {action: "cancel", label: "COMMON.Cancel", icon: "fa-solid fa-xmark"},
    ],
  });
  if (!Array.isArray(selected) || editableWorldActor(app, actor.id) !== actor) return;

  const chosen = new Set(selected);
  const current = actor.getFlag(SYSTEM, FLAG) ?? {};
  const update = {};
  for (const scene of scenes) {
    if (game.scenes.get(scene.id) !== scene || !scene.visible) continue;
    const checked = chosen.has(scene.id);
    if (initial.has(scene.id) === checked || (current[scene.id] === true) === checked) continue;
    // Patch only the user's changed selections. Other GMs can independently link this actor to another scene.
    const key = checked ? scene.id : "-=" + scene.id;
    update[`flags.${SYSTEM}.${FLAG}.${key}`] = checked ? true : null;
  }
  if (Object.keys(update).length) await actor.update(update);
}

export function sceneLinkMenu(app) {
  return {
    label: "SWFFG.NpcSession.LinkScenes",
    icon: "fa-solid fa-link",
    visible: row => Boolean(editableWorldActor(app, row.dataset.entryId)),
    onClick: async (_event, row) => {
      const actor = editableWorldActor(app, row.dataset.entryId);
      if (!actor) return;
      try {
        await editSceneLinks(app, actor);
      } catch (error) {
        console.error("Star Wars FFG | Actor scene links", error);
        ui.notifications.error(game.i18n.localize("SWFFG.NpcSession.SceneLinkError"));
      }
    },
  };
}
