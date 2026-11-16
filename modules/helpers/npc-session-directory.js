import {renderSceneStorage, sceneStorageMenus, onSceneStorageSearch, handleSceneStorageDrop} from "./scene-storage.mjs";
import {sceneDirectoryTokens,renderSceneTokenRows,openSceneDirectoryToken} from "./scene-token-directory.mjs";

/** Personal session controls for the nine world sidebar directories. */
const SYSTEM = "starwarsffg";
const TABS = ["scenes", "actors", "npcs", "vehicles", "items", "journal", "tables", "macros", "compendium"];
const ACTOR_TABS = ["actors", "npcs", "vehicles"];
const WRAPPED = Symbol("starwarsffg.sessionDirectory");
const states = new WeakMap();
let pendingPin = Promise.resolve();
let pendingIcon = Promise.resolve();
const DEFAULT_ICON = "folder-open";
const FACTION_GLYPHS = Object.freeze({
  "rebel-alliance": "rebel",
  "galactic-republic": "galactic-republic",
  "galactic-empire": "empire"
});
const CUSTOM_FOLDER_GLYPHS = Object.freeze({"rocket":"x-wing", "tie-fighter":"tie-fighter", "imperial-class-i":"imperial-class-i", "robot":"astromech"});
export const NPC_FOLDER_ICONS = Object.freeze([
  "none", DEFAULT_ICON, "map-location-dot", "globe", "layer-group", "location-dot", "users", "user-secret",
  "shield-halved", "robot", "rocket", "tie-fighter", "imperial-class-i", "crosshairs", "building-columns", "skull", ...Object.keys(FACTION_GLYPHS)
]);

const localize = key => game.i18n.localize("SWFFG.NpcSession." + key);
const isPackTab = app => app.tabName === "compendium";
const viewsFor = app => ACTOR_TABS.includes(app.tabName) ? ["all", "scene", "session"] : ["all", "session"];
const collectionFor = app => isPackTab(app) ? game.packs : app.collection;
const entryId = (app, entry) => isPackTab(app) ? entry.collection : entry.id;
const mayUse = app => TABS.includes(app.tabName) && (app.tabName !== "npcs" || game.user.isGM);
const favoriteKey = app => app.tabName === "npcs" ? "npcSessionFavorites" : "directorySessionFavorites";
function pinsFor(app, stored) {
  const ids = app.tabName === "npcs" ? stored : stored?.[app.tabName];
  return new Set(Array.isArray(ids) ? ids : []);
}
function favorites(app) {
  return pinsFor(app, game.settings.get(SYSTEM, favoriteKey(app)));
}

function stateFor(app) {
  if (!states.has(app)) states.set(app, {view: "all", entries: new Set(), count: 0, flatCount: 0, sceneId: null, sceneCount: 0});
  return states.get(app);
}

export function isSessionView(app) {
  return mayUse(app) && states.get(app)?.view === "session";
}

function isFlatView(app) {
  const view = states.get(app)?.view;
  return mayUse(app) && (view === "scene" || view === "session");
}

/** A player may see the active scene without owning it. Never use the active
 * scene as a substitute for a local view, including while the canvas is blank. */
function localViewedScene() {
  const scene = game.scenes?.viewed;
  return scene && (game.user.isGM || scene.active || scene.visible) ? scene : null;
}

function linkedToScene(actor, sceneId) {
  return Boolean(sceneId&&sceneDirectoryTokens(actor,game.scenes.get(sceneId)).length);
}

/** Visit the filtered collection tree in the order used by directory.hbs. */
function collectEntries(node, result) {
  for (const child of node.children) {
    if (!child.visible) continue;
    collectEntries(child, result);
  }
  result.push(...node.entries);
}

