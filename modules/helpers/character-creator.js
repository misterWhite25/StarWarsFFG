import { LegacyDialogV2 } from "../applications/legacy-dialog-v2.js";
import { ItemSheetFFGV2 } from "../items/item-sheet-ffg-v2.js";
import { observeBookTree, observeForceTree, prepareBookForceUpgrades, prepareBookTalents } from './wizard-book-trees.mjs';
import PopoutEditor from '../popout-editor.js';
import EffectHelpers from "./effects.js";
import {updateWizardPreview} from './wizard-preview.mjs';
import {xpLogEarn, xpLogSpend} from "./actor-helpers.js";
import DiceHelpers from "./dice-helpers.js";
import CharacteristicIncrease from './characteristic-increase.js';
import {sortDataBy} from "../actors/actor-sheet-ffg.js";
import {weaponQualityName} from './weapon-selection.js';
import {advancementCatalogue, advancementTree, careerSpecializations, CREATION_CHARACTERISTIC_MAX, CREATION_SKILL_MAX, forceRatingRequirement, sameAdvancementItem, skillCost, specializationCost, specializationOptions, startingRanks, treeCost} from './advancement.js';

const wizardTableLanguage = () => ({
  emptyTable: game.i18n.localize("SWFFG.UI.Actor.WizardTable.emptyTable"),
  info: game.i18n.localize("SWFFG.UI.Actor.WizardTable.info"),
  infoEmpty: game.i18n.localize("SWFFG.UI.Actor.WizardTable.infoEmpty"),
  infoFiltered: game.i18n.localize("SWFFG.UI.Actor.WizardTable.infoFiltered"),
  loadingRecords: game.i18n.localize("SWFFG.UI.Actor.WizardTable.loadingRecords"),
  processing: game.i18n.localize("SWFFG.UI.Actor.WizardTable.processing"),
  search: game.i18n.localize("SWFFG.UI.Actor.WizardTable.search"),
  zeroRecords: game.i18n.localize("SWFFG.UI.Actor.WizardTable.zeroRecords"),
  paginate: {first: game.i18n.localize("SWFFG.UI.Actor.WizardTable.Page.first"), last: game.i18n.localize("SWFFG.UI.Actor.WizardTable.Page.last"), next: game.i18n.localize("SWFFG.UI.Actor.WizardTable.Page.next"), previous: game.i18n.localize("SWFFG.UI.Actor.WizardTable.Page.previous")},
  aria: {orderable: game.i18n.localize("SWFFG.UI.Actor.WizardTable.Sort.orderable"), orderableReverse: game.i18n.localize("SWFFG.UI.Actor.WizardTable.Sort.orderableReverse"), orderableRemove: game.i18n.localize("SWFFG.UI.Actor.WizardTable.Sort.orderableRemove")}
});
const wizardSelectSettings = () => ({
  placeholderText: game.i18n.localize("SWFFG.UI.Actor.WizardSelect.placeholderText"),
  searchPlaceholder: game.i18n.localize("SWFFG.UI.Actor.WizardSelect.searchPlaceholder"),
  searchText: game.i18n.localize("SWFFG.UI.Actor.WizardSelect.searchText"),
  searchingText: game.i18n.localize("SWFFG.UI.Actor.WizardSelect.searchingText")
});

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api

const RULE_STAT = {fad: 'morality', aor: 'duty', eote: 'obligation'};

function creationGearCost(item) {
  const price = item?.system?.price?.value;
  if (price == null || price === '') return NaN;
  const cost = Number(price);
  return Number.isSafeInteger(cost) && cost >= 0 ? cost : NaN;
}

const STEP_CATALOGUES = {
  background: ['availableBackgrounds', 'getBackgrounds'],
  species: ['availableSpecies', 'getAvailableSpecies'],
  career: ['availableCareers', 'getAvailableCareers'],
  motivation: ['availableMotivations', 'getAvailableMotivations'],
  gear: ['items', 'getItems'],
};

const BACKGROUND_SUGGESTIONS = {
  cultures: {
    types: ['culture'],
    entries: {ComfortableWithTech: '45', PrimitiveBackwater: '45', PrivilegedFew: '45-46', PoorAndHungry: '46'},
  },
  hooks: {
    types: ['hook'],
    entries: {FleeingTheEmpire: '47', DesireForUnderstanding: '47', WithGreatPower: '47', UltimateAbilities: '47'},
  },
  forceAttitudes: {
    types: ['force', 'attitude'],
    entries: {AncientReligion: '46', DutyToTradition: '46-47', PragmaticPower: '47', OneWithTheForce: '47'},
  },
};

const STARTING_TRAIT_GROUPS = [
  {key: 'Obligation', type: 'obligation', label: 'SWFFG.DescriptionObligation'},
  {key: 'Duty', type: 'duty', label: 'SWFFG.DescriptionDuty'},
  {key: 'Strength', type: 'morality', subtype: 'Emotional Strength', label: 'SWFFG.CharacterCreator.Obligation.EmotionalStrength'},
  {key: 'Weakness', type: 'morality', subtype: 'Emotional Weakness', label: 'SWFFG.CharacterCreator.Obligation.EmotionalWeakness'},
];

const CORE_MOTIVATION_CATALOGUE = {
  Ambition: {page: 106, entries: ['Revenge', 'Wealth', 'Power', 'BecomeAJedi', 'Survival', 'Glory', 'DestroyTheSith', 'Enlightenment', 'Expertise', 'Discovery']},
  Cause: {page: 106, entries: ['Freedom', 'RestoreTheJedi', 'GalacticPeace', 'Justice', 'StopTheRebellion', 'Equality', 'HelpTheHelpless', 'FreeEnterprise', 'OverthrowTheEmpire', 'Knowledge']},
  Faith: {page: 107, entries: ['NaturalWorld', 'GoodnessOfPeople', 'FriendsAndFamily', 'CosmicForce', 'ScienceAndReason', 'JediCode', 'ImperialRule', 'Rebellion', 'ReligiousCode', 'Nothing']},
};

