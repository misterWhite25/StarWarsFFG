import {resolveCrewActor,integratedCrewVehicle,integratedCrewGroupSignature} from './integrated-crew.mjs';
import {requireLivingVehicleGroup} from './vehicle-minion-group.mjs';
import {resetNewRollTarget} from './roll-target-start.mjs';
import {groundAttackDifficulty,groundAttackRange} from "./ground-movement-state.mjs";
import { supportsWeaponSelection, missingAccurateBoost, prepareRememberedWeapon } from "./weapon-selection.js";
import RollBuilderFFG from "../dice/roll-builder.js";
import ModifierHelpers from "../helpers/modifiers.js";
import ImportHelpers from "../importer/import-helpers.js";
import { DicePoolFFG } from "../dice/pool.js";

export default class DiceHelpers {
  static async rollSkill(obj, event, type, flavorText, sound) {
    const data = await obj.getData();
    const row = event.target.parentElement.parentElement;
    let skillName = row.parentElement.dataset["ability"];
    if (skillName === undefined) {
      skillName = row.dataset["ability"];
      if (skillName === undefined) {
        skillName = row.parentElement.parentElement.parentElement.dataset["ability"];
      }
    }

    let skills;
    const theme = await game.settings.get("starwarsffg", "skilltheme");
    try {
      skills = JSON.parse(JSON.stringify(CONFIG.FFG.alternateskilllists.find((list) => list.id === theme).skills));
    } catch (err) {
      // if we run into an error use the default starwars skill set
      skills = JSON.parse(JSON.stringify(CONFIG.FFG.alternateskilllists.find((list) => list.id === "starwars").skills));
      CONFIG.logger.warn(`Unable to load skill theme ${theme}, defaulting to starwars skill theme`, err);
    }

    let skillData = skills?.[skillName];

    if (!skillData) {
      skillData = data.data[skillName];
    }

    let skill = {
      rank: 0,
      characteristic: "",
      boost: 0,
      setback: 0,
      force: 0,
      advantage: 0,
      dark: 0,
      light: 0,
      failure: 0,
      threat: 0,
      success: 0,
      triumph: 0,
      despair: 0,
      remsetback: 0,
      upgrades: 0,
      label: skillData?.label ? game.i18n.localize(skillData.label) : game.i18n.localize(skillName),
      source: {},
    };
    let characteristic = {
      value: 0,
    };

    if (data?.data?.skills?.[skillName]) {
      skill = data.data.skills[skillName];
    }
    if (data?.data?.characteristics?.[skill?.characteristic]) {
      characteristic = data.data.characteristics[skill.characteristic];
    }

    const actor = await game.actors.get(data.actor._id);

    // Determine if this roll is triggered by an item.
    let item;
    if ($(row.parentElement).hasClass("item")) {
      //Check if token is linked to actor
      if (obj.actor.token === null) {
        let itemID = row.parentElement.dataset["itemId"];
        item = actor.items.get(itemID);
      } else {
        //Rolls this if unlinked
        let itemID = row.parentElement.dataset["itemId"];
        item = obj.actor.token.actor.items.get(itemID);
      }
    }

    if (item && item.type === "weapon") {
      const ammoEnabled = item.getFlag("starwarsffg", "config.enableAmmo");
      if (ammoEnabled && item.system.ammo.value <= 0) {
        return ui.notifications.warn(game.i18n.localize("SWFFG.UI.Dice.NotEnoughAmmo"));
      }
    }

    const makePool = async (itemData = {}) => {
    const status = this.getWeaponStatus(itemData);
    if (!status) throw new Error(game.i18n.localize("SWFFG.ItemTooDamagedToUse"));
    let defenseDice = this.getDefenseDice(skill, itemData);

    // TODO: Get weapon specific modifiers from itemmodifiers and itemattachments

    let dicePool = new DicePoolFFG({
      ability: Math.max(characteristic.value, skill.rank),
      boost: skill.boost ?? 0,
      setback: (skill.setback ?? 0) + status.setback + defenseDice,
      force: skill.force ?? 0,
      advantage: skill.advantage ?? 0,
      dark: skill.dark ?? 0,
      light: skill.light ?? 0,
      failure: skill.failure ?? 0,
      threat: skill.threat ?? 0,
      success: skill.success ?? 0,
      triumph: skill.triumph ?? 0,
      despair: skill.despair ?? 0,
      upgrades: skill.upgrades ?? 0,
      remsetback: skill.remsetback ?? 0,
      difficulty: (groundAttackDifficulty(obj.actor,itemData) ?? 2) + status.difficulty, // Range assistance is optional.
    });

    dicePool.upgrade(Math.min(characteristic.value, skill.rank) + dicePool.upgrades);

    if (type === "ability") {
      dicePool.upgrade();
    } else if (type === "difficulty") {
      dicePool.upgradeDifficulty();
    }

    dicePool = new DicePoolFFG(await this.getModifiers(dicePool, itemData));
      return dicePool;
    };
    const itemData = item || {};
    const dicePool = await makePool(itemData);
    await this.displayRollDialog(data, dicePool, `${game.i18n.localize("SWFFG.Rolling")} ${game.i18n.localize(skill.label)}`, skill.label, itemData, flavorText, sound, supportsWeaponSelection(skillName, skill) ? {actor:obj.actor, skillKey:skillName, makePool} : null);
  }

