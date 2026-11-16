const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const aliases = new Map();
for (const [id, names] of Object.entries({
  ranged: ['RangedLight', 'RangedHeavy', 'Ranged: Light', 'Ranged: Heavy', 'Armes légères', 'Armes lourdes', 'SWFFG.SkillsNameRangedLight', 'SWFFG.SkillsNameRangedHeavy'],
  melee: ['Melee', 'Brawl', 'Lightsaber', 'Corps à corps', 'Pugilat', 'Sabre laser', 'SWFFG.SkillsNameMelee', 'SWFFG.SkillsNameBrawl', 'SWFFG.SkillsNameLightsaber'],
  medicine: ['Medicine', 'Médecine', 'SWFFG.SkillsNameMedicine'],
  gunnery: ['Gunnery', 'Artillerie', 'SWFFG.SkillsNameGunnery'],
})) for (const name of names) aliases.set(normalize(name), id);

// Correspondance éditoriale à valider par le MJ, sans calculer de difficulté.
export function suggestTables(skill, context = {}) {
  const kind = aliases.get(normalize(skill));
  const result = new Map();
  const add = (id, reason) => result.set(id, {id, reason});
  if (kind === 'medicine') {
    add('6-11', game.i18n.localize("SWFFG.UI.Interface.MedicineDifficultyReason"));
    if (context.criticalTreatment) add('6-10', game.i18n.localize("SWFFG.UI.Interface.CriticalTreatmentReason"));
  }
  // Ne pas présenter les tables de combat personnel pour une arme de véhicule.
  if (context.scale === 'personal' && ['ranged', 'melee', 'gunnery'].includes(kind)) {
    if (['ranged', 'gunnery'].includes(kind)) {
      add('6-1', game.i18n.localize("SWFFG.UI.Interface.RangedAttackReason")); add('6-4', game.i18n.localize("SWFFG.UI.Interface.RangeModifierReason"));
    }
    add('6-2', game.i18n.localize("SWFFG.UI.Interface.PositiveSpendingReason")); add('6-3', game.i18n.localize("SWFFG.UI.Interface.NegativeSpendingReason"));
    if (context.concealment) add('6-7', game.i18n.localize("SWFFG.UI.Interface.ConcealmentReason"));
    if (context.improvised) add('6-5', game.i18n.localize("SWFFG.UI.Interface.ImprovisedWeaponReason"));
    if (context.silhouetteDifference) add('6-6', game.i18n.localize("SWFFG.UI.Interface.SilhouetteDifferenceReason"));
  }
  return [...result.values()];
}
