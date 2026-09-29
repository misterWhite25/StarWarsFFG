const labels = {
  stats: '', characteristics: '', value: '', max: 'Seuil', min: 'Minimum', adjusted: 'Ajusté',
  wounds: 'Blessures', strain: 'Stress', encumbrance: 'Encombrement', forcePool: 'Réserve de Force',
  Brawn: 'Vigueur', Agility: 'Agilité', Intellect: 'Intelligence', Cunning: 'Ruse', Willpower: 'Volonté', Presence: 'Présence',
  conflict: 'Conflit', duty: 'Devoir', obligation: 'Obligation', morality: 'Moralité',
  experience: 'Expérience', available: 'Disponible', total: 'Total', soak: 'Encaissement',
  defence: 'Défense', melee: 'Corps à corps', ranged: 'Distance', credits: 'Crédits',
  hullTrauma: 'Dégâts de coque', hulltrauma: 'Dégâts de coque', systemStrain: 'Stress mécanique', systemstrain: 'Stress mécanique',
  speed: 'Vitesse', handling: 'Maniabilité', silhouette: 'Gabarit', armor: 'Blindage', shields: 'Boucliers',
  fore: 'Avant', aft: 'Arrière', port: 'Bâbord', starboard: 'Tribord', quantity: 'Quantité',
  unit_wounds: 'Blessures par unité', force: 'Force', rating: 'Indice', committed: 'Engagée',
};

export function resourceLabel(path) {
  return path.split('.').map(part => labels[part] ?? part).filter(Boolean).join(' — ');
}

export function registerTokenResourceLabels() {
  const Base = CONFIG.Token.documentClass;
  CONFIG.Token.documentClass = class FFGTokenDocument extends Base {
    static getTrackedAttributeChoices(attributes) {
      const choices = super.getTrackedAttributeChoices(attributes);
      if (game.i18n.lang !== 'fr') return choices;
      const barGroup = game.i18n.localize('TOKEN.BarAttributes');
      return choices.map(choice => ({...choice,
        label: resourceLabel(choice.value),
        group: choice.group === barGroup ? 'Barres de ressources' : 'Valeurs simples',
      }));
    }
  };
}
