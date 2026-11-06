import {prepareLegacySheetContext, revealSheetFrame} from '../applications/legacy-sheet-layout.js';
import {activateHomesteadFields} from '../helpers/homestead-fields.js';
import {vehicleMaintenance,applyVehicleMaintenanceEdit} from '../helpers/vehicle-maintenance.js';
import {prepareVehicleMalfunctions,vehicleMalfunctionAction} from '../helpers/vehicle-malfunctions.js';
import {prepareVehicleLogbook,activateVehicleLogbook} from '../helpers/vehicle-logbook.js';
import {prepareVehicleOwners,dropVehicleOwner,activateVehicleOwners} from '../helpers/vehicle-owners.js';
import {vehicleConsumables, applyConsumableStockEdit, vehicleFuel, applyVehicleFuelEdit} from '../helpers/vehicle-consumables.js';
import {isPossession} from '../helpers/inventory-location.js';
import {activateInventoryPossessions,dropPossession} from '../helpers/inventory-possessions.js';
import {showEquipmentSummary} from "../helpers/equipment-summary.js";
import {showCalculationDetails} from "../helpers/stat-calculation-dialog.js";
import {annotateTalentMechanisms, showTalentSummary, hasSummaryTalents} from "../helpers/talent-summary.js";
import { activateSheetPortrait, activateInventoryImagePreview } from "../helpers/sheet-portrait.js";
import { ActorSheetFFG } from "./actor-sheet-ffg.js";

const { ActorSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;

/** ApplicationV2 and Handlebars host for the Star Wars FFG actor sheet. */
export class ActorSheetFFGV2 extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["starwarsffg", "sheet", "actor", "v2", "themed"],
    editable: true,
    actions: {vehicleMalfunction: vehicleMalfunctionAction},
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

  async _onDrop(event) {
    if(await dropVehicleOwner(this,event))return;
    return super._onDrop(event);
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
    await this._triggeredTalentsWindow?.close();
    this._triggeredTalentsWindow = undefined;
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
    const context = await prepareLegacySheetContext(this, options, ActorSheetFFG.prototype.getData);
    if (this.actor.type === 'vehicle') {
      const editable = this.isEditable && this.actor.isOwner;
      context.vehicleConsumables = vehicleConsumables(this.actor);
      context.vehicleFuel = vehicleFuel(this.actor);
      context.vehicleMaintenance = vehicleMaintenance(this.actor);
      context.maintenanceInputId = this.id + '-maintenance';
      context.canEditConsumableStock = editable && game.user.isGM;
      context.canEditVehicle = editable;
      context.vehicleJourneys = prepareVehicleLogbook(this.actor);
      [context.vehicleOwners, context.vehicleMalfunctions] = await Promise.all([
        prepareVehicleOwners(this.actor), prepareVehicleMalfunctions(this.actor)
      ]);
    }
    context.inventoryPossessionsEnabled=['character','minion','rival','nemesis'].includes(this.actor.type);
    if(context.inventoryPossessionsEnabled){
      const items=Array.from(context.items?.contents??context.items??[]);
      context.possessions=items.filter(isPossession).map(item=>({...item.toObject?.()??item,possessionTypeLabel:game.i18n.localize(`TYPES.Item.${item.type}`)}));
      context.items=items.filter(item=>!isPossession(item));
    }
    return context;
  }

  _preSyncPartState(partId, newElement, priorElement, state) {
    super._preSyncPartState(partId, newElement, priorElement, state);
    if (partId !== 'sheet') return;
    state.ffgActiveTab = this._sheetTab;
    // Foundry's generic ".tab" selector only saves the first tab. The root
    // window-content and the equipment tab can both be scrolled independently.
    const selectors = ['', '.sheet-body', '.sheet-tabs', '.header-description-block',
      ...Array.from(priorElement.querySelectorAll('.tab[data-tab]'),
        tab => `.tab[data-tab="${CSS.escape(tab.dataset.tab)}"]`)];
    state.scrollPositions = selectors.flatMap(selector => {
      const element = selector ? priorElement.querySelector(selector) : priorElement;
      return element ? [[selector, element.scrollTop, element.scrollLeft]] : [];
    });
  }

  _syncPartState(partId, newElement, priorElement, state) {
    // Restore visibility synchronously, before restoring scroll offsets. Hidden
    // tabs clamp scrollTop to zero; legacy listeners are attached later.
    if (partId === 'sheet' && state.ffgActiveTab) {
      for (const tab of newElement.querySelectorAll('.tab[data-tab], .sheet-tabs [data-tab]')) {
        tab.classList.toggle('active', tab.dataset.tab === state.ffgActiveTab);
      }
    }
    super._syncPartState(partId, newElement, priorElement, state);
  }

  async _renderHTML(context, options) {
    const result = await super._renderHTML(context, options);
    const element = result.sheet;
    if (element) {
      // Finish the sidebar while the new template is still detached. Adding
      // these controls after awaited render hooks visibly shrinks and regrows it.
      this._prepareSidebar(element);
      const active = this._sheetTab ?? element.querySelector('.sheet-tabs [data-tab]')?.dataset.tab;
      for (const tab of element.querySelectorAll('.tab[data-tab], .sheet-tabs [data-tab]')) {
        tab.classList.toggle('active', tab.dataset.tab === active);
      }
    }
    return result;
  }

  _prepareSidebar(element) {
    const isCharacter = this.actor.type === 'character';
    const npcWithTalents = ['minion', 'rival', 'nemesis'].includes(this.actor.type) && hasSummaryTalents(this.actor);
    {
      const sidebar = element.querySelector('.sheet-tabs');
      if (sidebar) {
        sidebar.querySelectorAll('.ffg-summary-button').forEach(button => button.remove());
        const summaryButtons = [];
        if (isCharacter || npcWithTalents) summaryButtons.push(['Récapitulatif des talents', 'fa-list-check', showTalentSummary]);
        if (isCharacter || npcWithTalents) summaryButtons.push(['Déclencher un talent', 'fa-bolt', async sheet => {try {await (await import('../helpers/triggered-talents.js')).showTriggeredTalents(sheet);} catch(error) {ui.notifications.error(error.message);}}]);
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
  }

  async _renderFrame(options) {
    const frame=await super._renderFrame(options);
    frame.classList.add('ffg-sheet-pending');
    frame.classList.add(this.actor.type,this.isEditable?'editable':'locked');frame.querySelector('.window-content')?.classList.add(this.actor.type);
    return frame;
  }

  async _postRender(context,options) {
    await super._postRender(context,options);
    revealSheetFrame(this, options);
  }

  async getData(options={}) { return this._prepareContext(options); }

  async _onRender(context, options) {
    await super._onRender(context, options);
    activateSheetPortrait(this);
    activateHomesteadFields(this);
    activateInventoryImagePreview(this);
    activateInventoryPossessions(this);
    activateVehicleOwners(this);
    activateVehicleLogbook(this);

    const {renderDodgeButton}=await import('../helpers/dodge-reaction.js');
    renderDodgeButton(this);
    annotateTalentMechanisms(this);
    const {renderReviewedTalentControls}=await import('../helpers/reviewed-talent-ui.js');renderReviewedTalentControls(this);
    const actorClasses = ["character", "nemesis", "rival", "minion", "vehicle", "homestead", "editable", "locked"];
    this.element.classList.remove(...actorClasses);
    this.element.classList.add(this.actor.type, this.isEditable ? "editable" : "locked");
    // Legacy styles expect the actor type on the content inside the sheet host.
    const content = this.element.querySelector(".window-content");
    content.classList.remove(...actorClasses);
    content.classList.add(this.actor.type);
    const isCharacter = this.actor.type === 'character';
    const npcWithTalents = ['minion', 'rival', 'nemesis'].includes(this.actor.type) && hasSummaryTalents(this.actor);
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
    this._activateLegacyListeners($(this.element), context);
    if(this.element?.ownerDocument){
      const {renderSkillModifierSummary}=await import('../helpers/skill-modifier-summary.js');
      renderSkillModifierSummary(this);
    }

  }

  _activateLegacyListeners(html, context) {
    return ActorSheetFFG.prototype._activateFFGListeners.call(this, html, context);
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
    // User-reviewed career and armour bonuses are derived, including in manual edit mode.
    for(const key of this.actor._reviewedTalentPaths??[]){delete updateData[key];delete updateData[key.replace(/^system\./,'data.')];}

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
    if (this.actor.type === 'vehicle') {
      const changedName = event?.target?.name;
      const virtualEdit = {
        vehicleMaintenanceAmount: ['vehicleMaintenanceRevision', applyVehicleMaintenanceEdit],
        vehicleConsumablesAmount: ['vehicleConsumablesRevision', applyConsumableStockEdit],
        vehicleFuelCurrent: ['vehicleFuelRevision', applyVehicleFuelEdit]
      };
      const options = {changedName, isGM: game.user.isGM};
      try {
        if (Object.hasOwn(virtualEdit, changedName)) {
          const [revision, apply] = virtualEdit[changedName];
          const update = {[changedName]: updateData[changedName], [revision]: updateData[revision]};
          apply(this.actor, update, options);
          return await this.actor.update(update);
        }
        for (const [name, [revision]] of Object.entries(virtualEdit)) {
          delete updateData[name];
          delete updateData[revision];
        }
        // Fuel capacity is a regular actor flag, validated against the current reserve.
        if (Object.hasOwn(updateData, 'flags.starwarsffg.fuelCapacity')) applyVehicleFuelEdit(this.actor, updateData, options);
      } catch (error) {
        ui.notifications.warn(error.message);
        this.render();
        return;
      }
    }
    return this._updateObject(event, updateData);
  }
}

const v2Lifecycle = new Set(["constructor", "activateListeners", "getData", "render", "_onSubmit"]);
for (const name of Object.getOwnPropertyNames(ActorSheetFFG.prototype)) {
  if (v2Lifecycle.has(name) || Object.hasOwn(ActorSheetFFGV2.prototype, name)) continue;
  Object.defineProperty(ActorSheetFFGV2.prototype, name, Object.getOwnPropertyDescriptor(ActorSheetFFG.prototype, name));
}
