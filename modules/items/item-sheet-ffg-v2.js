import { activateSheetPortrait, activateEquipmentImagePreview } from "../helpers/sheet-portrait.js";
import { ItemSheetFFG } from "./item-sheet-ffg.js";

const { ItemSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;

/** ApplicationV2 and Handlebars host for the Star Wars FFG item sheet. */
export class ItemSheetFFGV2 extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["starwarsffg", "sheet", "item", "v2", "themed"],
    editable: true,
    position: { width: 550, height: 650 },
    window: { resizable: true },
    form: {
      closeOnSubmit: false,
      submitOnChange: true,
      handler: ItemSheetFFGV2._onSubmitForm,
    },
  };

  static PARTS = {
    sheet: {
      template: "systems/starwarsffg/templates/items/ffg-gear-sheet.html",
      root: true,
      scrollable: [".sheet-body", ".tab"],
    },
  };

  constructor(options, ...args) {
    super(options, ...args);
    this._tabs = [];
  }

  async close(options = {}) {
    this._bookTreeObserver?.disconnect();
    const result = await super.close(options);
    // Keep the selected tab during edits, but start at the first tab on reopening.
    if (!this.rendered) this._sheetTab = undefined;
    return result;
  }

  get object() { return this.document; }

  get template() {
    return `systems/starwarsffg/templates/items/ffg-${this.item.type}-sheet.html`;
  }

  get isEditable() {
    return super.isEditable && !this.item.flags.readonly && this.options.editable !== false;
  }

  _getHeaderControls() {
    const controls = super._getHeaderControls();
    controls.unshift({
      action: "ffgSheetOptions",
      icon: "fas fa-wrench",
      label: game.i18n.localize("SWFFG.SheetOptions"),
      visible: this.isEditable && ["gear", "weapon", "armour"].includes(this.item.type),
      onClick: () => this.sheetoptions?.handler(),
    });
    return controls;
  }

  _configureRenderParts(options) {
    const parts = super._configureRenderParts(options);
    parts.sheet.template = this.template;
    return parts;
  }

  async _prepareContext(options={}) {
    const previousPosition={width:this.position.width,height:this.position.height};
    const context=await ItemSheetFFG.prototype.getData.call(this,options);
    const legacySize={width:this.position.width,height:this.position.height};
    Object.assign(this.position,previousPosition);
    if(!this._ffgInitialSizeApplied){
      const requested={...options.position};
      for(const dimension of ['width','height']){
        if(requested[dimension]===undefined||requested[dimension]===this.constructor.DEFAULT_OPTIONS.position[dimension])requested[dimension]=legacySize[dimension];
      }
      options.position=requested;this._ffgInitialSizeApplied=true;
    }
    return context;
  }

  async _renderFrame(options) {
    const frame=await super._renderFrame(options);
    frame.classList.add('ffg-sheet-pending');
    frame.classList.toggle('ffg-specialization-tree',this.item.type==='specialization');
    return frame;
  }

  async _postRender(context,options) {
    await super._postRender(context,options);
    if(options.isFirstRender&&this.element?.classList.contains('ffg-sheet-pending')){
      this.setPosition(options.position??this.position);
      this.element.classList.remove('ffg-sheet-pending');
    }
  }

  async getData(options={}) { return this._prepareContext(options); }

  async _onRender(context, options) {
    await super._onRender(context, options);
    activateSheetPortrait(this);
    activateEquipmentImagePreview(this);
    this.element?.classList?.toggle('ffg-specialization-tree', this.item.type === 'specialization');
    this.element?.classList?.toggle('ffg-book-editing', this.item.type === 'specialization' && this.isEditable && context.data?.isEditing === true);
    const html = $(this.element);
    ItemSheetFFG.prototype._activateFFGListeners.call(this, html);
    this._activateLegacyTabs(html);
    if(this.item.type==='specialization'){const {installBookTreeConnections}=await import('../helpers/book-tree-presentation.js');installBookTreeConnections(this);}
  }

  _activateLegacyTabs(html) {
    const nav = html.find(".sheet-tabs");
    nav.find("[data-tab]").off("click.ffg-v2-tabs").on("click.ffg-v2-tabs", event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      const tab = event.currentTarget.dataset.tab;
      this._sheetTab = tab;
      this._tabs?.[0]?.activate(tab);
      nav.find("[data-tab]").removeClass("active");
      $(event.currentTarget).addClass("active");
      html.find(".sheet-body > .tab[data-tab]").removeClass("active");
      html.find(`.sheet-body > .tab[data-tab="${tab}"]`).addClass("active");
    });
  }

  render(force={}, options={}) {
    if (typeof force === "boolean") return super.render({ ...options, force });
    return super.render(force ?? {});
  }

  async _onSubmit(event) {
    if (this.form?.reportValidity() === false) return;
    event?.preventDefault();
    const formData = new foundry.applications.ux.FormDataExtended(this.form);
    return this.constructor._onSubmitForm.call(this, event, this.form, formData);
  }

  static async _onSubmitForm(event, _form, formData) {
    if (!this.isEditable) return;
    const updateData={...formData.object};
    return this._updateObject(event, updateData);
  }
}

const v2Lifecycle = new Set(["constructor", "activateListeners", "getData", "render", "_onSubmit"]);
for (const name of Object.getOwnPropertyNames(ItemSheetFFG.prototype)) {
  if (v2Lifecycle.has(name) || Object.hasOwn(ItemSheetFFGV2.prototype, name)) continue;
  Object.defineProperty(ItemSheetFFGV2.prototype, name, Object.getOwnPropertyDescriptor(ItemSheetFFG.prototype, name));
}
