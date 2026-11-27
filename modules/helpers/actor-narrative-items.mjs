import {compendiumIndexLoader} from './compendium-index-loader.mjs';

const tr = key => game.i18n.localize('SWFFG.UI.Actor.' + key);
const localize = key => game.i18n.localize(key);
const labels = {
  motivation: ['AddMotivation', 'MotivationSource', 'WizardMotivationNotFound'],
  obligation: ['AddObligation', 'ObligationSource', 'WizardObligationNotFound'],
};

function field(doc, labelText, input) {
  const row = doc.createElement('label');
  row.className = 'ffg-narrative-field';
  const caption = doc.createElement('span');
  caption.textContent = localize(labelText);
  row.append(caption, input);
  return row;
}

function option(doc, label, value) {
  const entry = doc.createElement('option');
  entry.value = value;
  entry.textContent = label;
  return entry;
}

async function catalogueSources(itemType) {
  const readable = doc => doc.testUserPermission(game.user, 'OBSERVER');
  const world = game.items.filter(item => item.type === itemType && readable(item));
  const configured = game.settings.get('starwarsffg', itemType + 'Compendiums').split(',')
    .map(key => game.packs.get(key.trim())).filter(Boolean);
  const packs = [...new Set([...configured, ...game.packs])]
    .filter(pack => pack.documentName === 'Item' && readable(pack));
  const indexes = await compendiumIndexLoader.load(packs, ['type']);
  const sources = [{label: tr('MotivationWorldItems'), entries: world.map(({name, uuid}) => ({name, uuid}))}];
  for (const {pack, index} of indexes) {
    const entries = Array.from(index).filter(item => item.type === itemType).map(item => ({
      name: item.name, uuid: pack.getUuid(item._id)
    }));
    if (entries.length) sources.push({label: pack.title, entries});
  }
  return sources.filter(source => source.entries.length);
}

function createDescription(doc, text) {
  if (!text.trim()) return '';
  const paragraph = doc.createElement('p');
  for (const [index, line] of text.trim().split(/\r?\n/).entries()) {
    if (index) paragraph.append(doc.createElement('br'));
    paragraph.append(doc.createTextNode(line));
  }
  return paragraph.outerHTML;
}

function motivationFields(doc, collator) {
  const type = doc.createElement('input');
  type.type = 'text';
  type.name = 'motivationType';
  const choices = doc.createElement('datalist');
  choices.id = 'ffg-motivation-types-' + foundry.utils.randomID();
  type.setAttribute('list', choices.id);
  const types = Object.values(CONFIG.FFG.characterCreator.motivationTypes);
  types.sort((a, b) => collator.compare(localize(a.label), localize(b.label)));
  for (const entry of types) choices.append(option(doc, localize(entry.label), localize(entry.label)));
  return {
    fields: [field(doc, 'SWFFG.MotivationType', type), choices],
    read(form) {
      const value = form.elements.motivationType.value.trim();
      return {type: types.find(entry => localize(entry.label) === value)?.value ?? value};
    },
  };
}

function obligationFields(doc) {
  const {obligationTypes, obligationSubTypes} = CONFIG.FFG.characterCreator;
  const type = doc.createElement('select');
  type.name = 'obligationType';
  for (const entry of Object.values(obligationTypes)) {
    const choice = option(doc, localize(entry.label), entry.value);
    choice.defaultSelected = entry.value === 'obligation';
    type.append(choice);
  }
  const subtype = doc.createElement('select');
  subtype.name = 'obligationSubtype';
  for (const entry of Object.values(obligationSubTypes)) subtype.append(option(doc, localize(entry.label), entry.value));
  const magnitude = doc.createElement('input');
  magnitude.name = 'obligationMagnitude';
  magnitude.type = 'number';
  magnitude.min = '0';
  magnitude.step = '1';
  magnitude.defaultValue = '0';
  magnitude.required = true;
  const magnitudeField = field(doc, 'SWFFG.CharacterCreator.Obligation.Magnitude', magnitude);
  const subtypeField = field(doc, 'SWFFG.CharacterCreator.Obligation.SubType', subtype);
  return {
    fields: [field(doc, 'SWFFG.CharacterCreator.Obligation.Label', type), magnitudeField, subtypeField],
    activate(fieldset) {
      const {obligationType, obligationSubtype, obligationMagnitude} = fieldset.elements;
      const update = () => {
        const morality = obligationType.value === 'morality';
        obligationSubtype.closest('label').hidden = obligationSubtype.disabled = !morality;
        obligationMagnitude.closest('label').hidden = obligationMagnitude.disabled = morality;
      };
      update();
      obligationType.addEventListener('change', update);
    },
    read(form) {
      const kind = form.elements.obligationType.value;
      if (kind === 'morality') return {type: kind, subtype: form.elements.obligationSubtype.value};
      const magnitude = form.elements.obligationMagnitude.valueAsNumber;
      if (!Number.isSafeInteger(magnitude) || magnitude < 0) throw Error(tr('InvalidNarrativeMagnitude'));
      return {type: kind, magnitude};
    },
  };
}

