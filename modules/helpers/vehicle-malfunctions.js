import {collectMalfunctions,malfunctionModifier,repairQuote,buildMalfunction,instantMalfunctionUpdates,vehicleMalfunctionEffects,malfunctionNavigation,ruleFor} from './vehicle-malfunction-engine.js';
export {malfunctionModifier,vehicleMalfunctionEffects,malfunctionNavigation};
const scope = 'starwarsffg';
const flag = 'vehicleMalfunctions';
const voyageScope = 'swffg-compendium-bilingual-steelers-core_rule';
const tableUuid = 'Compendium.' + voyageScope + '.en-tables-steelers.RollTable.0a15c1b507abd55d';
const pending = new Map();
const clone = value => foundry.utils.deepClone(value);
const stored = actor => clone(actor.getFlag(scope, flag) ?? []);
const canWrite = actor => actor?.type === 'vehicle' && actor.isOwner;
const localize = key => game.i18n.localize('SWFFG.VehicleMalfunctions.' + key);
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);

const bilingual = (fr, en) => game.i18n.lang === 'fr' ? fr : en;
const formatNumber = value => Number(value).toLocaleString(game.i18n.lang, {maximumFractionDigits: 2});
function repairLabel(quote) {
  return quote.total === null ? bilingual('À chiffrer', 'To be priced') :
    formatNumber(quote.total) + bilingual(' crédits', ' credits');
}

export function isMalfunctionTable(table) {
  const id = '0a15c1b507abd55d';
  return table.id === id || String(table._stats?.compendiumSource ?? '').endsWith(id) ||
    Object.values(table.flags ?? {}).some(value => value?.key === 'reference.tables.' + id);
}

async function selectMalfunctionTarget(actor, result) {
  const rule = ruleFor({resultId: result.id ?? result._id});
  if (!rule.target) return {};
  const shields = actor.system?.stats?.shields ?? {};
  const disabledWeapons = rule.target === 'weapon' ? malfunctionNavigation(actor).disabledWeapons : [];
  const choices = rule.target === 'shield'
    ? Object.entries({fore: 'Avant', aft: 'Arrière', port: 'Bâbord', starboard: 'Tribord'})
      .filter(([arc]) => Number(shields[arc]) > 0)
    : Array.from(actor.items ?? []).filter(item =>
      rule.target === 'weapon' ? item.type === 'shipweapon' && !disabledWeapons.includes(item.id) : !['criticaldamage', 'criticalinjury'].includes(item.type))
      .map(item => [item.id, item.name]);
  if (!choices.length) throw Error(bilingual('Aucune cible applicable pour cette avarie.', 'No applicable target for this malfunction.'));
  const selected = choices.length === 1 ? choices[0][0] : await foundry.applications.api.DialogV2.prompt({
    window: {title: result.name}, classes: ['starwarsffg', 'themed'],
    content: '<label>' + bilingual('Système concerné', 'Affected system') + '<select name="target">' +
      choices.map(([id, name]) => '<option value="' + escape(id) + '">' + escape(name) + '</option>').join('') + '</select></label>',
    ok: {label: bilingual('Choisir', 'Choose'), callback: (_event, button) => button.form.elements.target.value},
    rejectClose: false
  });
  if (!selected) throw Error(bilingual('Tirage annulé.', 'Roll cancelled.'));
  return rule.target === 'shield' ? {arc: selected} : {target: actor.items.get(selected)};
}

function applicableResult(actor, result) {
  const rule = ruleFor({resultId: result.id});
  if(rule.target==='equipment'&&!Array.from(actor.items??[]).some(item=>!['criticaldamage','criticalinjury'].includes(item.type)))return false;
  if (rule.requires === 'shield') return ['fore', 'aft', 'port', 'starboard']
    .some(arc => Number(actor.system?.stats?.shields?.[arc]) > 0);
  if (rule.requires === 'weapon' || rule.target === 'weapon') {
    const {disabledWeapons} = malfunctionNavigation(actor);
    return Array.from(actor.items ?? []).some(item => item.type === 'shipweapon' && !disabledWeapons.includes(item.id));
  }
  return true;
}

