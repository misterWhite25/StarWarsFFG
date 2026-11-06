/** Restore editable portraits for the legacy templates hosted by V2 sheets. */
export function activateSheetPortrait(sheet) {
  activateAdversaryImagePreview(sheet);
  for (const image of sheet.element.querySelectorAll('img[data-edit="img"]')) {
    if (!sheet.isEditable) continue;
    image.style.cursor = 'pointer';
    image.addEventListener('click', async event => {
      event.preventDefault();
      event.stopPropagation();
      if (!sheet.isEditable) return;
      const picker = new foundry.applications.apps.FilePicker.implementation({
        type: 'image',
        current: sheet.document.img,
        document: sheet.document,
        callback: async path => {
          if (sheet.isEditable) await sheet.document.update({img: path});
        },
        position: {top: sheet.position.top + 40, left: sheet.position.left + 10},
      });
      await picker.browse();
    });
  }
}

/** View equipment art without entering the image editor or changing the item. */
export function activateEquipmentImagePreview(sheet) {
  if (!["gear", "weapon", "armour"].includes(sheet.document.type)) return;
  for (const image of sheet.element.querySelectorAll('img[data-edit="img"]')) {
    if (image.closest('.ffg-equipment-portrait')) continue;
    const wrapper = document.createElement('div');
    wrapper.className = 'ffg-equipment-portrait';
    image.before(wrapper);
    wrapper.append(image);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ffg-equipment-image-preview';
    const label = game.i18n.localize('SWFFG.ViewEquipmentImage');
    button.title = label;
    button.setAttribute('aria-label', label);
    const icon = document.createElement('i');
    icon.className = 'fa-solid fa-magnifying-glass-plus';
    icon.setAttribute('aria-hidden', 'true');
    button.append(icon);
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      new foundry.applications.apps.ImagePopout({
        src: sheet.document.img,
        uuid: sheet.document.uuid,
        window: {title: sheet.document.name},
      }).render({force: true});
    });
    wrapper.append(button);
  }
}

/** Open equipment art directly from an actor's inventory, including read-only sheets. */
export function activateInventoryImagePreview(sheet) {
  for (const row of sheet.element.querySelectorAll('.items-list > .item[data-item-id]')) {
    const item = sheet.actor.items.get(row.dataset.itemId);
    if (!item || !['weapon', 'armour', 'gear'].includes(item.type) || !item.img) continue;
    const name = row.querySelector('.item-name > .hover');
    if (!name || name.querySelector('.ffg-inventory-image-preview')) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ffg-inventory-image-preview';
    button.title = game.i18n.localize('SWFFG.ViewEquipmentImage');
    button.setAttribute('aria-label', `${button.title} : ${item.name}`);
    const icon = document.createElement('i');
    icon.className = 'fa-solid fa-magnifying-glass-plus';
    icon.setAttribute('aria-hidden', 'true');
    button.append(icon);
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      new foundry.applications.apps.ImagePopout({
        src: item.img,
        uuid: item.uuid,
        window: {title: item.name},
      }).render({force: true});
    });
    // A double click on the loupe must not open the item editor.
    button.addEventListener('dblclick', event => event.stopPropagation());
    name.append(button);
  }
}

/** View actor and item artwork directly from a visible compendium index. */
export function renderCompendiumImagePreviews(app, html) {
  const pack = app.collection;
  const root = html?.querySelectorAll ? html : html?.[0];
  if (!root || pack?.visible !== true || !['Actor', 'Item'].includes(pack.documentName)) return;
  for (const row of root.querySelectorAll('.directory-item.document[data-entry-id]')) {
    if (row.querySelector('.ffg-compendium-image-preview')) continue;
    const entry = pack.index.get(row.dataset.entryId);
    if (!entry?.img) continue;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ffg-compendium-image-preview';
    const label = `${game.i18n.localize('SWFFG.ViewEquipmentImage')} : ${entry.name}`;
    button.title = label;
    button.setAttribute('aria-label', label);
    const icon = document.createElement('i');
    icon.className = 'fa-solid fa-magnifying-glass-plus';
    icon.setAttribute('aria-hidden', 'true');
    button.append(icon);
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      // Read the current index entry: no import, unlock, or document update.
      const current = pack.index.get(row.dataset.entryId);
      if (!pack.visible || !current?.img) return;
      new foundry.applications.apps.ImagePopout({
        src: current.img,
        window: {title: current.name},
      }).render({force: true});
    });
    button.addEventListener('dblclick', event => {
      event.preventDefault();
      event.stopPropagation();
    });
    row.append(button);
  }
}

/** Magnify actor artwork, including vehicles and locked compendium sheets. */
export function activateAdversaryImagePreview(sheet) {
  if (!['character', 'minion', 'rival', 'nemesis', 'vehicle'].includes(sheet.document?.type)) return;
  for (const image of sheet.element.querySelectorAll('img[data-edit="img"]')) {
    const block = image.closest('.profile-block');
    if (!block || block.querySelector('.ffg-adversary-image-preview') || !sheet.document.img) continue;
    block.classList.add('ffg-adversary-portrait');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ffg-adversary-image-preview';
    button.title = game.i18n.localize('SWFFG.ViewEquipmentImage');
    button.setAttribute('aria-label', `${button.title} : ${sheet.document.name}`);
    const icon = document.createElement('i');
    icon.className = 'fa-solid fa-magnifying-glass-plus';
    icon.setAttribute('aria-hidden', 'true');
    button.append(icon);
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      if (!sheet.document.img) return;
      new foundry.applications.apps.ImagePopout({
        src: sheet.document.img,
        uuid: sheet.document.uuid,
        window: {title: sheet.document.name},
      }).render({force: true});
    });
    button.addEventListener('dblclick', event => {
      event.preventDefault();
      event.stopPropagation();
    });
    image.after(button);
  }
}
