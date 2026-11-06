// The voyage flag remains the single stock ledger, shared with the travel module.
export const CONSUMABLE_SCOPE = 'swffg-compendium-bilingual-steelers-core_rule';
const voyagePath = 'flags.' + CONSUMABLE_SCOPE + '.voyageResources';
const round = n => Math.round(n * 1e6) / 1e6;
const format = n => Number(n).toLocaleString('fr-FR', {maximumFractionDigits: 2});
const finite = n => n !== '' && n !== null && n !== undefined && Number.isFinite(Number(n)) && Number(n) >= 0;

const aliases = {h:'hours',heure:'hours',heures:'hours',hour:'hours',j:'days',jour:'days',jours:'days',day:'days',semaine:'weeks',semaines:'weeks',week:'weeks',mois:'months',month:'months',an:'years',ans:'years',annee:'years',annees:'years',year:'years'};
const labels = {days:'Jours', months:'Mois', hours:'Heures', weeks:'Semaines', years:'Années'};

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
  const units = ['days','months',...(!['days','months'].includes(unit)?[unit]:[])].map(value=>({value,label:labels[value]??capacity.duration,selected:value===unit}));
  const hoursPerUnit = factors[unit];
  return {units, unitLabel:labels[unit]??capacity.duration, hoursPerUnit, maxAmount:capacity.value,
    currentAmount:current===null||!Number.isFinite(hoursPerUnit)?null:round(current/hoursPerUnit),
    revision:stock.revision??0,
    capacityText:maxHours===null?'Unité à préciser':`${format(maxHours/24)} jours · ${format(maxHours)} h`,
    currentText:current===null?'Réserve à initialiser':`${format(current/24)} jours · ${format(current)} h`,
    overCapacity:current!==null && maxHours!==null && current>maxHours};
}

/** Only an explicit stock edit updates the ledger; unrelated form edits leave it intact. */
export function applyConsumableStockEdit(actor, update, {changedName,isGM}={}) {
  const amount = update.vehicleConsumablesAmount;
  const revision = update.vehicleConsumablesRevision;
  delete update.vehicleConsumablesAmount;
  delete update.vehicleConsumablesRevision;
  if(actor.type!=='vehicle'||changedName!=='vehicleConsumablesAmount')return;
  if(!isGM)throw Error('Seul le MJ peut modifier les réserves de voyage.');
  const current = actor.flags?.[CONSUMABLE_SCOPE]?.voyageResources ?? {};
  if(Number(revision)!==Number(current.revision??0))throw Error('Les réserves ont changé. Actualise la fiche avant de les modifier.');
  const view = vehicleConsumables(actor);
  if(!finite(amount)||!Number.isFinite(view.hoursPerUnit))throw Error('La réserve doit être un nombre positif ou nul dans l’unité du vaisseau.');
  if(Number(amount)>Number(view.maxAmount))throw Error('La réserve actuelle dépasse la capacité maximale du vaisseau.');
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
  if(!finite(max))throw Error('La capacité de carburant doit être positive ou nulle.');
  if(changedName!=='vehicleFuelCurrent'){
    if(update['flags.starwarsffg.fuelCapacity']!==undefined&&view.current!==null&&Number(max)<view.current)throw Error('La capacité de carburant ne peut pas être inférieure au stock actuel.');
    return;
  }
  if(!isGM)throw Error('Seul le MJ peut modifier les réserves de voyage.');
  if(Number(revision)!==Number(view.revision))throw Error('Les réserves ont changé. Actualise la fiche avant de les modifier.');
  if(!finite(fuel)||Number(fuel)>Number(max))throw Error('Le carburant doit être compris entre zéro et la capacité maximale.');
  update[voyagePath + '.resources.fuel'] = round(Number(fuel));
  update[voyagePath + '.revision'] = Number(view.revision) + 1;
}