  static getDefenseDice(skill, itemData){
    let defenseDice = 0;
    if (game.settings.get("starwarsffg", "useDefense")) {
      let isRanged = ["Ranged: Light", "Ranged: Heavy", "Gunnery"].includes(skill.value);
      let isMelee = ["Melee", "Brawl", "Lightsaber"].includes(skill.value);
      if (itemData?.type === "weapon" || itemData?.metaData?.tags?.includes("weapon")) {
        if (game.user.targets.size > 0) {
          for (const target of game.user.targets) {
            if (isRanged) {
              defenseDice = Math.max(defenseDice, target.actor.system.stats.defence.ranged);
            } else if (isMelee) {
              defenseDice = Math.max(defenseDice, target.actor.system.stats.defence.melee);
            }
          }
        }
      }
    }
    return defenseDice;
  }

  static async displayRollDialog(data, dicePool, description, skillName, item, flavorText, sound, weaponContext = null, rollChoices = {}) {
    dicePool = await resetNewRollTarget(dicePool, {skillName, item, weaponContext, nonAttack:rollChoices.nonAttack});
    const prepared = await prepareRememberedWeapon(weaponContext, item, dicePool);
    const actor=weaponContext?.actor??data?.document??resolveCrewActor(data?.actor?._id??data?.actor?.id);
    if(integratedCrewVehicle(actor)){data.document=actor;data.documentUuid=actor.uuid;data.integratedCrewGroup??=integratedCrewGroupSignature(actor);}
    const builder = new RollBuilderFFG(data, prepared.pool, description, skillName, prepared.item, flavorText, sound);
    builder.weaponContext = weaponContext;
    builder.roll.nonAttack = Boolean(rollChoices.nonAttack);
    builder.roll.crew = rollChoices.crew ?? prepared.item?.crew;
    builder.roll.autoFire = Boolean(rollChoices.autoFire);
    builder.roll.shotMode = rollChoices.shotMode;
    const groundRange=prepared.item?.type==='weapon'?groundAttackRange(weaponContext?.actor??data?.actor):null;
    builder.roll.shotRange = rollChoices.shotRange ?? (groundRange ? (groundRange.band===0?'engaged':groundRange.band===1?'short':'beyond') : undefined);
    if(['personal','vehicle'].includes(rollChoices.combatMode)) {
      builder.roll.combatMode=rollChoices.combatMode;
      builder._combatModeExplicit=true;
    }
    return builder.render(true);
  }

