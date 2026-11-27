const namespace = "starwarsffg.";
const localization = "SWFFG.UI.Interface.";
const originalMenus = [
  "rulesetSettings", "combatSettings", "actorSettings", "xpSpendingSettings",
  "localizationSettings", "groupManagerSettings"
];
const themes = [
  ["Interface", ["sidebarOrder", "enableCharacterSidebar", "enablePlayerCharacterPortraits", "enableGmCharacterShortcuts", "enableGMHotbar"]],
  ["Combat", ["groundRangeDistances", "npcAutoInitiative", "showCombatTurnBanner"]],
  ["Scenes", ["enableSceneStorage", "enableSharedPortraits", "enableTrombinoscope"]],
  ["Compendiums", ["steelersCompendiumLayout", "bannerGallery"]]
];

function getSection(parent, {tag, className, heading, title, theme}) {
  const selector = theme ? `[data-steelers-theme="${theme}"]` : `.${className}`;
  const existing = parent.querySelector(`:scope > ${selector}`);
  if (existing) return existing;
  const doc = parent.ownerDocument;
  const section = doc.createElement(tag);
  section.className = className;
  if (theme) section.dataset.steelersTheme = theme;
  const label = doc.createElement(heading);
  label.textContent = title;
  section.append(label);
  return section;
}

function appendRows(section, rows, searchText) {
  for (const row of rows) {
    let search = row.querySelector("[data-steelers-search]");
    if (!search) {
      search = row.ownerDocument.createElement("span");
      search.hidden = true;
      search.dataset.searchable = "";
      search.dataset.steelersSearch = "";
      row.append(search);
    }
    search.textContent = searchText;
    section.append(row);
  }
}

/** Reorder native rows without replacing their inputs or save handlers. */
export function groupSteelersSettings(app) {
  const system = app.element?.querySelector('[data-category="system"]');
  if (!system) return;
  const entries = new Map();
  const selector = `button[data-action="openSubmenu"][data-key^="${namespace}"], [name^="${namespace}"]`;
  for (const control of system.querySelectorAll(selector)) {
    const row = control.closest(".form-group");
    if (!row) continue;
    const key = (control.dataset.key ?? control.name).slice(namespace.length);
    if (control.dataset.action === "openSubmenu") row.querySelector(":scope > .hint")?.remove();
    entries.set(key, row);
  }
  if (!entries.size) return;

  const takeRows = keys => keys.flatMap(key => {
    const row = entries.get(key);
    entries.delete(key);
    return row ? [row] : [];
  });
  const localize = key => game.i18n.localize(localization + key);
  const originalRows = takeRows(originalMenus);
  const doc = system.ownerDocument;
  if (originalRows.length) {
    const original = getSection(system, {
      tag: "fieldset", className: "ffg-original-settings", heading: "legend", title: localize("OriginalSettings")
    });
    appendRows(original, originalRows, localize("OriginalSettingsSearch"));
    let sourceNote = original.querySelector(".ffg-original-source-note");
    if (!sourceNote) {
      sourceNote = doc.createElement("p");
      sourceNote.className = "ffg-original-source-note";
      const link = doc.createElement("a");
      link.href = "https://github.com/StarWarsFoundryVTT/StarWarsFFG";
      link.textContent = "Star Wars FFG";
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      sourceNote.append(localize("OriginalSystemSource"), link, ".");
    }
    original.append(sourceNote);
    system.prepend(original);
  }

  if (!entries.size) return;
  const steelersTitle = localize("SteelersSystem");
  const steelers = getSection(system, {
    tag: "fieldset", className: "ffg-steelers-settings", heading: "legend", title: steelersTitle
  });
  for (const [theme, keys] of [...themes, ["Other", null]]) {
    const rows = keys ? takeRows(keys) : [...entries.values()];
    if (!rows.length) continue;
    const title = localize(`SteelersSettings.${theme}`);
    const section = getSection(steelers, {
      tag: "section", className: "ffg-steelers-theme", heading: "h3", title, theme
    });
    appendRows(section, rows, `${steelersTitle} ${title}`);
    steelers.append(section);
  }
  system.prepend(steelers);
}

Hooks.once("init", () => {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = new URL("../../styles/steelers-settings.css", import.meta.url).href;
  document.head.append(link);
});
Hooks.on("renderSettingsConfig", groupSteelersSettings);
