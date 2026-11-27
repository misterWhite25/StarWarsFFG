import ImportHelpers from "./import-helpers.js";
import OggDude from "./oggdude/oggdude.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api

export default class DataImporter extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "data-importer",
    tag: "form",
    form: {
      handler: DataImporter._startImport,
      submitOnChange: false,
      closeOnSubmit: false
    },
    window: {
      title: "SWFFG.UI.Import.DataTitle",
      contentClasses: ["standard-form"]
    },
    actions: {
      loadFile: DataImporter._loadFile,
      selectAll: DataImporter._enableImportAll,
    },
  }

  static PARTS = {
    importer: {
      template: "systems/starwarsffg/templates/importer/data-importer.html",
      classes: ["starwarsffg", "data-import"],
    },
    footer: {
      template: "templates/generic/form-footer.hbs",
    }
  }

  /** @override */
  constructor(options) {
    super(options);
    this.oggdude = OggDude;
    this.importers = this.oggdude.Meta;
    this.loadedZip = null;
    this.shouldImport = {};
  }

  /**
   * Return a reference to the target attribute
   * @type {String}
   */
  get attribute() {
    return this.options.name;
  }

  /** @override */
  async _prepareContext() {
    let data = await foundry.applications.apps.FilePicker.browse("data", "", { bucket: null, extensions: [".zip", ".ZIP"], wildcard: false });
    const files = data.files.map((file) => decodeURIComponent(file));

    if (!CONFIG?.temporary) {
      CONFIG.temporary = {};
    }

    return {
      importers: this.importers,
      data,
      files,
      cssClass: "data-importer-window",
      buttons: [
        { type: "submit", icon: "fas fa-file-import", label: "SWFFG.ImportFile", disabled: true }
      ]
    };
  }

  /** @override */
  _onRender(_context, _options) {
    // Add debug log option to window header
    const debugSpan = document.createElement("span");
    debugSpan.className = "debug";
    debugSpan.innerHTML = `<label><input type="checkbox" /> ${game.i18n.localize("SWFFG.UI.Import.GenerateLog")}</label>`;
    const headerCloseButton = this.element?.querySelector("#data-importer header button[data-action=close]");
    if (headerCloseButton && headerCloseButton.parentNode) {
      headerCloseButton.parentNode.insertBefore(debugSpan, headerCloseButton);
    }

    this.element.querySelector(".import-file-selector").addEventListener("change", () => this._resetSelection());
  }

  _importLog = [];
  _importLogger(message) {
    if (this.element.querySelector(".debug input:checked")) {
      this._importLog.push(`[${new Date().getTime()}] ${message}`);
    }
    
  }

  /**
   * Enable all checkboxes for import rather than forcing the user to click them all one at a time
   * @private
   */
  static _enableImportAll() {
    for (const input of this.element.querySelectorAll("input[name=imports]:enabled")) input.checked = true;
  }

  _resetSelection() {
    this.loadedZip = null;
    this.loadToken = null;
    for (const input of this.element.querySelectorAll("input[name=imports]")) {
      input.checked = false;
      input.disabled = true;
    }
    this.element.querySelector("[data-action=selectAll]").disabled = true;
    this.element.querySelector("button[type=submit]").disabled = true;
  }

  async _readFile() {
    const path = this.element.querySelector("[name=import-file]").value;
    if (path) {
      const response = await fetch(foundry.utils.getRoute(path));
      if (!response.ok) throw Error(response.statusText);
      return JSZip.loadAsync(await response.arrayBuffer());
    }
    const file = this.element.querySelector("input[type=file]").files[0];
    if (file) return JSZip.loadAsync(await file.arrayBuffer());
    ui.notifications.warn(game.i18n.localize("SWFFG.Notifications.Import.NoFileWarning"));
  }

  static async _loadFile() {
    if (this.importing) return;
    this._resetSelection();
    const token = this.loadToken = Symbol();
    try {
      const zip = await this._readFile();
      if (!zip || token !== this.loadToken) return;
      for (const importer of Object.values(this.importers)) {
        const input = this.element.querySelector("#import" + importer.className);
        const available = importer.fileNames.every(name => this._findEntry(zip, name, importer.filesAreDir))
          && (importer.requiredFiles ?? []).every(name => this._findEntry(zip, name, false))
          && (importer.requiredDirectories ?? []).every(name => this._findEntry(zip, name, true));
        input.disabled = !available;
      }
      this.loadedZip = zip;
      const hasData = Boolean(this.element.querySelector("input[name=imports]:enabled"));
      this.element.querySelector("[data-action=selectAll]").disabled = !hasData;
      this.element.querySelector("button[type=submit]").disabled = !hasData;
    } catch (err) {
      ui.notifications.error(game.i18n.localize("SWFFG.Notifications.Import.FileLoadError"));
      console.error(err);
    }
  }

  _findEntry(zip, name, directory) {
    const basename = name.split("/").filter(Boolean).pop();
    if (directory) return ImportHelpers.xmlFiles(zip, basename)[0];
    return Object.values(zip.files).find(entry => !entry.dir && entry.name.split("/").pop() === basename);
  }

  static async _startImport() {
    const zip = this.loadedZip;
    if (!zip) return;
    const selected = [...this.element.querySelectorAll("input[name=imports]:enabled:checked")];
    if (!selected.length) return;
    const importFiles = selected.map(input => input.dataset.itemtype);
    this.shouldImport = Object.fromEntries(importFiles.map(type => [type, true]));
    this._importLogger("Starting import");
    this._resetSelection();
    this.importing = true;
    try {
      await this._importSelected(zip, importFiles);
    } finally {
      this.importing = false;
    }
  }

  async _importSelected(zip, importFiles) {
    const documents = new Map();
    const replaceExisting = this.element.querySelector("#deleteExisting").checked;
    try {
      for (const importer of Object.values(this.importers)) {
        if (!this.shouldImport[importer.itemName]) continue;
        const names = importer.filesAreDir ? [] : importer.fileNames;
        const directories = importer.filesAreDir ? importer.fileNames : (importer.requiredDirectories ?? []);
        for (const name of [...names, ...(importer.requiredFiles ?? [])]) {
          const entry = this._findEntry(zip, name, false);
          const xml = ImportHelpers.stringToXml(await entry.async("text"));
          if (xml.querySelector("parsererror")) throw Error(name);
          documents.set(name, xml);
        }
        if (replaceExisting) {
          for (const dir of directories) {
            for (const entry of ImportHelpers.xmlFiles(zip, dir.split("/").filter(Boolean).pop())) {
              const xml = ImportHelpers.stringToXml(await entry.async("text"));
              if (xml.querySelector("parsererror")) throw Error(entry.name);
            }
          }
        }
      }
    } catch (error) {
      ui.notifications.error(game.i18n.localize("SWFFG.Notifications.Import.FileLoadError"));
      console.error(error);
      return;
    }
    if (replaceExisting) {
      for (const itemType of importFiles) await this._deleteCompendium(itemType);
    }

    // If skills are not selected for import, pre-populate the skills cache so other importers
    // (weapons, species, careers, etc.) can still resolve skill keys without errors.
    if (!this.shouldImport["skills"]) {
      CONFIG.temporary["skills"] = {};
      const skillsPack = game.packs.get("world.oggdudeskilldescriptions");
      if (skillsPack) {
        this._importLogger("Skills not selected for import - loading skills from world compendium");
        const skillDocs = await skillsPack.getDocuments();
        for (const doc of skillDocs) {
          const importId = doc.flags?.starwarsffg?.ffgimportid;
          if (importId) {
            CONFIG.temporary.skills[importId] = ImportHelpers.oggSkillKeyToSystemKey(importId) ?? doc.name;
          }
        }
        this._importLogger(`Loaded ${Object.keys(CONFIG.temporary.skills).length} skills from world compendium`);
      }
    }

    const selected = Object.values(this.importers).filter(importer => this.shouldImport[importer.itemName]);
    const phases = [...new Set(selected.map(importer => importer.phase))].sort((a, b) => a - b);
    for (const phase of phases) {
      const group = selected.filter(importer => importer.phase === phase);
      await Promise.all(group.map(async importer => {
        this._importLogger(`Importing ${importer.displayName}`);
        const run = OggDude.Import[importer.className];
        if (importer.filesAreDir) return run(zip);
        // Multiple files in one category can create or update the same compendium.
        for (const name of importer.fileNames) await run(documents.get(name), zip);
      }));
    }
    this._importLogger("Done with import!");

    if (this.element.querySelector(".debug input:checked")) {
      foundry.utils.saveDataToFile(this._importLog.join("\n"), "text/plain", "import-log.txt");
    }

    CONFIG.temporary = {};
    this.close();
  }

  async _deleteCompendium(itemType) {
    const typeToCompendium = {
      armor: ["world.oggdudearmor"],
      background: ["world.oggdudebackgrounds"],
      career: ["world.oggdudecareers"],
      forcepower: ["world.oggdudeforcepowers"],
      gear: ["world.oggdudegear"],
      itemmodifier: ["world.oggdudearmormods", "world.oggdudeweaponmods", "world.oggdudegenericmods", "world.oggdudevehiclemods"],
      itemattachment: ["world.oggdudearmorattachments", "world.oggdudeweaponattachments", "world.oggdudegenericattachments", "world.oggdudevehicleattachments"],
      motivation: ["world.oggdudemotivations"],
      obligation: ["world.oggdudeobligation"],
      signatureability: ["world.oggdudesignatureabilities"],
      skills: ["world.oggdudeskilldescriptions"],
      specialization: ["world.oggdudespecializations"],
      species: ["world.oggdudespecies"],
      talent: ["world.oggdudetalents"],
      vehicle: ["world.oggdudevehiclesplanetary", "world.oggdudevehiclesspace"],
      weapon: ["world.oggdudeweapons", "world.oggdudevehicleweapons"],
    };

    for (const curType of typeToCompendium[itemType]) {
      const pack = game.packs.get(curType);
      if (pack) {
        this._importLogger(`Deleting compendium: ${pack.metadata.name}`);
        await pack.deleteCompendium();
      }
    }
  }
}
