import {registerSystemGuideTours} from './system-guide.js';
import {registerLegacyTourCategory} from './legacy-tour-category.js';
import DiceHelpers from './dice-helpers.js';
import EffectHelpers from './effects.js';

class ExampleActorTour extends foundry.nue.Tour {
  tempActor = null;
  companion = null;

  get canStart() {
    return Actor.implementation.canUserCreate(game.user);
  }

  async start() {
    if (!this.canStart || foundry.nue.Tour.tourInProgress || this.tempActor) return;
    try {
      this.tempActor = await Actor.create({
        name: game.i18n.localize("SWFFG.Guide.ExampleActor"),
        type: "character"
      });
      await this.prepareActor();
      const sheet = this.tempActor.sheet;
      await sheet.render({force: true});
      sheet.bringToFront();
      return await super.start();
    } catch (error) {
      await this.closeExample();
      await foundry.applications.instances.get("tours-management")?.maximize();
      throw error;
    }
  }

  async prepareActor() {}

  async progress(index) {
    try {
      const result = await super.progress(index);
      if (index === -1 || index === this.steps.length) await this.closeExample();
      return result;
    } catch (error) {
      if (foundry.nue.Tour.activeTour === this) await this.exit();
      else await this.closeExample();
      throw error;
    }
  }

  async exit() {
    super.exit();
    await this.closeExample();
  }

  _getTargetElement(selector) {
    return this.companion?.element?.querySelector(selector)
      ?? this.tempActor?.sheet?.element?.querySelector(selector);
  }

  async closeCompanion() {
    const companion = this.companion;
    this.companion = null;
    await companion?.close();
  }

  async closeExample() {
    const actor = this.tempActor;
    this.tempActor = null;
    try {
      await this.closeCompanion();
    } finally {
      if (actor && game.actors.has(actor.id)) await actor.delete();
    }
  }
}

class CharacterTour extends ExampleActorTour {
  async prepareActor() {
    await this.tempActor.update({"system.characteristics.Brawn.value": 3});
  }

  async _preStep() {
    await this.closeCompanion();
    if (this.currentStep.id === "dice-pool") {
      this.companion = await DiceHelpers.rollSkillByKey(this.tempActor, "Athletics", 2, undefined, undefined, {
        id: "ffg-character-tour-roll",
        render: false
      });
      await this.companion?.render(true);
    }
    await super._preStep();
  }
}

class EditModeTour extends ExampleActorTour {
  async prepareActor() {
    await this.tempActor.createEmbeddedDocuments("ActiveEffect", [{
      name: game.i18n.localize("SWFFG.Guide.ExampleActor"),
      changes: [{
        key: "system.characteristics.Brawn.value",
        ...EffectHelpers.changeType(),
        value: 3
      }]
    }]);
  }

  async _preStep() {
    await this.closeCompanion();
    const {id} = this.currentStep;
    const options = this.tempActor.sheet.sheetoptions;
    await options.save({"flags.starwarsffg.config.enableEditMode": id === "stat-changes"});
    if (id === "enable-edit-mode") {
      this.companion = await new Promise((resolve, reject) => {
        const hook = Hooks.on("renderDialogV2", dialog => {
          if (!dialog.element.querySelector('.sheet-options-dialog [name="config.enableEditMode"]')) return;
          Hooks.off("renderDialogV2", hook);
          resolve(dialog);
        });
        options.handler().then(() => {
          Hooks.off("renderDialogV2", hook);
          resolve(null);
        }, error => {
          Hooks.off("renderDialogV2", hook);
          reject(error);
        });
      });
    }
    await super._preStep();
  }
}

/** Register the system guides and their native Foundry counterparts. */
export async function register_system_tours() {
  registerLegacyTourCategory();
  registerSystemGuideTours();
  for (const [id, Tour] of [["character", CharacterTour], ["edit-mode", EditModeTour]]) {
    try {
      game.tours.register("starwarsffg", id, await Tour.fromJSON(`/systems/starwarsffg/modules/tours/${id}.json`));
    } catch (error) {
      console.error("Star Wars FFG | Tour registration failed", id, error);
    }
  }
}