  static async addSkillDicePool(data, elem) {
    const skillName = elem.dataset["ability"];
    if (data.data.skills[skillName]) {
      const skill = data.data.skills[skillName];
      const characteristic = data.data.characteristics[skill.characteristic];

      const dicePool = new DicePoolFFG({
        ability: Math.max(characteristic?.value ? characteristic.value : 0, skill?.rank ? skill.rank : 0),
        boost: skill.boost,
        setback: skill.setback,
        force: skill.force,
        advantage: skill.advantage,
        dark: skill.dark,
        light: skill.light,
        failure: skill.failure,
        threat: skill.threat,
        success: skill.success,
        triumph: skill?.triumph ? skill.triumph : 0,
        despair: skill?.despair ? skill.despair : 0,
        upgrades: skill?.upgrades ? skill.upgrades : 0,
        remsetback: skill?.remsetback ? skill.remsetback : 0,
        source: {
          skill: skill?.ranksource?.length ? skill.ranksource : [],
          boost: skill?.boostsource?.length ? skill.boostsource : [],
          remsetback: skill?.remsetbacksource?.length ? skill.remsetbacksource : [],
          setback: skill?.setbacksource?.length ? skill.setbacksource : [],
          advantage: skill?.advantagesource?.length ? skill.advantagesource : [],
          dark: skill?.darksource?.length ? skill.darksource : [],
          light: skill?.lightsource?.length ? skill.lightsource : [],
          failure: skill?.failuresource?.length ? skill.failuresource : [],
          threat: skill?.threatsource?.length ? skill.threatsource : [],
          success: skill?.successsource?.length ? skill.successsource : [],
          triumph: skill?.triumphsource?.length ? skill.triumphsource : [],
          despair: skill?.despairsource?.length ? skill.despairsource : [],
          upgrades: skill?.upgradessource?.length ? skill.upgradessource : [],
        },
      });
      dicePool.upgrade(Math.min(characteristic.value, skill.rank) + dicePool.upgrades);

      const rollButton = elem.querySelector(".roll-button");
      dicePool.renderPreview(rollButton);
    }
  }

  static async rollItem(itemId, actorId, flavorText, sound, context = {}) {
    const actor = context.actor ?? resolveCrewActor(actorId);
    const integratedVehicle=integratedCrewVehicle(actor);if(integratedVehicle)requireLivingVehicleGroup(integratedVehicle);
    const item = actor?.items?.get(itemId);
    if (!item) return null;
    // Existing hotbar macros must obey the same carried-inventory boundary as the selector.
    if (item.flags?.starwarsffg?.inventoryLocation === 'possession') {
      ui.notifications.warn(game.i18n.format("SWFFG.UI.Dice.PossessionNotCarried",{name:item.name}));
      return null;
    }
    const actorSheet = await actor.sheet.getData();
    actorSheet.document=actor;actorSheet.documentUuid=actor.uuid;
    if(context.tokenUuid)actorSheet.pilotageTokenUuid=context.tokenUuid;
    const itemData = item.system;
    await item.setFlag("starwarsffg", "uuid", item.uuid);



    const skill = actor.system.skills[itemData.skill.value];
    const characteristic = actor.system.characteristics[skill.characteristic];
    const makePool = async (selected = {}) => {
    const status = this.getWeaponStatus(selected);
    if (!status) throw new Error(game.i18n.localize("SWFFG.ItemTooDamagedToUse"));
    let defenseDice = this.getDefenseDice(skill, selected);
    let dicePool = new DicePoolFFG({
      ability: Math.max(characteristic.value, skill.rank),
      boost: skill.boost,
      setback: (skill.setback ?? 0) + status.setback + defenseDice,
      force: skill.force,
      advantage: skill.advantage,
      dark: skill.dark,
      light: skill.light,
      failure: skill.failure,
      threat: skill.threat,
      success: skill.success,
      triumph: skill?.triumph ? skill.triumph : 0,
      despair: skill?.despair ? skill.despair : 0,
      upgrades: skill?.upgrades ? skill.upgrades : 0,
      remsetback: skill?.remsetback ? skill.remsetback : 0,
      difficulty: (groundAttackDifficulty(actor,selected) ?? 2) + status.difficulty, // Range assistance is optional.
    });

    dicePool.upgrade(Math.min(characteristic.value, skill.rank) + dicePool.upgrades);

    dicePool = new DicePoolFFG(await this.getModifiers(dicePool, selected));

      return dicePool;
    };
    const dicePool = await makePool(item);
    return this.displayRollDialog(actorSheet, dicePool, `${game.i18n.localize("SWFFG.Rolling")} ${skill.label}`, skill.label, item, flavorText, sound, supportsWeaponSelection(itemData.skill.value, skill) ? {actor, skillKey:itemData.skill.value, makePool} : null);
  }

