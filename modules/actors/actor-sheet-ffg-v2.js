import {isPossession} from '../helpers/inventory-location.js';
import {activateInventoryPossessions,dropPossession} from '../helpers/inventory-possessions.js';
import {showEquipmentSummary} from "../helpers/equipment-summary.js";
import {showCalculationDetails} from "../helpers/stat-calculation-dialog.js";
import {showTalentSummary, summaryTalents} from "../helpers/talent-summary.js";
import { activateSheetPortrait, activateInventoryImagePreview } from "../helpers/sheet-portrait.js";
import { ActorSheetFFG } from "./actor-sheet-ffg.js";

const { ActorSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;

/** ApplicationV2 and Handlebars host for the Star Wars FFG actor sheet. */
export class ActorSheetFFGV2 extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["starwarsffg", "sheet", "actor", "v2", "themed"],
    editable: true,
    position: { width: 710, height: 650 },
    window: { resizable: true },
    form: {
      closeOnSubmit: false,
      submitOnChange: true,
      handler: ActorSheetFFGV2._onSubmitForm,
    },
  };

  static PARTS = {
    sheet: {
      template: "systems/starwarsffg/templates/actors/ffg-character-sheet.html",
      root: true,
      scrollable: [".sheet-body", ".tab"],
    },
  };

  constructor(options, ...args) {
    // Comfortable default dimensions, capped to fit smaller viewports.
    const width = Math.min(1000, Math.floor(window.innerWidth * 0.9));
    const height = Math.min(1150, Math.floor(window.innerHeight * 0.9));
    super({
      ...options,
      position: { width, height, ...options?.position },
    }, ...args);
    // The legacy context builder reads these values on every render.
    this.sheetWidth = this.position.width;
    this.sheetHeight = this.position.height;
    this._filters = { skills: new Set() };
    this._sheetTab = undefined;
    this._tabs = [];
    this.pools = new Map();
  }

  // V2 supplies an Item document; the FFG handler still consumes drag data.
  async _onDropItem(event, item) {
    if (!this.isEditable || !this.actor.isOwner) return false;
    if(item?.documentName==='Item'&&await dropPossession(this,event,item))return false;
    const data = item?.documentName === "Item" ? item.toDragData() : item;
    return ActorSheetFFG.prototype._onDropItem.call(this, event, data);
  }

  async _onDropItemCreate(data) {
    if (!this.isEditable || !this.actor.isOwner) return [];
    return this.actor.createEmbeddedDocuments("Item", Array.isArray(data) ? data : [data]);
  }

  async close(options = {}) {
    const result = await super.close(options);
    // Keep the selected tab during edits, but start at the first tab on reopening.
    if (!this.rendered) this._sheetTab = undefined;
    return result;
  }

  get object() { return this.document; }

  _onPosition(position) {
    super._onPosition(position);
    if (this.minimized) return;
    this.sheetWidth = position.width;
    this.sheetHeight = position.height;
  }

  get title() {
    if (!this.actor.isToken) return this.actor.name;
    return `[${game.i18n.localize("DOCUMENT.Token")}] ${this.actor.name}`;
  }

  _getHeaderControls() {
    const controls = super._getHeaderControls();
    controls.unshift({
      action: "ffgSheetOptions",
      icon: "fas fa-wrench",
      label: game.i18n.localize("SWFFG.SheetOptions"),
      visible: this.isEditable,
      onClick: () => this.sheetoptions?.handler(),
    });
    if (this.actor.type === "character") controls.splice(1, 0, {action: "ffgCalculationDetails", icon: "fas fa-calculator", label: "Détail des calculs", onClick: () => showCalculationDetails(this.actor)});
    if(this.actor.type==='character') controls.push({action:'ffgCreationGuide',icon:'fas fa-graduation-cap',label:'Création et XP',onClick:async()=>{const {showCreationGuide}=await import('../helpers/creation-guide.js');return showCreationGuide(this.actor);}});
    const detachIndex = controls.findIndex(control => control.action === "detach");
    if (detachIndex > 0) controls.unshift(controls.splice(detachIndex, 1)[0]);
    return controls;
  }

  get template() {
    return `systems/starwarsffg/templates/actors/ffg-${this.actor.type}-sheet.html`;
  }

  _configureRenderParts(options) {
    const parts = super._configureRenderParts(options);
    parts.sheet.template = this.template;
    return parts;
  }

  async _prepareContext(options={}) {
    const previousPosition={width:this.position.width,height:this.position.height};
    const context=await ActorSheetFFG.prototype.getData.call(this,options);
    context.inventoryPossessionsEnabled=['character','minion','rival','nemesis'].includes(this.actor.type);
    if(context.inventoryPossessionsEnabled){
      const items=Array.from(context.items?.contents??context.items??[]);
      context.possessions=items.filter(isPossession).map(item=>({...item.toObject?.()??item,possessionTypeLabel:game.i18n.localize(`TYPES.Item.${item.type}`)}));
      context.items=items.filter(item=>!isPossession(item));
    }
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
    frame.classList.add(this.actor.type,this.isEditable?'editable':'locked');frame.querySelector('.window-content')?.classList.add(this.actor.type);
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
    activateInventoryImagePreview(this);
    activateInventoryPossessions(this);
    const {renderDodgeButton}=await import('../helpers/dodge-reaction.js');
    renderDodgeButton(this);
    const actorClasses = ["character", "nemesis", "rival", "minion", "vehicle", "homestead", "editable", "locked"];
    this.element.classList.remove(...actorClasses);
    this.element.classList.add(this.actor.type, this.isEditable ? "editable" : "locked");
    // Legacy styles expect the actor type on the content inside the sheet host.
    const content = this.element.querySelector(".window-content");
    content.classList.remove(...actorClasses);
    content.classList.add(this.actor.type);
    const isCharacter = this.actor.type === 'character';
    const npcWithTalents = ['minion', 'rival', 'nemesis'].includes(this.actor.type) && summaryTalents(this.actor).length > 0;
    {
      const sidebar = this.element.querySelector('.sheet-tabs');
      if (sidebar) {
        sidebar.querySelectorAll('.ffg-summary-button').forEach(button => button.remove());
        const summaryButtons = [];
        if (isCharacter || npcWithTalents) summaryButtons.push(['Récapitulatif des talents', 'fa-list-check', showTalentSummary]);
        if (isCharacter) summaryButtons.push(['Récapitulatif de l’équipement', 'fa-suitcase', showEquipmentSummary]);
        for (const [label, icon, show] of summaryButtons) {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'ffg-summary-button';
          button.title = label;
          button.setAttribute('aria-label', label);
          const symbol = document.createElement('i');
          symbol.className = `fa-solid ${icon}`;
          symbol.setAttribute('aria-hidden', 'true');
          button.append(symbol);
          button.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            void show(this);
          });
          sidebar.append(button);
        }
      }
    }
    if (isCharacter || npcWithTalents) void showTalentSummary(this, true);
    else if (this._talentSummary?.rendered) void this._talentSummary.close();
    if (isCharacter) {
      void showEquipmentSummary(this, true);
      if (this.actor.flags?.starwarsffg?.automaticStats?.enabled) {
        for (const path of ["wounds.max", "strain.max", "soak.value", "defence.melee", "defence.ranged", "encumbrance.max"]) {
          const input = this.element.querySelector(`[name="data.stats.${path}"], [name="system.stats.${path}"]`);
          if (input) {input.disabled = true; input.title = "Calcul automatique : voir Détail des calculs";}
        }
      }
    }
    this._activateLegacyListeners($(this.element));
    if(this.element?.ownerDocument){
      const {renderSkillModifierSummary}=await import('../helpers/skill-modifier-summary.js');
      renderSkillModifierSummary(this);
    }

  }

  _activateLegacyListeners(html) {
    return ActorSheetFFG.prototype._activateFFGListeners.call(this, html);
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
    const updateData = { ...formData.object };
    const overrides = this._manualEditMode && !this.actor.flags?.starwarsffg?.automaticStats?.enabled ? {} : foundry.utils.flattenObject(this.actor.overrides);
    for (const key of Object.keys(overrides)) {
      delete updateData[key];
      // These legacy templates still submit data.*, while V14 overrides use system.*.
      delete updateData[key.replace(/^system\./, "data.")];
    }
    // Blank/invalid numeric inputs must not erase persisted statistics on unrelated edits.
    for (const input of this.form?.querySelectorAll('[data-dtype="Number"], input[type="number"]') ?? []) {
      const value = updateData[input.name];
      if (input.disabled || value === null || value === "" || (value !== undefined && !Number.isFinite(Number(value)))) delete updateData[input.name];
    }
    return this._updateObject(event, updateData);
  }
}

const v2Lifecycle = new Set(["constructor", "activateListeners", "getData", "render", "_onSubmit"]);
for (const name of Object.getOwnPropertyNames(ActorSheetFFG.prototype)) {
  if (v2Lifecycle.has(name) || Object.hasOwn(ActorSheetFFGV2.prototype, name)) continue;
  Object.defineProperty(ActorSheetFFGV2.prototype, name, Object.getOwnPropertyDescriptor(ActorSheetFFG.prototype, name));
}
