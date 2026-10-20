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
    add('6-11', 'Difficulté du test de Médecine');
    if (context.criticalTreatment) add('6-10', 'Soin d’une blessure critique indiqué');
  }
  // Ne pas présenter les tables de combat personnel pour une arme de véhicule.
  if (context.scale === 'personal' && ['ranged', 'melee', 'gunnery'].includes(kind)) {
    if (['ranged', 'gunnery'].includes(kind)) {
      add('6-1', 'Attaque à distance'); add('6-4', 'Vérifier les modificateurs de distance');
    }
    add('6-2', 'Dépenses positives'); add('6-3', 'Dépenses négatives');
    if (context.concealment) add('6-7', 'Camouflage signalé par le MJ');
    if (context.improvised) add('6-5', 'Arme improvisée sélectionnée');
    if (context.silhouetteDifference) add('6-6', 'Différence de gabarit signalée');
  }
  return [...result.values()];
}
