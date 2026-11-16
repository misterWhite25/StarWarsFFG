import {vehicleMinionGroup} from './vehicle-minion-group.mjs';
const labels = {
  stats: '', characteristics: '', value: '', max: "SWFFG.UI.Interface.Threshold", min: "SWFFG.UI.Interface.Minimum", adjusted: "SWFFG.UI.Interface.Adjusted",
  wounds: "SWFFG.UI.Interface.Wounds", strain: "SWFFG.UI.Interface.Strain", encumbrance: "SWFFG.UI.Interface.Encumbrance", forcePool: "SWFFG.UI.Interface.ForcePool",
  Brawn: "SWFFG.UI.Interface.Brawn", Agility: "SWFFG.UI.Interface.Agility", Intellect: "SWFFG.UI.Interface.Intellect", Cunning: "SWFFG.UI.Interface.Cunning", Willpower: "SWFFG.UI.Interface.Willpower", Presence: "SWFFG.UI.Interface.Presence",
  conflict: "SWFFG.UI.Interface.Conflict", duty: "SWFFG.UI.Interface.Duty", obligation: "SWFFG.UI.Interface.Obligation", morality: "SWFFG.UI.Interface.Morality",
  experience: "SWFFG.UI.Interface.Experience", available: "SWFFG.UI.Interface.Available", total: "SWFFG.UI.Interface.Total", soak: "SWFFG.UI.Interface.Soak",
  defence: "SWFFG.UI.Interface.Defense", melee: "SWFFG.UI.Interface.Melee", ranged: "SWFFG.UI.Interface.Ranged", credits: "SWFFG.UI.Interface.Credits",
  hullTrauma: "SWFFG.UI.Interface.HullTrauma", hulltrauma: "SWFFG.UI.Interface.HullTrauma", systemStrain: "SWFFG.UI.Interface.SystemStrain", systemstrain: "SWFFG.UI.Interface.SystemStrain",
  speed: "SWFFG.UI.Interface.Speed", handling: "SWFFG.UI.Interface.Handling", silhouette: "SWFFG.UI.Interface.Silhouette", armor: "SWFFG.UI.Interface.Armor", shields: "SWFFG.UI.Interface.Shields",
  fore: "SWFFG.UI.Interface.Fore", aft: "SWFFG.UI.Interface.Aft", port: "SWFFG.UI.Interface.Port", starboard: "SWFFG.UI.Interface.Starboard", quantity: "SWFFG.UI.Interface.Quantity",
  unit_wounds: "SWFFG.UI.Interface.UnitWounds", force: "SWFFG.UI.Interface.Force", rating: "SWFFG.UI.Interface.Rating", committed: "SWFFG.UI.Interface.Committed",
};

export function resourceLabel(path) {
  return path.split('.').map(part => labels[part] ? game.i18n.localize(labels[part]) : labels[part] ?? part).filter(Boolean).join(' - ');
}

export function registerTokenResourceLabels() {
  const Base = CONFIG.Token.documentClass;
  CONFIG.Token.documentClass = class FFGTokenDocument extends Base {
    getBarAttribute(barName,options={}) {
      const result=super.getBarAttribute(barName,options),group=vehicleMinionGroup(this.actor);
      return result?.attribute==='stats.hullTrauma'&&group.enabled?{...result,max:group.totalHull}:result;
    }
    static getTrackedAttributeChoices(attributes) {
      const choices = super.getTrackedAttributeChoices(attributes);
      const barGroup = game.i18n.localize('TOKEN.BarAttributes');
      return choices.map(choice => ({...choice,
        label: resourceLabel(choice.value),
        group: choice.group === barGroup ? game.i18n.localize("SWFFG.UI.Interface.ResourceBars") : game.i18n.localize("SWFFG.UI.Interface.ResourceValues"),
      }));
    }
  };
}
