/** Personal staging area. Documents, ownership, sorting and folder ancestry stay native. */
const SYSTEM = 'starwarsffg';
const SETTING = 'enableSceneStorage';
const FLAG = 'sceneStorage';
const layouts = new WeakMap();
let writes = Promise.resolve();
let refreshQueued = false;

const enabled = app => app?.tabName === 'scenes' && game.user.isGM && game.settings.get(SYSTEM, SETTING);
const flat = app => app.element?.classList.contains('ffg-npc-favorites-only');
const mapping = () => game.user.getFlag(SYSTEM, FLAG) ?? {};
const kind = doc => doc?.documentName;

export function isStored(doc, stored = mapping()) {
  const seen = new Set();
  for (let current = doc; current && !seen.has(current.uuid); current = current.folder) {
    seen.add(current.uuid);
    const value = stored[kind(current)]?.[current.id];
    if (typeof value === 'boolean') return value;
  }
  return false;
}

function refresh() {
  if (refreshQueued) return;
  refreshQueued = true;
  queueMicrotask(() => {
    refreshQueued = false;
    // These preferences change presentation only. Keep native search, focus,
    // scrolling and context-menu listeners in place instead of rebuilding the tab.
    for (const app of [ui.scenes, ui.scenes?.popout]) if (app?.rendered) renderSceneStorage(app);
  });
}

export function setStored(doc, value) {
  writes = writes.catch(() => {}).then(async () => {
    if (!game.user.isGM || !game.settings.get(SYSTEM, SETTING)) return;
    if (kind(doc) !== 'Scene' && !(kind(doc) === 'Folder' && doc.type === 'Scene')) return;
    if (doc.pack || (kind(doc) === 'Scene' ? game.scenes.get(doc.id) : game.folders.get(doc.id)) !== doc) return;
    const next = {Scene: {}, Folder: {}};
    const current = mapping();
    for (const type of ['Scene', 'Folder']) {
      const collection = type === 'Scene' ? game.scenes : game.folders;
      for (const [id, state] of Object.entries(current[type] ?? {})) {
        if (typeof state === 'boolean' && collection.has(id)) next[type][id] = state;
      }
    }
    next[kind(doc)][doc.id] = Boolean(value);
    // Updating a folder moves its entire subtree, clearing older local exceptions.
    if (kind(doc) === 'Folder') for (const type of ['Scene', 'Folder']) {
      const collection = type === 'Scene' ? game.scenes : game.folders;
      for (const id of Object.keys(next[type])) {
        let parent = collection.get(id)?.folder;
        const seen = new Set();
        while (parent && !seen.has(parent.id)) {
          if (parent.id === doc.id) { delete next[type][id]; break; }
          seen.add(parent.id); parent = parent.folder;
        }
      }
    }
    const updates = {};
    for (const type of ['Scene', 'Folder']) {
      for (const id of new Set([...Object.keys(current[type] ?? {}), ...Object.keys(next[type])])) {
        const prefix = 'flags.' + SYSTEM + '.' + FLAG + '.' + type + '.';
        if (!Object.hasOwn(next[type], id)) updates[prefix + '-=' + id] = null;
        else if (current[type]?.[id] !== next[type][id]) updates[prefix + id] = next[type][id];
      }
    }
    if (Object.keys(updates).length) await game.user.update(updates);
    refresh();
  }).catch(error => {
    console.error('Star Wars FFG | Scene storage', error);
    ui.notifications.error(game.i18n.localize("SWFFG.UI.Interface.SceneStorageError"));
    throw error;
  });
  return writes;
}