export async function drawVehicleMalfunction(actor, {table: selectedTable = null, adjustment = 0} = {}) {
  if (!canWrite(actor)) throw Error(localize('Forbidden'));
  const table = selectedTable ?? await fromUuid(tableUuid);
  if (!table) throw Error(localize('TableMissing'));
  if (!Number.isSafeInteger(adjustment) || Math.abs(adjustment) > 10000) throw Error(localize('InvalidRoll'));
  const modifiers = malfunctionModifier(actor);
  for (let attempt = 0; attempt < 20; attempt++) {
    const roll = await new Roll('max(1, 1d100 + @modifier)', {modifier: modifiers.total + adjustment}).evaluate();
    const result = table.getResultsForRoll(roll.total)[0];
    if (!result) throw Error(bilingual('Aucun résultat pour ce total.', 'No result for this total.'));
    if (!applicableResult(actor, result)) continue;
    const target = await selectMalfunctionTarget(actor, result);
    const record = buildMalfunction(actor, result, {total: roll.total, ...target});
    if (record.mechanics.timer) {
      const timer = await new Roll(record.mechanics.timer).evaluate();
      record.timer = {formula: record.mechanics.timer, total: timer.total, unit: record.mechanics.unit};
      record.description += '<p>' + record.mechanics.timer + ' = ' + timer.total + ' ' + record.mechanics.unit + '</p>';
    }
    return {
      ...record, table: table.name, tableUuid: table.uuid, formula: roll.formula,
      roll: roll.toJSON(), modifiers: {...modifiers, adjustment}, actorUpdates: instantMalfunctionUpdates(actor, record),
      text: record.description.replace(/<[^>]*>/g, ' ')
    };
  }
  throw Error(bilingual('Aucune avarie applicable après les nouveaux tirages.', 'No applicable malfunction after rerolling.'));
}

export async function rollAndRecordMalfunction(actor, options = {}) {
  const record = await drawVehicleMalfunction(actor, options);
  if (!record.unresolved) {
    const entry = {...record, id: foundry.utils.randomID(), when: new Date().toISOString(), source: 'table'};
    await mutate(actor, entries => [...entries, entry], {instant: entry});
  }
  const content = '<h3>' + escape(record.title) + '</h3>' + record.description +
    '<p>' + bilingual('Réparation', 'Repair') + ' : ' + escape(repairLabel(record.repair)) + '</p>';
  try { await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({actor}), content, rolls: [Roll.fromData(record.roll)],
    flavor: bilingual('Avarie', 'Malfunction') + ' - ' + actor.name
  }); } catch { ui.notifications.warn(bilingual('Avarie enregistrée sur le vaisseau. Publication dans le chat impossible.','Malfunction saved on the vehicle. Could not publish to chat.')); }
  return record;
}

export async function promptVehicleMalfunction(table) {
  const ships = Array.from(game.actors ?? []).filter(canWrite).sort((a, b) => a.name.localeCompare(b.name));
  if (!ships.length) return ui.notifications.warn(bilingual('Aucun véhicule modifiable.', 'No editable vehicle.'));
  const choice = await foundry.applications.api.DialogV2.prompt({
    window: {title: bilingual('Jet d’avarie du vaisseau', 'Vehicle malfunction check')},
    classes: ['starwarsffg', 'themed'], position: {width: 560},
    content: '<p>' + bilingual('Le modificateur inclut les dégâts de coque, le stress mécanique, les avaries actives et les dégâts critiques.',
      'The modifier includes hull trauma, system strain, active malfunctions and critical damage.') + '</p><label>' +
      bilingual('Vaisseau', 'Vehicle') + '<select name="ship">' + ships.map(ship => '<option value="' + escape(ship.id) + '">' +
        escape(ship.name) + ' (+' + malfunctionModifier(ship).total + ')</option>').join('') + '</select></label><label>' +
      bilingual('Ajustement du MJ', 'GM adjustment') + '<input name="adjustment" type="number" step="1" min="-10000" max="10000" value="0"></label>',
    ok: {label: bilingual('Lancer', 'Roll'), callback: (_event, button) => ({
      ship: button.form.elements.ship.value, adjustment: Number(button.form.elements.adjustment.value)
    })},
    rejectClose: false
  });
  if (!choice) return;
  return rollAndRecordMalfunction(game.actors.get(choice.ship), {table, adjustment: choice.adjustment});
}

export const collectVehicleMalfunctions = collectMalfunctions;

export async function prepareVehicleMalfunctions(actor) {
  const editor = foundry.applications.ux.TextEditor.implementation;
  return Promise.all(collectVehicleMalfunctions(actor).map(async entry => ({
    ...entry,
    totalLabel: entry.total ?? '',
    repairLabel: repairLabel(entry.repair??repairQuote(actor,ruleFor(entry),actor.items?.get(ruleFor(entry).targetId))),
    descriptionHTML: await editor.enrichHTML(entry.description + (entry.targetName?'<p><em>'+bilingual('Cible','Target')+' : '+escape(({fore:'Avant',aft:'Arrière',port:'Bâbord',starboard:'Tribord'})[entry.targetName]??entry.targetName)+'</em></p>':''), {
      secrets: actor.isOwner, relativeTo: actor
    })
  })));
}

