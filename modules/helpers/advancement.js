import {xpLogEarn, xpLogSpend} from './actor-helpers.js';

export const CREATION_CHARACTERISTIC_MAX = 5;
export const CREATION_SKILL_MAX = 2;
export const SKILL_MAX = 5;
const CORE = 'swffg-compendium-bilingual-steelers-core_rule';
const purchaseQueues = new WeakMap();
const widths = {single: 1, double: 2, triple: 3, full: 4};

const normalized = value => String(value ?? '').normalize('NFKC').trim().toLocaleLowerCase();
const lastId = source => typeof source === 'string' ? source.split('.').at(-1) : undefined;
const identities = item => [item?.id, item?._id, lastId(item?.source), lastId(item?._stats?.compendiumSource), lastId(item?.flags?.core?.sourceId), item?.flags?.['swffg-compendium-bilingual']?.key].filter(Boolean);
export function sameAdvancementItem(first, second) {
  const ids = new Set(identities(first));
  return identities(second).some(id => ids.has(id)) || Boolean(first?.name && normalized(first.name) === normalized(second?.name));
}

export function careerSpecializations(career) {
  const entries = Object.values(career?.system?.specializations ?? {});
  return entries.filter(entry => entry?.name);
}

export function specializationCost(item, career, owned) {
  if (!career || owned.some(existing => sameAdvancementItem(existing, item))) return null;
  const inCareer = careerSpecializations(career).some(entry => sameAdvancementItem(entry, item));
  return 10 * (owned.length + 1) + (item.system.universal || inCareer ? 0 : 10);
}

export function skillCost(rank, inCareer) {
  return 5 * rank + (inCareer ? 0 : 5);
}

export function startingRanks(career, species, rules) {
  const droid = normalized(species?.name) === 'droid' || species?.flags?.['swffg-compendium-bilingual']?.startingGrants?.key === 'csg-81-0';
  if (droid && rules !== 'fad') return {career: 6, specialization: 3};
  const skills = Object.values(career?.system?.careerSkills ?? {}).filter(skill => skill && skill !== '(none)');
  return {career: rules === 'fad' || skills.length === 6 ? 3 : 4, specialization: 2};
}

export function forceRatingRequirement(actor, item) {
  const rating = Number(actor?.system?.stats?.forcePool?.max ?? 0);
  const required = Number(item.system.required_force_rating);
  if (Number.isFinite(rating) && Number.isFinite(required) && rating >= Math.max(1, required)) return null;
  return {forceRating: rating, requiredForceRating: Math.max(1, required || 0)};
}

export async function advancementCatalogue(type, setting) {
  const sources = new Set([`${CORE}.en-talents`, ...game.settings.get('starwarsffg', setting).split(',').map(source => source.trim()).filter(Boolean)]);
  const items = game.items.filter(item => item.type === type);
  for (const source of sources) {
    const pack = game.packs.get(source);
    if (!pack || pack.documentName !== 'Item') continue;
    const index = await pack.getIndex();
    const documents = await Promise.all(index.filter(item => item.type === type).map(item => pack.getDocument(item._id)));
    for (const item of documents) {
      if (item && !items.some(existing => sameAdvancementItem(existing, item))) items.push(item);
    }
  }
  return items;
}

export async function specializationOptions(career, owned) {
  const inCareer = careerSpecializations(career).filter(item => !owned.some(existing => sameAdvancementItem(existing, item)));
  const catalogue = await advancementCatalogue('specialization', 'specializationCompendiums');
  const remaining = catalogue.filter(item => !owned.some(existing => sameAdvancementItem(existing, item)) && !inCareer.some(entry => sameAdvancementItem(entry, item)));
  const option = item => ({name: item.name, id: item.id, source: item.uuid});
  return {
    inCareer,
    universal: remaining.filter(item => item.system.universal).map(option),
    outCareer: remaining.filter(item => !item.system.universal).map(option),
    baseCost: 10 * (owned.length + 1),
    increasedCost: 10 * (owned.length + 2),
  };
}

export function treeCost(item, key) {
  if (item.type === 'specialization' && /^talent\d+$/.test(key)) return 5 * (Math.floor(Number(key.slice(6)) / 4) + 1);
  if (item.type === 'forcepower' && /^upgrade\d+$/.test(key)) return Number(item.system.upgrades?.[key]?.cost ?? NaN);
  return NaN;
}

