import {MALFUNCTION_RULES} from './vehicle-malfunction-rules.js';

export const MALFUNCTION_SCOPE = 'starwarsffg';
const voyageScope = 'swffg-compendium-bilingual-steelers-core_rule';
const numeric = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const positive = value => Math.max(0, numeric(value));
const round = value => Math.round(value * 100) / 100;

export function collectMalfunctions(actor) {
  const raw = actor?.getFlag?.(MALFUNCTION_SCOPE, 'vehicleMalfunctions') ?? actor?.flags?.starwarsffg?.vehicleMalfunctions;
  const entries = structuredClone(Array.isArray(raw) ? raw : []);
  const rows = new Map(entries.map(entry => [entry.id, entry]));
  const history = actor?.flags?.[voyageScope]?.voyageResources?.history ?? {};
  for (const receipt of Object.values(history)) {
    const breakdown = receipt.breakdown;
    if (!breakdown || breakdown.unresolved) continue;
    if (['aucune avarie', 'no malfunction', 'no breakdown'].includes(String(breakdown.title).toLowerCase())) continue;
    if (String(breakdown.table ?? '').startsWith('Avaries de voyage') && Number(breakdown.total) <= 50) continue;
    const id = 'trip:' + receipt.id;
    if (!rows.has(id)) rows.set(id, {
      id, title: breakdown.title, description: breakdown.description ?? breakdown.text ?? '',
      total: breakdown.total, when: receipt.when, source: 'voyage', tripId: receipt.id,
      resultId: breakdown.resultId, mechanics: breakdown.mechanics, repair: breakdown.repair, targetName: breakdown.targetName
    });
  }
  return [...rows.values()].filter(row => !row.deleted && !row.unresolved)
    .sort((a, b) => String(b.when ?? '').localeCompare(String(a.when ?? '')));
}

export const ruleFor = entry => entry.mechanics ?? MALFUNCTION_RULES[entry.resultId] ?? {};

export function malfunctionModifier(actor) {
  const entries = collectMalfunctions(actor);
  const details = {
    hull: positive(actor.system?.stats?.hullTrauma?.value) * 10,
    strain: positive(actor.system?.stats?.systemStrain?.value) * 10,
    malfunctions: entries.length * 5,
    criticals: Array.from(actor.items ?? []).filter(item => item.type === 'criticaldamage').length * 10,
    additional: entries.reduce((sum, entry) => sum + numeric(ruleFor(entry).modifier), 0)
  };
  return {...details, total: Object.values(details).reduce((sum, value) => sum + value, 0)};
}

export function repairQuote(actor, rule, target = null) {
  const silhouette = positive(actor.system?.stats?.silhouette?.value);
  const spec = rule.repair ?? {kind: 'manual'};
  let base = null;
  if (spec.kind === 'fixed') base = spec.value;
  if (spec.kind === 'percent') {
    const value = spec.base === 'weapon' ? target?.system?.price?.value : actor.system?.stats?.cost?.value;
    if (Number.isFinite(Number(value)) && Number(value) > 0) base = Number(value) * spec.value / 100;
  }
  return {
    silhouette, parts: base, total: base === null ? null : round(base * (spec.kind === 'percent' && spec.base === 'ship' ? 1 : silhouette)),
    time: rule.repairTime ?? '', test: rule.repairTest ?? '', specification: spec
  };
}

export function buildMalfunction(actor, result, {total = null, target = null, arc = null} = {}) {
  const rule = structuredClone(MALFUNCTION_RULES[result.id ?? result._id] ?? {});
  if (!rule.resultId) throw Error('Résultat absent de la table Avaries.');
  if (rule.target === 'shield' && !['fore', 'aft', 'port', 'starboard'].includes(arc)) {
    throw Error('Choisis un arc de bouclier.');
  }
  if (['weapon', 'equipment'].includes(rule.target) && !target) {
    throw Error('Choisis le système ou l’arme concerné.');
  }
  rule.targetId = target?.id ?? null;
  rule.arc = arc;
  return {
    title: result.name, description: result.description ?? '', resultId: rule.resultId,
    total, mechanics: rule, unresolved: Boolean(rule.unresolved),
    repair: repairQuote(actor, rule, target), targetName: target?.name ?? arc ?? ''
  };
}

export function instantMalfunctionUpdates(actor, entry) {
  const rule = ruleFor(entry);
  if (rule.instant === 'hull') {
    return {'system.stats.hullTrauma.value': positive(actor._source?.system?.stats?.hullTrauma?.value ?? actor.system?.stats?.hullTrauma?.value) + 1};
  }
  if (rule.instant === 'stop') return {'system.stats.speed.value': 0};
  return {};
}

export function malfunctionChanges(actor, entry) {
  const rule = ruleFor(entry);
  const changes = (rule.changes ?? []).map(([key, value, type = 'add']) => ({key, value, type}));
  if (rule.target === 'shield' && rule.arc) changes.push({key: 'system.stats.shields.' + rule.arc, value: -1, type: 'add'});
  if (rule.shieldOff || rule.systemsOff) {
    for (const arc of ['fore', 'aft', 'port', 'starboard']) changes.push({key: 'system.stats.shields.' + arc, value: 0, type: 'override'});
  }
  if (rule.systemsOff) {
    for (const key of ['speed.max', 'speed.value', 'hyperdrive.value', 'hyperdrive.backup']) changes.push({key: 'system.stats.' + key, value: 0, type: 'override'});
    changes.push({key: 'system.stats.navicomputer.value', value: false, type: 'override'});
  }
  return changes.map(change => ({...change, phase: 'initial', priority: change.type === 'override' ? 50 : 20}));
}

export function vehicleMalfunctionEffects(actor, EffectClass) {
  if (actor.type !== 'vehicle') return [];
  return collectMalfunctions(actor).flatMap(entry => {
    const changes = malfunctionChanges(actor, entry);
    return changes.length ? [new EffectClass({
      name: entry.title, type: 'base', disabled: false, transfer: false,
      flags: {starwarsffg: {vehicleMalfunction: entry.id}}, system: {changes}
    }, {parent: actor})] : [];
  });
}

export function malfunctionNavigation(actor) {
  return collectMalfunctions(actor).reduce((state, entry) => {
    const rule = ruleFor(entry);
    state.setback += numeric(rule.navigationSetback);
    state.pilotUpgrade += numeric(rule.pilotUpgrade);
    state.fuelFactor *= rule.fuelFactor ?? 1;
    state.navigationUnavailable ||= Boolean(rule.navigationUnavailable || rule.systemsOff);
    if (rule.systemsOff) state.disabledWeapons.push(...Array.from(actor.items??[]).filter(item=>item.type==='shipweapon').map(item=>item.id));
    if (rule.weaponOff && rule.targetId) state.disabledWeapons.push(rule.targetId);
    if (rule.target === 'weapon' && rule.setback && rule.targetId) state.weaponSetbacks[rule.targetId] = (state.weaponSetbacks[rule.targetId] ?? 0) + rule.setback;
    return state;
  }, {setback: 0, pilotUpgrade: 0, fuelFactor: 1, navigationUnavailable: false, disabledWeapons: [], weaponSetbacks: {}});
}

export function clampMalfunctionStats(actor) {
  if (actor.type !== 'vehicle') return;
  const stats = actor.system?.stats;
  if (!stats) return;
  for (const key of ['speed', 'systemStrain']) {
    if (stats[key]) stats[key].max = Math.max(0, numeric(stats[key].max));
  }
  if (stats.shields) for (const arc of ['fore', 'aft', 'port', 'starboard']) stats.shields[arc] = positive(stats.shields[arc]);
}
