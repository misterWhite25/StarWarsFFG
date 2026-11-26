import { getActiveEffectChanges, activeEffectChangesUpdate } from "../compatibility/active-effects.js";
import { deleteDataField } from "../compatibility/data-operators.js";
import EffectHelpers from "./effects.js";
import ModifierHelpers from "./modifiers.js";

export default class ItemHelpers {
  static async itemUpdate(event, initialFormData) {
    let formData = initialFormData;
    formData = foundry.utils.expandObject(formData);

    if (this.object.isEmbedded && this.object.actor?.compendium?.metadata) {
      return;
    }
    

    // Handle the free-form attributes list
    const formAttrs = foundry.utils.expandObject(formData)?.data?.attributes || {};
    const attributes = Object.values(formAttrs).reduce((obj, v) => {
      let k = v["key"].trim();
      delete v["key"];
      obj[k] = v;
      return obj;
    }, {});

    // Remove attributes which are no longer used
    if (this.object.system?.attributes) {
      for (let k of Object.keys(this.object.system.attributes)) {
        if (!Object.hasOwn(attributes, k)) attributes[k] = deleteDataField();
      }
    }

    // apply active effects
    await ModifierHelpers.applyActiveEffectOnUpdate(this.object, formData);

    // recombine attributes to formData
    if (Object.keys(attributes).length > 0) {
      foundry.utils.setProperty(formData, `data.attributes`, attributes);
    }

    // migrate data to v10 structure
    delete formData._id;

    foundry.utils.setProperty(formData, `flags.starwarsffg.loaded`, false);
    await this.object.update(formData);
    // sync the active effect state (if applicable). needs to be after the update so we have the updated state
    await ItemHelpers.syncAEStatus(this.object, this.object.getEmbeddedCollection("ActiveEffect"));
    await this.render(true);

    if (this.object.type === "talent") {
      if (this.object.flags?.clickfromparent?.length) {
        let listofparents = JSON.parse(JSON.stringify(this.object.flags.clickfromparent));
        while (listofparents.length > 0) {
          const parent = listofparents.shift();
          const spec = await fromUuid(parent.id);
          if (spec) {
            let updateData = {};
            foundry.utils.setProperty(updateData, `data.talents.${parent.talent}.name`, formData.name);
            foundry.utils.setProperty(updateData, `data.talents.${parent.talent}.description`, this.object.system.description);
            foundry.utils.setProperty(updateData, `data.talents.${parent.talent}.activation`, formData.data.activation.value);
            foundry.utils.setProperty(updateData, `data.talents.${parent.talent}.isRanked`, formData.data.ranks.ranked);
            foundry.utils.setProperty(updateData, `data.talents.${parent.talent}.isForceTalent`, formData.data.isForceTalent);
            foundry.utils.setProperty(updateData, `data.talents.${parent.talent}.isConflictTalent`, formData.data.isConflictTalent);

            const linkedAttributes = {...attributes};
            for (const key of Object.keys(spec.system.talents?.[parent.talent]?.attributes ?? {})) {
              if (!Object.hasOwn(linkedAttributes, key)) linkedAttributes[key] = deleteDataField();
            }
            foundry.utils.setProperty(updateData, `data.talents.${parent.talent}.attributes`, linkedAttributes);

            if (parent.id.includes(".OwnedItem.")) {
              const ids = parent.id.split(".OwnedItem.");
              const actor = await fromUuid(ids[0]);
              const item = await actor.items.get(ids[1]);
              foundry.utils.setProperty(updateData, `flags.starwarsffg.loaded`, false);
              await item.update(updateData);
              await item.sheet.render(true);
            } else {
              foundry.utils.setProperty(updateData, `flags.starwarsffg.loaded`, false);
              await spec.update(updateData);
              await spec.sheet.render(true);
            }
          }
        }
      }
    } else if (this.object.type === "career") {
      // apply career skills from Careers
      const existingEffects = this.object.getEmbeddedCollection("ActiveEffect");
      const itemEffect = existingEffects.find(i => i.name === `(inherent)`);
      const changes = [];
      for (let i = 0; i < 8; i++) {
        let path;
        const skill = formData.data.careerSkills[`careerSkill${i}`];
        if (skill !== "(none)") {
          path = `system.skills.${skill}.careerskill`;
        } else {
          path = "(none)";
        }
        changes.push({
          key: path,
          ...EffectHelpers.changeType(),
          value: true,
        });
      }
      if (itemEffect) {
        await itemEffect.update(activeEffectChangesUpdate(changes));
      }
    } else if (this.object.type === "specialization") {
      // apply career skills from Careers
      const existingEffects = this.object.getEmbeddedCollection("ActiveEffect");
      const itemEffect = existingEffects.find(i => i.name === `(inherent)`);
      const changes = [];
      for (let i = 0; i < 5; i++) {
        let path;
        const skill = formData.data.careerSkills[`careerSkill${i}`];
        if (skill !== "(none)") {
          path = `system.skills.${skill}.careerskill`;
        } else {
          path = "(none)";
        }
        changes.push({
          key: path,
          ...EffectHelpers.changeType(),
          value: true,
        });
      }
      if (itemEffect) {
        await itemEffect.update(activeEffectChangesUpdate(changes));
      }
    }
  }