function speciesPortrait(species) {
  const src = species?.img?.trim();
  if (!src || /(?:^|\/)icons\/svg\/(?:mystery-man|item-bag)\.svg(?:[?#].*)?$/i.test(src)) return null;
  return src;
}

function showImagePreview(src, title) {
  if (!src) return;
  return new foundry.applications.apps.ImagePopout({src, window: {title}}).render({force: true});
}

function specializationTalentList(specialization, locale) {
  const groups = new Map();
  for (const talent of Object.values(specialization.system.talents ?? {})) {
    const name = talent?.name?.trim();
    if (!name) continue;
    const lower = name.toLocaleLowerCase(locale);
    const key = JSON.stringify([lower.normalize(), talent.itemId || talent.description]);
    const group = groups.get(key);
    if (group) {
      group.count++;
    } else {
      const label = name === name.toLocaleUpperCase(locale) ? lower.charAt(0).toLocaleUpperCase(locale) + lower.slice(1) : name;
      groups.set(key, {label, count: 1, description: talent.description});
    }
  }
  return [...groups.values()];
}

const gearIcons = {
  weapon: 'fa-crosshairs',
  shipweapon: 'fa-crosshairs',
  armour: 'fa-shield-halved',
  gear: 'fa-toolbox',
  itemattachment: 'fa-screwdriver-wrench',
  itemmodifier: 'fa-sliders',
};
const gearTypeLabels = {
  weapon: 'TYPES.Item.weapon',
  armour: 'TYPES.Item.armour',
  armor: 'TYPES.Item.armour',
  vehicle: 'TYPES.Actor.vehicle',
  gear: 'TYPES.Item.gear',
  all: 'SWFFG.ModTypeAll',
  mount: 'SWFFG.CharacterCreator.tables.labels.Mount',
};
const gearNumberFields = ['price', 'damage', 'crit', 'rarity', 'encumbrance', 'hardpoints', 'defence', 'soak'];
const gearModifierLabels = {
  'add boost mod': 'SWFFG.ModTypeAddBoost',
  'add setback mod': 'SWFFG.ModTypeAddSetback',
  'remove setback mod': 'SWFFG.ModTypeRemSetback',
};

function gearIdentity(item) {
  const img = item.img?.trim();
  const genericImage = /(?:\/defaults\/(?:items\/)?(?:weapon|armor|armour|gear|attachment|itemmodifier)(?:-steelers)?\.[\w]+|\bicons\/svg\/(?:mystery-man|item-bag|sword)\.svg)(?:[?#].*)?$/i;
  return {portrait: img && !genericImage.test(img) ? img : null, icon: gearIcons[item.type] ?? gearIcons.gear};
}

function gearNumber(value, format) {
  const number = typeof value === 'string' && value.trim() ? Number(value) : value;
  return Number.isFinite(number) ? {order: number, label: format.format(number)} : {order: '', label: '-'};
}

function gearTableRow(item, format) {
  const {system} = item;
  const skill = system.skill?.value;
  const range = system.range?.value;
  const {ranges, sensor_ranges, vehicle_ranges} = CONFIG.FFG;
  const rangeLabel = ranges[range]?.label ?? vehicle_ranges?.[range]?.label ?? sensor_ranges[range]?.label;
  return {
    item,
    ...gearIdentity(item),
    numbers: Object.fromEntries(gearNumberFields.map(field => [field, gearNumber(system[field]?.value, format)])),
    skill: skill ? game.i18n.localize(CONFIG.FFG.skills[skill]?.label ?? skill) : '-',
    range: range ? game.i18n.localize(rangeLabel ?? range) : '-',
    type: system.type ? game.i18n.localize(gearTypeLabels[system.type] ?? system.type) : '-',
    qualities: Object.values(system.itemmodifier ?? {}).filter(quality => quality?.name).map(quality => {
      const key = gearModifierLabels[quality.name.trim().toLowerCase()];
      const name = key ? game.i18n.localize(key) : weaponQualityName(quality.name);
      return {name, description: quality.system?.description};
    }),
  };
}

export class CharacterCreator extends HandlebarsApplicationMixin(ApplicationV2) {
  static #specializationPurchase;

  // https://foundryvtt.wiki/en/development/api/applicationv2

  static PARTS = {
    header: { template: 'systems/starwarsffg/templates/wizards/char_creator/header.html' },
    tabs: { template: 'templates/generic/tab-navigation.hbs' },
    background: {
      template: 'systems/starwarsffg/templates/wizards/char_creator/tabs/background.html'
    },
    species: {
      template: 'systems/starwarsffg/templates/wizards/char_creator/tabs/species.html'
    },
    career: {
      template: 'systems/starwarsffg/templates/wizards/char_creator/tabs/career.html'
    },
    specialization: {
      template: 'systems/starwarsffg/templates/wizards/char_creator/tabs/career.html'
    },
    xp_spend: {
      template: 'systems/starwarsffg/templates/wizards/char_creator/tabs/xp_spend.html'
    },
    motivation: {
      template: 'systems/starwarsffg/templates/wizards/char_creator/tabs/motivation.html'
    },
    gear: {
      template: 'systems/starwarsffg/templates/wizards/char_creator/tabs/gear.html'
    },
    review: {
      template: 'systems/starwarsffg/templates/wizards/char_creator/tabs/review.html'
    },
    footer: { template: 'systems/starwarsffg/templates/wizards/char_creator/footer.html' },
  }

  /** @type {Record<string, foundry.applications.types.ApplicationTabsConfiguration>} */
  static TABS = {
    primary: {
      tabs: [
        // https://foundryvtt.wiki/en/development/guides/Tabs-and-Templates/Tabs-in-AppV2
        {
          id: "background",
          label: "SWFFG.UI.Actor.WizardTab.background"
        },
        {
          id: "species",
          label: "SWFFG.UI.Actor.WizardTab.species"
        },
        {
          id: "career",
          label: "SWFFG.UI.Actor.WizardTab.career"
        },
        {
          id: "specialization",
          label: "SWFFG.UI.Actor.WizardTab.specialization"
        },
        {
          id: "xp_spend",
          label: "SWFFG.UI.Actor.WizardTab.xp_spend"
        },
        {
          id: "motivation",
          label: "SWFFG.UI.Actor.WizardTab.motivation"
        },
        {
          id: "gear",
          label: "SWFFG.UI.Actor.WizardTab.gear"
        },
        {
          id: "review",
          label: "SWFFG.UI.Actor.WizardTab.review"
        },
      ],
      //labelPrefix: "MYSYS.tab", // Optional. Prepended to the id to generate a localization key
      initial: "background",
    },
  };

  static DEFAULT_OPTIONS = {
    tag: "form",
    form: {
      handler: CharacterCreator.myFormHandler,
      submitOnChange: false,
      closeOnSubmit: false
    },
    actions: {
      moveCreationStep: CharacterCreator.moveCreationStep,
      previewSpeciesPortrait: CharacterCreator.previewSpeciesPortrait,
      previewGearImage: CharacterCreator.previewGearImage,
      createWizardActor: function() { return this.createActorShim(); },
    },
    window: {title: "SWFFG.CharacterCreator.Entry.Button", resizable: true},
    position: {
      width: 950,
      height: 800,
    },
    classes: ["starwarsffg", "wizard", "charCreator"],
  }

  constructor(options={}) {
    super(options);
    this.data = {
      // items granted - either by the GM or by the starting bonus, etc
      grants: {
        gm: {
          credits: game.settings.get("starwarsffg", "defaultCredits"),
        },
        bonus: {
          xp: 0,
          credits: 0,
          duty: 0,
          obligation: 0,
          morality: 0,
        },
        species: {},
        career: {},
        specialization: {},
      },
      // choices made by the user
      selected: {
        background: {
          culture: null,
          hook: null,
          forceAttitude: null,
        },
        startingBonus: null,
        obligations: [],
        species: null,
        speciesStartingChoices: {},
        career: null,
        careerCareerSkillRanks: [],
        specialization: null,
        specializationCareerSkillRanks: [],
        rules: 'fad',
        motivations: [],
        artwork: {portrait: '', token: ''},
      },
      // filtered list of specializations based on the selected career
      available: {
        specializations: [],
      },
      // things purchased by the user, with XP or credits
      purchases: {
        xp: {
          characteristics: [],
          skills: [],
          talents: [],
          specializations: [],
          forcePowers: [],
        },
        credits: [],
      },
      initial: {
        duty: game.settings.get("starwarsffg", "defaultDuty"),             // decreased with starting bonuses
        obligation: game.settings.get("starwarsffg", "defaultObligation"), // increased with starting bonuses
        morality: game.settings.get("starwarsffg", "defaultMorality"),     // increased or decreased with starting bonuses
      },
      spendingCredits: Math.floor(Math.random() * 100) + 1,
    };
    this.compendiumData = {};
    this.stepWidgets = [];
    this.stepTableStates = new Map();

    if (game.users.filter(u => u.isGM && u.active).length === 0) {
      ui.notifications.error(game.i18n.localize("SWFFG.CharacterCreator.Checks.GM"));
      return this.close();
    }
    this._wizardSocketHandler = async (message, senderId) => {
      if (message?.eventType !== "pcWizard" || senderId !== game.users.activeGM?.id ||
          message.recipient !== game.user.id || message.wizardId !== this._wizardSession) return;
      if (message.event === "createCharacterResponse" && this._previewRequest && message.requestId === this._previewRequest) {
        this._previewRequest = null;
        const update = this._previewUpdating;
        try {
          await this.showCharacterStatus(message.actorId, update);
        } finally {
          if (this._previewUpdating === update) this._previewUpdating = null;
        }
      } else if (message.event === "createFinalActorResponse" && this._finalRequest && message.requestId === this._finalRequest) {
        this._finalRequest = null;
        await this.createActor(message.actorId);
      }
    };
    game.socket.on("system.starwarsffg", this._wizardSocketHandler);
  }

  _speciesWizardAPI() {
    return game.modules.get("swffg-compendium-bilingual-steelers-core_rule")?.api?.species;
  }

  async _syncWizardSpecies(actor) {
    const api = this._speciesWizardAPI();
    if (typeof api?.syncWizardSpecies !== "function") return null;
    try {
      const result = await api.syncWizardSpecies(this, actor);
      this._steelersSpeciesStatus = result;
      return result;
    } catch (error) {
      // Keep a blocked preview editable; the final preflight refuses completion.
      const result = {status: "blocked", error};
      this._steelersSpeciesStatus = result;
      CONFIG.logger.error("Species wizard synchronization", error);
      return result;
    }
  }

  _configureRenderOptions(options) {
    if (options.creationStep) this.tabGroups.primary = options.creationStep;
    super._configureRenderOptions(options);
  }

  _configureRenderParts(options) {
    const parts = super._configureRenderParts(options);
    const step = this.tabGroups.primary ?? this.constructor.TABS.primary.initial;
    return {header: parts.header, tabs: parts.tabs, [step]: parts[step], footer: parts.footer};
  }

  _replaceHTML(result, content, options) {
    const step = this.tabGroups.primary;
    if (result[step]) {
      const previous = content.querySelector(':scope > .tab[data-group="primary"]');
      options.stepScroll = ['background', 'career', 'specialization', 'xp_spend'].includes(step) && previous?.dataset.tab === step
        ? {top: previous.scrollTop, left: previous.scrollLeft}
        : null;
      this.destroyStepWidgets();
      if (previous && previous.dataset.tab !== step) previous.remove();
    }
    super._replaceHTML(result, content, options);
    if (result[step]) content.querySelector('[data-application-part="footer"]')?.before(result[step]);
  }

  async _postRender(context, options) {
    await super._postRender(context, options);
    if (options.stepScroll) {
      // Restore after the tables have reapplied their saved search and pagination.
      this.element.querySelector('.tab.active[data-group="primary"]')?.scrollTo({...options.stepScroll, behavior: 'instant'});
    }
  }

  async _onClose(options) {
    this.destroyStepWidgets();
    if (this._wizardSocketHandler) game.socket.off('system.starwarsffg', this._wizardSocketHandler);
    const purchase = CharacterCreator.#specializationPurchase;
    if (purchase?.wizard === this) {
      await purchase.dialog?.close();
      if (CharacterCreator.#specializationPurchase === purchase) CharacterCreator.#specializationPurchase = undefined;
    }
    if (this._wizardSession) {
      if (game.user.isGM) await updateWizardPreview(game.user, this._wizardSession, true);
      else game.socket.emit("system.starwarsffg", {
        eventType: "pcWizard", event: "deleteCharacter", wizardId: this._wizardSession,
      });
    }
    await super._onClose(options);
  }

  destroyStepWidgets() {
    for (const widget of this.stepWidgets) widget.destroy();
    this.stepWidgets.length = 0;
  }

  createStepTable(section, id, options = {}) {
    const table = new globalThis.DataTable(section.querySelector('#' + id), {
      language: wizardTableLanguage(),
      pageLength: 20,
      lengthChange: false,
      stateSave: true,
      stateSaveCallback: (_settings, state) => this.stepTableStates.set(id, state),
      stateLoadCallback: () => this.stepTableStates.get(id) ?? null,
      ...options,
    });
    this.stepWidgets.push(table);
    return table;
  }

  createStepSelect(section, id, selected, onChange) {
    const element = section.querySelector('#' + id);
    if (!element) return;
    const select = new globalThis.SlimSelect({
      select: element,
      settings: wizardSelectSettings(),
      events: {afterChange: ([option]) => option && onChange(option)},
    });
    if (selected) select.setSelected(selected, false);
    this.stepWidgets.push(select);
  }

  /** @override */
  async _onRender(context, options) {
    await super._onRender(context, options);
    this.updateCreationSteps();
    const step = this.tabGroups.primary;
    if (!options.parts.includes(step)) return;
    const section = this.element.querySelector('.tab.active[data-group="primary"]');
    const on = (type, selector, handler) => $(section).on(type, selector, event => handler.call(this, event));

    switch (step) {
      case 'background': {
        on('change', '#wizard-rules', event => this.selectRules(event.currentTarget.value));
        const {cultures, hooks, forceAttitudes} = context.availableBackgrounds;
        const background = this.data.selected.background;
        for (const [key, selectId, descriptionId, items] of [
          ['culture', 'culture', '#cultured_esc', cultures],
          ['hook', 'hook', '#hook_desc', hooks],
          ['forceAttitude', 'force_attitude', '#force_attitude_desc', forceAttitudes],
        ]) {
          this.createStepSelect(section, selectId, background[key]?.uuid, ({value}) => {
            const item = items.find(option => option.uuid === value) ?? null;
            background[key] = item;
            section.querySelector(descriptionId).textContent = item?.system.description ?? '';
          });
        }
        this.createStepSelect(section, 'startingBonus', this.data.selected.startingBonus, option => this.selectStartingBonus(option.value));
        const select = section.querySelector('#starting-trait');
        const add = section.querySelector('.wizard-add-starting-trait');
        const summary = section.querySelector('.wizard-starting-trait-summary');
        const choices = context.startingTraitGroups.flatMap(group => group.items);
        select.addEventListener('change', () => {
          const item = choices.find(option => option.uuid === select.value);
          add.disabled = !item;
          summary.textContent = item?.system.description || item?.system.metadata?.sources?.join(' · ') || '';
          summary.hidden = !summary.textContent;
        });
        on('click', '.wizard-add-starting-trait', async () => {
          const item = choices.find(option => option.uuid === select.value);
          if (!item || add.disabled) return;
          add.disabled = true;
          this.data.selected.obligations.push(new Item(item.toObject(), {temporary: true}));
          await this.render({force: true});
        });
        on('change', '.wizard-starting-trait-edit', event => {
          const input = event.currentTarget;
          const choice = this.data.selected.obligations[input.dataset.index];
          const value = input.name === 'magnitude' ? input.valueAsNumber : input.value;
          if (choice && (input.name !== 'magnitude' || (Number.isFinite(value) && input.checkValidity()))) {
            choice.updateSource({[`system.${input.name}`]: value});
          }
        });
        on('click', '.wizard-remove-starting-trait', async event => {
          event.currentTarget.disabled = true;
          this.data.selected.obligations.splice(Number(event.currentTarget.dataset.index), 1);
          await this.render({force: true});
        });
        break;
      }
      case 'species':
        this.createStepTable(section, 'species', {order: []});
        on('click', '.species-spend', this.handleSpeciesSelect);
        break;
      case 'career':
        this.createStepTable(section, 'careers');
        on('click', '.career-spend', this.handleCareerSelect);
        break;
      case 'specialization':
        this.createStepTable(section, 'specializations');
        on('click', '.specialization-spend', this.handleSpecializationSelect);
        break;
      case 'motivation':
        if (section.querySelector('#selected_motivations')) this.createStepTable(section, 'selected_motivations');
        this.createStepTable(section, 'motivations');
        on('click', '.motivation-spend', this.handleMotivationPurchase);
        on('click', '.motivation-refund', this.handleMotivationRefund);
        break;
      case 'gear':
        this.createGearTable(section);
        on('click', '.credit-spend', this.handleCreditPurchase);
        on('click', '.credit-refund', this.handleCreditRefund);
        break;
      case 'review':
        this.bindReviewArtwork(section);
        break;
      case 'xp_spend':
        on('click', '[data-action="characteristic-control"]', this.handleCharacteristicModify);
        on('click', '.purchase-specialization', this.handleSpecializationPurchase);
        on('click', '.specialization-remove', this.handleRemoveSpecialization);
        on('change', '.specialization-talent-purchase', this.handleSpecializationTalentPurchase);
        on('click', '.purchase-forcePower', this.handleForcePowerPurchase);
        on('click', '.forcePower-remove', this.handleRemoveForcePower);
        on('change', '.forcePower-talent-purchase', this.handleForcePowerTalentPurchase);
        for (const grid of section.querySelectorAll('.specialization-grid, .ffg-force-grid')) {
          const observer = grid.classList.contains('ffg-force-grid') ? observeForceTree(grid) : observeBookTree(grid);
          this.stepWidgets.push({destroy: () => observer.disconnect()});
        }
        break;
    }

    on('click', '[data-action="skill-control"]', this.handleSkillModify);
    const skillRows = section.querySelectorAll('.skill');
    if (skillRows.length && this.tempActor) {
      const data = foundry.utils.deepClone(this.tempActor.system);
      for (const row of skillRows) await DiceHelpers.addSkillDicePool({data}, row);
    }
  }

  bindReviewArtwork(section) {
    for (const picker of section.querySelectorAll('file-picker[data-wizard-artwork]')) {
      const kind = picker.dataset.wizardArtwork;
      const previews = section.querySelectorAll(`[data-artwork-preview="${kind}"]`);
      picker.input.setAttribute('aria-label', picker.dataset.label);
      if (picker.button) picker.button.tabIndex = 0;
      picker.addEventListener('input', () => {
        this.data.selected.artwork[kind] = picker.value.trim();
      });
      picker.addEventListener('change', () => {
        for (const preview of previews) {
          const src = this.data.selected.artwork[kind] || preview.dataset.defaultSrc;
          const image = preview.querySelector('img');
          if (src) image.setAttribute('src', src);
          else image.removeAttribute('src');
          image.hidden = !src;
          preview.querySelector('i').hidden = Boolean(src);
        }
      });
    }
  }

  createGearTable(section) {
    const applyDefaultFilter = !this.stepTableStates.has('buy_gear');
    const categories = [
      {label: 'SWFFG.ItemsWeapons', type: 'weapon', className: 'weapon', columns: [3, 4, 5, 6, 7, 8, 9, 10, 11]},
      {label: 'SWFFG.ItemsArmor', type: 'armour', className: 'armor', columns: [3, 6, 7, 8, 11, 12, 13]},
      {label: 'SWFFG.ItemsGear', type: 'gear', className: 'gear', columns: [3, 6, 7, 11]},
      {label: 'TYPES.Item.itemattachment', type: 'itemattachment', className: 'attachment', columns: [3, 6, 8, 14]},
      {label: 'TYPES.Item.itemmodifier', type: 'itemmod', icon: gearIcons.itemmodifier, className: 'mod', columns: [14]},
    ];
    const activateCategory = (table, selector) => {
      table.buttons('.wizard-gear-category').active(false).nodes().attr('aria-pressed', 'false');
      table.button(selector).active(true).node().attr('aria-pressed', 'true');
    };
    const table = this.createStepTable(section, 'buy_gear', {
      autoWidth: false,
      columnDefs: [{visible: false, targets: 0}],
      layout: {topStart: {buttons: categories.map(({label, type, icon = gearIcons[type], className, columns}) => ({
        text: `<i class="fa-solid ${icon}" aria-hidden="true"></i> ${foundry.utils.escapeHTML(game.i18n.localize(label))}`,
        className: `wizard-gear-category ${className}`,
        attr: {'aria-pressed': 'false'},
        action: (_event, dt, button) => {
          for (let column = 3; column <= 14; column++) dt.column(column).visible(columns.includes(column), false);
          dt.column(0).search(type).draw(false);
          dt.columns.adjust();
          activateCategory(dt, button);
        },
      }))}},
    });
    if (applyDefaultFilter) table.buttons('.weapon').trigger();
    else {
      const selected = categories.find(category => category.type === table.column(0).search());
      if (selected) activateCategory(table, '.' + selected.className);
    }
  }

  async loadStepCatalogue(step) {
    const catalogue = STEP_CATALOGUES[step];
    if (!catalogue) return;
    const [key, loader] = catalogue;
    if (!Object.hasOwn(this.compendiumData, key)) {
      if (step === 'background') {
        const [backgrounds, traits] = await Promise.all([this[loader](), this.getStartingTraitGroups()]);
        this.compendiumData[key] = backgrounds;
        this.compendiumData.startingTraitGroups = traits;
      } else {
        this.compendiumData[key] = await this[loader]();
      }
    }
  }

  /** @override */
  async _prepareContext() {
    // essentially, this takes the place of getData
    // only data returned by this is available to the template
    // async _preparePartContext(partId, context) may be used for specific parts
    const context = {
      // ...
      /** @type {Record<string, foundry.applications.types.ApplicationTab} */
      tabs: this._prepareTabs("primary"),
      data: this.data,
    };

    const step = this.tabGroups.primary;
    await this.loadStepCatalogue(step);

    context.availableBackgrounds = this.compendiumData['availableBackgrounds'];
    context.reviewBackgrounds = Object.values(this.data.selected.background).filter(Boolean);
    context.startingBonusesRadio = this.startingBonusForHTML();
    context.creationRules = CONFIG.FFG.characterCreator?.rules;
    context.startingTraitGroups = this.compendiumData.startingTraitGroups;
    if (step === 'background') {
      context.startingTraits = this.data.selected.obligations.map(item => {
        const group = STARTING_TRAIT_GROUPS.find(({type, subtype}) =>
          item.system.type === type && (!subtype || item.system.subtype === subtype));
        return {item, label: group?.label ?? 'SWFFG.DescriptionMorality'};
      });
    }
    context.availableSpecies = this.compendiumData.availableSpecies ?? [];
    context.speciesPortraits = Object.fromEntries(
      context.availableSpecies.map(species => [species.uuid, speciesPortrait(species)]),
    );
    context.availableCareers = this.compendiumData.availableCareers ?? [];
    context.filteredSpecializations = this.data.available.specializations;
    if (step === 'specialization') {
      context.specializationTalents = Object.fromEntries(context.filteredSpecializations.map(item => [
        item.uuid, specializationTalentList(item, game.i18n.lang),
      ]));
    }
    context.careerSkillLabels = Object.fromEntries(
      [...context.availableCareers, ...context.filteredSpecializations].map(item => {
        const skills = Object.values(item.system.careerSkills ?? {})
          .filter(skill => typeof skill === 'string')
          .map(skill => skill.trim())
          .filter(skill => skill && skill.toLowerCase() !== '(none)')
          .map(skill => game.i18n.localize(CONFIG.FFG.skills[skill]?.label ?? skill));
        return [item.uuid, skills.join(', ')];
      }),
    );
    context.availableMotivations = this.compendiumData['availableMotivations'];
    if (step === 'motivation') {
      const types = new Set(context.availableMotivations.map(item => item.system.type));
      const configuredTypes = Object.values(CONFIG.FFG.characterCreator.motivationTypes);
      context.motivationTypes = Object.fromEntries([...types].map(type => {
        const configured = configuredTypes.find(entry => entry.value.toLowerCase() === type?.toLowerCase());
        return [type, configured ? game.i18n.localize(configured.label) : type];
      }));
      context.selectedMotivationUuids = Object.fromEntries(this.data.selected.motivations.map(({item}) => [item.uuid, true]));
    }
    context.tempActor = this.tempActor;
    const characteristicPurchases = this.data.purchases.xp.characteristics;
    context.characteristicRows = Object.entries(this.tempActor?.system.characteristics ?? {}).map(([id, stat]) => ({
      id,
      label: game.i18n.localize(CONFIG.FFG.characteristics[id]?.label ?? id),
      value: stat.value,
      canIncrease: stat.value < CREATION_CHARACTERISTIC_MAX,
      canDecrease: characteristicPurchases.some(purchase => purchase.key === id && purchase.value === stat.value),
    }));
    if (this.tempActor && ['career', 'specialization', 'xp_spend'].includes(step)) {
      const skillData = foundry.utils.deepClone(
        this.tempActor.system
      );
      context.skillsList = this.tempActor.sheet._createSkillColumns({data: skillData});
      context.actor = this.tempActor;

    }
    const xp = this.calcXp();
    context.totalXp = xp.total;
    context.availableXp = xp.available;

    const credits = this.calcCredits();
    if (step === 'gear') {
      const format = new Intl.NumberFormat(game.i18n.lang);
      context.gearCatalogue = (this.compendiumData.items ?? []).map(item => ({
        ...gearTableRow(item, format),
        affordable: creationGearCost(item) <= credits.available,
      }));
      context.purchasedGear = this.data.purchases.credits.map(purchase => ({
        item: purchase.item,
        ...gearIdentity(purchase.item),
        price: gearNumber(purchase.cost, format).label,
      }));
    }

    context.totalCredits = credits.total;
    context.availableCredits = credits.available;
    context.FFGCONFIG = CONFIG.FFG;

    const obligation = await this.calcObligation();
    context.startingObligation = obligation.starting;
    context.availableObligation = obligation.available;
    context.obligationKey = obligation.key;
    const obligationLabels = {morality:"SWFFG.DescriptionMorality",duty:"SWFFG.DescriptionDuty",obligation:"SWFFG.DescriptionObligation"};
    context.obligationLabel = obligationLabels[obligation.key] ? game.i18n.localize(obligationLabels[obligation.key]) : obligation.key;

    // include career / specialization career ranks
    let combinedPurchases = {};
    if (this.tempActor) {
      combinedPurchases = Object.fromEntries(
        Object.keys(this.tempActor.system.skills).map(key => [key, 0])
      ); // default to 0 as 0 is not > undefined (for use in the template)
    }
    const careerPurchases = {};
    const specializationPurchases = {};
    for (const skillName of this.data.selected.careerCareerSkillRanks) {
      // add to career purchases
      if (!Object.keys(careerPurchases).includes(skillName)) {
        careerPurchases[skillName] = 0;
      }
      careerPurchases[skillName]++;
      combinedPurchases[skillName] = (combinedPurchases[skillName] ?? 0) + 1;
    }
    for (const skillName of this.data.selected.specializationCareerSkillRanks) {
      // add to career purchases
      if (!Object.keys(specializationPurchases).includes(skillName)) {
        specializationPurchases[skillName] = 0;
      }
      specializationPurchases[skillName]++;
      combinedPurchases[skillName] = (combinedPurchases[skillName] ?? 0) + 1;
    }
    context.careerSkillPurchases = careerPurchases;
    context.specializationSkillPurchases = specializationPurchases;
    context.combinedPurchases = combinedPurchases;
    context.reviewStartingRanks = Object.entries(combinedPurchases).filter(([, ranks]) => ranks > 0).map(([skill, ranks]) => ({
      name: game.i18n.localize(CONFIG.FFG.skills[skill]?.label ?? skill),
      ranks,
    }));

    const careerKeys = [];
    const specializationKeys = [];
    if (this.data.selected.career?.system?.careerSkills) {
      for (const skillName of Object.values(this.data.selected.career.system.careerSkills)) {
        careerKeys.push(skillName);
      }
    }
    if (this.data.selected.specialization?.system?.careerSkills) {
      for (const skillName of Object.values(this.data.selected.specialization.system.careerSkills)) {
        specializationKeys.push(skillName);
      }
    }
    context.careerKeys = careerKeys;
    context.specializationKeys = specializationKeys;
    context.startingRanks = this.getStartingRanks();
    if (step !== 'xp_spend' && step !== 'review') return context;
    const specializations = this.ownedSpecializations();
    const draftSpecializations = specializations.map(item => this.prepareDraftTree(item));
    if (step === 'xp_spend') {
      await Promise.all(specializations.map((item, index) =>
        prepareBookTalents(item, draftSpecializations[index].system.talents)));
    }
    const primary = this.data.selected.specialization;
    context.draftSpecialization = primary ? draftSpecializations[0] : null;
    context.draftSpecializations = primary ? draftSpecializations.slice(1) : draftSpecializations;
    context.draftForcePowers = await Promise.all(this.data.purchases.xp.forcePowers.map(async ({item}) => {
      const draft = this.prepareDraftTree(item);
      if (step === 'xp_spend') {
        draft.system.isEditing = false;
        draft.system.renderedDesc = await PopoutEditor.renderDiceImages(draft.system.description, item.actor ?? {});
        await prepareBookForceUpgrades(item, draft.system.upgrades);
      }
      return draft;
    }));
    if (step === 'review') {
      const {xp, credits} = this.data.purchases;
      const advance = (purchases, config) => purchases.map(({key, cost}) => ({
        name: game.i18n.localize(config[key]?.label ?? key), rank: 1, cost,
      }));
      const trees = [context.draftSpecialization, ...context.draftSpecializations, ...context.draftForcePowers];
      const talents = xp.talents.map(purchase => {
        const tree = trees.find(candidate => candidate?.uuid === purchase.tree);
        const node = tree?.system?.talents?.[purchase.key] ?? tree?.system?.upgrades?.[purchase.key];
        return {name: node?.name ?? purchase.specName, cost: purchase.cost};
      });
      context.reviewSpeciesPortrait = speciesPortrait(this.data.selected.species);
      context.reviewPortrait = this.data.selected.artwork.portrait || context.reviewSpeciesPortrait;
      context.reviewXpPurchases = [
        ...advance(xp.characteristics, CONFIG.FFG.characteristics),
        ...advance(xp.skills, CONFIG.FFG.skills),
        ...[...xp.specializations, ...xp.forcePowers].map(({item, cost}) => ({name: item.name, cost})),
        ...talents,
      ];
      const format = new Intl.NumberFormat(game.i18n.lang);
      context.reviewGear = credits.map(({item, cost}) => ({name: item.name, cost: gearNumber(cost, format).label}));
    }

    return context;
  }

  /** @override */
  async _preparePartContext(partId, context, _options) {
    context.tab = context.tabs[partId];
    return context;
  }

  /**
   * Converts the config object into an object slimselect can use
   * @returns {*[]}
   */
  startingBonusForHTML() {
    const startingBonuses = CONFIG.FFG.characterCreator.startingBonusesRadio[this.data.selected.rules];
    const options = [];
    for (const value of Object.keys(startingBonuses)) {
      const label = startingBonuses[value];
      options.push({
        value: value,
        label: label,
      });
    }
    return options;
  }

  /**
   * Retrieve all items available for the player to buy
   * @returns {Promise<*[]>}
   */
  async getItems() {
    const sources = new Set([
      ...this.getSources('item').map(source => source.trim()).filter(Boolean),
      'swffg-compendium-bilingual-steelers-equipment.en-items',
    ]);
    const preparedItems = [];
    const maxRarity = game.settings.get("starwarsffg", "maxRarity");
    const allowRestricted = game.settings.get("starwarsffg", "allowRestricted");

    for (const source of sources) {
      const pack = game.packs.get(source);
      if (!pack) {
        continue;
      }
      const items = await pack.getDocuments();
      for (const item of items) {
        if (item.system?.rarity?.value > maxRarity || (!allowRestricted && item.system?.rarity?.isrestricted)) {
          // do not include items disallowed by the GM
          continue;
        }
        item.pill = await foundry.applications.ux.TextEditor.enrichHTML(item?.link);
        preparedItems.push(item);
      }
    }

    return preparedItems;
  }

  async getConfiguredCreationItems(type) {
    const items = [];
    const sources = new Set(this.getSources(type).map(source => source.trim()).filter(Boolean));
    for (const source of sources) {
      const pack = game.packs.get(source);
      if (pack?.documentName === 'Item' && pack.visible) {
        items.push(...await pack.getDocuments({type}));
      }
    }
    items.push(...game.items.filter(item => item.type === type));
    return items;
  }

  async getBackgrounds() {
    const items = await this.getConfiguredCreationItems('background');
    return Object.fromEntries(Object.entries(BACKGROUND_SUGGESTIONS).map(([group, {types, entries}]) => {
      const available = items.filter(item => types.includes(item.system.type));
      const selected = Object.values(this.data.selected.background).find(item => types.includes(item?.system.type));
      if (available.length || this.data.selected.rules !== 'fad') {
        if (selected && !available.some(item => item.uuid === selected.uuid)) available.push(selected);
        return [group, available];
      }
      const suggestions = Object.entries(entries).map(([key, page]) => {
        const label = `SWFFG.CharacterCreator.background.Suggestion.${key}`;
        const name = game.i18n.localize(`${label}.Name`);
        if (selected?.name === name) return selected;
        return new Item({
          _id: foundry.utils.randomID(),
          name,
          type: 'background',
          img: 'icons/svg/book.svg',
          system: {
            type: types[0],
            description: game.i18n.localize(`${label}.Description`),
            metadata: {sources: [game.i18n.format('SWFFG.CharacterCreator.background.Suggestion.Source', {page})]},
          },
        }, {temporary: true});
      });
      return [group, suggestions];
    }));
  }

  async getStartingTraitGroups() {
    const items = await this.getConfiguredCreationItems('obligation');

    const groups = STARTING_TRAIT_GROUPS.map(({key, type, subtype, label}) => {
      const matches = items.filter(item => item.system.type === type && (!subtype || item.system.subtype === subtype));
      const prefix = `SWFFG.CharacterCreator.StartingTraits.${key}`;
      const catalogue = matches.length ? matches : game.i18n.localize(`${prefix}.Options`).split('|').map(name => new Item({
        _id: foundry.utils.randomID(),
        name,
        type: 'obligation',
        img: 'icons/svg/book.svg',
        system: {
          type, subtype: subtype ?? '', magnitude: 0,
          metadata: {sources: [game.i18n.localize(`${prefix}.Source`)]},
        },
      }, {temporary: true}));
      return {label, items: catalogue};
    });
    const morality = items.filter(item => item.system.type === 'morality' &&
      !STARTING_TRAIT_GROUPS.some(group => group.type === 'morality' && group.subtype === item.system.subtype));
    if (morality.length) groups.push({label: 'SWFFG.DescriptionMorality', items: morality});
    return groups;
  }

  /**
   * Retrieve all Species available for the player to buy
   * @returns {Promise<*[]>}
   */
  async getAvailableSpecies() {
    const coreSpecies = "swffg-compendium-bilingual-steelers-core_rule.en-species";
    const sources = [...new Set([
      ...this.getSources("species").map(source => source.trim()).filter(Boolean),
      ...(game.packs.get(coreSpecies) ? [coreSpecies] : []),
    ])];
    const species = [];
    const seen = new Set();
    const addSpecies = async item => {
      if (item.type !== "species" || (item.uuid && seen.has(item.uuid))) return;
      if (item.uuid) seen.add(item.uuid);
      item.pill = await foundry.applications.ux.TextEditor.enrichHTML(item?.link);
      species.push(item);
    };

    for (const source of sources) {
      const pack = game.packs.get(source);
      if (!pack) continue;
      for (const item of await pack.getDocuments()) await addSpecies(item);
    }
    for (const item of game.items.filter(i => i.type === "species")) await addSpecies(item);
    return species;
  }

  /**
   * Retrieve all Careers available for the player to buy
   * @returns {Promise<*[]>}
   */
  async getAvailableCareers() {
    const careers = await advancementCatalogue('career', 'careerCompendiums');
    for (const item of careers) item.pill = await foundry.applications.ux.TextEditor.enrichHTML(item.link);
    return careers;
  }

  /**
   * Retrieve all Motivations available for the player to buy
   * @returns {Promise<*[]>}
   */
  async getAvailableMotivations() {
    const items = await this.getConfiguredCreationItems('motivation');
    if (items.length || this.data.selected.rules !== 'fad') {
      await Promise.all(items.map(async item => {
        item.pill = await foundry.applications.ux.TextEditor.enrichHTML(item.link);
      }));
      return items;
    }

    return Object.entries(CORE_MOTIVATION_CATALOGUE).flatMap(([type, {page, entries}]) =>
      entries.map(key => {
        const label = `SWFFG.CharacterCreator.Motivation.Core.${key}`;
        const name = game.i18n.localize(`${label}.Name`);
        const selected = this.data.selected.motivations.find(({item}) => item.system.type === type && item.name === name);
        if (selected) return selected.item;
        return new Item({
          _id: foundry.utils.randomID(),
          name,
          type: 'motivation',
          img: 'icons/svg/book.svg',
          system: {
            type,
            description: game.i18n.localize(`${label}.Description`),
            metadata: {sources: [game.i18n.format('SWFFG.CharacterCreator.Motivation.Core.Source', {page})]},
          },
        }, {temporary: true});
      }));
  }

  /**
   * Common function for retrieving compendiums for a specific item type
   * (reads from settings)
   * @param sourcesType
   * @returns {*}
   */
  getSources(sourcesType) {
    return game.settings.get("starwarsffg", `${sourcesType}Compendiums`).split(',');
  }

  selectRules(rules) {
    const selected = this.data.selected;
    if (!Object.hasOwn(RULE_STAT, rules) || selected.rules === rules) return;
    selected.rules = rules;
    if (rules !== 'fad') selected.background.forceAttitude = null;
    delete this.compendiumData.availableBackgrounds;
    delete this.compendiumData.availableMotivations;
    const limits = this.getStartingRanks();
    selected.careerCareerSkillRanks.splice(limits.career);
    selected.specializationCareerSkillRanks.splice(limits.specialization);
    return this.selectStartingBonus('');
  }

  selectStartingBonus(choice) {
    const rules = this.data.selected.rules;
    if (choice && !Object.hasOwn(CONFIG.FFG.characterCreator.startingBonusesRadio[rules], choice)) return;
    const bonus = {xp: 0, credits: 0, duty: 0, obligation: 0, morality: 0};
    if (choice === '10xp') bonus.xp = 10;
    if (choice === '5xp') bonus.xp = 5;
    if (choice === '2k_credits') bonus.credits = 2500;
    if (choice === '1k_credits' || (rules === 'fad' && choice === '5xp')) bonus.credits = 1000;
    if (rules === 'fad') {
      if (choice === '21_plus_morality') bonus.morality = 21;
      if (choice === '21_minus_morality') bonus.morality = -21;
    } else if (choice) {
      const adjustment = choice === '10xp' || choice === '2k_credits' ? 10 : 5;
      bonus[RULE_STAT[rules]] = rules === 'aor' ? -adjustment : adjustment;
    }
    this.data.grants.bonus = bonus;
    this.data.selected.startingBonus = choice;
    return this.tempActor ? this.showCharacterStatusShim() : this.render(true);
  }

  careerStepBlockReason() {
    const {career, careerCareerSkillRanks} = this.data.selected;
    if (!career) return game.i18n.localize('SWFFG.CharacterCreator.Entry.CareerRequired');
    const maximum = this.getStartingRanks().career;
    const count = careerCareerSkillRanks.length;
    return count === maximum ? null : game.i18n.format('SWFFG.CharacterCreator.Entry.CareerRanksRequired', {count, maximum});
  }

  updateCreationSteps() {
    const steps = this.constructor.TABS.primary.tabs;
    const index = steps.findIndex(step => step.id === this.tabGroups.primary);
    const header = this.element.querySelector('.wizard-header');
    header.querySelector('[data-wizard-step]').textContent = game.i18n.format('SWFFG.CharacterCreator.Entry.Step', {
      current: index + 1,
      total: steps.length,
    });
    header.querySelector('[data-wizard-heading]').textContent = game.i18n.localize(steps[index].label);
    const progress = header.querySelector('progress');
    progress.max = steps.length;
    progress.value = index + 1;
    const footer = this.element.querySelector('.wizard-step-navigation');
    footer.querySelector('[data-direction="back"]').disabled = index === 0;
    const forward = footer.querySelector('[data-direction="forward"]');
    const blocker = steps[index].id === 'career' ? this.careerStepBlockReason() : null;
    forward.disabled = Boolean(blocker);
    forward.hidden = index === steps.length - 1;
    footer.querySelector('.create-actor').hidden = !forward.hidden;
    if (!forward.hidden) {
      forward.querySelector('[data-wizard-next-label]').textContent = blocker ?? game.i18n.localize(steps[index + 1].label);
    }
  }

  static async moveCreationStep(_event, target) {
    const steps = this.constructor.TABS.primary.tabs;
    const current = this.tabGroups.primary;
    const index = steps.findIndex(step => step.id === current);
    const forward = target.dataset.direction === 'forward';
    const next = steps[index + (forward ? 1 : -1)];
    if (!next) return;
    if (forward && current === 'career') {
      const blocker = this.careerStepBlockReason();
      if (blocker) return ui.notifications.warn(blocker);
    }
    if (forward && ['species', 'specialization'].includes(current) && !this.data.selected[current]) {
      return ui.notifications.warn(game.i18n.localize('SWFFG.CharacterCreator.Entry.ChoiceRequired'));
    }
    if (this.stepNavigationPending) return;
    this.stepNavigationPending = true;
    target.disabled = true;
    try {
      await this.loadStepCatalogue(next.id);
      if (!this.rendered) return;
      await this.render({force: true, creationStep: next.id});
    } catch (error) {
      this.tabGroups.primary = current;
      ui.notifications.error(error.message);
    } finally {
      this.stepNavigationPending = false;
      if (target.isConnected) target.disabled = false;
    }
  }

  static previewSpeciesPortrait(_event, target) {
    const species = this.compendiumData.availableSpecies.find(item => item.uuid === target.dataset.source);
    return showImagePreview(speciesPortrait(species), species?.name);
  }

  static previewGearImage(_event, target) {
    const {source} = target.dataset;
    const item = this.compendiumData.items?.find(item => item.uuid === source)
      ?? this.data.purchases.credits.find(({item}) => item.uuid === source)?.item;
    if (!item) return;
    return showImagePreview(gearIdentity(item).portrait, item.name);
  }

  async handleSpeciesSelect(event) {
    const target = $(event.currentTarget);
    const selectedSpecies = await fromUuid(target.data("source"));
    if (!selectedSpecies) {
      return ui.notifications.warn(game.i18n.localize("SWFFG.UI.Actor.WizardSpeciesNotFound"));
    }
    if (this.data.selected.species?.uuid !== selectedSpecies.uuid) {
      this.clearDependentPurchases();
      this.data.purchases.xp.characteristics = [];
      this.data.selected.careerCareerSkillRanks = [];
      this.data.selected.specializationCareerSkillRanks = [];
      this.data.selected.speciesStartingChoices = {};
      delete this._steelersSpeciesStatus;
    }
    this.data.selected.species = selectedSpecies;
    await this.showCharacterStatusShim();
  }

  async handleCareerSelect(event) {
    const target = $(event.currentTarget);
    const selectedCareer = await fromUuid(target.data("source"));
    if (!selectedCareer) {
      return ui.notifications.warn(game.i18n.localize("SWFFG.UI.Actor.WizardCareerNotFound"));
    }
    if (sameAdvancementItem(this.data.selected.career, selectedCareer)) return;
    this.clearDependentPurchases();
    this.data.selected.career = selectedCareer;
    this.data.selected.specialization = null;
    this.data.selected.careerCareerSkillRanks = [];

    // update specialization information
    this.data.available.specializations = [];
    this.data.selected.specializationCareerSkillRanks = [];
    for (const specData of careerSpecializations(selectedCareer)) {
      const specItem = specData.source ? await fromUuid(specData.source) : game.items.get(specData.id);
      if (specItem) {
        specItem.pill = await foundry.applications.ux.TextEditor.enrichHTML(specItem?.link);
        this.data.available.specializations.push(specItem);
      }
    }

    await this.showCharacterStatusShim();
  }

  async handleSpecializationSelect(event) {
    const target = $(event.currentTarget);
    const selectedSpecialization = await fromUuid(target.data("source"));
    if (!selectedSpecialization) {
      return ui.notifications.warn(game.i18n.localize("SWFFG.UI.Actor.WizardSpecializationNotFound"));
    }
    if (!careerSpecializations(this.data.selected.career).some(entry => sameAdvancementItem(entry, selectedSpecialization))) return this.refusePurchase();
    if (sameAdvancementItem(this.data.selected.specialization, selectedSpecialization)) return;
    if (this.data.selected.specialization) this.clearDependentPurchases();
    this.data.selected.specialization = selectedSpecialization;
    this.data.selected.specializationCareerSkillRanks = [];
    await this.showCharacterStatusShim();
  }

  /**
   * Initial handler for showCharacterStatus, since we need different code paths based on if a socket event is needed
   * @returns {Promise<void>}
   */
  async showCharacterStatusShim() {
    const update = Symbol('preview');
    this._previewUpdating = update;
    this._steelersSpeciesPreviewPending = true;
    this._wizardSession ??= foundry.utils.randomID();
    if (game.user.isGM) {
      try {
        const preview = await updateWizardPreview(game.user, this._wizardSession);
        if (this._previewUpdating === update) await this.showCharacterStatus(preview.id, update);
      } finally {
        if (this._previewUpdating === update) this._previewUpdating = null;
      }
    } else {
      this._previewRequest = foundry.utils.randomID();
      game.socket.emit("system.starwarsffg", {
        eventType: "pcWizard",
        event: "createCharacterRequest",
        wizardId: this._wizardSession,
        requestId: this._previewRequest,
      });
    }
  }

  async showCharacterStatus(actorId, update = this._previewUpdating) {
    const tempActor = game.actors.get(actorId);
    if (!tempActor) {
      ui.notifications.error(game.i18n.localize("SWFFG.UI.Actor.WizardPreviewNotFound"));
      return;
    }

    if (!tempActor.getFlag('starwarsffg', 'speciesWizardManaged')) {
      await tempActor.setFlag('starwarsffg', 'speciesWizardManaged', true);
    }

    
    const { total: totalXp, available: availableXp } = this.calcXp();
    if (this.data.selected.species?.uuid) {
      await tempActor.update({
        "system.experience": {
          total: totalXp,
          available: availableXp,
        }
      }, {render: false});
    }

    
    // apply purchases
    for (const characteristicPurchase of this.data.purchases.xp.characteristics) {
      const updateKey = `system.characteristics.${characteristicPurchase.key}.value`;
      const newValue = tempActor.system.characteristics[characteristicPurchase.key].value + 1;
      await tempActor.update({[updateKey]: newValue}, {render: false});
    }
    for (const skillPurchase of this.data.purchases.xp.skills) {
      const updateKey = `system.skills.${skillPurchase.key}.rank`;
      const newValue = tempActor.system.skills[skillPurchase.key].rank + 1;
      await tempActor.update({[updateKey]: newValue}, {render: false});
    }

    // add items to the actor
    const items = [];
    // the various item types are in slightly different formats, so let's add them explicitly
    // backgrounds
    for (const backKey of Object.keys(this.data.selected.background)) {
      if (this.data.selected.background[backKey]?.uuid) {
        items.push(this.data.selected.background[backKey]);
      }
    }
    // obligations
    for (const item of this.data.selected.obligations) {
      if (item?.uuid) {
        items.push(item);
      }
    }
    // species
    if (this.data.selected.species?.uuid) {
      items.push(this.data.selected.species);
    }
    // career (skill ranks are later)
    if (this.data.selected.career?.uuid) {
      items.push(this.data.selected.career);
    }
    // specialization (skill ranks are later)
    if (this.data.selected.specialization?.uuid) {
      items.push(this.draftTree(this.data.selected.specialization));
    }
    items.push(...this.additionalCreationItems());
    // motivations
    items.push(...this.data.selected.motivations.map(({item}) => item));


    await tempActor.createEmbeddedDocuments("Item", items);
    await this.applyCreationTalentGrants(tempActor);

    // apply career skill ranks from career and specialization
    const careerItem = tempActor.items.find(i => i.type === "career");
    if (careerItem) {
      for (const skillPurchase of this.data.selected.careerCareerSkillRanks) {
        const nk = new Date().getTime();
        await careerItem.update({
          "system.attributes": {
            [`attr${nk}`]: {
              modtype: "Skill Rank",
              mod: skillPurchase,
              value: 1,
            },
          }
        });
        const AE = {
          name: `attr${nk}`,
          changes: [{
            key: `system.skills.${skillPurchase}.rank`,
            ...EffectHelpers.changeType(),
            value: 1,
          }],
        };
        await careerItem.createEmbeddedDocuments("ActiveEffect", [AE]);
      }
    }

    const specializationItem = tempActor.items.find(i => i.type === "specialization" && i.name === this.data.selected.specialization?.name);
    if (specializationItem) {
      for (const skillPurchase of this.data.selected.specializationCareerSkillRanks) {
        const nk = new Date().getTime();
        await specializationItem.update({
          "system.attributes": {
            [`attr${nk}`]: {
              modtype: "Skill Rank",
              mod: skillPurchase,
              value: 1,
            },
          }
        });
        const AE = {
          name: `attr${nk}`,
          changes: [{
            key: `system.skills.${skillPurchase}.rank`,
            ...EffectHelpers.changeType(),
            value: 1,
          }],
        };
        await specializationItem.createEmbeddedDocuments("ActiveEffect", [AE]);
      }
    }
    await this._syncWizardSpecies(tempActor);

    
    if (update !== this._previewUpdating) return;
    this.tempActor = tempActor;
    // The prepared actor includes career skills from all remaining trees, talents and species effects.
    for (const purchase of this.data.purchases.xp.skills) {
      const skill = tempActor.system.skills?.[purchase.key];
      if (skill) purchase.cost = skillCost(purchase.value, skill.careerskill);
    }
    const repricedXp = this.calcXp().available;
    if (repricedXp !== availableXp) {
      await tempActor.update({'system.experience.available': repricedXp}, {render: false});
    }
    this.render();
  }

  validCharacteristicPurchases() {
    const ranks = new Map();
    for (const {key, value} of this.data.purchases.xp.characteristics) {
      if (!Number.isInteger(value) || value < 1 || value > CREATION_CHARACTERISTIC_MAX ||
          (ranks.has(key) && value !== ranks.get(key) + 1) ||
          this.tempActor?.system?.characteristics?.[key]?.value > CREATION_CHARACTERISTIC_MAX) return false;
      ranks.set(key, value);
    }
    return true;
  }

  async handleCharacteristicModify(event) {
    if (this._previewUpdating) return;
    const target = $(event.currentTarget);
    const characteristic = target.data("target");
    const direction = target.data("direction");
    const curValue = this.tempActor?.system.characteristics?.[characteristic]?.value;
    if (!Number.isInteger(curValue)) return;
    let newValue;
    if (direction === "increase") {
      const last = this.data.purchases.xp.characteristics.findLast(purchase => purchase.key === characteristic);
      newValue = Math.max(curValue, last?.value ?? 0) + 1;
      if (newValue > CREATION_CHARACTERISTIC_MAX || newValue * 10 > this.calcXp().available) return this.refusePurchase();
      this.data.purchases.xp.characteristics.push({
        key: characteristic,
        value: newValue,
        cost: newValue * 10,
      });
    } else {
      const purchaseIndex = this.data.purchases.xp.characteristics.findIndex(function(purchase) {
        return purchase.key === characteristic && purchase.value === curValue;
      });
      if (purchaseIndex < 0) return;
      this.data.purchases.xp.characteristics.splice(purchaseIndex, 1);
    }
    // rebuild the actor to apply the changes
    await this.showCharacterStatusShim();
  }

  refusePurchase(key = 'SWFFG.Advancement.InvalidPurchase', values) {
    ui.notifications.warn(values ? game.i18n.format(key, values) : game.i18n.localize(key));
    return false;
  }

  getStartingRanks() {
    const {career, species, rules} = this.data.selected;
    return startingRanks(career, species, rules);
  }

  canChooseStartingSkill(type, skill, limit) {
    const choices = this.data.selected[`${type}CareerSkillRanks`];
    const skills = Object.values(this.data.selected[type]?.system?.careerSkills ?? {});
    return choices.length < limit && !choices.includes(skill) && skills.some(value => value.replace(' ', ' ') === skill);
  }

  ownedSpecializations() {
    const primary = this.data.selected.specialization;
    return [primary, ...this.data.purchases.xp.specializations.map(({item}) => item)].filter(Boolean);
  }

  draftTree(item) {
    const draft = item.toObject();
    const field = item.type === 'specialization' ? 'talents' : 'upgrades';
    for (const purchase of this.data.purchases.xp.talents) {
      if (purchase.tree === item.uuid && draft.system[field][purchase.key]) draft.system[field][purchase.key].islearned = true;
    }
    return draft;
  }

  prepareDraftTree(item) {
    if (!item) return null;
    const draft = this.draftTree(item);
    const field = item.type === 'specialization' ? 'talents' : 'upgrades';
    const state = advancementTree(draft, this.ownedSpecializations().map(tree => this.draftTree(tree)));
    draft.uuid = item.uuid;
    for (const [key, node] of Object.entries(draft.system[field])) {
      node.automatic = state.automatic.has(key);
      node.canPurchase = state.open.has(key) && treeCost(item, key) <= this.calcXp().available;
    }
    return draft;
  }

  additionalCreationItems() {
    const xp = this.data.purchases.xp;
    return [...xp.specializations, ...xp.forcePowers].map(({item}) => this.draftTree(item));
  }

  async applyCreationTalentGrants(actor) {
    const specializations = this.ownedSpecializations();
    const grants = [];
    for (const purchase of this.data.purchases.xp.talents.filter(entry => entry.grant)) {
      const source = specializations.find(tree => tree.uuid === purchase.tree);
      const owned = actor.items.find(item => item.type === 'specialization' && sameAdvancementItem(item, source));
      if (!owned) throw Error('A creation talent has no attached specialization');
      const grant = foundry.utils.deepClone(purchase.grant);
      grant.flags.starwarsffg.characteristicIncrease.sourceSpecializationId = owned.id;
      grant.flags.starwarsffg.characteristicIncrease.sourceTalentKey = purchase.key;
      grants.push(grant);
    }
    if (grants.length) await actor.createEmbeddedDocuments('Item', grants);
  }

  clearDependentPurchases() {
    const {xp} = this.data.purchases;
    const changed = ['skills', 'specializations', 'forcePowers', 'talents'].some(key => xp[key].length);
    for (const key of ['skills', 'specializations', 'forcePowers', 'talents']) xp[key] = [];
    if (changed) ui.notifications.info(game.i18n.localize('SWFFG.Advancement.DraftUpdated'));
  }

  async handleSkillModify(event) {
    if (this._previewUpdating) return;
    const target = $(event.currentTarget);
    const skill = target.data("target").replace(" ", " ");
    const direction = target.data("direction");
    const current = this.tempActor?.system?.skills?.[skill];
    if (!current) return;
    const curValue = Number(current.rank);
    const skillMode = target.data("mode");
    if (direction === 'increase' && curValue >= CREATION_SKILL_MAX) return this.refusePurchase();
    const limits = this.getStartingRanks();
    let newValue;
    if (skillMode === "career") {
      if (direction === "increase") {
        if (!this.canChooseStartingSkill('career', skill, limits.career)) return this.refusePurchase();
        this.data.selected.careerCareerSkillRanks.push(skill);
      } else {
        const purchaseIndex = this.data.selected.careerCareerSkillRanks.findIndex(function (purchase) {
          return purchase === skill;
        });
        if (purchaseIndex < 0) return;
        this.data.selected.careerCareerSkillRanks.splice(purchaseIndex, 1);
      }
    } else if (skillMode === "specialization") {
      if (direction === "increase") {
        if (!this.canChooseStartingSkill('specialization', skill, limits.specialization)) return this.refusePurchase();
        this.data.selected.specializationCareerSkillRanks.push(skill);
      } else {
        const purchaseIndex = this.data.selected.specializationCareerSkillRanks.findIndex(function (purchase) {
          return purchase === skill;
        });
        if (purchaseIndex < 0) return;
        this.data.selected.specializationCareerSkillRanks.splice(purchaseIndex, 1);
      }
    } else {
      if (direction === "increase") {
        newValue = curValue + 1;
        const cost = skillCost(newValue, current.careerskill);
        if (cost > this.calcXp().available) return this.refusePurchase();
        this.data.purchases.xp.skills.push({
          key: skill,
          value: newValue,
          cost: cost,
        });
      } else {
        const purchaseIndex = this.data.purchases.xp.skills.findIndex(function (purchase) {
          return purchase.key === skill && purchase.value === curValue;
        });
        if (purchaseIndex < 0) return;
        this.data.purchases.xp.skills.splice(purchaseIndex, 1);
      }
    }
    // rebuild the actor to apply the changes
    await this.showCharacterStatusShim();
  }

  async handleSpecializationPurchase() {
    const active = CharacterCreator.#specializationPurchase;
    if (active) {
      if (active.dialog?.rendered) active.dialog.bringToFront();
      return;
    }

    const purchase = {wizard: this, dialog: null};
    CharacterCreator.#specializationPurchase = purchase;
    const release = () => {
      if (CharacterCreator.#specializationPurchase === purchase) CharacterCreator.#specializationPurchase = undefined;
    };
    try {
      const {career, specialization} = this.data.selected;
      if (!career || !specialization) return this.refusePurchase();
      const options = await specializationOptions(career, this.ownedSpecializations());
      const available = this.calcXp().available;
      if (options.baseCost > available) return this.refusePurchase();
      if (options.increasedCost > available) options.outCareer = [];
      const template = "systems/starwarsffg/templates/wizards/char_creator/purchase.html";
      const content = await foundry.applications.handlebars.renderTemplate(template, {
        ...options, itemCategory: 'specialization', itemType: game.i18n.localize('TYPES.Item.specialization'),
        groups: ['Universal', 'In Career', 'Out of Career'],
        previewSpecialization: true,
      });
      if (CharacterCreator.#specializationPurchase !== purchase || !this.rendered || this.tabGroups.primary !== 'xp_spend') return;
      purchase.dialog = this.createPurchaseConfirmation('specializations', content);
      purchase.dialog.addEventListener('close', release, {once: true});
      await purchase.dialog.render(true);
    } finally {
      if (!purchase.dialog?.rendered) release();
    }
  }

  async handleForcePowerPurchase() {
    const owned = this.data.purchases.xp.forcePowers.map(({item}) => item);
    const catalogue = await advancementCatalogue('forcepower', 'forcePowerCompendiums');
    const unowned = catalogue.filter(item => !owned.some(existing => sameAdvancementItem(existing, item)));
    if (catalogue.length && !unowned.length) {
      return this.refusePurchase('SWFFG.Advancement.ForcePower.AllOwned');
    }
    const candidates = unowned.map(item => ({
      item,
      cost: Number(item.system.base_cost),
      requirement: forceRatingRequirement(this.tempActor, item),
    })).filter(({cost}) => Number.isSafeInteger(cost) && cost >= 0);
    if (!candidates.length) return this.refusePurchase('SWFFG.Advancement.ForcePower.NoneAvailable');

    const eligible = candidates.filter(({requirement}) => !requirement);
    if (!eligible.length) {
      const requirement = candidates.map(candidate => candidate.requirement)
        .reduce((lowest, current) => current.requiredForceRating < lowest.requiredForceRating ? current : lowest);
      return this.refusePurchase('SWFFG.Advancement.ForcePower.MinimumRating', requirement);
    }
    const available = this.calcXp().available;
    const affordablePowers = eligible.filter(({cost}) => cost <= available);
    if (!affordablePowers.length) {
      return this.refusePurchase('SWFFG.Advancement.ForcePower.MinimumXP', {
        cost: Math.min(...eligible.map(({cost}) => cost)), available,
      });
    }
    const selectableItems = sortDataBy(affordablePowers.map(({item, cost}) => ({
      name: item.name, id: item.id, source: item.uuid, cost,
      requiredForceRating: Math.max(1, Number(item.system.required_force_rating)),
    })), 'name');
    const template = "systems/starwarsffg/templates/wizards/char_creator/purchase.html";
    const content = await foundry.applications.handlebars.renderTemplate(template, {
      selectableItems, itemCategory: 'forcepower', itemType: game.i18n.localize('TYPES.Item.forcepower'),
      groups: [...new Set(selectableItems.map(item => item.requiredForceRating))].sort((a, b) => a - b),
    });
    await this.createPurchaseConfirmation('forcePowers', content).render(true);
  }

  async removeTreePurchase(category, uuid) {
    const xp = this.data.purchases.xp;
    const index = xp[category].findIndex(({item}) => item.uuid === uuid);
    if (index < 0) return;
    const [removed] = xp[category].splice(index, 1);
    const priorTalents = xp.talents;
    xp.talents = priorTalents.filter(purchase => purchase.tree !== uuid);
    const trees = this.ownedSpecializations().map(tree => this.draftTree(tree));
    if (trees.some(tree => !advancementTree(tree, trees, {strict: true}).valid)) {
      xp[category].splice(index, 0, removed);
      xp.talents = priorTalents;
      return this.refusePurchase();
    }
    const owned = [this.data.selected.specialization].filter(Boolean);
    for (const purchase of xp.specializations) {
      purchase.cost = specializationCost(purchase.item, this.data.selected.career, owned);
      owned.push(purchase.item);
    }
    await this.showCharacterStatusShim();
  }

  async handleRemoveSpecialization(event) {
    return this.removeTreePurchase('specializations', event.currentTarget.dataset.tree);
  }

  async handleRemoveForcePower(event) {
    return this.removeTreePurchase('forcePowers', event.currentTarget.dataset.tree);
  }

  async modifyTreePurchase(event, type) {
    const input = event.currentTarget;
    const powers = this.data.purchases.xp.forcePowers.map(({item}) => item);
    const specializations = this.ownedSpecializations();
    const item = (type === 'forcepower' ? powers : specializations).find(tree => tree.uuid === input.dataset.tree);
    const key = input.dataset.target;
    const purchases = this.data.purchases.xp.talents;
    const index = purchases.findIndex(purchase => purchase.tree === item?.uuid && purchase.key === key);
    const refuse = () => { input.checked = index >= 0; return this.refusePurchase(); };
    if (!item) return refuse();
    const current = this.draftTree(item);
    const trees = specializations.map(tree => this.draftTree(tree));
    const state = advancementTree(current, trees);
    if (index >= 0) {
      const [removed] = purchases.splice(index, 1);
      const updatedTrees = specializations.map(tree => this.draftTree(tree));
      const toCheck = type === 'forcepower' ? [this.draftTree(item)] : updatedTrees;
      if (toCheck.some(tree => !advancementTree(tree, updatedTrees, {strict: true}).valid)) {
        purchases.splice(index, 0, removed);
        return refuse();
      }
    } else {
      const cost = treeCost(item, key);
      if (!state.open.has(key) || state.learned.has(key) || !Number.isSafeInteger(cost) || cost < 0 || cost > this.calcXp().available) return refuse();
      const node = type === 'specialization' ? current.system.talents[key] : null;
      let grant;
      if (node && CharacteristicIncrease.matches({type:'talent', name:node.name})) {
        const source = node.pack && node.itemId ? await game.packs.get(node.pack)?.getDocument(node.itemId) : null;
        const talent = source ?? (await advancementCatalogue('talent', 'talentCompendiums')).find(doc => doc.id === node.itemId || doc.name === node.name);
        if (!talent || !this.tempActor) return refuse();
        grant = await CharacteristicIncrease.choose(talent.toObject(), this.tempActor, {phase:'creation'});
        if (!grant) return refuse();
      }
      purchases.push({tree: item.uuid, specName: item.name, key, cost, ...(grant ? {grant} : {})});
    }
    await this.showCharacterStatusShim();
  }

  async handleForcePowerTalentPurchase(event) {
    return this.modifyTreePurchase(event, 'forcepower');
  }

  async handleSpecializationTalentPurchase(event) {
    return this.modifyTreePurchase(event, 'specialization');
  }

  bindSpecializationPurchasePreview(dialog) {
    const select = dialog.querySelector('#ffgPurchase');
    const previewButton = dialog.querySelector('.wizard-preview-specialization');
    const confirmButton = dialog.querySelector('button[data-action="done"]');
    const selectedSource = () => select.selectedOptions[0]?.dataset.source;
    let loading = false;
    const syncButtons = () => {
      confirmButton.disabled = !selectedSource();
      previewButton.disabled = loading || confirmButton.disabled;
    };
    select.addEventListener('change', syncButtons);
    previewButton.addEventListener('click', async () => {
      const source = selectedSource();
      if (!source || loading) return;
      loading = true;
      syncButtons();
      try {
        const item = await fromUuid(source);
        if (!dialog.isConnected || selectedSource() !== source) return;
        if (item?.type !== 'specialization') throw new Error('Specialization could not be resolved');
        const prefix = 'wizard-specialization-preview-';
        const id = prefix + `${ItemSheetFFGV2.name}-${item.uuid.replaceAll('.', '-')}`;
        const preview = foundry.applications.instances.get(id) ?? new ItemSheetFFGV2({
          id: prefix + '{id}', document: item, editable: false, canImport: false,
        });
        if (!preview.isVisible) throw new Error('Specialization sheet is not visible');
        await preview.render({force: true});
        preview.bringToFront();
      } catch (error) {
        console.error('Star Wars FFG |', error);
        ui.notifications.warn(game.i18n.localize('SWFFG.CharacterCreator.buttons.specialization.previewUnavailable'));
      } finally {
        loading = false;
        syncButtons();
      }
    });
    syncButtons();
  }

  createPurchaseConfirmation(itemType, content) {
    const isSpecialization = itemType === 'specializations';
    const isForcePower = itemType === 'forcePowers';
    return new LegacyDialogV2(
      {
        title: isSpecialization
          ? game.i18n.localize('SWFFG.CharacterCreator.buttons.specialization.purchase')
          : game.i18n.format("SWFFG.Actors.Sheets.Purchase.DialogTitle", {itemType}),
        content: content,
        render: isSpecialization ? ([dialog]) => this.bindSpecializationPurchasePreview(dialog) : undefined,
        buttons: {
          done: {
            icon: '<i class="fa-regular fa-circle-up"></i>',
            label: game.i18n.localize("SWFFG.Actors.Sheets.Purchase.ConfirmPurchase"),
            callback: async (purchaseWindow) => {
              
              const selectedUuid = $("#ffgPurchase option:selected", purchaseWindow).data("source");
              if (!selectedUuid) {
                return isForcePower ? this.refusePurchase('SWFFG.Advancement.ForcePower.SelectPower') : this.refusePurchase();
              }

              const selectedItem = await fromUuid(selectedUuid);
              if (isForcePower && selectedItem?.type !== 'forcepower') {
                return this.refusePurchase('SWFFG.Advancement.ForcePower.Unavailable');
              }
              if (!selectedItem) {
                ui.notifications.warn(game.i18n.localize("SWFFG.UI.Actor.WizardPurchasedSpecializationNotFound"));
                return;
              }
              let cost;
              if (itemType === 'specializations' && selectedItem.type === 'specialization') {
                cost = specializationCost(selectedItem, this.data.selected.career, this.ownedSpecializations());
              } else if (isForcePower) {
                const owned = this.data.purchases.xp.forcePowers;
                const name = selectedItem.name;
                if (owned.some(({item}) => sameAdvancementItem(item, selectedItem))) {
                  return this.refusePurchase('SWFFG.Advancement.ForcePower.AlreadyOwned', {name});
                }
                const requirement = forceRatingRequirement(this.tempActor, selectedItem);
                if (requirement) {
                  return this.refusePurchase('SWFFG.Advancement.ForcePower.RequiredRating', {name, ...requirement});
                }
                cost = Number(selectedItem.system.base_cost);
              }
              if (!Number.isSafeInteger(cost) || cost < 0) {
                return isForcePower ? this.refusePurchase('SWFFG.Advancement.ForcePower.Unavailable') : this.refusePurchase();
              }
              const available = this.calcXp().available;
              if (cost > available) {
                return isForcePower
                  ? this.refusePurchase('SWFFG.Advancement.ForcePower.RequiredXP', {name: selectedItem.name, cost, available})
                  : this.refusePurchase();
              }
              this.data.purchases.xp[itemType].push({item: selectedItem, cost});
              // rebuild the actor to apply the changes
              await this.showCharacterStatusShim();
            },
          },
          cancel: {
            icon: '<i class="fas fa-cancel"></i>',
            label: game.i18n.localize("SWFFG.Actors.Sheets.Purchase.CancelPurchase"),
          },
        },
      },
      {
        classes: ["dialog", "starwarsffg"],
      }
    );
  }

  calcXp() {
    const speciesXPBonus = this._speciesWizardAPI()?.wizardXPBonus?.(this) ?? 0;
    if (!Number.isSafeInteger(speciesXPBonus)) throw new Error("Invalid species wizard XP bonus");
    let total = (this.data.selected.species?.system?.startingXP || 0) + this.data.grants.bonus.xp + speciesXPBonus;
    let available = total;
    for (const purchase of this.data.purchases.xp.characteristics) {
      available-= purchase.cost;
    }
    for (const purchase of this.data.purchases.xp.skills) {
      available-= purchase.cost;
    }
    for (const purchase of this.data.purchases.xp.talents) {
      available-= purchase.cost;
    }
    for (const purchase of this.data.purchases.xp.specializations) {
      available-= purchase.cost;
    }
    for (const purchase of this.data.purchases.xp.forcePowers) {
      available-= purchase.cost;
    }

    return {
      total: total,
      available: available,
    }
  }

  async calcObligation() {
    const key = RULE_STAT[this.data.selected.rules];
    const starting = this.data.initial[key];
    return {starting, available: starting + this.data.grants.bonus[key], key};
  }

  async handleCreditPurchase(event) {
    const target = $(event.currentTarget);
    const itemUuid = target.data("source");
    const purchasedItem = await fromUuid(itemUuid);
    if (!purchasedItem) {
      return ui.notifications.warn(game.i18n.localize("SWFFG.UI.Actor.WizardPurchasedItemNotFound"));
    }
    const cost = creationGearCost(purchasedItem);
    if (!(cost <= this.calcCredits().available)) return this.refusePurchase('SWFFG.CharacterCreator.Wizard.Credits.OverBudget');
    this.data.purchases.credits.push({item: purchasedItem, cost});
    // rebuild the actor to apply the changes
    await this.showCharacterStatusShim();
  }

  async handleCreditRefund(event) {
    const target = $(event.currentTarget);
    const itemName = target.data("name");
    const purchasedItemLength = this.data.purchases.credits.length - 1;

    for (let index = purchasedItemLength; index >= 0; --index) {
      const itemPurchase = this.data.purchases.credits[index];
      if (itemPurchase.item.name === itemName) {
        this.data.purchases.credits.splice(index, 1);
      }
    }

    // rebuild the actor to apply the changes
    await this.showCharacterStatusShim();
  }

  calcCredits() {
    const total = this.data.grants.gm.credits + this.data.grants.bonus.credits;
    let available = total;

    for (const purchase of this.data.purchases.credits) {
      available -= purchase.cost;
    }

    return {
      total: total,
      available: available,
    }
  }

  async handleMotivationPurchase(event) {
    const uuid = event.currentTarget.dataset.source;
    const item = this.compendiumData.availableMotivations.find(option => option.uuid === uuid);
    if (!item) return ui.notifications.warn(game.i18n.localize('SWFFG.UI.Actor.WizardMotivationNotFound'));
    if (this.data.selected.motivations.some(choice => choice.item.uuid === uuid)) return;
    this.data.selected.motivations.push({item});
    await this.showCharacterStatusShim();
  }

  async handleMotivationRefund(event) {
    const uuid = event.currentTarget.dataset.source;
    const choices = this.data.selected.motivations;
    const index = choices.findIndex(({item}) => item.uuid === uuid);
    if (index < 0) return;
    choices.splice(index, 1);
    await this.showCharacterStatusShim();
  }

  async createActorShim() {
    if (this._previewUpdating || (this._steelersSpeciesPreviewPending && !this.tempActor)) return false;
    if (!this.data.selected.species || !this.data.selected.career || !this.data.selected.specialization) {
      return this.refusePurchase();
    }
    const api = this._speciesWizardAPI();
    if (typeof api?.validateWizard === "function" && await api.validateWizard(this) === false) return false;
    if (!(this.calcCredits().available >= 0)) return this.refusePurchase('SWFFG.CharacterCreator.Wizard.Credits.OverBudget');
    if (this.calcXp().available < 0 || !this.validCharacteristicPurchases()) return this.refusePurchase();
    for (const {item} of this.data.purchases.xp.forcePowers) {
      const requirement = forceRatingRequirement(this.tempActor, item);
      if (requirement) {
        return this.refusePurchase('SWFFG.Advancement.ForcePower.RequiredRating', {name: item.name, ...requirement});
      }
    }
    if (game.user.isGM) {
      // temporary: create a new actor to add stuff to
      
      const finalActor = await Actor.create(
        {
          name: game.i18n.format("SWFFG.UI.Actor.WizardNewCharacter", {name: game.user.name}),
          type: "character",
          displaySheet: false,
        },
      );
      await this.createActor(finalActor.id);
    } else {
      this._wizardSession ??= foundry.utils.randomID();
      this._finalRequest = foundry.utils.randomID();
      game.socket.emit("system.starwarsffg", {
        eventType: "pcWizard",
        event: "createFinalActorRequest",
        wizardId: this._wizardSession,
        requestId: this._finalRequest,
      });
    }
  }

  async createActor(actorId) {
    const {portrait, token} = this.data.selected.artwork;
    const newActor = game.actors.get(actorId);
    if (!newActor) {
      ui.notifications.error(game.i18n.localize("SWFFG.UI.Actor.WizardActorNotFound"));
      return;
    }

    await newActor.setFlag("starwarsffg", "speciesWizardManaged", true);

    const xp = await this.calcXp();
    const totalXp = xp.total;
    const availableXp = xp.available;

    // grant XP
    await newActor.update({
      "system.experience": {
        total: totalXp,
        available: availableXp,
      }
    });

    // apply XP purchases
    for (const characteristicPurchase of this.data.purchases.xp.characteristics) {
      const updateKey = `system.characteristics.${characteristicPurchase.key}.value`;
      const newValue = newActor.system.characteristics[characteristicPurchase.key].value + 1;
      await newActor.update({[updateKey]: newValue})
    }
    for (const skillPurchase of this.data.purchases.xp.skills) {
      const updateKey = `system.skills.${skillPurchase.key}.rank`;
      const newValue = newActor.system.skills[skillPurchase.key].rank + 1;
      await newActor.update({[updateKey]: newValue})
    }

    // add actor items to the actor
    const items = [];
    // the various item types are in slightly different formats, so let's add them explicitly
    // backgrounds
    for (const backKey of Object.keys(this.data.selected.background)) {
      if (this.data.selected.background[backKey]?.uuid) {
        items.push(this.data.selected.background[backKey]);
      }
    }
    // obligations
    for (const item of this.data.selected.obligations) {
      if (item?.uuid) {
        items.push(item);
      }
    }
    // species
    if (this.data.selected.species?.uuid) {
      items.push(this.data.selected.species);
    }
    // career (skill ranks are later)
    if (this.data.selected.career?.uuid) {
      items.push(this.data.selected.career);
    }
    // specialization (skill ranks are later)
    if (this.data.selected.specialization?.uuid) {
      items.push(this.draftTree(this.data.selected.specialization));
    }
    items.push(...this.additionalCreationItems());
    // motivations
    items.push(...this.data.selected.motivations.map(({item}) => item));


    await newActor.createEmbeddedDocuments("Item", items);
    await this.applyCreationTalentGrants(newActor);

    // apply credit purchases
    const credits = await this.calcCredits();
    const creditItems = [];
    for (const creditItem of this.data.purchases.credits) {
      creditItems.push(creditItem.item);
    }
    

    await newActor.createEmbeddedDocuments("Item", creditItems);
    await newActor.update({
      "system.stats.credits": {
        value: credits.available + this.data.spendingCredits,
      }
    });

    // apply XP spend log items

    // apply obligation values
    const obligation = await this.calcObligation();
    await newActor.update({"system": {
      [obligation.key]: {
        value: obligation.available,
      }
    }});

    const careerItem = newActor.items.find(i => i.type === "career");
    if (careerItem) {
      for (const skillPurchase of this.data.selected.careerCareerSkillRanks) {
        const nk = new Date().getTime();
        await careerItem.update({
          "system.attributes": {
            [`attr${nk}`]: {
              modtype: "Skill Rank",
              mod: skillPurchase,
              value: 1,
            },
          }
        });
        const AE = {
          name: `attr${nk}`,
          changes: [{
            key: `system.skills.${skillPurchase}.rank`,
            ...EffectHelpers.changeType(),
            value: 1,
          }],
        };
        await careerItem.createEmbeddedDocuments("ActiveEffect", [AE]);
      }
    }

    const specializationItem = newActor.items.find(i => i.type === "specialization" && i.name === this.data.selected.specialization?.name);
    if (specializationItem) {
      for (const skillPurchase of this.data.selected.specializationCareerSkillRanks) {
        const nk = new Date().getTime();
        await specializationItem.update({
          "system.attributes": {
            [`attr${nk}`]: {
              modtype: "Skill Rank",
              mod: skillPurchase,
              value: 1,
            },
          }
        });
        const AE = {
          name: `attr${nk}`,
          changes: [{
            key: `system.skills.${skillPurchase}.rank`,
            ...EffectHelpers.changeType(),
            value: 1,
          }],
        };
        await specializationItem.createEmbeddedDocuments("ActiveEffect", [AE]);
      }
    }

    const speciesResult = await this._syncWizardSpecies(newActor);
    if (["blocked", "choices-required"].includes(speciesResult?.status)) {
      // Leave the wizard open; never present this partially built actor as complete.
      this.render();
      return false;
    }

    const artwork = {};
    if (portrait) artwork.img = portrait;
    if (token) artwork['prototypeToken.texture.src'] = token;
    if (portrait || token) await newActor.update(artwork);

    await xpLogEarn(newActor, totalXp, totalXp, totalXp, "Initial State");
    await xpLogSpend(newActor, "Character Creation Changes", totalXp - availableXp, availableXp, totalXp);

    await newActor.unsetFlag("starwarsffg", "speciesWizardManaged");
    await newActor.sheet.render(true);
    await this.close();
  }
}
