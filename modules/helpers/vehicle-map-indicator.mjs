function markVehicleMaps(root) {
  if (!root?.querySelectorAll) return;
  for (const row of root.querySelectorAll('li.directory-item.document[data-entry-id]')) {
    const actor = game.actors.get(row.dataset.entryId);
    const name = row.querySelector(':scope > .entry-name');
    const existing = name?.querySelector('.ffg-vehicle-map-indicator');
    if (actor?.type !== 'vehicle' || !actor.getFlag('starwarsffg', 'vehicleDeck')?.enabled || !String(actor.getFlag('starwarsffg', 'vehicleDeck')?.image ?? '').trim()) {
      existing?.remove();
      continue;
    }
    if (!name || existing) continue;
    const badge = document.createElement('span');
    badge.className = 'ffg-vehicle-map-indicator';
    badge.title = badge.dataset.tooltip = game.i18n.localize("SWFFG.UI.Vehicle.MapMode");
    badge.setAttribute('role', 'img');
    badge.setAttribute('aria-label', game.i18n.localize("SWFFG.UI.Vehicle.MapMode"));
    const icon = document.createElement('i');
    icon.className = 'fa-solid fa-map';
    icon.setAttribute('aria-hidden', 'true');
    badge.append(icon);
    name.append(badge);
  }
}

function refresh() {
  for (const directory of [ui.vehicles, ui.vehicles?.popout, ui.actors, ui.actors?.popout]) {
    markVehicleMaps(directory?.element);
  }
}

Hooks.once('init', () => {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('../../styles/vehicle-map-indicator.css', import.meta.url).href;
  document.head.append(link);
});
Hooks.once('ready', refresh);
for (const hook of ['renderVehicleDirectory', 'renderActorDirectory']) {
  Hooks.on(hook, app => markVehicleMaps(app.element));
}
Hooks.on('updateActor', actor => {
  if (actor.type === 'vehicle') refresh();
});