function matchesTalent(first, second) {
  return Boolean(first.itemId && first.itemId === second.itemId) || Boolean(first.name && normalized(first.name) === normalized(second.name));
}

export function advancementTree(item, specializations = [], {strict = false, standaloneTalents = []} = {}) {
  const force = item.type === 'forcepower';
  const prefix = force ? 'upgrade' : 'talent';
  const entries = Object.entries(item.system[force ? 'upgrades' : 'talents'] ?? {}).filter(([key, node]) => key.startsWith(prefix) && node?.name && (!force || node.visible));
  const nodes = new Map(entries.map(([key, node]) => [Number(key.slice(prefix.length)), {key, node, width: force ? widths[node.size] ?? 1 : 1, links: new Set()}]));
  const roots = new Set();
  const columns = new Map();
  for (const [index, node] of nodes) {
    for (let offset = 0; offset < node.width; offset++) columns.set(index + offset, node);
  }
  const connect = (first, second) => {
    if (!second) return;
    first.links.add(second.key);
    second.links.add(first.key);
  };
  for (const [index, entry] of nodes) {
    const {node, width, key} = entry;
    const toBase = Array.from({length: width}, (_, offset) => node[`links-top-${offset + 1}`]).some(Boolean);
    if (index < 4 && (!force || toBase)) roots.add(key);
    for (let offset = 0; index >= 4 && offset < width; offset++) {
      if (node[`links-top-${offset + 1}`]) connect(entry, columns.get(index - 4 + offset));
    }
    if (node['links-right'] && (index % 4) + width < 4) connect(entry, nodes.get(index + width));
  }
  // Legacy powers may have no connections marked to the base power.
  if (force && !roots.size) for (const [index, entry] of nodes) if (index < 4) roots.add(entry.key);

  const local = new Set(entries.filter(([, node]) => node.islearned).map(([key]) => key));
  const external = force ? [] : [
    ...standaloneTalents.filter(talent => !talent.system?.ranks?.ranked).map(talent => ({itemId: lastId(talent._stats?.compendiumSource), name: talent.name})),
    ...specializations.filter(tree => tree !== item && !sameAdvancementItem(tree, item)).flatMap(tree => Object.values(tree.system.talents ?? {}).filter(talent => talent.islearned && !talent.isRanked)),
  ];
  const shared = new Set(entries.filter(([, node]) => !node.isRanked && external.some(talent => matchesTalent(talent, node))).map(([key]) => key));
  const learned = strict ? new Set() : new Set(local);
  const open = new Set(roots);
  const graph = [...nodes.values()];
  let changed;
  do {
    changed = false;
    for (const {key, links} of graph) {
      if (open.has(key) && !learned.has(key) && (local.has(key) || shared.has(key))) {
        learned.add(key);
        changed = true;
      }
      if (!learned.has(key)) continue;
      for (const link of links) if (!open.has(link)) {
        open.add(link);
        changed = true;
      }
    }
  } while (changed);
  return {open, learned, local, automatic: new Set([...learned].filter(key => !local.has(key))), valid: [...local].every(key => learned.has(key))};
}

export function affordable(actor, cost) {
  return Number.isSafeInteger(cost) && cost >= 0 && Number(actor.system.experience.available) >= cost;
}

export function serializeXp(actor, operation) {
  const previous = purchaseQueues.get(actor) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(operation);
  purchaseQueues.set(actor, next);
  return next.finally(() => {
    if (purchaseQueues.get(actor) === next) purchaseQueues.delete(actor);
  });
}

export async function debitXp(actor, action, cost, rollback) {
  const current = Number(actor._source.system.experience.available);
  try {
    await actor.update({'system.experience.available': current - cost});
  } catch (error) {
    await rollback?.();
    throw error;
  }
  await xpLogSpend(actor, action, cost, actor.system.experience.available, actor.system.experience.total);
}

export function grantXp(actor, amount, note) {
  if (!Number.isSafeInteger(amount) || amount <= 0) return false;
  return serializeXp(actor, async () => {
    const xp = actor._source.system.experience;
    await actor.update({'system.experience.available': Number(xp.available) + amount, 'system.experience.total': Number(xp.total) + amount});
    await xpLogEarn(actor, amount, actor.system.experience.available, actor.system.experience.total, note);
    return true;
  });
}
