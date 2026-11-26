
import {isCarriedEquipment} from "../helpers/inventory-location.js";
import { activeEffectCreateData, activeEffectUpdateData } from "../compatibility/active-effects.js";

function disablePushOnItem(effect, options){
  // don't show push/animation if that's an effect from item
  if(effect.parent?.documentName === "Item")
  {
    options.animate = false;
  }
}

/**
 * Extend the basic ActiveEffect
 * @extends {ActiveEffect}
 */
export class ActiveEffectFFG extends ActiveEffect {
  prepareDerivedData() {
    super.prepareDerivedData();
    const item = this.parent;
    // Gear has no equip toggle. Its generated modifiers follow its inventory location,
    // including modifiers saved as disabled by earlier system versions.
    if (item?.type === "gear" && item.actor && Object.hasOwn(item.system.attributes ?? {}, this.name)) {
      this.disabled = !isCarriedEquipment(item);
    }
  }

  /** Normalize legacy inputs at the document boundary, including embedded batch operations. */
  static async createDocuments(data = [], operation = {}) {
    return super.createDocuments(data.map(effect => activeEffectCreateData(effect)), operation);
  }

  static async updateDocuments(updates = [], operation = {}) {
    return super.updateDocuments(updates.map(effect => activeEffectUpdateData(effect)), operation);
  }

  /** @override */
  async _onCreate(changed, options, userId) {
    disablePushOnItem(this, options);
    await super._onCreate(changed, options, userId);
  }

  /** @override */
  async _onUpdate(changed, options, userId) {
    disablePushOnItem(this, options);
    await super._onUpdate(changed, options, userId);
  }

  /** @override */
  async _onDelete(options, userId) {
    disablePushOnItem(this, options);
    await super._onDelete(options, userId);
  }
}