  /** Resolve a skill macro from stable document identifiers so its weapon selector uses current Actor data. */
  static async rollSkillByKey(actorId, skillKey, difficulty = 2, flavorText, sound) {
    const actor = resolveCrewActor(actorId);
    const skill = actor?.system?.skills?.[skillKey];
    const characteristic = actor?.system?.characteristics?.[skill?.characteristic];
    if (!actor || !skill || !characteristic) return null;
    const sheet = await actor.sheet.getData();
    return this.rollSkillDirect(skill, characteristic, difficulty, sheet, flavorText, sound, {actor, skillKey});
  }

  // Takes a skill object, characteristic object, difficulty number and ActorSheetFFG.getData() object and creates the appropriate roll dialog.
  static async rollSkillDirect(skill, characteristic, difficulty, sheet, flavorText, sound, context = {}) {
    const sheetActor = sheet?.actor?.system ? sheet.actor : game.actors.get(sheet?.actor?._id ?? sheet?.actor?.id ?? sheet?.data?._id);
    const actor = context.actor ?? sheetActor ?? game.actors.find(candidate => Object.values(candidate.system?.skills ?? {}).includes(skill));
    const integratedVehicle=integratedCrewVehicle(actor);if(integratedVehicle)requireLivingVehicleGroup(integratedVehicle);
    const skillKey = context.skillKey ?? Object.entries(actor?.system?.skills ?? {}).find(([key, value]) => value === skill || key === skill?.value || (value?.label === skill?.label && value?.characteristic === skill?.characteristic))?.[0];
    const makePool = async (itemData = {}) => {
    const status = this.getWeaponStatus(itemData);
    if (!status) throw new Error(game.i18n.localize("SWFFG.ItemTooDamagedToUse"));
    const defenseDice = context.nonAttack ? 0 : this.getDefenseDice(skill, itemData);
    let dicePool = new DicePoolFFG({
      ability: Math.max(characteristic.value, skill.rank),
      boost: skill.boost,
      setback: (skill.setback ?? 0) + status.setback + defenseDice,
      force: skill.force,
      difficulty: (groundAttackDifficulty(actor,itemData) ?? difficulty) + status.difficulty,
      advantage: skill.advantage,
      dark: skill.dark,
      light: skill.light,
      failure: skill.failure,
      threat: skill.threat,
      success: skill.success,
      triumph: skill?.triumph ? skill.triumph : 0,
      despair: skill?.despair ? skill.despair : 0,
      remsetback: skill?.remsetback ? skill.remsetback : 0,
      upgrades: skill?.upgrades ? skill.upgrades : 0,
    });

    dicePool.upgrade(Math.min(characteristic.value, skill.rank) + dicePool.upgrades);
    dicePool = new DicePoolFFG(await this.getModifiers(dicePool, itemData));
    return dicePool;
    };

    const dicePool = await makePool({});
    const weaponContext = !context.nonAttack && actor && supportsWeaponSelection(skillKey, skill) ? {actor, skillKey, makePool} : null;
    return this.displayRollDialog(sheet, dicePool, `${game.i18n.localize("SWFFG.Rolling")} ${skill.label}`, skill.label, {}, flavorText, sound, weaponContext, {nonAttack:context.nonAttack});
  }

  static getWeaponStatus(item) {
    let setback = 0;
    let difficulty = 0;

    if ((item.type === "weapon" || item.type === "shipweapon" ) && item?.system?.status && item.system.status !== "None") {
      const status = CONFIG.FFG.itemstatus[item.system.status].attributes.find((i) => i.mod === "Setback");

      if (status.value < 99) {
        if (status.value === 1) {
          setback = status.value;
        } else {
          difficulty = 1;
        }
      } else {
        ui.notifications.error(`${item.name} ${game.i18n.localize("SWFFG.ItemTooDamagedToUse")} (${game.i18n.localize(CONFIG.FFG.itemstatus[item.system.status].label)}).`);
        return;
      }
    }

    return { setback, difficulty };
  }