async function mutate(actor, change, {instant = null} = {}) {
  if (!canWrite(actor)) throw Error(localize('Forbidden'));
  const previous = pending.get(actor.uuid) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(async () => {
    if (!canWrite(actor)) throw Error(localize('Forbidden'));
    const before = stored(actor);
    const after = change(before);
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      const updates=instant?instantMalfunctionUpdates(actor,instant):{};
      if(Object.keys(updates).length) await actor.update({...updates,['flags.'+scope+'.'+flag]:after});
      else await actor.setFlag(scope, flag, after);
    }
  });
  pending.set(actor.uuid, next);
  try { await next; }
  finally { if (pending.get(actor.uuid) === next) pending.delete(actor.uuid); }
}

export async function addVehicleMalfunction(actor, table, result, total = '') {
  if (!result?.id || !table?.results?.has(result.id)) throw Error(localize('ChooseResult'));
  const rolled = total === '' ? null : Number(total);
  if (rolled !== null && (!Number.isSafeInteger(rolled) || rolled < 1 || rolled > 1000000)) {
    throw Error(localize('InvalidRoll'));
  }
  const selection = await selectMalfunctionTarget(actor, result);
  const record = buildMalfunction(actor, result, {total: rolled, ...selection});
  if(record.unresolved) throw Error("Cette plage ne définit aucune avarie. Choisis un résultat avec le MJ.");
  const entry = {...record, id: foundry.utils.randomID(), when: new Date().toISOString(), source: "table", tableUuid: table.uuid};
  await mutate(actor, entries => [...entries, entry], {instant: entry});
}

export async function removeVehicleMalfunction(actor, id, expected) {
  await mutate(actor, entries => {
    const current = collectVehicleMalfunctions(actor).find(entry => entry.id === id);
    if (!current || JSON.stringify(current) !== expected) throw Error(localize('Stale'));
    // Keep a marker so a repaired voyage malfunction cannot reappear from its receipt.
    const target=Array.from(actor.items??[]).find(item=>item.id===ruleFor(current).targetId);
    return [...entries.filter(entry => entry.id !== id), {...current,repair:current.repair??repairQuote(actor,ruleFor(current),target),deleted:true}];
  });
}

async function chooseMalfunction(sheet) {
  const table = await fromUuid(tableUuid);
  if (!table) throw Error(localize('TableMissing'));
  const results = [...table.results].sort((a, b) => a.range[0] - b.range[0]);
  const content = '<div class="vehicle-malfunction-editor"><label>' + localize('Result') +
    '<select name="result"><option value="">' + localize('ChooseResult') + '</option>' +
    results.map(result => '<option value="' + escape(result.id) + '">' +
      escape(result.range.join('-') + ' · ' + result.name) + '</option>').join('') +
    '</select></label><label>' + localize('RollOptional') +
    '<input name="total" type="number" min="1" max="1000000" step="1"></label>' +
    '<p class="malfunction-error" role="alert"></p></div>';
  const dialog = new foundry.applications.api.DialogV2({
    window: {title: localize('Add')}, classes: ['starwarsffg', 'themed'],
    position: {width: 550}, content,
    buttons: [{
      action: 'save', label: localize('Add'), default: true,
      callback: async (_event, _button, app) => {
        try {
          const id = app.element.querySelector('[name="result"]').value;
          await addVehicleMalfunction(sheet.actor, table, table.results.get(id),
            app.element.querySelector('[name="total"]').value);
        } catch (error) {
          app.element.querySelector('.malfunction-error').textContent = error.message;
          throw error;
        }
      }
    }, {action: 'cancel', label: localize('Cancel')}],
    rejectClose: false
  });
  await dialog.render({force: true});
}

export async function vehicleMalfunctionAction(event, control) {
  event.preventDefault();
  const sheet = this;
  if (!sheet.isEditable || !canWrite(sheet.actor)) return;
  try {
    if (control.dataset.malfunctionAction === 'roll') {
      if(control.dataset.rolling)return;
      control.dataset.rolling='true';
      try { return await rollAndRecordMalfunction(sheet.actor); }
      finally { delete control.dataset.rolling; }
    }
    if (control.dataset.malfunctionAction === 'add') return await chooseMalfunction(sheet);
    const id = control.closest('[data-malfunction-id]')?.dataset.malfunctionId;
    const entry = collectVehicleMalfunctions(sheet.actor).find(row => row.id === id);
    if (!entry) throw Error(localize('Stale'));
    const expected = JSON.stringify(entry);
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: {title: localize('Remove')},
      content: '<p>' + escape(localize('RemoveConfirm')) + '</p>'
    });
    if (confirmed) await removeVehicleMalfunction(sheet.actor, id, expected);
  } catch (error) { ui.notifications.error(error.message); }
}

if(globalThis.Hooks) Hooks.once('ready',()=>{
  game.starwarsffg??={};
  game.starwarsffg.malfunctions={draw:drawVehicleMalfunction,navigation:malfunctionNavigation,prompt:promptVehicleMalfunction};
});