export function sessionTree(app, tree) {
  if (!mayUse(app)) return tree;
  const state = stateFor(app);
  const entries = [];
  collectEntries(tree, entries);
  state.entries = new Set(entries.map(entry => entryId(app, entry)));
  const pins = favorites(app);
  const pinned = entries.filter(entry => pins.has(entryId(app, entry)));
  state.count = pinned.length;
  let selected = pinned;
  if (ACTOR_TABS.includes(app.tabName)) {
    state.sceneId = localViewedScene()?.id ?? null;
    const linked = state.sceneId ? entries.filter(actor => linkedToScene(actor, state.sceneId)) : [];
    state.sceneCount = linked.reduce((count,actor)=>count+sceneDirectoryTokens(actor,localViewedScene()).length,0);
    if (state.view === "scene") selected = linked;
  }
  if (state.view === "all") return tree;
  state.flatCount = selected.length;
  return {...tree, children: [], entries: selected};
}

export async function selectSessionView(event, button) {
  event.stopPropagation();
  if (!mayUse(this)) return;
  const state = stateFor(this);
  const next = button.dataset.view;
  if (next === state.view || !viewsFor(this).includes(next)) return;
  state.view = next;
  await this.render();
}

export function toggleSessionPin(event, button) {
  event.stopPropagation();
  const row = button.closest("li.directory-item");
  const id = isPackTab(this) ? row?.dataset.pack : row?.dataset.entryId;
  if (!mayUse(this) || !id) return;
  // Two quick clicks (including sidebar + popout) must each observe the prior write.
  pendingPin = pendingPin.then(async () => {
    if (!mayUse(this) || !states.get(this)?.entries.has(id)) return;
    const entry = collectionFor(this).get(id);
    if (!entry || entry.visible === false) return;
    const key = favoriteKey(this);
    const stored = game.settings.get(SYSTEM, key);
    const pins = pinsFor(this, stored);
    if (pins.has(id)) pins.delete(id);
    else pins.add(id);
    const value = this.tabName === "npcs" ? [...pins] : {...stored, [this.tabName]: [...pins]};
    await game.settings.set(SYSTEM, key, value);
  }).catch(error => {
    console.error("Star Wars FFG | Directory favorites", error);
    ui.notifications.error(localize("Error"));
  });
  return pendingPin;
}

function configuredIcon(mapping, id) {
  const slug = mapping?.[id];
  return NPC_FOLDER_ICONS.includes(slug) ? slug : DEFAULT_ICON;
}

const FOLDER_TYPES = ["Scene", "Actor", "Item", "JournalEntry", "RollTable", "Macro", "Compendium"];
const ICON_INPUT = "ffgPersonalFolderIcon";

function supportsPersonalIcon(folder) {
  return !folder.pack && !folder.inCompendium && FOLDER_TYPES.includes(folder.type);
}

/** Both surfaces use the same Foundry font family and glyph for a saved choice. */
function applyFolderGlyph(icon, slug, preview = false) {
  const previous = icon.dataset.ffgNpcIcon ?? DEFAULT_ICON;
  icon.classList.remove("fa-" + (FACTION_GLYPHS[previous] ?? (previous === "none" ? "ban" : previous)));
  const ship = CUSTOM_FOLDER_GLYPHS[slug];
  icon.classList.toggle("ffg-folder-ship-icon", Boolean(ship));
  if(ship)icon.style.setProperty("--ffg-folder-ship-mask", `url("${new URL('../../images/ship-icons/'+ship+'.svg',import.meta.url).href}")`);
  else icon.style.removeProperty("--ffg-folder-ship-mask");
  const brand = FACTION_GLYPHS[slug];
  icon.classList.toggle("fa-brands", Boolean(brand));
  icon.classList.toggle("fa-solid", !brand && !ship);
  icon.classList.toggle("ffg-folder-icon-none", !preview && slug === "none");
  if (!ship && (preview || slug !== "none")) icon.classList.add("fa-" + (brand ?? (slug === "none" ? "ban" : slug)));
  icon.dataset.ffgNpcIcon = slug;
}

