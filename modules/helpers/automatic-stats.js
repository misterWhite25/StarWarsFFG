const fields = {
  wounds: ['wounds.max', 'Seuil de blessures'], strain: ['strain.max', 'Seuil de stress'],
  soak: ['soak.value', 'Encaissement'], melee: ['defence.melee', 'Défense au corps à corps'],
  ranged: ['defence.ranged', 'Défense à distance'], encumbrance: ['encumbrance.max', 'Seuil d’encombrement'],
};
const number = value => value !== '' && value != null && Number.isFinite(Number(value)) ? Number(value) : null;
const read = (object, path) => path.split('.').reduce((o, k) => o?.[k], object);

/** Pure, repeatable calculation: never alters documents or their effects. */
export function calculateStats(actor, config = actor.flags?.starwarsffg?.automaticStats ?? {}) {
  const items = Array.from(actor.items ?? []);
  const species = items.filter(i => i.type === 'species');
  const errors = [], warnings = [];
  if (species.length !== 1) errors.push('Une seule espèce renseignée est nécessaire.');
  const attributes = species[0]?.system?.attributes ?? {};
  const birthBrawn = number(config.creationBrawn), birthWill = number(config.creationWillpower);
  if (birthBrawn === null || birthBrawn < 1) errors.push('Renseigner la Vigueur à la création.');
  if (birthWill === null || birthWill < 1) errors.push('Renseigner la Volonté à la création.');
  const speciesWounds = number(attributes.Wounds?.value), speciesStrain = number(attributes.Strain?.value);
  if (speciesWounds === null || speciesStrain === null) errors.push('Les seuils de base de l’espèce sont incomplets.');
  const brawn = number(actor.system?.characteristics?.Brawn?.value);
  if (brawn === null) errors.push('La Vigueur actuelle est manquante.');
  const bases = {wounds: (speciesWounds ?? 0) + (birthBrawn ?? 0), strain: (speciesStrain ?? 0) + (birthWill ?? 0),
    soak: brawn ?? 0, melee: 0, ranged: 0, encumbrance: 5 + (brawn ?? 0)};
  const names = {wounds: `${species[0]?.name ?? 'Espèce'} + Vigueur à la création`,
    strain: `${species[0]?.name ?? 'Espèce'} + Volonté à la création`, soak: 'Vigueur actuelle',
    melee: 'Base', ranged: 'Base', encumbrance: '5 + Vigueur actuelle'};
  const rows = Object.entries(fields).map(([id, [path, label]]) => ({id, path, label,
    current: read(actor.system?.stats, path), total: bases[id], sources: [{name: names[id], operation: 'base', value: bases[id]}]}));
  const armour = items.filter(i => i.type === 'armour' && i.system?.equippable?.equipped && Number(i.system.quantity?.value ?? 1) > 0);
  for (const [id, stat] of [['soak', 'soak'], ['melee', 'defence'], ['ranged', 'defence']]) {
    const best = armour.reduce((winner, item) => {
      const value = number(item.system?.[stat]?.adjusted ?? item.system?.[stat]?.value) ?? 0;
      return value > winner.value ? {value, name: item.name} : winner;
    }, {value: 0, name: ''});
    if (best.value) { const row = rows.find(r => r.id === id); row.total += best.value; row.sources.push({name: best.name, operation: '+', value: best.value}); }
  }
  const changes = [];
  for (const effect of actor.allApplicableEffects()) {
    if (!effect.active) continue;
    const parent = effect.parent?.documentName === 'Item' ? effect.parent : null;
    if (parent?.system?.equippable && !parent.system.equippable.equipped) continue;
    const sourceChanges = effect._source?.system?.changes ?? effect.system?.changes ?? [];
    // Species and worn armour are read directly above. Brawn already feeds soak/encumbrance.
    for (const change of sourceChanges) {
      const row = rows.find(r => change.key === `system.stats.${r.path}`);
      if (!row) continue;
      if (change.phase && !['initial','final'].includes(change.phase)) { errors.push(`Phase d’effet non prise en charge : ${effect.name}`); continue; }
      if (parent?.type === 'armour' && parent.system?.attributes?.[effect.name]?.modtype === 'Armor Stat') continue;
      if (effect.name === '(inherent)' && ['species', 'armour'].includes(parent?.type)) continue;
      if (parent?.system?.attributes?.[effect.name]?.modtype === 'Characteristic' &&
          parent.system.attributes[effect.name].mod === 'Brawn' && ['soak', 'encumbrance'].includes(row.id)) continue;
      if (parent && effect.name.startsWith('attr') && !parent.system?.attributes?.[effect.name]) {
        warnings.push(`${parent.name} : effet ancien sans modificateur correspondant (${row.label}). Conservé jusqu’à vérification.`);
      }
      if (parent?.type === 'weapon' && ['wounds', 'strain'].includes(row.id)) warnings.push(`${parent.name} modifie ${row.label.toLowerCase()} : vérifier ce bonus.`);
      const type = change.type ?? ({2: 'add', 1: 'multiply', 3: 'downgrade', 4: 'upgrade', 5: 'override'})[change.mode];
      const value = number(change.value);
      if (value === null || !['add', 'multiply', 'downgrade', 'upgrade', 'override'].includes(type)) {
        errors.push(`${parent?.name ?? effect.name} : effet non numérique ou personnalisé sur ${row.label.toLowerCase()}, à configurer.`); continue;
      }
      const priority = number(change.priority) ?? ({multiply: 10, add: 20, downgrade: 30, upgrade: 40, override: 50})[type];
      changes.push({row, value, type, priority, phase: change.phase === 'final' ? 1 : 0, name: parent ? `${parent.name} — ${effect.name}` : effect.name});
    }
  }
  for (const {row, value, type, name} of changes.sort((a,b) => a.phase - b.phase || a.priority - b.priority)) {
    row.total = type === 'add' ? row.total + value : type === 'multiply' ? row.total * value :
      type === 'upgrade' ? Math.max(row.total, value) : type === 'downgrade' ? Math.min(row.total, value) : value;
    row.sources.push({name, operation: type, value});
  }
  for (const item of items.filter(i => i.type === 'talent')) {
    const attrs = Object.entries(item.system?.attributes ?? {}).filter(([,a]) => ['Wounds','Strain','Soak','Defence.Melee','Defence.Ranged','EncumbranceMax'].includes(a.mod));
    for (const [key] of attrs) if (!Array.from(item.effects ?? []).some(e => e.name === key))
      warnings.push(`${item.name} : modificateur sans effet associé ; non compté. Vérifier sa configuration.`);
  }
  for (const row of rows) {
    const adjustment = number(config.adjustments?.[row.id]) ?? 0;
    if (adjustment) {row.total += adjustment; row.sources.push({name: 'Ajustement MJ', operation: '+', value: adjustment});}
    const limit = ['melee','ranged'].includes(row.id) ? 4 : Infinity;
    const bounded = Math.max(0, Math.min(limit, row.total));
    if (bounded !== row.total) row.sources.push({name: 'Limite', operation: '=', value: bounded});
    row.total = bounded;
  }
  return {rows, errors: [...new Set(errors)], warnings: [...new Set(warnings)]};
}

export default class AutomaticStats {
  static apply(actor) {
    if (actor.type !== 'character' || !actor.flags?.starwarsffg?.automaticStats?.enabled) return;
    const result = calculateStats(actor);
    actor.automaticStatsReport = result;
    if (result.errors.length) return;
    for (const row of result.rows) {
      const [group, field] = row.path.split('.');
      actor.system.stats[group][field] = row.total;
      actor.overrides ??= {};
      actor.overrides.system ??= {}; actor.overrides.system.stats ??= {};
      (actor.overrides.system.stats[group] ??= {})[field] = row.total;
    }
    actor.system.stats.woundsOverThreshold = actor.system.stats.wounds.value - actor.system.stats.wounds.max;
    actor.system.stats.strainOverThreshold = actor.system.stats.strain.value - actor.system.stats.strain.max;
  }
}