  static async getModifiers(initialDicePool, item) {
    let dicePool = initialDicePool;
    const applyQuality = async modifier => {
      const before = Number(dicePool.boost) || 0;
      dicePool = await ModifierHelpers.getDicePoolModifiers(dicePool, modifier, []);
      dicePool.boost += missingAccurateBoost(modifier, Number(dicePool.boost) - before);
    };
    if (item.type === "weapon" || item.type === "shipweapon") {
      dicePool = await ModifierHelpers.getDicePoolModifiers(dicePool, item, []);

      if (item?.system?.itemattachment) {
        await ImportHelpers.asyncForEach(item.system.itemattachment, async (attachment) => {
          //get base mods and additional mods totals
          dicePool = await ModifierHelpers.getDicePoolModifiers(dicePool, attachment, []);
          const activeModifiers = attachment.system.itemmodifier.filter((i) => i.system?.active);
          await ImportHelpers.asyncForEach(activeModifiers, async (modifier) => {
            await applyQuality(modifier);
          });
        });
      }
      if (item?.system?.itemmodifier) {
        await ImportHelpers.asyncForEach(item.system.itemmodifier, async (modifier) => {
          await applyQuality(modifier);
        });
      }
    }

    return dicePool;
  }
}

/**
 * Helper function to build a dice pool
 * @param actor_id ID of the actor making the check
 * @param skill_name name of the string of the skill
 * @param incoming_roll existing dice, e.g. difficulty dice
 * @returns {DicePoolFFG}
 */
export function get_dice_pool(actor_id, skill_name, incoming_roll) {
  const actor = resolveCrewActor(actor_id);
  const skills = actor?.system?.skills ?? {};
  // Actor keys also include custom campaign skills absent from CONFIG.FFG.skills.
  const parsed_skill_name = Object.hasOwn(skills, skill_name) ? skill_name : convert_skill_name(skill_name);
  const skill = skills[parsed_skill_name];
  const characteristic = actor?.system?.characteristics?.[skill?.characteristic];
  if (!skill || !characteristic) throw new Error("La compétence ou sa caractéristique est indisponible sur cette fiche.");

  const dicePool = new DicePoolFFG({
    ability: Math.max(characteristic.value, skill.rank) + incoming_roll.ability - (Math.min(characteristic.value, skill.rank) + incoming_roll.proficiency),
    proficiency: Math.min(characteristic.value, skill.rank) + incoming_roll.proficiency,
    boost: (skill.boost ?? 0) + incoming_roll.boost,
    setback: (skill.setback ?? 0) + incoming_roll.setback,
    force: (skill.force ?? 0) + incoming_roll.force,
    advantage: (skill.advantage ?? 0) + incoming_roll.advantage,
    dark: (skill.dark ?? 0) + incoming_roll.dark,
    light: (skill.light ?? 0) + incoming_roll.light,
    failure: (skill.failure ?? 0) + incoming_roll.failure,
    threat: (skill.threat ?? 0) + incoming_roll.threat,
    success: (skill.success ?? 0) + incoming_roll.success,
    triumph: (skill.triumph ?? 0) + incoming_roll.triumph,
    despair: (skill.despair ?? 0) + incoming_roll.despair,
    upgrades: (skill.upgrades ?? 0) + incoming_roll.upgrades,
    remsetback: Number(skill.remsetback ?? 0) + Number(incoming_roll.remsetback ?? 0),
    difficulty: +incoming_roll.difficulty,
    challenge: +incoming_roll.challenge,
  });
  return dicePool;
}

/**
 * Convert the skill name to how the game handles it
 * @param pool_skill_name skill name to be converted
 * @returns {null|string}
 */
function convert_skill_name(pool_skill_name) {
  
  const skills = CONFIG.FFG.skills;
  for (const skill of Object.keys(skills)) {
    if (game.i18n.localize(skills[skill].label) === pool_skill_name) {
      
      return skill;
    }
  }
  // it would appear that sometimes it's value instead of label
  for (const skill of Object.keys(skills)) {
    if (skills[skill].value === pool_skill_name) {
      
      return skill;
    }
  }
  
  return null;
}
