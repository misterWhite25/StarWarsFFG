import { LegacyDialogV2 } from "../applications/legacy-dialog-v2.js";
import EffectHelpers from "./effects.js";
import {xpLogEarn, xpLogSpend} from "./actor-helpers.js";
import DiceHelpers from "./dice-helpers.js";
import {sortDataBy, addIfNotExist} from "../actors/actor-sheet-ffg.js";

const wizardTableLanguage = () => ({
  emptyTable: game.i18n.localize("SWFFG.UI.Actor.WizardTable.emptyTable"),
  info: game.i18n.localize("SWFFG.UI.Actor.WizardTable.info"),
  infoEmpty: game.i18n.localize("SWFFG.UI.Actor.WizardTable.infoEmpty"),
  infoFiltered: game.i18n.localize("SWFFG.UI.Actor.WizardTable.infoFiltered"),
  lengthMenu: game.i18n.localize("SWFFG.UI.Actor.WizardTable.lengthMenu"),
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

export class CharacterCreator extends HandlebarsApplicationMixin(ApplicationV2) {
  // https://foundryvtt.wiki/en/development/api/applicationv2
  _openCareerSection = "career-select-container";

  static PARTS = {
    header: { template: 'systems/starwarsffg/templates/wizards/char_creator/header.html' },
    tabs: { template: 'templates/generic/tab-navigation.hbs' },
    rules: {
      template: 'systems/starwarsffg/templates/wizards/char_creator/tabs/rules.html'
    },
    background: {
      template: 'systems/starwarsffg/templates/wizards/char_creator/tabs/background.html'
    },
    startingBonus: {
      template: 'systems/starwarsffg/templates/wizards/char_creator/tabs/startingBonus.html'
    },
    obligation: {
      template: 'systems/starwarsffg/templates/wizards/char_creator/tabs/obligation.html'
    },
    species: {
      template: 'systems/starwarsffg/templates/wizards/char_creator/tabs/species.html'
    },
    career: {
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
    //footer: { template: 'systems/starwarsffg/templates/wizards/char_creator/footer.html' },
  }

  /** @type {Record<string, foundry.applications.types.ApplicationTabsConfiguration>} */
  static TABS = {
    primary: {
      tabs: [
        // https://foundryvtt.wiki/en/development/guides/Tabs-and-Templates/Tabs-in-AppV2
        {
          id: "rules",
          label: "SWFFG.UI.Actor.WizardTab.rules"
        },
        {
          id: "background",
          label: "SWFFG.UI.Actor.WizardTab.background"
        },
        {
          id: "startingBonus",
          label: "SWFFG.UI.Actor.WizardTab.startingBonus"
        },
        {
          id: "obligation",
          label: "SWFFG.UI.Actor.WizardTab.obligation"
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
          id: "xp_spend",
          label: "SWFFG.UI.Actor.WizardTab.xp_spend"
        },
        {
          id: "gear",
          label: "SWFFG.UI.Actor.WizardTab.gear"
        },
        {
          id: "motivation",
          label: "SWFFG.UI.Actor.WizardTab.motivation"
        },
        {
          id: "review",
          label: "SWFFG.UI.Actor.WizardTab.review"
        },
      ],
      //labelPrefix: "MYSYS.tab", // Optional. Prepended to the id to generate a localization key
      initial: "rules", // Set the initial tab
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
      selectRules: CharacterCreator.selectRules,
    },
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
    this.builtin = {
      rules: {
        fad: "SWFFG.CharacterCreator.Rules.fad",
        aor: "SWFFG.CharacterCreator.Rules.aor",
        eote: "SWFFG.CharacterCreator.Rules.eote",
      },
    };

    this.compendiumData = {};

    if (game.users.filter(u => u.isGM && u.active).length === 0) {
      ui.notifications.error(game.i18n.localize("SWFFG.CharacterCreator.Checks.GM"));
      return this.close();
    }
    // configure socket events
    game.socket.on("system.starwarsffg", async (...args) => {
      if (args[0]?.eventType === "pcWizard" && args[0]?.event === "createCharacterResponse") {
        await this.showCharacterStatus(args[0].actorId);
      } else if (args[0]?.eventType === "pcWizard" && args[0]?.event === "createFinalActorResponse") {
        await this.createActor(args[0].actorId);
      }
    });
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

  /** @override */
  async _onRender(context, options) {
    /**
     * Used to activateListeners on ApplicationV2
     */
    await super._onRender(context, options);
    

    // backgrounds
    const cultureSelector = new globalThis.SlimSelect({
      select: '#culture',
      settings: wizardSelectSettings(),
      events: {
        afterChange: async (newVal) => {
          // could be >1 but we only allow one here
          await this.selectCulture(newVal[0].value, newVal[0].text);
        }
      }
    });
    cultureSelector.setSelected(this.data.selected.background.culture?.uuid, false);
    const hookSelector = new globalThis.SlimSelect({
      select: '#hook',
      settings: wizardSelectSettings(),
      events: {
        afterChange: async (newVal) => {
          // could be >1 but we only allow one here
          await this.selectHook(newVal[0].value, newVal[0].text);
        }
      }
    });
    hookSelector.setSelected(this.data.selected.background.hook?.uuid, false);
    if (this.data.selected.rules === "fad") {
      const forceAttitudeSelector = new globalThis.SlimSelect({
        select: '#force_attitude',
      settings: wizardSelectSettings(),
        events: {
          afterChange: async (newVal) => {
            // could be >1 but we only allow one here
            await this.selectForceAttitude(newVal[0].value, newVal[0].text);
          }
        }
      });
      forceAttitudeSelector.setSelected(this.data.selected.background.forceAttitude?.uuid, false);
    }

    // starting bonuses
    const startingBonusSelector = new globalThis.SlimSelect({
        select: '#startingBonus',
      settings: wizardSelectSettings(),
        events: {
          afterChange: async (newVal) => {
            // could be >1 but we only allow one here
            this.selectStartingBonus(newVal[0].value);
          }
        }
      });
      startingBonusSelector.setSelected(this.data.selected.startingBonus, false);

    // obligations
    const obligationsTable = new globalThis.DataTable(
      "#obligations",
      {language: wizardTableLanguage()},
    );
    obligationsTable.on("draw", () => {
      $(".obligation-spend").off("click").on("click", async (event) => {
        await this.handleObligationSelect(event);
      });
    });
    $(".obligation-spend").on("click", async (event) => {
      await this.handleObligationSelect(event);
    });
    $(".obligation-control").on("click", async (event) => {
      await this.handleObligationEdit(event);
    });

    // species
    const speciesTable = new globalThis.DataTable(
      "#species",
      {language: wizardTableLanguage()},
    );
    speciesTable.on("draw", () => {
      $(".species-spend").off("click").on("click", async (event) => {
        await this.handleSpeciesSelect(event);
      });
    });
    $(".species-spend").on("click", async (event) => {
      await this.handleSpeciesSelect(event);
    });

    // careers
    const careersTable = new globalThis.DataTable(
      "#careers",
      {language: wizardTableLanguage()},
    );
    careersTable.on("draw", () => {
      $(".career-spend").off("click").on("click", async (event) => {
        await this.handleCareerSelect(event);
      });
    });
    $(".career-spend").on("click", async (event) => {
      await this.handleCareerSelect(event);
    });
    $(".career_tab-container").on("click", (event) => {
      const $container = $(event.currentTarget);
      const uniqueClass = $container.attr("class").split(/\s+/).find(c => c !== "career_tab-container");
      this._openCareerSection = uniqueClass;
      $container.next(".career-selection").toggle('slow');
      $container.next(".career_skill_rank_select-selection").toggle('slow');
      $container.next(".specialization-selection").toggle('slow');
      $container.next(".specialization_skill_rank_select-selection").toggle('slow');
    });
    $(`.${this._openCareerSection}`).next().show();

    // specializations
    new globalThis.DataTable(
      "#specializations",
      {language: wizardTableLanguage()},
    );
    $(".specialization-spend").on("click", async (event) => {
      await this.handleSpecializationSelect(event);
    });

    $(".starwarsffg.wizard").find(".skill").each(async (_, elem) => {
      const skillData = foundry.utils.deepClone(
        this.tempActor.system
      );
      await DiceHelpers.addSkillDicePool({data: skillData}, elem);
    });

    // handled spending XP
    $('[data-action="characteristic-control"]').on("click", async (event) => {
      await this.handleCharacteristicModify(event);
    });
    $('[data-action="skill-control"]').on("click", async (event) => {
      await this.handleSkillModify(event);
    });
    $(".skills-container").on("click", function() {
      $(".skills-summary").toggle('slow');
    });
    $(".specialization-container").on("click", function() {
      $(this).next(".specialization-summary").toggle('slow');
    });
    $(".specialization-remove").on("click", async (event) => {
      await this.handleRemoveSpecialization(event);
    });
    $(".purchase-specialization").on("click", async (event) => {
      await this.handleSpecializationPurchase(event);
    });
    $(".specialization-talent-purchase").on("change", async (event) => {
      await this.handleSpecializationTalentPurchase(event);
    });

    // force powers
    $(".purchase-forcePower").on("click", async (event) => {
      await this.handleForcePowerPurchase(event);
    });
    $(".forcePower-container").on("click", function() {
      $(this).next(".forcePower-summary").toggle('slow');
    });
    $(".forcePower-remove").on("click", async (event) => {
      await this.handleRemoveForcePower(event);
    });
    $(".forcePower-talent-purchase").on("change", async (event) => {
      await this.handleForcePowerTalentPurchase(event);
    });

    // credit spending
    const gearTable = new globalThis.DataTable(
      "#buy_gear",
      {
        language: wizardTableLanguage(),
        columnDefs: [{
          visible: false,
          targets: 0,
        }],
        layout: {
          topStart: {
            buttons: [
              {
                text: game.i18n.localize('SWFFG.ItemsWeapons'),
                action: async (e, dt, _node, _config) => {
                  dt.column(3).visible(true);
                  dt.column(4).visible(true);
                  dt.column(5).visible(true);
                  dt.column(6).visible(true);
                  dt.column(7).visible(true);
                  dt.column(8).visible(true);
                  dt.column(9).visible(true);
                  dt.column(10).visible(true);
                  dt.column(11).visible(true);
                  dt.column(12).visible(false);
                  dt.column(13).visible(false);
                  dt.column(14).visible(false);
                  dt.column(0).search('weapon').draw(false);
                  await this.activateShopListeners();
                },
                className: 'weapon',
              },
              {
                text: game.i18n.localize('SWFFG.ItemsArmor'),
                action: async (e, dt, _node, _config) => {
                  dt.column(3).visible(true);
                  dt.column(4).visible(false);
                  dt.column(5).visible(false);
                  dt.column(6).visible(true);
                  dt.column(7).visible(true);
                  dt.column(8).visible(true);
                  dt.column(9).visible(false);
                  dt.column(10).visible(false);
                  dt.column(11).visible(true);
                  dt.column(12).visible(true);
                  dt.column(13).visible(true);
                  dt.column(14).visible(false);
                  dt.column(0).search('armour').draw(false);
                  await this.activateShopListeners();
                },
                className: 'armor',
              },
              {
                text: game.i18n.localize('SWFFG.ItemsGear'),
                action: async (e, dt, _node, _config) => {
                  dt.column(3).visible(true);
                  dt.column(4).visible(false);
                  dt.column(5).visible(false);
                  dt.column(6).visible(true);
                  dt.column(7).visible(true);
                  dt.column(8).visible(false);
                  dt.column(9).visible(false);
                  dt.column(10).visible(false);
                  dt.column(11).visible(true);
                  dt.column(12).visible(false);
                  dt.column(13).visible(false);
                  dt.column(14).visible(false);
                  dt.column(0).search('gear').draw(false);
                  await this.activateShopListeners();
                },
                className: 'gear',
              },
              {
                text: game.i18n.localize('TYPES.Item.itemattachment'),
                action: async (e, dt, _node, _config) => {
                  dt.column(3).visible(true);
                  dt.column(4).visible(false);
                  dt.column(5).visible(false);
                  dt.column(6).visible(true);
                  dt.column(7).visible(false);
                  dt.column(8).visible(true);
                  dt.column(9).visible(false);
                  dt.column(10).visible(false);
                  dt.column(11).visible(true);
                  dt.column(12).visible(false);
                  dt.column(13).visible(false);
                  dt.column(14).visible(true);
                  dt.column(0).search('itemattachment').draw(false);
                  await this.activateShopListeners();
                },
                className: 'attachment',
              },
              {
                text: game.i18n.localize('TYPES.Item.itemmodifier'),
                action: async (e, dt, _node, _config) => {
                  dt.column(3).visible(false);
                  dt.column(4).visible(false);
                  dt.column(5).visible(false);
                  dt.column(6).visible(false);
                  dt.column(7).visible(false);
                  dt.column(8).visible(false);
                  dt.column(9).visible(false);
                  dt.column(10).visible(false);
                  dt.column(11).visible(false);
                  dt.column(12).visible(false);
                  dt.column(13).visible(false);
                  dt.column(14).visible(true);
                  dt.column(0).search('itemmod').draw(false);
                  await this.activateShopListeners();
                },
                className: 'mod',
              },
            ],
          }
        }
      }
    );
    gearTable.on("draw", async () => {
      await this.activateShopListeners();
    });
    gearTable.buttons('.weapon').trigger();

    // motivations
    new globalThis.DataTable(
      "#selected_motivations",
      {language: wizardTableLanguage()},
    );
    const availableMotivationTable = new globalThis.DataTable(
      "#motivations",
      {language: wizardTableLanguage()},
    );
    availableMotivationTable.on("draw", async () => {
      $(".motivation-spend").off("click").on("click", async (event) => {
        await this.handleMotivationPurchase(event);
      });
    });
    $(".motivation-spend").on("click", async (event) => {
      await this.handleMotivationPurchase(event);
    });
    $(".motivation-refund").on("click", async (event) => {
      await this.handleMotivationRefund(event);
    });

    // create the actor!
    $(".create-actor").on("click", async (event) => {
      await this.createActorShim(event);
    });

    
  }

  /**
   * Activates credit listeners
   * Done here since they're called repeatedly within the various filtered views in the datatable
   * @returns {Promise<void>}
   */
  async activateShopListeners() {
    $(".credit-spend").off("click").on("click", async (event) => {
      await this.handleCreditPurchase(event);
    });
    $(".credit-refund").off("click").on("click", async (event) => {
      await this.handleCreditRefund(event);
    });
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
      builtin: this.builtin,
    };

    if (Object.keys(this.compendiumData).length === 0) {
      this.compendiumData['availableBackgrounds'] = await this.getBackgrounds();
      this.compendiumData['availableObligations'] = await this.getAvailableMoralities();
      this.compendiumData['availableSpecies'] = await this.getAvailableSpecies();
      this.compendiumData['availableCareers'] = await this.getAvailableCareers();
      this.compendiumData['availableMotivations'] = await this.getAvailableMotivations();
      this.compendiumData['items'] = await this.getItems();
    }

    context.availableBackgrounds = this.compendiumData['availableBackgrounds'];
    context.startingBonusesRadio = this.startingBonusForHTML();
    context.availableObligations = this.compendiumData['availableObligations'];
    context.availableSpecies = this.compendiumData['availableSpecies'];
    context.availableCareers = this.compendiumData['availableCareers'];
    context.filteredSpecializations = this.data.available.specializations;
    context.availableMotivations = this.compendiumData['availableMotivations'];
    context.tempActor = this.tempActor;
    if (this.tempActor) {
      const skillData = foundry.utils.deepClone(
        this.tempActor.system
      );
      context.skillsList = this.tempActor.sheet._createSkillColumns({data: skillData});

    }
    const xp = this.calcXp();
    context.totalXp = xp.total;
    context.availableXp = xp.available;

    // items for the shop
    context.items = this.compendiumData['items'];

    const credits = this.calcCredits();
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
        Object.keys(this.tempActor.system.skills).map(key => [key.replace(" ", " "), 0])
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
      combinedPurchases[skillName]++;
    }
    for (const skillName of this.data.selected.specializationCareerSkillRanks) {
      // add to career purchases
      if (!Object.keys(specializationPurchases).includes(skillName)) {
        specializationPurchases[skillName] = 0;
      }
      specializationPurchases[skillName]++;
      combinedPurchases[skillName]++;
    }
    context.careerSkillPurchases = careerPurchases;
    context.specializationSkillPurchases = specializationPurchases;
    context.combinedPurchases = combinedPurchases;

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

    return context;
  }

  /** @override */
  async _preparePartContext(partId, context, _options) {
    // TODO: is this needed? valuable?
    switch (partId) {
      case 'rules':
      case 'another_tab':
        context.tab = context.tabs[partId];
        break;
      default:
    }
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
    const sources = this.getSources("item");
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

  /**
   * Retrieve all backgrounds available for the player to buy
   * @returns {Promise<{cultures: *[], hooks: *[], forceAttitudes: *[]}>}
   */
  async getBackgrounds() {
    const sources = this.getSources("background");
    const cultures = [];
    const hooks = [];
    const forceAttitudes = [];

    for (const source of sources) {
      const pack = game.packs.get(source);
      if (!pack) {
        continue;
      }
      const items = await pack.getDocuments();
      for (const item of items) {
        item.pill = await foundry.applications.ux.TextEditor.enrichHTML(item?.link);
        if (item.system.type === "culture") {
          cultures.push(item);
        } else if (item.system.type === "hook") {
          hooks.push(item);
        } else if (item.system.type === "attitude") {
          forceAttitudes.push(item);
        }
      }
    }

    for (const item of game.items.filter(i => i.type === "background")) {
      item.pill = await foundry.applications.ux.TextEditor.enrichHTML(item?.link);
      if (item.system.type === "culture") {
        cultures.push(item);
      } else if (item.system.type === "hook") {
        hooks.push(item);
      } else if (item.system.type === "attitude") {
        forceAttitudes.push(item);
      }
    }

    return {
      cultures: cultures,
      hooks: hooks,
      forceAttitudes: forceAttitudes,
    }
  }

  /**
   * Retrieve all Moralities available for the player to buy
   * @returns {Promise<*[]>}
   */
  async getAvailableMoralities() {
    const sources = this.getSources("obligation");
    const obligations = [];

    for (const source of sources) {
      const pack = game.packs.get(source);
      if (!pack) {
        continue;
      }
      const items = await pack.getDocuments();
      for (const item of items) {
        item.pill = await foundry.applications.ux.TextEditor.enrichHTML(item?.link);
        obligations.push(item);
      }
    }

    for (const item of game.items.filter(i => i.type === "obligation")) {
      item.pill = await foundry.applications.ux.TextEditor.enrichHTML(item?.link);
      obligations.push(item);
    }

    return obligations;
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
    const sources = this.getSources("career");
    const careers = [];

    for (const source of sources) {
      const pack = game.packs.get(source);
      if (!pack) {
        continue;
      }
      const items = await pack.getDocuments();
      for (const item of items) {
        item.pill = await foundry.applications.ux.TextEditor.enrichHTML(item?.link);
        careers.push(item);
      }
    }

    for (const item of game.items.filter(i => i.type === "careers")) {
      item.pill = await foundry.applications.ux.TextEditor.enrichHTML(item?.link);
      careers.push(item);
    }

    return careers;
  }

  /**
   * Retrieve all Motivations available for the player to buy
   * @returns {Promise<*[]>}
   */
  async getAvailableMotivations() {
    const sources = this.getSources("motivation");
    const motivations = [];

    for (const source of sources) {
      const pack = game.packs.get(source);
      if (!pack) {
        continue;
      }
      const items = await pack.getDocuments();
      for (const item of items) {
        item.pill = await foundry.applications.ux.TextEditor.enrichHTML(item?.link);
        motivations.push(item);
      }
    }

    for (const item of game.items.filter(i => i.type === "motivation")) {
      item.pill = await foundry.applications.ux.TextEditor.enrichHTML(item?.link);
      motivations.push(item);
    }

    return motivations;
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

  /**
   * Handler for the user selecting which ruleset to use
  */
  static selectRules(event, target) {
    const choice = $(target).find(":checked")[0].value;
    this.data.selected.rules = choice;
    this.render(true);
  }

  /**
  * Handler for the user selecting their starting bonus
  */
  selectStartingBonus(choice) {
    
    const ruleToBonusMap = {
      fad: 'conflict',
      aor: 'duty',
      eote: 'obligation',
    };
    this.data.grants.bonus.xp = 0;
    this.data.grants.bonus.duty = 0;
    this.data.grants.bonus.obligation = 0;
    this.data.grants.bonus.conflict = 0;
    this.data.grants.bonus.credits = 0;

    if (this.data.selected.rules === 'fad') {
      if (choice === '10xp') {
        this.data.grants.bonus.xp = 10;
      } else if (choice === '2k_credits') {
        this.data.grants.bonus.credits = 2500;
      } else if (choice === '5xp' ) {
        this.data.grants.bonus.xp = 5;
        this.data.grants.bonus.credits = 1000;
      } else if (choice === '21_plus_morality' ) {
        this.data.grants.bonus.morality = 21;
      } else if (choice === '21_minus_morality' ) {
        this.data.grants.bonus.morality = -21;
      }
    } else {
      if (choice === '5xp') {
        this.data.grants.bonus.xp = 5;
        this.data.grants.bonus[ruleToBonusMap[this.data.grants.rules]] = 5;
      } else if (choice === '10xp') {
        this.data.grants.bonus.xp = 10;
        this.data.grants.bonus[ruleToBonusMap[this.data.grants.rules]] = 10;
      } else if (choice === '1k_credits') {
        this.data.grants.bonus.credits = 1000;
        this.data.grants.bonus[ruleToBonusMap[this.data.grants.rules]] = 5;
      } else if (choice === '2k_credits') {
        this.data.grants.bonus.credits = 2500;
        this.data.grants.bonus[ruleToBonusMap[this.data.grants.rules]] = 10;
      }
    }
    this.data.selected.startingBonus = choice;
    this.render(true);
  }

  /**
   * Handler for culture selection
   * @param itemUuid
   * @param itemNametarget
   * @returns {Promise<void>}
   */
  async selectCulture(itemUuid, itemNametarget) {
    const selectedItem = await fromUuid(itemUuid);
    if (!selectedItem) {
      ui.notifications.warn(game.i18n.format("SWFFG.UI.Actor.WizardCultureNotFound", {name: itemNametarget}));
      return;
    }
    $("#cultured_esc").text(selectedItem.system.description);
    this.data.selected.background.culture = selectedItem;
  }

  /**
   * Handler for hook selection
   * @param itemUuid
   * @param itemNametarget
   * @returns {Promise<void>}
  */
  async selectHook(itemUuid, itemNametarget) {
    const selectedItem = await fromUuid(itemUuid);
    if (!selectedItem) {
      ui.notifications.warn(game.i18n.format("SWFFG.UI.Actor.WizardHookNotFound", {name: itemNametarget}));
      return;
    }
    $("#hook_desc").text(selectedItem.system.description);
    this.data.selected.background.hook = selectedItem;
  }

  /**
   * Handler for forceAttitude selection
   * @param itemUuid
   * @param itemNametarget
   * @returns {Promise<void>}
  */
  async selectForceAttitude(itemUuid, itemNametarget) {
    const selectedItem = await fromUuid(itemUuid);
    if (!selectedItem) {
      ui.notifications.warn(game.i18n.format("SWFFG.UI.Actor.WizardForceAttitudeNotFound", {name: itemNametarget}));
      return;
    }
    $("#force_attitude_desc").text(selectedItem.system.description);
    this.data.selected.background.forceAttitude = selectedItem;
  }

  /** @override */
  async _onClickTab(event) {
    if ($(event.target).data("tab") === "review") {
      // force a re-render on the review tab so we are sure we're using the latest data
      await this.render(true);
    }
    await super._onClickTab(event);
  }

  async handleSpeciesSelect(event) {
    const target = $(event.currentTarget);
    const selectedSpecies = await fromUuid(target.data("source"));
    if (!selectedSpecies) {
      return ui.notifications.warn(game.i18n.localize("SWFFG.UI.Actor.WizardSpeciesNotFound"));
    }
    if (this.data.selected.species?.uuid !== selectedSpecies.uuid) {
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
    this.data.selected.career = selectedCareer;
    this.data.selected.careerCareerSkillRanks = [];

    // update specialization information
    this.data.available.specializations = [];
    this.data.selected.specializationCareerSkillRanks = [];
    for (const specData of Object.values(selectedCareer.system.specializations)) {
      const specItem = await fromUuid(specData.source);
      if (specItem) {
        specItem.pill = await foundry.applications.ux.TextEditor.enrichHTML(specItem?.link);
        this.data.available.specializations.push(specItem);
      }
    }

    await this.showCharacterStatusShim();
  }

  async handleObligationEdit(event) {
    const target = $(event.currentTarget);
    const action = target.data("action");
    const input = target.parent().parent().children("td").children("input");
    const obligationIndex = target.data("index");
    const editBtn = target.parent().parent().children("td").children(".fa-edit");
    const saveBtn = target.parent().parent().children("td").children(".fa-save");

    if (action === "edit") {
      input.prop("disabled", false);
      editBtn.addClass("control-inactive");
      editBtn.removeClass("control-active");
      saveBtn.addClass("control-active");
      saveBtn.removeClass("control-inactive");
    } else if (action === "save") {
      for (const attr of input) {
        const propName = attr.name;
        const propValue = attr.value;
        this.data.selected.obligations[obligationIndex]["system"][propName] = propValue;
      }
      input.prop("disabled", true);

      editBtn.addClass("control-active");
      editBtn.removeClass("control-inactive");
      saveBtn.addClass("control-inactive");
      saveBtn.removeClass("control-active");
    } else if (action === "deselect") {
      this.data.selected.obligations.splice(obligationIndex, 1);
      target.parent().parent().remove();
    }
  }

  async handleObligationSelect(event) {
    const target = $(event.currentTarget);
    const selectedObligation = await fromUuid(target.data("source"));
    if (!selectedObligation) {
      return ui.notifications.warn(game.i18n.localize("SWFFG.UI.Actor.WizardObligationNotFound"));
    }
    this.data.selected.obligations.push(selectedObligation);
    await this.showCharacterStatusShim();
  }

  async handleSpecializationSelect(event) {
    const target = $(event.currentTarget);
    const selectedSpecialization = await fromUuid(target.data("source"));
    if (!selectedSpecialization) {
      return ui.notifications.warn(game.i18n.localize("SWFFG.UI.Actor.WizardSpecializationNotFound"));
    }
    this.data.selected.specialization = selectedSpecialization;
    this.data.selected.specializationCareerSkillRanks = [];
    await this.showCharacterStatusShim();
  }

  /**
   * Initial handler for showCharacterStatus, since we need different code paths based on if a socket event is needed
   * @returns {Promise<void>}
   */
  async showCharacterStatusShim() {
    this._steelersSpeciesPreviewPending = true;
    if (game.user.isGM) {
      // temporary: delete previous copies of the actor
      const existingActor = game.actors.getName(`temp actor - ${game.user.name}`);
      if (existingActor) {
        await existingActor.delete();
      }
      // temporary: create a new actor to add stuff to
      const tempActor = await Actor.create(
        {
          name: `temp actor - ${game.user.name}`,
          type: "character",
          displaySheet: false,
        },
      );
      await this.showCharacterStatus(tempActor.id);
    } else {
      game.socket.emit("system.starwarsffg", {
        eventType: "pcWizard",
        event: "createCharacterRequest",
      });
    }
  }

  async showCharacterStatus(actorId) {
    const tempActor = game.actors.get(actorId);
    if (!tempActor) {
      ui.notifications.error(game.i18n.localize("SWFFG.UI.Actor.WizardPreviewNotFound"));
      return;
    }

    await tempActor.setFlag("starwarsffg", "speciesWizardManaged", true);

    
    const { total: totalXp, available: availableXp } = this.calcXp();
    if (this.data.selected.species?.uuid) {
      await tempActor.update({
        "system.experience": {
          total: totalXp,
          available: availableXp,
        }
      });
    }

    
    // apply purchases
    for (const characteristicPurchase of this.data.purchases.xp.characteristics) {
      const updateKey = `system.characteristics.${characteristicPurchase.key}.value`;
      const newValue = tempActor.system.characteristics[characteristicPurchase.key].value + 1;
      await tempActor.update({[updateKey]: newValue})
    }
    for (const skillPurchase of this.data.purchases.xp.skills) {
      const updateKey = `system.skills.${skillPurchase.key}.rank`;
      const newValue = tempActor.system.skills[skillPurchase.key].rank + 1;
      await tempActor.update({[updateKey]: newValue})
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
      items.push(this.data.selected.specialization);
    }
    // motivations
    for (const item of this.data.selected.motivations) {
      if (item?.uuid) {
        items.push(item);
      }
    }
    
    
    await tempActor.createEmbeddedDocuments("Item", items);

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

    
    this.tempActor = tempActor;
    
    this.render();
  }

  async handleCharacteristicModify(event) {
    const target = $(event.currentTarget);
    const characteristic = target.data("target");
    const direction = target.data("direction");
    const curValue = parseInt(target.data("value"));
    let newValue;
    if (direction === "increase") {
      newValue = curValue + 1;
      this.data.purchases.xp.characteristics.push({
        key: characteristic,
        value: newValue,
        cost: newValue * 10,
      });
    } else {
      const purchaseIndex = this.data.purchases.xp.characteristics.findIndex(function(purchase) {
        return purchase.key === characteristic && purchase.value === curValue;
      });
      this.data.purchases.xp.characteristics.splice(purchaseIndex, 1);
    }
    // rebuild the actor to apply the changes
    await this.showCharacterStatusShim();
  }

  async handleSkillModify(event) {
    const target = $(event.currentTarget);
    const skill = target.data("target").replace(" ", " ");
    const direction = target.data("direction");
    const curValue = target.data("value");
    const skillMode = target.data("mode");
    let newValue;
    if (skillMode === "career") {
      if (direction === "increase") {
        this.data.selected.careerCareerSkillRanks.push(skill);
      } else {
        const purchaseIndex = this.data.selected.careerCareerSkillRanks.findIndex(function (purchase) {
          return purchase === skill;
        });
        this.data.selected.careerCareerSkillRanks.splice(purchaseIndex, 1);
      }
    } else if (skillMode === "specialization") {
      if (direction === "increase") {
        this.data.selected.specializationCareerSkillRanks.push(skill);
      } else {
        const purchaseIndex = this.data.selected.specializationCareerSkillRanks.findIndex(function (purchase) {
          return purchase === skill;
        });
        this.data.selected.specializationCareerSkillRanks.splice(purchaseIndex, 1);
      }
    } else {
      if (direction === "increase") {
        newValue = curValue + 1;
        let cost;
        if (this.tempActor.system.skills[skill].careerskill) {
          cost = newValue * 5;
        } else {
          cost = (newValue * 5) + 5;
        }
        this.data.purchases.xp.skills.push({
          key: skill,
          value: newValue,
          cost: cost,
        });
      } else {
        const purchaseIndex = this.data.purchases.xp.skills.findIndex(function (purchase) {
          return purchase.key === skill && purchase.value === curValue;
        });
        this.data.purchases.xp.skills.splice(purchaseIndex, 1);
      }
    }
    // rebuild the actor to apply the changes
    await this.showCharacterStatusShim();
  }

  async handleSpecializationPurchase(_event) {
    const availableXP = this.calcXp()['available'];
    const template = "systems/starwarsffg/templates/dialogs/ffg-confirm-purchase.html";
    const groups = [];
    // prepare the items list
    const inCareer = this.data.selected.career?.system?.specializations;
      if (!inCareer) {
        ui.notifications.warn(game.i18n.localize("SWFFG.UI.Actor.WizardCareerSpecializationsMissing"));
        return;
      }
      const inCareerNames = Object.values(inCareer).map(i => i.name);
      const sources = game.settings.get("starwarsffg", "specializationCompendiums").split(",");
      let outCareer = [];
      let universal = [];
      for (const source of sources) {
        const pack = game.packs.get(source);
        if (!pack) {
          continue;
        }
        const items = await pack.getDocuments();
        for (const item of items) {
          if (!inCareerNames.includes(item.name) && item.system.universal) {
            universal.push({
              name: item.name,
              id: item.id,
              source: item.uuid,
            });
          } else if (!inCareerNames.includes(item.name)) {
            outCareer.push({
              name: item.name,
              id: item.id,
              source: item.uuid,
            });
          }
        }
      }
      outCareer = sortDataBy(outCareer, "name");
      universal = sortDataBy(universal, "name");
      const baseCost = (this.data.purchases.xp.specializations.length + 1) * 10;
      const increasedCost = baseCost + 10;
      if (baseCost > availableXP) {
        return ui.notifications.warn(game.i18n.localize("SWFFG.Actors.Sheets.Purchase.NotEnoughXP"));
      } else if (increasedCost > availableXP) {
        outCareer = [];
      }
      const itemType =  game.i18n.localize("TYPES.Item.specialization");
      groups.push("Universal");
      groups.push("In Career");
      groups.push("Out of Career");
      const content = await foundry.applications.handlebars.renderTemplate(template, { inCareer, outCareer, universal, baseCost, increasedCost, itemType: itemType, itemCategory: "specialization", groups: groups });
      // actually show the purchase menu
      await this.showPurchaseConfirmation("specializations", content)
  }

  async handleForcePowerPurchase(_event) {
    const groups = [];
    const template = "systems/starwarsffg/templates/dialogs/ffg-confirm-purchase.html";
    const sources = game.settings.get("starwarsffg", "forcePowerCompendiums").split(",");
      let selectableItems = [];
      const worldItems = game.items.filter(i => i.type === "forcepower");
      for (const worldItem of worldItems) {
        selectableItems.push({
          name: worldItem.name,
          id: worldItem.id,
          source: worldItem.uuid,
          cost: worldItem.system.base_cost,
          requiredForceRating: parseInt(worldItem.system.required_force_rating),
        });
        addIfNotExist(groups, parseInt(worldItem.system.required_force_rating));
      }
      for (const source of sources) {
        const pack = game.packs.get(source);
        if (!pack) {
          continue;
        }
        const items = await pack.getDocuments();
        for (const item of items) {
          selectableItems.push({
            name: item.name,
            id: item.id,
            source: item.uuid,
            cost: item.system.base_cost,
            requiredForceRating: parseInt(item.system.required_force_rating),
          });
          addIfNotExist(groups, parseInt(item.system.required_force_rating));
        }
      }
      selectableItems = sortDataBy(selectableItems, "name");
      const itemType = game.i18n.localize("TYPES.Item.forcepower");
      groups.sort();
      const content = await foundry.applications.handlebars.renderTemplate(template, { selectableItems, itemType: itemType, itemCategory: "forcepower", groups: groups });
      // actually show the purchase menu
      await this.showPurchaseConfirmation("forcePowers", content)
  }

  async handleRemoveSpecialization(event) {
    const target = $(event.currentTarget);
    const specName = target.data("name");
    const talentPurchaseLength = this.data.purchases.xp.talents.length - 1;
    const specializationPurchaseLength = this.data.purchases.xp.specializations.length - 1;

    for (let index = talentPurchaseLength; index >= 0; index--) {
      const talentPurchase = this.data.purchases.xp.talents[index];
      if (talentPurchase.specName === specName) {
        this.data.purchases.xp.talents.splice(index, 1);
      }
    }

    for (let index = specializationPurchaseLength; index >= 0; index--) {
      const specPurchase = this.data.purchases.xp.specializations[index];
      if (specPurchase.item.name === specName) {
        this.data.purchases.xp.specializations.splice(index, 1);
      }
    }

    // rebuild the actor to apply the changes
    await this.showCharacterStatusShim();
  }

  async handleRemoveForcePower(event) {
    const target = $(event.currentTarget);
    const specName = target.data("name");
    const talentPurchaseLength = this.data.purchases.xp.talents.length - 1;
    const forcePowerPurchaseLength = this.data.purchases.xp.forcePowers.length - 1;

    for (let index = talentPurchaseLength; index >= 0; index--) {
      const talentPurchase = this.data.purchases.xp.talents[index];
      if (talentPurchase.specName === specName) {
        this.data.purchases.xp.talents.splice(index, 1);
      }
    }

    for (let index = forcePowerPurchaseLength; index >= 0; index--) {
      const forcePowerPurchase = this.data.purchases.xp.forcePowers[index];
      if (forcePowerPurchase.item.name === specName) {
        this.data.purchases.xp.forcePowers.splice(index, 1);
      }
    }

    // rebuild the actor to apply the changes
    await this.showCharacterStatusShim();
  }

  async handleForcePowerTalentPurchase(event) {
    const target = $(event.currentTarget);
    const upgrade = target.data("target");
    const forcePowerName = target.data("forcepower");
    const parentForcePower = this.data.purchases.xp.forcePowers.find(s => s.item.name === forcePowerName)?.item;
    if (!parentForcePower) {
      return ui.notifications.warn(game.i18n.format("SWFFG.UI.Actor.WizardPowerUpgradeNotFound", {power: forcePowerName, upgrade}));
    }
    const wasLearned = parentForcePower.system.upgrades[upgrade]?.islearned || false
    const cost = target.data("cost");

    parentForcePower.system.upgrades[upgrade].islearned = !wasLearned;

    if (!wasLearned) {
      this.data.purchases.xp.talents.push({
        specName: parentForcePower.name,
        key: upgrade,
        cost: cost,
      });
    } else {
      const purchaseIndex = this.data.purchases.xp.talents.findIndex(function(purchase) {
        return purchase.key === upgrade && purchase.specName === parentForcePower;
      });
      this.data.purchases.xp.talents.splice(purchaseIndex, 1);
    }

    // rebuild the actor to apply the changes
    await this.showCharacterStatusShim();
  }

  async handleSpecializationTalentPurchase(event) {
    const target = $(event.currentTarget);
    const talent = target.data("target");
    const specializationName = target.data("specialization");
    const cost = target.data("cost");
    let wasLearned;
    if (specializationName === this.data.selected.specialization?.name) {
      wasLearned = this.data.selected.specialization?.system?.talents[talent]?.islearned || false;
      this.data.selected.specialization.system.talents[talent].islearned = !wasLearned;
    } else {
      const parentSpec = this.data.purchases.xp.specializations.find(s => s.item.name === specializationName)?.item;
      if (!parentSpec) {
        return ui.notifications.warn(game.i18n.format("SWFFG.UI.Actor.WizardTalentSpecializationNotFound", {specialization: specializationName, talent}));
      }
      wasLearned = parentSpec.system.talents[talent]?.islearned || false;
      parentSpec.system.talents[talent].islearned = !wasLearned;
    }

    if (!wasLearned) {
      this.data.purchases.xp.talents.push({
        specName: specializationName,
        key: talent,
        cost: cost,
      });
    } else {
      const purchaseIndex = this.data.purchases.xp.talents.findIndex(function(purchase) {
        return purchase.key === talent && purchase.specName === specializationName;
      });
      this.data.purchases.xp.talents.splice(purchaseIndex, 1);
    }

    // rebuild the actor to apply the changes
    await this.showCharacterStatusShim();
  }

  async showPurchaseConfirmation(itemType, content) {
    new LegacyDialogV2(
      {
        title: game.i18n.format("SWFFG.Actors.Sheets.Purchase.DialogTitle", {itemType: itemType}),
        content: content,
        buttons: {
          done: {
            icon: '<i class="fa-regular fa-circle-up"></i>',
            label: game.i18n.localize("SWFFG.Actors.Sheets.Purchase.ConfirmPurchase"),
            callback: async (purchaseWindow) => {
              
              const cost = $("#ffgPurchase option:selected", purchaseWindow).data("cost");
              const selectedUuid = $("#ffgPurchase option:selected", purchaseWindow).data("source");

              

              const selectedItem = await fromUuid(selectedUuid);
              if (!selectedItem) {
                ui.notifications.warn(game.i18n.localize("SWFFG.UI.Actor.WizardPurchasedSpecializationNotFound"));
                return;
              }
              this.data.purchases.xp[itemType].push({
                item: selectedItem,
                cost: cost,
              });
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
    ).render(true);
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
    let starting = 0;
    let available = 0;
    let key;

    if (this.data.selected.rules === "fad") {
      starting = this.data.initial.morality;
      available = starting;
      key = "morality";
      if (this.data.selected.startingBonus === "21_plus_morality") {
        available += 21;
      } else if (this.data.selected.startingBonus === "21_minus_morality") {
        available -= 21;
      }
    } else if (this.data.selected.rules === "eote") {
      starting = this.data.initial.obligation;
      available = starting;
      key = "obligation";
      if (this.data.selected.startingBonus === "5xp") {
        available += 5;
      } else if (this.data.selected.startingBonus === "10xp") {
        available += 10;
      } else if (this.data.selected.startingBonus === "1k_credits") {
        available += 5;
      } else if (this.data.selected.startingBonus === "2k_credits") {
        available += 10;
      }
    } else if (this.data.selected.rules === "aor") {
      starting = this.data.initial.duty;
      available = starting;
      key = "duty";
      if (this.data.selected.startingBonus === "5xp") {
        available -= 5;
      } else if (this.data.selected.startingBonus === "10xp") {
        available -= 10;
      } else if (this.data.selected.startingBonus === "1k_credits") {
        available -= 5;
      } else if (this.data.selected.startingBonus === "2k_credits") {
        available -= 10;
      }
    }
    return {
      starting: starting,
      available: available,
      key: key,
    }
  }

  async handleCreditPurchase(event) {
    const target = $(event.currentTarget);
    const itemUuid = target.data("source");
    const purchasedItem = await fromUuid(itemUuid);
    if (!purchasedItem) {
      return ui.notifications.warn(game.i18n.localize("SWFFG.UI.Actor.WizardPurchasedItemNotFound"));
    }
    this.data.purchases.credits.push({
      item: purchasedItem,
      cost: purchasedItem.system.price.value,
    });
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
    const target = $(event.currentTarget);
    const itemUuid = target.data("source");
    const purchasedItem = await fromUuid(itemUuid);
    if (!purchasedItem) {
      return ui.notifications.warn(game.i18n.localize("SWFFG.UI.Actor.WizardMotivationNotFound"));
    }
    this.data.selected.motivations.push({
      item: purchasedItem,
    });
    // rebuild the actor to apply the changes
    await this.showCharacterStatusShim();
  }

  async handleMotivationRefund(event) {
    const target = $(event.currentTarget);
    const itemName = target.data("name");
    const purchasedItemLength = this.data.selected.motivations.length - 1;

    for (let index = purchasedItemLength; index >= 0; --index) {
      const itemPurchase = this.data.selected.motivations[index];
      if (itemPurchase.item.name === itemName) {
        this.data.selected.motivations.splice(index, 1);
      }
    }

    // rebuild the actor to apply the changes
    await this.showCharacterStatusShim();
  }

  async createActorShim() {
    const api = this._speciesWizardAPI();
    if (typeof api?.validateWizard === "function" && await api.validateWizard(this) === false) return false;
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
      game.socket.emit("system.starwarsffg", {
        eventType: "pcWizard",
        event: "createFinalActorRequest",
      });
    }
  }

  async createActor(actorId) {
    
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
      items.push(this.data.selected.specialization);
    }
    // motivations
    for (const item of this.data.selected.motivations) {
      if (item?.item?.uuid) {
        items.push(item);
      }
    }

    
    await newActor.createEmbeddedDocuments("Item", items);

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

    await xpLogEarn(newActor, totalXp, totalXp, totalXp, "Initial State");
    await xpLogSpend(newActor, "Character Creation Changes", totalXp - availableXp, availableXp, totalXp);

    await newActor.unsetFlag("starwarsffg", "speciesWizardManaged");
    newActor.sheet.render(true);
  }
}
