import {systemGuideTours} from './system-guide-content.js';

const scope = 'starwarsffg';

class SystemGuideTour extends foundry.nue.Tour {
  async start() {
    if (this.config.restricted && !game.user.isGM) return;
    try {
      // Foundry stores a numeric step; an older edition may have had more pages.
      if (!Number.isInteger(this.stepIndex) || this.stepIndex < -1 || this.stepIndex > this.steps.length) {
        await this.reset();
      }
      return await super.start();
    } catch (error) {
      ui.notifications.error('Impossible d’ouvrir la présentation Steelers.');
      await foundry.applications.instances.get('tours-management')?.maximize();
      throw error;
    }
  }

  async _renderStep() {
    await super._renderStep();
    const frame = this.targetElement;
    frame.classList.add('ffg-system-guide-tour');
    const progress = frame.querySelector('.step-controls .progress');
    if (progress) progress.textContent = `Étape ${this.stepIndex + 1} sur ${this.steps.length}`;
    const labels = {exit: 'Fermer', previous: 'Précédent', next: this.hasNext ? 'Suivant' : 'Terminer'};
    for (const button of frame.querySelectorAll('.step-button')) {
      button.setAttribute('aria-label', labels[button.dataset.action]);
      button.title = labels[button.dataset.action];
    }
  }
}

export function registerSystemGuideTours() {
  for (const config of systemGuideTours) {
    if (!game.tours.has(`${scope}.${config.id}`)) {
      game.tours.register(scope, config.id, new SystemGuideTour(config));
    }
  }
}

export function registerSystemGuide() {
  game.settings.register(scope, 'systemGuideSeenVersion', {scope: 'client', config: false, type: String, default: ''});
}

export async function showSystemGuideAfterUpdate() {
  const version = game.system.version;
  if (!version || game.settings.get(scope, 'systemGuideSeenVersion') === version || foundry.nue.Tour.tourInProgress) return;
  try {
    registerSystemGuideTours();
    await game.tours.get(`${scope}.${systemGuideTours[0].id}`).start();
    await game.settings.set(scope, 'systemGuideSeenVersion', version);
  } catch (error) {
    console.error('Star Wars FFG : ouverture du guide impossible', error);
  }
}