export function sceneStorageMenus(app, folder = false) {
  const resolve = row => folder ? game.folders.get(row?.closest('[data-folder-id]')?.dataset.folderId) : game.scenes.get(row?.closest('[data-entry-id]')?.dataset.entryId);
  return [
    {label: game.i18n.localize("SWFFG.UI.Interface.StoreForLater"), icon: '<i class="fa-solid fa-box-archive"></i>', group: SYSTEM,
      visible: row => enabled(app) && Boolean(resolve(row)) && !isStored(resolve(row)),
      onClick: (_event, row) => setStored(resolve(row), true)},
    {label: game.i18n.localize("SWFFG.UI.Interface.RestoreForSession"), icon: '<i class="fa-solid fa-arrow-up"></i>', group: SYSTEM,
      visible: row => enabled(app) && Boolean(resolve(row)) && isStored(resolve(row)),
      onClick: (_event, row) => setStored(resolve(row), false)}
  ];
}

function restore(app) {
  const previous = layouts.get(app);
  if (!previous) return;
  // A partial render may reuse the list. Restore exact nodes before re-partitioning.
  if (previous.list.isConnected) for (const place of [...previous.places].reverse()) {
    if (place.parent.isConnected) place.parent.insertBefore(place.row, place.next?.parentNode === place.parent ? place.next : null);
  }
  previous.storage.remove(); previous.priority.remove();
  for (const place of previous.places) place.row.querySelector(':scope > .ffg-scene-folder-path')?.remove();
  layouts.delete(app);
}

function folderPath(doc) {
  const names = [], seen = new Set();
  for (let parent = doc.folder; parent && !seen.has(parent.id); parent = parent.folder) {
    names.unshift(parent.name); seen.add(parent.id);
  }
  return names.join(' / ');
}

function openStorage(app) {
  const layout = layouts.get(app);
  // Native search is debounced and may finish just after a popout closes.
  if (!layout || !app.element?.isConnected) return;
  const searching = Boolean(app.element.querySelector('input[type=search]')?.value.trim());
  const expanded = searching || game.user.getFlag(SYSTEM, 'sceneStorageExpanded') === true;
  layout.body.hidden = !expanded;
  layout.button.setAttribute('aria-expanded', String(expanded));
  layout.button.querySelector('.ffg-scene-storage-chevron').className = 'ffg-scene-storage-chevron fa-solid ' + (expanded ? 'fa-chevron-down' : 'fa-chevron-right');
}

export function onSceneStorageSearch(app, _query) { openStorage(app); }

