import {gmDifficulty, normalizeDifficulty, GM_DIFFICULTY_SETTING} from './gm-difficulty.js';
import {setupPilotageAssets} from './pilotage-assets.mjs';
import {setupPilotageMovement} from './ground-movement-pilotage.mjs';
import {setupNpcCommandPanel} from './npc-command.mjs';
import {createPilotageModifierEditor} from './pilotage-mj.js';

const tabName = 'ffgPilotage';
const settingsTitle = 'SWFFG.UI.Pilotage.GMControl';
const combatTitle = 'SWFFG.UI.Pilotage.CombatTitle';
const combatTabName = 'ffgPilotageCombat';

function buildSettings(root) {
  let config=gmDifficulty();
  const dice=[['challenge',game.i18n.localize("SWFFG.UI.Pilotage.Challenge"),'red'],['difficulty',game.i18n.localize("SWFFG.UI.Pilotage.Difficulty"),'purple'],['setback',game.i18n.localize("SWFFG.UI.Pilotage.Setback"),'black']];
  root.innerHTML=`<h2>${game.i18n.localize(settingsTitle)}</h2>
 <section class="pilotage-difficulty-section pilotage-card">
  <header class="pilotage-card-heading"><i class="fa-solid fa-dice" data-pilotage-difficulty-status role="img"></i><h3>${game.i18n.localize("SWFFG.UI.Pilotage.CommonDifficulty")}</h3></header>
  <div class="pilotage-difficulty-controls">
   <table class="gm-dice-table"><tbody>${dice.map(([key,label,color])=>`<tr data-gm-die="${key}"><td class="pilotage-die-icon"><img src="systems/starwarsffg/images/dice/starwars/${color}.png" alt="${label}" width="20" height="20"></td><td class="pilotage-die-label">${label}</td><td class="pilotage-die-value"><button type="button" data-gm-count="${key}" aria-label="${game.i18n.format("SWFFG.UI.Pilotage.DiceCount",{dice:label})}">${config[key]}</button></td></tr>`).join('')}</tbody></table>
  </div>
  <p class="pilotage-note">${game.i18n.localize("SWFFG.UI.Pilotage.DiceClickHint")}</p>
  <div class="pilotage-difficulty-footer"><label class="pilotage-enable"><span>${game.i18n.localize("SWFFG.UI.Pilotage.UseForAllRolls")}</span><input type="checkbox" name="pilotage-enabled" ${config.enabled?'checked':''}></label>
  <div class="gm-dice-preview" aria-label="${game.i18n.localize("SWFFG.UI.Pilotage.PreparedDice")}" aria-live="polite"></div><button type="button" class="pilotage-primary" data-pilotage-save-difficulty>${game.i18n.localize("SWFFG.UI.Pilotage.ApplyDifficulty")}</button></div>
  <button type="button" data-pilotage-request-roll><i class="fa-solid fa-dice" aria-hidden="true"></i> ${game.i18n.localize("SWFFG.UI.RollRequests.Request")}</button>
  <p class="pilotage-note">${game.i18n.localize("SWFFG.UI.Pilotage.IndividualSetbackHint")}</p>
 </section>
 <div class="pilotage-views-content"></div>`;
  setupPilotageAssets(root);
  setupPilotageMovement(root);
  const update=()=>{
    const preview=root.querySelector('.gm-dice-preview');preview.replaceChildren();
    for(const [key,label,color]of dice){root.querySelector(`[data-gm-count="${key}"]`).textContent=config[key];for(let i=0;i<config[key];i++){const img=document.createElement('img');img.src=`systems/starwarsffg/images/dice/starwars/${color}.png`;img.alt=label;img.width=24;img.height=24;preview.append(img);}}
  };
  for(const row of root.querySelectorAll('[data-gm-die]')){row.addEventListener('click',event=>{event.preventDefault();config[row.dataset.gmDie]++;update();});row.addEventListener('contextmenu',event=>{event.preventDefault();config[row.dataset.gmDie]=Math.max(0,config[row.dataset.gmDie]-1);update();});}
  const requestRoll = root.querySelector('[data-pilotage-request-roll]');
  requestRoll.addEventListener('click', async () => {
    requestRoll.disabled = true;
    try { await game.ffg.rollRequests.show(); }
    catch (error) { ui.notifications.error(error.message); }
    finally { requestRoll.disabled = false; }
  });

  const enabled=root.querySelector('[name=pilotage-enabled]');
  const status=root.querySelector('[data-pilotage-difficulty-status]');
  const apply=root.querySelector('[data-pilotage-save-difficulty]');
  const refreshDifficulty=()=>{
    config=gmDifficulty();
    enabled.checked=config.enabled;
    update();
    const key=config.enabled?'CommonDifficultyActive':'CommonDifficultyInactive';
    const label=game.i18n.localize('SWFFG.UI.Pilotage.'+key);
    status.dataset.active=String(config.enabled);
    status.setAttribute('aria-label',label);
    status.dataset.tooltip=label;
  };
  apply.addEventListener('click',async()=>{
    apply.disabled=true;
    try{
      await game.settings.set('starwarsffg',GM_DIFFICULTY_SETTING,normalizeDifficulty({...config,enabled:enabled.checked}));
      ui.notifications.info(game.i18n.localize("SWFFG.UI.Pilotage.CommonDifficultySaved"));
    }catch(error){ui.notifications.error(error.message);}
    finally{apply.disabled=false;}
  });
  refreshDifficulty();
  return refreshDifficulty;
}

