import { ActorSheetFFG } from "./actor-sheet-ffg.js";

const { ActorSheetV2 } = foundry.applications.sheets;

/**
 * ApplicationV2 host for the existing Star Wars FFG actor-sheet logic.
 *
 * The original sheet still provides the data preparation and domain-specific
 * event handlers. This class owns the Foundry v14 window, render, form, and
 * drag/drop lifecycles so native controls such as Detach Window are available.
 */
export class ActorSheetFFGV2 extends ActorSheetV2 {
  static DEFAULT_OPTIONS = {
    classes: ["starwarsffg", "sheet", "actor", "v2"],
    tag: "div",
    editable: true,
    submitOnChange: true,
    position: {
      width: 710,
      height: 650,
    },
    window: {
      contentTag: "form",
      contentClasses: ["starwarsffg", "sheet", "actor", "v2"],
      resizable: true,
    },
    form: {
      closeOnSubmit: false,
      submitOnChange: true,
      handler: this._onSubmitForm,
    },
  };

  constructor(options, ...args) {
    super(options, ...args);
    this._filters = {skills: new Set()};
    this._sheetTab = "characteristics";
    this._tabs = [];
    this.pools = new Map();
  }

  /** ApplicationV1 compatibility alias used by the existing sheet logic. */
  get object() {
    return this.document;
  }

  /** Preserve the compact title used by the legacy actor sheet. */
  get title() {
    if (!this.actor.isToken) return this.actor.name;
    return `[${game.i18n.localize("DOCUMENT.Token")}] ${this.actor.name}`;
  }

  get template() {
    return `systems/starwarsffg/templates/actors/ffg-${this.actor.type}-sheet.html`;
  }

  /** Reuse the mature FFG context preparation while hosting it in ApplicationV2. */
  async _prepareContext(options) {
    return ActorSheetFFG.prototype.getData.call(this, options);
  }

  /** ApplicationV1 compatibility method used by existing listener setup. */
  async getData(options={}) {
    return this._prepareContext(options);
  }

  async _renderHTML(context) {
    return foundry.applications.handlebars.renderTemplate(this.template, context);
  }

  _replaceHTML(result, content) {
    const template = document.createElement("template");
    template.innerHTML = result.trim();
    const renderedForm = template.content.firstElementChild;
    if (!(renderedForm instanceof HTMLFormElement)) {
      throw new Error(`Actor sheet template ${this.template} must render a form element.`);
    }

    const actorClasses = ["character", "nemesis", "rival", "minion", "vehicle", "homestead", "editable", "locked"];
    content.classList.remove(...actorClasses);
    content.classList.add(...renderedForm.classList);
    content.replaceChildren(...renderedForm.childNodes);
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this._activateLegacyListeners($(this.element));
  }

  _activateLegacyListeners(html) {
    return ActorSheetFFG.prototype._activateFFGListeners.call(this, html);
  }

  /** Accept legacy render(true, options) calls made by the sheet code. */
  render(force={}, options={}) {
    if (typeof force === "boolean") return super.render({...options, force});
    return super.render(force ?? {});
  }

  /** Submit requests made directly by existing FFG event handlers. */
  async _onSubmit(event) {
    if (this.form?.reportValidity() === false) return;
    event?.preventDefault();
    const formData = new foundry.applications.ux.FormDataExtended(this.form);
    return this.constructor._onSubmitForm.call(this, event, this.form, formData);
  }

  static async _onSubmitForm(event, form, formData) {
    if (!this.isEditable) return;
    const updateData = {...formData.object};
    const overrides = foundry.utils.flattenObject(this.actor.overrides);
    for (const key of Object.keys(overrides)) delete updateData[key];
    return this._updateObject(event, updateData);
  }
}

// Keep the existing FFG behavior in one implementation while ApplicationV1
// remains supported. Structural lifecycle methods are provided above by V2.
const v2Lifecycle = new Set([
  "constructor",
  "activateListeners",
  "getData",
  "render",
  "_onSubmit",
]);

for (const name of Object.getOwnPropertyNames(ActorSheetFFG.prototype)) {
  if (v2Lifecycle.has(name) || Object.hasOwn(ActorSheetFFGV2.prototype, name)) continue;
  Object.defineProperty(
    ActorSheetFFGV2.prototype,
    name,
    Object.getOwnPropertyDescriptor(ActorSheetFFG.prototype, name),
  );
}
