import {skillIcon,needsSkillIconUpdate} from './skill-hotbar-model.mjs';
// Macro API updates adapted from salohcin714's PR #2280; owned weapons use their actual parent Actor.
const createMacroItem = async (macro) => {
  const existing = game.macros.find(m => m.name === macro.name && m.command === macro.command);
  if (!existing) return CONFIG.Macro.documentClass.create(macro);
  if (macro.flags?.starwarsffg?.skillShortcut && existing.isOwner && needsSkillIconUpdate(existing.img, macro.img)) {
    await existing.update({img: macro.img, 'flags.starwarsffg.skillShortcut': macro.flags.starwarsffg.skillShortcut});
  }
  return existing;
};

async function createSkillMacro(data) {
  const actor = game.actors.get(data.actorId);
  if (!actor) return null;
  const command = `await game.ffg.DiceHelpers.rollSkillByKey(${JSON.stringify(data.actorId)}, ${JSON.stringify(data.data.skill)}, 2);`;
  return createMacroItem({name: `${actor.name}-${data.data.skill}`, type: "script", img:skillIcon(data.data.skill,actor.system?.skills?.[data.data.skill]), command, flags:{starwarsffg:{skillShortcut:{version:1,actorUuid:actor.uuid??"Actor."+actor.id,skillKey:data.data.skill}}}});
}

export async function createFFGMacro(bar, data, slot) {
  let macro;
  if (data?.data?.type === "skill") {
    macro = await createSkillMacro(data);
  } else if (["Item", "Actor"].includes(data.type)) {
    const entity = await foundry.utils.fromUuid(data.uuid);
    if (!entity) return false;
    if (entity.type === "weapon") {
      const actorId = entity.actor?.id;
      const command = actorId
        ? `await game.ffg.DiceHelpers.rollItem(${JSON.stringify(entity.id)}, ${JSON.stringify(actorId)});`
        : `await ui.hotbar.constructor.toggleDocumentSheet(${JSON.stringify(data.uuid)});`;
      macro = await createMacroItem({name: entity.name, type: "script", img: entity.img, command});
    } else if (entity.type === "skill") {
      macro = await createSkillMacro(data);
    }
  } else if (data.type === "Transfer" && data.data?.type === "weapon") {
    const item = data.data;
    const command = `await game.ffg.DiceHelpers.rollItem(${JSON.stringify(item._id)}, ${JSON.stringify(data.actorId)});`;
    macro = await createMacroItem({name: game.i18n.format("SWFFG.UI.Interface.AttackWith",{name:item.name}), type: "script", img: item.img, command});
  }
  if (macro) await game.user.assignHotbarMacro(macro, slot);
  return false;
}

/** Update the image for macros opening a document sheet. */
export async function updateMacro(macro) {
  if(macro.getFlag?.("starwarsffg", "skillShortcut"))return macro;
  const uuid = macro.command.split('"')[1];
  if (uuid) {
    const document = await foundry.utils.fromUuid(uuid);
    if (document?.img) await macro.update({img: document.img});
  }
  return macro;
}