export function registerPilotageSidebar() {
  const Base = foundry.applications.sidebar.AbstractSidebarTab;
  class PilotageTab extends Base {

    _canRender(options) {
      return game.user.isGM && super._canRender(options);
    }

    renderPopout() {
      this.activate();
    }

    async _renderHTML() {
      return this.element.firstElementChild ?? document.createElement('div');
    }

    _replaceHTML(result, content) {
      if (result.parentElement !== content) content.replaceChildren(result);
    }

  }

  class PilotageSidebar extends PilotageTab {
    static tabName = tabName;
    static DEFAULT_OPTIONS = {classes: ['ffg-pilotage-settings'], window: {title: settingsTitle}};

    async _onActivate() {
      if (!this.rendered) await this.render({force: true});
      if (!this.refreshDifficulty) this.refreshDifficulty = buildSettings(this.element.firstElementChild);
      Hooks.callAll('renderPilotageMJ', this);
    }
  }

  class PilotageCombatSidebar extends PilotageTab {
    static tabName = combatTabName;
    static DEFAULT_OPTIONS = {classes: ['ffg-pilotage-combat'], window: {title: combatTitle}};

    _onActivate() {
      void this.preparePanel().catch(error => ui.notifications.error(error.message));
    }

    async preparePanel() {
      if (!this.rendered) await this.render({force: true});
      const panel = this.element.firstElementChild;
      if (!this.modifiers) {
        panel.id = 'ffg-pilotage-combat-panel';
        this.modifiers = createPilotageModifierEditor();
      }
      setupNpcCommandPanel(panel, this.modifiers);
      return panel;
    }
  }

  CONFIG.ui[tabName] = PilotageSidebar;
  CONFIG.ui[combatTabName] = PilotageCombatSidebar;
  const tabs = Object.entries(CONFIG.ui.sidebar.TABS);
  tabs.splice(tabs.findIndex(([id]) => id === 'ffgCharacters') + 1, 0,
    [tabName, {gmOnly: true, tooltip: settingsTitle, icon: 'fa-solid fa-sliders'}],
    [combatTabName, {gmOnly: true, tooltip: combatTitle, icon: 'fa-solid fa-crosshairs'}]);
  CONFIG.ui.sidebar.TABS = Object.fromEntries(tabs);

  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = new URL('../../styles/pilotage-compact.css', import.meta.url).href;
  document.head.append(stylesheet);

  Hooks.on('ffgGMDifficultyChanged', () => ui[tabName]?.refreshDifficulty?.());
}