  /**
   * Takes formData and move anything under .data into .system in preparation for an item.update() call
   * @param formData
   * @returns {*}
   */
  static normalizeDataStructure(formData) {
    const updatedData = foundry.utils.deepClone(formData);
    if (Object.keys(formData).includes('data')) {
      if (!Object.keys(formData).includes('system')) {
        // sometimes we get formData with a mix of data and system...
        updatedData.system = {};
      }
      updatedData.system = foundry.utils.mergeObject(
          updatedData.system,
          updatedData.data
      );
      delete updatedData.data;
    }
    // Initialize updatedData.system if the key is present with no value
    if (Object.keys(updatedData).includes('system') && typeof updatedData.system === "undefined")
      {
        updatedData.system = {};
      }
    return updatedData;
  }

  /**
   * Takes formData and converts certain fields into an array, rather than the odd name they have by default
   * For example, submitting a form with a modifier on it results in a field value of "itemmodifier[0]", rather than
   *  a field named "itemmodifier" with a single entry in an array
   * @param formData
   */
  static explodeFormData(initialFormData) {
    let formData = initialFormData;
    // convert the formdata into a dict
    formData = foundry.utils.expandObject(formData);
    // collapse the resulting entries with an index into an array
    const relevantEntries = Object.keys(formData?.system).filter(i => i.includes("[") && i.includes("]"));
    for (const cur_entry of Object.keys(relevantEntries)) {
      const updatedKeyName =  relevantEntries[cur_entry].replace(/\[.*\]/, "");
      if (!Object.keys(formData.system).includes(updatedKeyName)) {
        formData.system[updatedKeyName] = [];
      }
      formData.system[updatedKeyName].push(formData.system[relevantEntries[cur_entry]]);
      delete formData.system[relevantEntries[cur_entry]];
    }
    return formData;
  }

  /**
   * Determines if a given Active Effect should have a status updated or not - based on the item it's a part of
   * For example, if a piece of armor has an attachment with a modification with a mod that's not installed,
   *  that mod should not apply any effect to the actor - even if the armor is equipped / unequipped
   * Similarly, unpurchased talents on specializations should not do anything until they are purchased
   * @param item - the item the active effect is a part of
   * @param activeEffect - the specific active effect to check
   * @returns {Promise<boolean>} - bool representing if the changes should be applied or not
   *
   */
  static async shouldUpdateAEStatus(item, activeEffect) {
    
    if (["armour", "weapon", "shipweapon"].includes(item.type)) {
      for (const attachment of item.system.itemattachment ?? []) {
        for (const modification of attachment?.system?.itemmodifier ?? []) {
          try {
            const foundMod = modification.system.attributes[activeEffect.name];
            
            if (foundMod && !modification.system.active) {
              
              return false;
            } else {
              
              return true;
            }
          } catch { /* Legacy modifiers may omit attributes; continue checking later modifiers before using the default status decision. */ }
        }
      }
    }
    
    return true;
  }

