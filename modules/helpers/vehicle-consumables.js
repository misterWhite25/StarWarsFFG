// The voyage flag remains the single stock ledger, shared with the travel module.
export const CONSUMABLE_SCOPE = 'swffg-compendium-bilingual-steelers-core_rule';
const voyagePath = 'flags.' + CONSUMABLE_SCOPE + '.voyageResources';
const round = n => Math.round(n * 1e6) / 1e6;
const format = n => Number(n).toLocaleString(game.i18n.lang, {maximumFractionDigits: 2});
const finite = n => n !== '' && n !== null && n !== undefined && Number.isFinite(Number(n)) && Number(n) >= 0;

const aliases = {h:'hours',heure:'hours',heures:'hours',hour:'hours',j:'days',jour:'days',jours:'days',day:'days',semaine:'weeks',semaines:'weeks',week:'weeks',mois:'months',month:'months',an:'years',ans:'years',annee:'years',annees:'years',year:'years'};
const labels = {days:"SWFFG.UI.Vehicle.Days", months:"SWFFG.UI.Vehicle.Months", hours:"SWFFG.UI.Vehicle.Hours", weeks:"SWFFG.UI.Vehicle.Weeks", years:"SWFFG.UI.Vehicle.Years"};

export function vehicleConsumables(actor) {
  const stock = actor.flags?.[CONSUMABLE_SCOPE]?.voyageResources ?? {};
  const capacity = actor.system?.stats?.consumables ?? {};
  const settings = globalThis.game?.settings;
  const campaign = settings?.settings?.has(CONSUMABLE_SCOPE + '.voyageRates')
    ? settings.get(CONSUMABLE_SCOPE, 'voyageRates')?.rates : undefined;
  const month = Number(campaign?.daysPerMonth ?? stock.rates?.daysPerMonth ?? 30);
  const year = Number(campaign?.daysPerYear ?? stock.rates?.daysPerYear ?? 365);
  const factors = {hours:1, days:24, weeks:168, months:24*month, years:24*year};
  const raw = String(capacity.duration ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const unit = aliases[raw] ?? raw;
  const maxHours = finite(capacity.value) && Number.isFinite(factors[unit]) ? round(Number(capacity.value)*factors[unit]) : null;
  const current = finite(stock.resources?.hours) ? Number(stock.resources.hours) : null;
  const units = ['days','months',...(!['days','months'].includes(unit)?[unit]:[])].map(value=>({value,label:labels[value]?game.i18n.localize(labels[value]):capacity.duration,selected:value===unit}));
  const hoursPerUnit = factors[unit];
  return {units, unitLabel:labels[unit]?game.i18n.localize(labels[unit]):capacity.duration, hoursPerUnit, maxAmount:capacity.value,
    currentAmount:current===null||!Number.isFinite(hoursPerUnit)?null:round(current/hoursPerUnit),
    revision:stock.revision??0,
    capacityText:maxHours===null?game.i18n.localize("SWFFG.UI.Vehicle.UnitRequired"):game.i18n.format("SWFFG.UI.Vehicle.ConsumableAmount",{days:format(maxHours/24),hours:format(maxHours)}),
    currentText:current===null?'':game.i18n.format("SWFFG.UI.Vehicle.ConsumableAmount",{days:format(current/24),hours:format(current)}),
    overCapacity:current!==null && maxHours!==null && current>maxHours};
}

/** Only an explicit stock edit updates the ledger; unrelated form edits leave it intact. */
export function applyConsumableStockEdit(actor, update, {changedName,isGM}={}) {
  const amount = update.vehicleConsumablesAmount;
  const revision = update.vehicleConsumablesRevision;
  delete update.vehicleConsumablesAmount;
  delete update.vehicleConsumablesRevision;
  if(actor.type!=='vehicle'||changedName!=='vehicleConsumablesAmount')return;
  if(!isGM)throw Error(game.i18n.localize("SWFFG.UI.Vehicle.GMOnlyTravelReserve"));
  const current = actor.flags?.[CONSUMABLE_SCOPE]?.voyageResources ?? {};
  if(Number(revision)!==Number(current.revision??0))throw Error(game.i18n.localize("SWFFG.UI.Vehicle.TravelReserveChanged"));
  const view = vehicleConsumables(actor);
  if(!finite(amount)||!Number.isFinite(view.hoursPerUnit))throw Error(game.i18n.localize("SWFFG.UI.Vehicle.ReserveNonnegative"));
  if(Number(amount)>Number(view.maxAmount))throw Error(game.i18n.localize("SWFFG.UI.Vehicle.ReserveOverCapacity"));
  update[voyagePath + '.resources.hours'] = round(Number(amount) * view.hoursPerUnit);
  update[voyagePath + '.revision'] = Number(current.revision ?? 0) + 1;
}

export function vehicleFuel(actor){
  const state=actor.flags?.[CONSUMABLE_SCOPE]?.voyageResources??{};
  const max=Number(actor.flags?.starwarsffg?.fuelCapacity??50);
  return {max,current:finite(state.resources?.fuel)?Number(state.resources.fuel):null,revision:state.revision??0};
}

export function applyVehicleFuelEdit(actor,update,{changedName,isGM}={}){
  const fuel=update.vehicleFuelCurrent,revision=update.vehicleFuelRevision;
  delete update.vehicleFuelCurrent;delete update.vehicleFuelRevision;
  if(actor.type!=='vehicle')return;
  const view=vehicleFuel(actor);
  const max=update['flags.starwarsffg.fuelCapacity']??view.max;
  if(!finite(max))throw Error(game.i18n.localize("SWFFG.UI.Vehicle.FuelCapacityNonnegative"));
  if(changedName!=='vehicleFuelCurrent'){
    if(update['flags.starwarsffg.fuelCapacity']!==undefined&&view.current!==null&&Number(max)<view.current)throw Error(game.i18n.localize("SWFFG.UI.Vehicle.FuelCapacityBelowStock"));
    return;
  }
  if(!isGM)throw Error(game.i18n.localize("SWFFG.UI.Vehicle.GMOnlyTravelReserve"));
  if(Number(revision)!==Number(view.revision))throw Error(game.i18n.localize("SWFFG.UI.Vehicle.TravelReserveChanged"));
  if(!finite(fuel)||Number(fuel)>Number(max))throw Error(game.i18n.localize("SWFFG.UI.Vehicle.FuelOutsideCapacity"));
  update[voyagePath + '.resources.fuel'] = round(Number(fuel));
  update[voyagePath + '.revision'] = Number(view.revision) + 1;
}