export function renderSceneStorage(app) {
  restore(app);
  const root = app.element;
  root?.classList.toggle('ffg-scene-storage-enabled', Boolean(enabled(app) && !flat(app)));
  if (!enabled(app) || flat(app)) return;
  const list = root.querySelector('.directory-list');
  if (!list) return;
  const stored = mapping();
  const rows = [...list.querySelectorAll('li.directory-item')].filter(row => row.matches('[data-entry-id], [data-folder-id]'));
  const places = rows.map(row => ({row, parent: row.parentNode, next: row.nextSibling}));
  const docs = new Map(rows.map(row => [row, row.classList.contains('folder') ? game.folders.get(row.dataset.folderId) : game.scenes.get(row.dataset.entryId)]));
  // The active scene must remain within reach even when its folder is stored.
  const zone = row => { const doc = docs.get(row); return doc?.documentName === 'Scene' && doc.active ? false : Boolean(doc && isStored(doc, stored)); };
  const priorParent = new Map(rows.map(row => [row, row.parentElement.closest('li.folder')]));
  const priority = document.createElement('li');
  priority.className = 'ffg-scene-priority';
  priority.textContent = game.i18n.localize("SWFFG.UI.Interface.ForSession");
  priority.title = game.i18n.localize("SWFFG.UI.Interface.RestoreSceneHint");
  const storage = document.createElement('li');
  storage.className = 'ffg-scene-storage';
  const count = [...game.scenes].filter(scene => !scene.active && isStored(scene, stored)).length;
  storage.innerHTML = `<button type="button" data-action="ffgToggleSceneStorage" aria-expanded="false"><i class="ffg-scene-storage-chevron fa-solid fa-chevron-right" aria-hidden="true"></i><i class="fa-solid fa-box-archive" aria-hidden="true"></i><span>${game.i18n.localize("SWFFG.UI.Interface.SceneStorage")}</span><span class="ffg-scene-storage-count"></span></button><div class="ffg-scene-storage-body" hidden><ol class="ffg-scene-storage-list plain"></ol><p class="ffg-scene-storage-help"></p></div>`;
  const button = storage.querySelector('button'), body = storage.querySelector('.ffg-scene-storage-body'), archive = storage.querySelector('ol');
  button.title = game.i18n.localize("SWFFG.UI.Interface.StoredScenesHint");
  button.querySelector('.ffg-scene-storage-count').textContent = String(count);
  list.prepend(priority); list.append(storage);
  for (const row of rows) {
    const parent = priorParent.get(row), storedHere = zone(row);
    if (parent && docs.has(parent) && storedHere === zone(parent)) continue;
    if (parent || storedHere) (storedHere ? archive : list).insertBefore(row, storedHere ? null : storage);
    const path = parent && folderPath(docs.get(row));
    if (path) {
      const caption = document.createElement('span');caption.className = 'ffg-scene-folder-path';
      caption.textContent = path;caption.title = game.i18n.format("SWFFG.UI.Interface.FolderOrigin",{path});
      if (row.classList.contains('folder')) row.querySelector(':scope > .folder-header')?.after(caption);
      else row.append(caption);
    }
  }
  const help = storage.querySelector('.ffg-scene-storage-help');
  help.textContent = archive.children.length ? game.i18n.localize("SWFFG.UI.Interface.RestoreStoredSceneHint") : game.i18n.localize("SWFFG.UI.Interface.StoreSceneDropHint");
  layouts.set(app, {list, places, storage, priority, body, button});
  button.addEventListener('click', event => {
    event.preventDefault(); event.stopPropagation();
    writes = writes.catch(() => {}).then(async () => {
      await game.user.setFlag(SYSTEM, 'sceneStorageExpanded', game.user.getFlag(SYSTEM, 'sceneStorageExpanded') !== true);
      openStorage(app); if (app.popout?.rendered) openStorage(app.popout); if (app !== ui.scenes) openStorage(ui.scenes);
    });
  });
  openStorage(app);
}

export async function handleSceneStorageDrop(app, event) {
  if (!enabled(app) || flat(app)) return false;
  const storage = event.target.closest('.ffg-scene-storage'), priority = event.target.closest('.ffg-scene-priority');
  const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
  if (!['Scene', 'Folder'].includes(data.type) || !data.uuid) return Boolean(storage || priority);
  const doc = await fromUuid(data.uuid);
  if (!doc || doc.pack || (doc.documentName !== 'Scene' && !(doc.documentName === 'Folder' && doc.type === 'Scene'))) return Boolean(storage || priority);
  const existing = (doc.documentName === 'Scene' ? game.scenes : game.folders).get(doc.id) === doc;
  if (!existing) return Boolean(storage || priority);
  if (storage || priority || isStored(doc)) {
    event.preventDefault(); await setStored(doc, Boolean(storage)); return true;
  }
  return false;
}

Hooks.once('init', () => {
  game.settings.register(SYSTEM, SETTING, {
    name: "SWFFG.UI.Interface.EnableSceneStorage",
    hint: "SWFFG.UI.Interface.SceneStorageSettingHint",
    scope: 'world', config: true, type: Boolean, default: false, onChange: refresh
  });
  const link = document.createElement('link'); link.rel = 'stylesheet';
  link.href = new URL('../../styles/scene-storage.css', import.meta.url).href;document.head.append(link);
});
Hooks.on('updateUser', (user, changes) => {
  if (user.id === game.user.id && (changes.flags?.[SYSTEM]?.[FLAG] || Object.keys(changes).some(key => key.startsWith('flags.' + SYSTEM + '.' + FLAG + '.')))) refresh();
});