function updateIconPreviewColor(sheet, field) {
  if (!field) return;
  const color = sheet.element.querySelector('[name="color"]')?.value;
  if (color) field.style.setProperty("--npc-folder-native", color);
  else field.style.removeProperty("--npc-folder-native");
}

function iconField(sheet, checked, onChange) {
  const field = document.createElement("div");
  field.className = "ffg-folder-icon-field form-group stacked";
  const title = document.createElement("label");
  title.id = sheet.id + "-personal-icon-label";
  title.textContent = localize("FolderIconLabel");
  const grid = document.createElement("div");
  grid.className = "ffg-npc-icon-picker";
  grid.setAttribute("role", "radiogroup");
  grid.setAttribute("aria-labelledby", title.id);
  for (const slug of NPC_FOLDER_ICONS) {
    const label = document.createElement("label");
    label.className = "ffg-npc-icon-choice";
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = ICON_INPUT;
    radio.value = slug;
    radio.checked = slug === checked;
    const icon = document.createElement("i");
    applyFolderGlyph(icon, slug, true);
    icon.setAttribute("aria-hidden", "true");
    const text = document.createElement("span");
    text.className = "ffg-npc-icon-label";
    text.textContent = localize("Icon." + slug);
    label.append(radio, icon, text);
    grid.append(label);
  }
  grid.addEventListener("change", event => {
    if (event.target.name === ICON_INPUT && NPC_FOLDER_ICONS.includes(event.target.value)) onChange(event.target.value);
  });
  field.append(title, grid);
  updateIconPreviewColor(sheet, field);
  return field;
}

/** Serialize updates to the one user-owned map, including saves from separate sheets. */
function saveFolderIcon(folder, slug) {
  const write = pendingIcon.then(async () => {
    if (!supportsPersonalIcon(folder) || !NPC_FOLDER_ICONS.includes(slug) ||
        !folder.id || folder.collection?.get(folder.id) !== folder) return;
    const current = game.settings.get(SYSTEM, "npcFolderIcons") ?? {};
    const next = {...current};
    if (slug === DEFAULT_ICON) delete next[folder.id];
    else next[folder.id] = slug;
    if (next[folder.id] !== current[folder.id]) await game.settings.set(SYSTEM, "npcFolderIcons", next);
  });
  // A failed preference write must not block a later save or another sheet.
  pendingIcon = write.catch(() => {});
  return write;
}

