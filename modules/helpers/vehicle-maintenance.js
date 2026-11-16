import {repairQuote, ruleFor} from './vehicle-malfunction-engine.js';

const voyageScope = 'swffg-compendium-bilingual-steelers-core_rule';
const money = value => Math.round(value * 100) / 100;
const valid = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0;
const localize = key => globalThis.game?.i18n?.localize('SWFFG.VehicleMaintenance.' + key) ?? key;

/** Read the immutable receipts. Opening a sheet never creates or rewrites a ledger. */
export function vehicleMaintenance(actor) {
  const flags = actor.flags ?? {};
  const history = flags[voyageScope]?.voyageResources?.history ?? {};
  const charges = new Map();
  const repairs = new Map();
  for (const [key, receipt] of Object.entries(history)) {
    const id = String(receipt.id ?? key);
    if (valid(receipt.cost?.maintenance)) charges.set('voyage:' + id, money(Number(receipt.cost.maintenance)));
    if (receipt.breakdown) repairs.set('trip:' + id, receipt.breakdown);
  }
  // Retired malfunctions retain their repair quote: removing an effect is not a payment.
  for (const entry of flags.starwarsffg?.vehicleMalfunctions ?? []) {
    if (entry.id && (!repairs.has(entry.id) || entry.repair)) repairs.set(entry.id, entry);
  }
  let unpriced = 0;
  for (const [id, entry] of repairs) {
    const rule = ruleFor(entry);
    if (entry.unresolved || rule.unresolved || ['aucune avarie','no malfunction','no breakdown'].includes(String(entry.title).toLowerCase())) continue;
    // Old voyage summaries have no reliable price or table rule.
    const target = Array.from(actor.items ?? []).find(item => item.id === rule.targetId);
    const quote = entry.repair ?? repairQuote(actor, rule, target);
    if (valid(quote.total)) charges.set('repair:' + id, money(Number(quote.total)));
    else if (!entry.deleted) unpriced++;
  }
  const sorted = [...charges].sort(([a],[b]) => a.localeCompare(b));
  const travel = money(sorted.filter(([id]) => id.startsWith('voyage:')).reduce((sum,[,value]) => sum + value,0));
  const repair = money(sorted.filter(([id]) => id.startsWith('repair:')).reduce((sum,[,value]) => sum + value,0));
  const state = flags.starwarsffg?.vehicleMaintenance ?? {};
  const adjustment = Number.isFinite(Number(state.adjustment)) ? Number(state.adjustment) : 0;
  const accrued = money(travel + repair);
  return {amount: Math.max(0,money(accrued + adjustment)), accrued, travel, repair, unpriced,
    revision: JSON.stringify([state.revision ?? 0, adjustment, sorted])};
}

/** An explicit amount edit records only the adjustment, preserving historical receipts. */
export function applyVehicleMaintenanceEdit(actor, update, {changedName, isGM = false} = {}) {
  const amount = update.vehicleMaintenanceAmount;
  const revision = update.vehicleMaintenanceRevision;
  delete update.vehicleMaintenanceAmount;
  delete update.vehicleMaintenanceRevision;
  if (actor.type !== 'vehicle' || changedName !== 'vehicleMaintenanceAmount') return;
  if (!actor.isOwner && !isGM) throw Error(localize('Forbidden'));
  const view = vehicleMaintenance(actor);
  if (revision !== view.revision) throw Error(localize('Stale'));
  if (!valid(amount) || Number(amount) > 1e12) throw Error(localize('Invalid'));
  const state = actor.flags?.starwarsffg?.vehicleMaintenance ?? {};
  update['flags.starwarsffg.vehicleMaintenance'] = {
    ...state, adjustment: money(Number(amount) - view.accrued), revision: (Number(state.revision) || 0) + 1
  };
}