  /**
   * Sync the status of an active effect to the parent object when an item is updated
   * For example, enable an active effect on a talent as a part of a specialization when that talent is purchased
   * @param item
   * @param activeEffects
   * @returns {Promise<void>}
   */
  static async syncAEStatus(item, activeEffects) {
    
    if (["specialization", "signatureability"].includes(item.type)) {
      
      for (const activeEffect of activeEffects) {
        if (["specialization"].includes(item.type)) {
          for (const talentKey of Object.keys(item.system.talents)) {
            const talent = item.system.talents[talentKey];
            const locatedMod = talent?.attributes?.[activeEffect.name];
            if (locatedMod) await activeEffect.update({disabled: !talent.islearned});
          }
        }
      }
    } else if (["forcepower"].includes(item.type)) {
      
      for (const activeEffect of activeEffects) {
        if (["forcepower"].includes(item.type)) {
          for (const upgradeKey of Object.keys(item.system.upgrades)) {
            const upgrade = item.system.upgrades[upgradeKey];
            const locatedMod = upgrade?.attributes?.[activeEffect.name];
            if (locatedMod) await activeEffect.update({disabled: !upgrade.islearned});
          }
        }
      }
    } else if (["armour", "weapon", "shipweapon"].includes(item.type)) {
      
      // sync AEs to the rank value - that is, if we have a mod which adds 1 to max wounds with 4 ranks, the AE should have a value of 4, not 1
      const existingEffects = item.getEmbeddedCollection("ActiveEffect");
      for (const modifier of item.system.itemmodifier ?? []) {
        for (const attr of Object.keys(modifier?.system?.attributes ?? {})) {
          const matchingEffect = existingEffects.find(effect => effect.name === attr);
          if (matchingEffect) {
            // the mod should be applied once per rank
            const newValue = modifier.system.rank_current * modifier.system.attributes[attr].value;
            
            await matchingEffect.update(activeEffectChangesUpdate([{
                ...getActiveEffectChanges(matchingEffect)[0],
                value: newValue,
              }]));
          }
        }
      }
    }
  }

  /**
   * Update the inherent Encumbrance Active Effect when armor is equipped/unequipped
   * (because the encumbrance is reduced by 3 when worn)
   * @param item - item being equipped
   * @param activeEffect - inherent AE for that item
   * @param equipped - if the item is now equipped or not
   * @returns {Promise<void>} - N/A, updates the change on the AE
   */
  static async updateEncumbranceOnEquip(item, activeEffect, equipped) {
    
    // Imported armour can have stale inherent bonuses despite correct item values.
    // Only refresh the built-in effect; custom effects keep their own values.
    if (item.type === "armour" && activeEffect.name === "(inherent)") {
      const changes = getActiveEffectChanges(activeEffect);
      const values = {
        "system.stats.soak.value": item.system.soak?.value,
        "system.stats.defence.melee": item.system.defence?.value,
        "system.stats.defence.ranged": item.system.defence?.value,
      };
      let changed = false;
      for (const change of changes) {
        const value = values[change.key];
        if (value !== undefined && Number.isFinite(Number(value)) && Number(change.value) !== Number(value)) {
          change.value = Number(value);
          changed = true;
        }
      }
      if (changed) await activeEffect.update(activeEffectChangesUpdate(changes));
    }
    const realEncumbrance = item?.system?.encumbrance?.value;
    if (item.type === "armour" && realEncumbrance) {
      const encumbranceModPath = ModifierHelpers.getModKeyPath("Stat", "Encumbrance");
      let updatedEncumbrance;
      if (equipped) {
        updatedEncumbrance = Math.max(realEncumbrance - 3, 0);
      } else {
        updatedEncumbrance = realEncumbrance;
      }
      
      const changes = getActiveEffectChanges(activeEffect);
      for (const change of changes) {
        if (change.key === encumbranceModPath) {
          change.value = updatedEncumbrance;
          break;
        }
      }
      await activeEffect.update(activeEffectChangesUpdate(changes));
    }
  }

  /** Assign fresh attribute keys to the copy and retain its Active Effect links. */
  static async uniqueAttrs(droppedItem) {
    for (const item of [droppedItem, ...Object.values(droppedItem.system.itemmodifier ?? {})]) {
      const attributes = item.system.attributes ?? {};
      for (const [key, value] of Object.entries(attributes)) {
        const copyKey = `attr${foundry.utils.randomID()}`;
        attributes[copyKey] = value;
        delete attributes[key];
        const effect = droppedItem.effects?.find(entry => entry.name === key);
        if (effect) effect.name = copyKey;
      }
    }
    return droppedItem;
  }
}