export function registerSessionFolderSheet() {
  const FolderConfig = foundry.applications.sheets.FolderConfig;
  class SessionFolderConfig extends FolderConfig {
    #draft = null;

    async _onRender(context, options) {
      await super._onRender(context, options);
      if (!this.isEditable || !supportsPersonalIcon(this.document) ||
          this.element.querySelector(".ffg-folder-icon-field")) return;
      const colorField = this.element.querySelector('[name="color"]')?.closest(".form-group");
      if (!colorField) return;
      const selected = this.#draft ?? configuredIcon(game.settings.get(SYSTEM, "npcFolderIcons"), this.document.id);
      colorField.after(iconField(this, selected, slug => { this.#draft = slug; }));
    }

    _processFormData(event, form, formData) {
      const fields = super._processFormData(event, form, formData);
      // A personal choice is never sent to Folder validation, update, or creation.
      delete fields[ICON_INPUT];
      return fields;
    }

    _onChangeForm(config, event) {
      super._onChangeForm(config, event);
      if (event.target.closest('[name="color"]')) {
        updateIconPreviewColor(this, this.element.querySelector(".ffg-folder-icon-field"));
      }
    }

    async _processSubmitData(event, form, submitData, options) {
      const slug = this.#draft;
      const result = await super._processSubmitData(event, form, submitData, options);
      if (slug === null || !this.isEditable || !supportsPersonalIcon(this.document)) return result;
      // Folder.update may return undefined for an icon-only save. Confirm that
      // native fields already match; a vetoed change must not commit the icon.
      const folder = result.created ?? result.updated ?? this.document;
      if (!result.created && !result.updated && (!folder.collection?.has(folder.id) ||
          !foundry.utils.isEmpty(foundry.utils.diffObject(folder.toObject(), submitData)))) return result;
      try {
        await saveFolderIcon(folder, slug);
      } catch (error) {
        throw new Error(localize("FolderIconError"), {cause: error});
      }
      return result;
    }

    _onClose(options) {
      this.#draft = null;
      return super._onClose(options);
    }
  }

  foundry.applications.apps.DocumentSheetConfig.registerSheet(CONFIG.Folder.documentClass, SYSTEM, SessionFolderConfig, {
    types: FOLDER_TYPES, makeDefault: true, label: "SWFFG.NpcSession.FolderIconLabel"
  });
}

function decorateFolders(app) {
  const icons = game.settings.get(SYSTEM, "npcFolderIcons");
  for (const folder of app.element.querySelectorAll(".directory-list li.folder[data-folder-id]")) {
    const header = folder.querySelector(":scope > .folder-header");
    if (!header) continue;
    if (header.style.backgroundColor) header.style.setProperty("--npc-folder-native", header.style.backgroundColor);
    else header.style.removeProperty("--npc-folder-native");
    const icon = header.querySelector(":scope > i.fa-folder-open, :scope > i.ffg-npc-folder-icon");
    if (!icon) continue;
    const slug = configuredIcon(icons, folder.dataset.folderId);
    icon.classList.add("ffg-npc-folder-icon");
    applyFolderGlyph(icon, slug);
  }
}

function decorateRows(app, pins) {
  const entries = stateFor(app).entries;
  const selector = isPackTab(app) ? "li.directory-item.compendium[data-pack]" : "li.directory-item.document[data-entry-id]";
  for (const row of app.element.querySelectorAll(".directory-list " + selector)) {
    const id = isPackTab(app) ? row.dataset.pack : row.dataset.entryId;
    const entry = collectionFor(app).get(id);
    const link = row.querySelector(":scope > .entry-name");
    if (!entry || !link || !entries.has(id)) continue;
    let button = row.querySelector(":scope > .ffg-npc-pin");
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "ffg-npc-pin";
      button.dataset.action = "ffgNpcPin";
      const star = document.createElement("i");
      star.className = "fa-star";
      star.setAttribute("aria-hidden", "true");
      button.append(star);
      link.after(button);
    }
    const active = pins.has(id);
    const name = isPackTab(app) ? game.i18n.localize(entry.title) : entry.name;
    const label = game.i18n.format("SWFFG.NpcSession." + (active ? "Unpin" : "Pin"), {name});
    button.setAttribute("aria-label", label);
    button.title = label;
    button.setAttribute("aria-pressed", String(active));
    button.firstElementChild.classList.toggle("fa-solid", active);
    button.firstElementChild.classList.toggle("fa-regular", !active);
  }
}

function renderViews(app, state) {
  const header = app.element.querySelector(".directory-header");
  if (!header) return;
  let views = header.querySelector(".ffg-npc-session-views");
  if (!views) {
    views = document.createElement("div");
    views.className = "ffg-npc-session-views";
    views.setAttribute("role", "group");
    for (const mode of viewsFor(app)) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.action = "ffgNpcView";
      button.dataset.view = mode;
      views.append(button);
    }
    header.append(views);
  }
  views.setAttribute("aria-label", localize("Views"));
  const labels = {
    all: localize("All"),
    scene: localize("Scene") + " (" + state.sceneCount + ")",
    session: localize("Session") + " (" + state.count + ")"
  };
  for (const button of views.children) {
    const view = button.dataset.view;
    button.textContent = labels[view];
    button.setAttribute("aria-pressed", String(view === state.view));
  }
}

export function renderSessionDirectory(app) {
  if (!mayUse(app)) return;
  const root = app.element;
  const state = stateFor(app);
  root.classList.add("ffg-session-directory-layout");
  root.classList.toggle("ffg-npc-favorites-only", state.view === "session");
  root.classList.toggle("ffg-directory-scene-only", state.view === "scene");
  decorateFolders(app);
  decorateRows(app, favorites(app));
  if(ACTOR_TABS.includes(app.tabName))renderSceneTokenRows(app,state.view==='scene',localViewedScene());
  renderViews(app, state);
  const list = root.querySelector(".directory-list");
  if (!list) return;
  let empty = list.querySelector(".ffg-npc-session-empty");
  if (state.view === "all" || state.flatCount) { empty?.remove(); return; }
  if (!empty) {
    empty = document.createElement("li");
    empty.className = "ffg-npc-session-empty";
    empty.setAttribute("role", "status");
    list.append(empty);
  }
  empty.textContent = localize(state.view === "session" ? "Empty" : state.sceneId ? "SceneEmpty" : "NoViewedScene");
}

/** Wrap the configured class, including any specialized Star Wars actor filtering. */
function sessionDirectoryClass(Base) {
  return class SessionDirectory extends Base {
    static [WRAPPED] = true;
    static DEFAULT_OPTIONS = {actions: {ffgNpcView: selectSessionView, ffgNpcPin: toggleSessionPin}};

    async _prepareDirectoryContext(context, options) {
      await super._prepareDirectoryContext(context, options);
      context.tree = sessionTree(this, context.tree);
    }

    async _onRender(context, options) {
      await super._onRender(context, options);
      renderSessionDirectory(this);
      renderSceneStorage(this);
    }

    _getEntryContextOptions() {
      const options = super._getEntryContextOptions();
      if (this.tabName === "scenes") return [...options, ...sceneStorageMenus(this)];
      return options;
    }

    async _onClickEntry(event,target,options={}) {
      const tokenUuid=ACTOR_TABS.includes(this.tabName)&&stateFor(this).view==='scene'&&target.closest('[data-ffg-scene-token]')?.dataset.ffgSceneToken;
      if(!tokenUuid)return super._onClickEntry(event,target,options);
      event.preventDefault();
      try{await openSceneDirectoryToken(tokenUuid);}catch(error){console.error('Star Wars FFG | Scene token',error);ui.notifications.warn(error.message);}
    }

    _getFolderContextOptions() {
      const options = super._getFolderContextOptions();
      return this.tabName === "scenes" ? [...options, ...sceneStorageMenus(this, true)] : options;
    }

    _onSearchFilter(event, query, rgx, html) {
      const result = super._onSearchFilter(event, query, rgx, html);
      if (this.tabName === "scenes") onSceneStorageSearch(this, query);
      if(ACTOR_TABS.includes(this.tabName)&&stateFor(this).view==='scene'&&query){
        for(const row of html.querySelectorAll('[data-ffg-scene-token]')){
          const token=fromUuidSync(row.dataset.ffgSceneToken);rgx.lastIndex=0;
          if(token&&rgx.test(foundry.applications.ux.SearchFilter.cleanQuery(token.name)))row.style.display='flex';
        }
      }
      return result;
    }

    _canDragDrop(selector) {
      return !isFlatView(this) && super._canDragDrop(selector);
    }

    async _onDrop(event) {
      // The flat view has no authoritative parent folder for drops.
      if (isFlatView(this)) return;
      if (await handleSceneStorageDrop(this, event)) return;
      return super._onDrop(event);
    }
  };
}

/** Filter indexed document results before Foundry applies its per-type search limit. */
function sessionCompendiumClass(Base) {
  return class SessionCompendiumDirectory extends Base {
    _matchSearchDocuments(query, documents) {
      if (!isSessionView(this)) return super._matchSearchDocuments(query, documents);
      const pins = favorites(this);
      const visible = states.get(this).entries;
      const results = game.documentIndex.lookup(query, {
        documentTypes: Array.from(this.activeFilters),
        limit: 25,
        ownership: CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED,
        filterEntries: entry => visible.has(entry.pack) && pins.has(entry.pack)
      });
      for (const match of Object.values(results).flat()) documents.add(match.entry);
    }
  };
}

let sceneHooksRegistered = false;
let sceneRefreshQueued = false;
const changedLinks = new Set();
const sceneDirectoryOpen = app => app?.rendered && states.has(app) && mayUse(app);

function queueSceneRefresh(actorId) {
  const directories = ACTOR_TABS.map(tab => globalThis.ui?.[tab]).filter(Boolean);
  if (!directories.some(app => sceneDirectoryOpen(app) || sceneDirectoryOpen(app.popout))) return;
  if (actorId) changedLinks.add(actorId);
  if (sceneRefreshQueued) return;
  sceneRefreshQueued = true;
  const refresh = () => {
    sceneRefreshQueued = false;
    const ids = [...changedLinks];
    changedLinks.clear();
    const sceneId = localViewedScene()?.id ?? null;
    const refreshView = app => {
      if (!sceneDirectoryOpen(app)) return false;
      const state = states.get(app);
      if (state.sceneId === sceneId && !ids.some(id => state.entries.has(id))) return false;
      if (state.view === "scene") {
        app.render({parts: ["directory"]});
        return true;
      }
      // Keep the current folder, scroll position and search intact when only the label changes.
      state.sceneId = sceneId;
      state.sceneCount = 0;
      if (sceneId) {
        for (const id of state.entries) {
          state.sceneCount+=sceneDirectoryTokens(app.collection.get(id),game.scenes.get(sceneId)).length;
        }
      }
      renderViews(app, state);
      return false;
    };
    for (const directory of directories) {
      // Foundry automatically propagates a docked render to its open popout.
      if (!refreshView(directory)) refreshView(directory.popout);
    }
  };
  if (globalThis.requestAnimationFrame) globalThis.requestAnimationFrame(refresh);
  else queueMicrotask(refresh);
}

function linksChanged(changes) {
  const flags = changes.flags?.[SYSTEM];
  if (flags && (Object.hasOwn(flags, "directorySceneLinks") || Object.hasOwn(flags, "-=directorySceneLinks"))) return true;
  if (Object.hasOwn(changes, "-=flags") || (changes.flags && Object.hasOwn(changes.flags, "-=" + SYSTEM))) return true;
  const path = "flags." + SYSTEM + ".directorySceneLinks";
  return Object.keys(changes).some(key => key === path || key.startsWith(path + ".") ||
    key === "flags." + SYSTEM + ".-=directorySceneLinks");
}

function registerSceneRefresh() {
  if (sceneHooksRegistered || !globalThis.Hooks) return;
  sceneHooksRegistered = true;
  // A blank canvas skips canvasReady, but Foundry renders SceneControls after
  // clearing the viewed scene. Comparing IDs ignores ordinary tool changes.
  for (const hook of ["canvasReady", "renderSceneControls", "deleteScene"]) {
    Hooks.on(hook, () => queueSceneRefresh());
  }
  Hooks.on("updateScene", (_scene, changes) => {
    if (Object.hasOwn(changes, "ownership") || Object.hasOwn(changes, "active")) queueSceneRefresh();
  });
  for(const name of ['createToken','updateToken','deleteToken'])Hooks.on(name,token=>queueSceneRefresh(token.actorId));
  Hooks.on("updateActor", (actor, changes) => {
    if (linksChanged(changes)) queueSceneRefresh(actor.id);
  });
}

export function registerSessionDirectories(interfaces) {
  for (const tab of TABS) {
    const Base = interfaces[tab];
    if (typeof Base !== "function" || Base[WRAPPED]) continue;
    const Directory = sessionDirectoryClass(Base);
    interfaces[tab] = tab === "compendium" ? sessionCompendiumClass(Directory) : Directory;
  }
  registerSceneRefresh();
}