export async function addActorNarrativeItem(sheet, itemType) {
  const actor = sheet.actor;
  if (!sheet.isEditable || !actor.isOwner) return;
  const [title, sourceLabel, notFound] = labels[itemType];
  const sources = await catalogueSources(itemType);
  if (!sheet.rendered || !sheet.isEditable || !actor.isOwner) return;

  const doc = sheet.element.ownerDocument;
  const content = doc.createElement('div');
  const source = doc.createElement('select');
  source.name = itemType + 'Source';
  source.append(option(doc, tr('MotivationManual'), ''));
  const collator = new Intl.Collator(game.i18n.lang);
  for (const {label, entries} of sources) {
    const group = doc.createElement('optgroup');
    group.label = label;
    entries.sort((a, b) => collator.compare(a.name, b.name));
    for (const entry of entries) group.append(option(doc, entry.name, entry.uuid));
    source.append(group);
  }
  if (sources.length) content.append(field(doc, 'SWFFG.UI.Actor.' + sourceLabel, source));

  const manual = doc.createElement('fieldset');
  manual.className = 'ffg-narrative-manual';
  const name = doc.createElement('input');
  name.type = 'text';
  name.name = itemType + 'Name';
  name.required = true;
  const description = doc.createElement('textarea');
  description.name = itemType + 'Description';
  description.rows = 5;
  const details = itemType === 'obligation' ? obligationFields(doc) : motivationFields(doc, collator);
  manual.append(field(doc, 'SWFFG.Name', name), ...details.fields, field(doc, 'SWFFG.MotivationDescription', description));
  content.append(manual);

  const status = doc.createElement('p');
  status.className = 'ffg-narrative-error';
  status.setAttribute('role', 'alert');
  status.hidden = true;
  content.append(status);

  class NarrativeDialog extends foundry.applications.api.DialogV2 {
    async _onSubmit(target, event) {
      try {
        return await super._onSubmit(target, event);
      } catch (error) {
        const message = this.element.querySelector('.ffg-narrative-error');
        message.textContent = error.message;
        message.hidden = false;
        for (const button of this.element.querySelectorAll('.form-footer button')) button.disabled = false;
      }
    }
  }

  await NarrativeDialog.wait({
    classes: ['starwarsffg', 'themed', 'ffg-narrative-dialog', 'ffg-' + itemType + '-dialog'],
    window: {title: tr(title)},
    position: {width: Math.min(520, doc.defaultView.innerWidth - 24)},
    renderOptions: sheet.window?.windowId ? {window: {windowId: sheet.window.windowId}} : {},
    content,
    render: (_event, dialog) => {
      const picker = dialog.element.querySelector('[name="' + source.name + '"]');
      const fields = dialog.element.querySelector('.ffg-narrative-manual');
      const error = dialog.element.querySelector('.ffg-narrative-error');
      details.activate?.(fields);
      picker?.addEventListener('change', () => {
        fields.hidden = fields.disabled = Boolean(picker.value);
        error.hidden = true;
      });
    },
    buttons: [{
      action: 'add', label: tr(title),
      callback: async (_event, button) => {
        const form = button.form;
        const uuid = form.elements[source.name]?.value;
        let item;
        if (uuid) {
          const original = await fromUuid(uuid);
          if (original?.type !== itemType || !original.testUserPermission(game.user, 'OBSERVER')) {
            throw Error(tr(notFound));
          }
          item = original.toObject();
          delete item._id;
          delete item.folder;
          if (original.pack) item._stats = {compendiumSource: original.uuid};
        } else {
          const enteredName = form.elements[name.name].value.trim();
          if (!enteredName) throw Error(tr('NarrativeNameRequired'));
          item = {
            name: enteredName, type: itemType,
            system: {...details.read(form), description: createDescription(doc, form.elements[description.name].value)}
          };
        }
        if (!sheet.isEditable || !actor.isOwner) return;
        await actor.createEmbeddedDocuments('Item', [item]);
      }
    }, {action: 'cancel', label: localize('SWFFG.Cancel')}]
  });
}
