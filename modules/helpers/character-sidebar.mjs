import {playerCharacters, isPersonalActor} from './player-character-data.mjs';
import {isCarriedEquipment} from './inventory-location.js';
import {equipmentDescription, equipmentStats} from './equipment-summary.js';
import {summarizeItemQualities} from './item-view-data.mjs';
import {fieldsAffect, identityFields} from './actor-change-fields.mjs';
import {npcSkillVisible} from './npc-command-data.mjs';

const tabName = 'ffgCharacters';
const system = 'starwarsffg';
const pinsSetting = 'sidebarCharacters';
const enabledSetting = 'enableCharacterSidebar';
const destinationSetting = 'gmTokenSheetDestination';
let pinWrites = Promise.resolve();
const label = key => game.i18n.localize(key);
let nameCollator, collatorLanguage;
function byName(a, b) {
  const language = game.i18n.lang;
  if (!nameCollator || language !== collatorLanguage) {
    nameCollator = new Intl.Collator(language, {numeric: true, sensitivity: 'base'});
    collatorLanguage = language;
  }
  return nameCollator.compare(a.name, b.name);
}

const readableRoll = message => message?.isRoll && message.isContentVisible;
let lastRoll;
function latestRoll() {
  if (lastRoll === undefined) lastRoll = game.messages.contents.findLast(readableRoll) ?? null;
  return lastRoll;
}

async function openLastRoll(id) {
  ui.chat.activate();
  const message = game.messages.get(id);
  if (!readableRoll(message)) return ui.chat.scrollBottom();
  const log = ui.chat.element.querySelector('.chat-log');
  const find = () => log.querySelector(`[data-message-id="${CSS.escape(id)}"]`);
  if (!find()) {
    const history = game.messages.contents;
    const first = history.findIndex(entry => entry.id === log.firstElementChild?.dataset.messageId);
    await ui.chat.renderBatch(Math.max(CONFIG.ChatMessage.batchSize, first - history.indexOf(message)));
  }
  if (ui.chat.active) find()?.scrollIntoView({block: 'center'});
}

function canUse(actor) {
  return isPersonalActor(actor) && actor.testUserPermission(game.user, 'OWNER');
}

// Manual pins are stored as actor IDs. Scene pins also remember which token supplies the sheet data.
function characterPins() {
  return new Map(game.settings.get(system, pinsSetting).map(pin =>
    typeof pin === 'string' ? [pin, null] : [pin.actorId, pin.tokenUuid]));
}

function pinnedToken(actorId, uuid) {
  if (!uuid) return null;
  const token = fromUuidSync(uuid);
  return token?.documentName === 'Token' && token.actorId === actorId ? token : null;
}

function renderDestinationControl(app) {
  const views = app.element?.querySelector('.pilotage-views-content');
  if (!views || !game.user.isGM) return;
  let control = views.querySelector('.pilotage-token-destination');
  if (!game.settings.get(system, enabledSetting)) return control?.remove();
  if (!control) {
    const doc = views.ownerDocument;
    control = doc.createElement('div');
    control.className = 'pilotage-card pilotage-token-destination';
    control.title = label('SWFFG.UI.CharacterSidebar.TokenDestinationHint');
    const caption = label('SWFFG.UI.CharacterSidebar.TokenDestination');
    const group = doc.createElement('div');
    group.className = 'pilotage-destination-buttons';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', caption);
    for (const [value, key] of [['standard', 'StandardSheet'], ['sidebar', 'SidebarSheet']]) {
      const button = doc.createElement('button');
      button.type = 'button';
      button.value = value;
      button.textContent = label('SWFFG.UI.CharacterSidebar.' + key);
      group.append(button);
    }
    group.addEventListener('click', async event => {
      const button = event.target.closest('button');
      if (!button || group.hasAttribute('aria-busy') || button.getAttribute('aria-pressed') === 'true') return;
      group.setAttribute('aria-busy', 'true');
      try { await game.settings.set(system, destinationSetting, button.value); }
      catch (error) { ui.notifications.error(error.message); }
      finally { group.removeAttribute('aria-busy'); renderDestinationControl(app); }
    });
    control.append(doc.createTextNode(caption), group);
    views.append(control);
  }
  const destination = game.settings.get(system, destinationSetting);
  for (const button of control.querySelectorAll('button')) {
    button.setAttribute('aria-pressed', String(button.value === destination));
  }
}

function refreshDestinationControl() {
  if (ui.ffgPilotage) renderDestinationControl(ui.ffgPilotage);
}
Hooks.on('renderPilotageMJ', renderDestinationControl);

function actorSummary(actor) {
  const {stats, characteristics} = actor.system;
  const meters = [];
  for (const key of ['wounds', 'strain']) {
    if (key === 'strain' && (!['character','nemesis'].includes(actor.type) || actor.flags.starwarsffg?.config?.enableStrainThreshold === false)) continue;
    if (stats[key]) meters.push({label: label(key === 'wounds' ? 'SWFFG.Wounds' : 'SWFFG.Strain'), value: stats[key].value + ' / ' + stats[key].max});
  }
  if (stats.soak) meters.push({label: label('SWFFG.Soak'), value: stats.soak.value});
  if (stats.defence) meters.push({label: label('SWFFG.Defense'), value: stats.defence.melee + ' / ' + stats.defence.ranged,
    hint: label('SWFFG.DefenseMelee') + ' / ' + label('SWFFG.DefenseRanged')});
  const traits = Object.entries(CONFIG.FFG.characteristics).filter(([key]) => characteristics[key]).map(([key, config]) => ({
    label: label(config.abrev), hint: label(config.label), value: characteristics[key].value
  }));
  return {id: actor.id, name: actor.name, img: actor.img, meters, traits};
}

function skillGroups(actor) {
  const groups = new Map((actor.system.skilltypes ?? []).map(type => [type.type, {label: type.label, rows: []}]));
  for (const [key, skill] of Object.entries(actor.system.skills ?? {})) {
    if (!actor.system.characteristics[skill.characteristic] || !npcSkillVisible(actor, key)) continue;
    if (!groups.has(skill.type)) groups.set(skill.type, {label: skill.type || label('SWFFG.Skills'), rows: []});
    groups.get(skill.type).rows.push({key, name: label(skill.label || key), rank: skill.rank ?? 0});
  }
  return [...groups.values()].filter(group => group.rows.length).map(group => ({...group, rows: group.rows.sort(byName)}));
}

async function talentGroups(actor, expandedId) {
  const {summaryTalents, talentDescription} = await import('./talent-summary.js');
  const active = [], passive = [];
  for (const talent of summaryTalents(actor)) {
    const id = JSON.stringify([talent.itemId, talent.name, talent.characteristicChoice]);
    const expanded = id === expandedId;
    const name = [talent.name, talent.characteristicChoice].filter(Boolean).join(' · ');
    (talent.active ? active : passive).push({
      id, name, expanded, total: talent.total,
      rank: talent.isRanked ? game.i18n.format('SWFFG.UI.Talent.RankNumber', {rank: talent.rank}) : '',
      description: expanded ? (await talentDescription(actor, talent)).innerHTML : ''
    });
  }
  return [{label: label('SWFFG.UI.Talent.Active'), rows: active}, {label: label('SWFFG.UI.Talent.Passive'), rows: passive}]
    .filter(group => group.rows.length);
}

async function equipmentGroups(actor, expandedId) {
  const carried = actor.items.filter(isCarriedEquipment).sort(byName);
  const expanded = carried.find(item => item.id === expandedId);
  let description, qualities;
  if (expanded) {
    const html = [expanded.system.description, expanded.system.special?.value].filter(Boolean).map(equipmentDescription).join('\n');
    description = await foundry.applications.ux.TextEditor.enrichHTML(html, {secrets: actor.isOwner, relativeTo: expanded});
    qualities = summarizeItemQualities(expanded.system).map(quality => [quality.name, quality.totalRanks || ''].join(' ').trim()).join(' · ');
  }
  return [['weapon','SWFFG.UI.Pilotage.Weapons'], ['armour','SWFFG.UI.Pilotage.Armor'], ['gear','SWFFG.UI.Pilotage.Equipment']]
    .map(([type, title]) => ({
      label: label(title),
      rows: carried.filter(item => item.type === type).map(item => ({
        id: item.id, name: item.name, img: item.img, weapon: type === 'weapon',
        expanded: item === expanded, description: item === expanded ? description : '', qualities: item === expanded ? qualities : '',
        quantity: item.system.quantity?.value ?? 1,
        summary: equipmentStats(item).filter(([name]) => name !== label('SWFFG.UI.Equipment.Quantity'))
          .map(([name, value]) => name + ' ' + label(String(value))).join(' · ')
      }))
    })).filter(group => group.rows.length);
}

const normalizeSearch = text => text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();

function filterRows(container, query) {
  let matches = 0;
  for (const row of container.querySelectorAll('[data-search-name]')) {
    row.hidden = !!query && !normalizeSearch(row.dataset.searchName).includes(query);
    if (!row.hidden) matches++;
  }
  return matches;
}

function applySearch(panel, value) {
  const query = normalizeSearch(value.trim());
  let matches = 0;
  for (const group of panel.querySelectorAll('[data-brief-group]')) {
    const visible = filterRows(group, query);
    group.hidden = !visible;
    matches += visible;
  }
  const empty = panel.querySelector('[data-no-match]');
  if (empty) empty.hidden = !query || matches > 0;
}

Hooks.once('init', () => {
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = new URL('../../styles/character-sidebar.css', import.meta.url).href;
  document.head.append(css);
  game.settings.register(system, enabledSetting, {
    name: 'SWFFG.UI.CharacterSidebar.SettingName',
    hint: 'SWFFG.UI.CharacterSidebar.SettingHint',
    scope: 'world', config: true, restricted: true, type: Boolean, default: true,
    onChange: async enabled => {
      refreshDestinationControl();
      if (!ui.sidebar?.rendered) return;
      const tab = ui[tabName];
      if (!enabled) {
        if (tab.active) ui.sidebar.changeTab('chat', 'primary');
        await tab.popout?.close({animate: false});
      }
      await ui.sidebar.render({parts: [tabName]});
    }
  });
  game.settings.register(system, destinationSetting, {
    scope: 'user', config: false, type: String, default: 'standard', onChange: refreshDestinationControl
  });
  game.settings.register(system, pinsSetting, {scope: 'user', type: Array, default: [], config: false});
  const {HandlebarsApplicationMixin} = foundry.applications.api;
  const Base = foundry.applications.sidebar.AbstractSidebarTab;
  class CharacterSidebar extends HandlebarsApplicationMixin(Base) {
    static tabName = tabName;
    static DEFAULT_OPTIONS = {classes: ['ffg-character-sidebar'], window: {title: 'SWFFG.UI.CharacterSidebar.Title'}};
    static PARTS = {sheet: {template: 'systems/starwarsffg/templates/sidebar/character.hbs', scrollable: ['.brief-scroll', '.brief-options']}};

    selected = null;
    section = 'skills';
    query = '';
    expandedItem = null;
    pickerQuery = null;

    _canRender(options) {
      if (!game.settings.get(system, enabledSetting)) return false;
      return super._canRender(options);
    }

    _onActivate() {
      super._onActivate();
      void this.render();
    }

    async _prepareContext(options) {
      const context = await super._prepareContext(options);
      if (!this.active && !this.isPopout) return context;
      const user = game.user;
      const pinned = user.isGM ? characterPins() : null;
      let roster;
      if (pinned) {
        roster = [...pinned.keys()].map(id => game.actors.get(id)).filter(canUse);
        context.choices = game.actors.filter(actor => canUse(actor) && !pinned.has(actor.id)).sort(byName).map(({id, name}) => ({id, name}));
      } else roster = playerCharacters(game.actors, user);
      const base = roster.find(entry => entry.id === this.selected) ?? roster[0];
      const token = pinnedToken(base?.id, pinned?.get(base?.id));
      const actor = token?.actor ?? base;
      if (actor?.id !== this.selected) { this.query = ''; this.expandedItem = null; }
      this.selected = actor?.id ?? null;
      context.gm = user.isGM;
      context.canSwitch = roster.length > 1;
      if (context.canSwitch) {
        context.actors = roster.map(entry => {
          const sceneToken = pinnedToken(entry.id, pinned?.get(entry.id));
          return {id: entry.id, name: sceneToken?.name ?? entry.name, img: sceneToken?.actor?.img ?? entry.img, active: entry === base};
        }).sort(byName);
        context.pickerId = this.id + '-picker';
        context.pickerOpen = this.pickerQuery !== null;
        context.pickerQuery = this.pickerQuery;
      } else this.pickerQuery = null;
      if (actor) {
        context.character = {...actorSummary(actor), name: token?.name ?? actor.name};
        context.tokenUuid = token?.uuid;
        context.query = this.query;
        context.skills = this.section === 'skills';
        context.talents = this.section === 'talents';
        context.equipment = this.section === 'equipment';
        if (context.skills) context.groups = skillGroups(actor);
        else if (context.talents) context.groups = await talentGroups(actor, this.expandedItem);
        else context.groups = await equipmentGroups(actor, this.expandedItem);
      }
      return context;
    }

    async _onRender(context, options) {
      await super._onRender(context, options);
      const panel = this.element.querySelector('.brief-panel');
      if (!panel) return;
      this.updateChatLink();
      if (this.query) applySearch(panel, this.query);
      const picker = panel.querySelector('.brief-picker');
      if (picker) this.bindPicker(panel, picker);
      panel.addEventListener('input', event => {
        if (event.target.name !== 'filter') return;
        this.query = event.target.value;
        applySearch(panel, this.query);
      });
      panel.addEventListener('change', event => {
        if (event.target.name === 'addActor') void this.setPinned(event.target.value, true).catch(error => ui.notifications.error(error.message));
      });
      panel.addEventListener('click', event => {
        const button = event.target.closest('button[data-brief-action]');
        if (button) void this.handleButton(button, panel).catch(error => ui.notifications.error(error.message));
      });
      const actor = pinnedToken(context.character?.id, context.tokenUuid)?.actor ?? game.actors.get(context.character?.id);
      if (canUse(actor) && context.skills) {
        const data = {data: actor.system};
        await Promise.all(Array.from(panel.querySelectorAll('[data-ability]'), row => game.ffg.DiceHelpers.addSkillDicePool(data, row)));
      }
    }

    updateChatLink() {
      const button = this.element?.querySelector('[data-brief-action=chat]');
      if (!button || (!this.active && !this.isPopout)) return;
      const message = latestRoll();
      button.dataset.id = message?.id ?? '';
      button.querySelector('span').textContent = message
        ? game.i18n.format('SWFFG.UI.CharacterSidebar.LastRoll', {name: message.alias})
        : label('SWFFG.UI.CharacterSidebar.Chat');
    }

    useSidebarForToken(token) {
      return game.user.isGM && canUse(token.actor) && game.settings.get(system, enabledSetting)
        && game.settings.get(system, destinationSetting) === 'sidebar';
    }

    showSceneToken(token) {
      if (!this.useSidebarForToken(token)) return false;
      void this.setPinned(token.actorId, true, token).catch(error => ui.notifications.error(error.message));
      return true;
    }

    setPinned(id, add, token = null) {
      // Additions and removals share one queue, including clicks from a detached tab.
      const pending = pinWrites.then(() => this.updatePin(id, add, token));
      pinWrites = pending.catch(() => {});
      return pending;
    }

    async updatePin(id, add, token) {
      if (!game.user.isGM || (add && !canUse(game.actors.get(id)))) return;
      if (token && !this.useSidebarForToken(token)) return;
      const pins = characterPins();
      const uuid = token?.uuid ?? null;
      const changed = add ? pins.get(id) !== uuid : pins.has(id);
      if (changed) {
        if (add) pins.set(id, uuid);
        else pins.delete(id);
        const value = Array.from(pins, ([actorId, tokenUuid]) => tokenUuid ? {actorId, tokenUuid} : actorId);
        await game.settings.set(system, pinsSetting, value);
      }
      if (token && !this.useSidebarForToken(token)) return;
      const newSelection = add && this.selected !== id;
      if (newSelection || changed) {
        this.query = '';
        this.expandedItem = null;
      }
      if (add) this.selected = id;
      const pickerWasOpen = this.pickerQuery !== null;
      this.pickerQuery = null;
      if (token) {
        const wasActive = this.active;
        this.activate();
        if (!wasActive || (!changed && !newSelection && !pickerWasOpen)) return;
      }
      await ui[tabName].render();
    }

    bindPicker(panel, picker) {
      const search = picker.querySelector('[name=actorFilter]');
      const applyPickerSearch = () => {
        const count = filterRows(picker, normalizeSearch(search.value.trim()));
        picker.querySelector('[data-picker-empty]').hidden = count > 0;
      };
      if (search.value) applyPickerSearch();
      search.addEventListener('input', () => {
        this.pickerQuery = search.value;
        applyPickerSearch();
      });
      panel.querySelector('.brief-roster').addEventListener('focusout', event => {
        const roster = event.currentTarget;
        if (roster.contains(event.relatedTarget)) return;
        queueMicrotask(() => {
          if (roster.isConnected && !picker.hidden && !roster.contains(roster.ownerDocument.activeElement)) this.togglePicker(panel, false);
        });
      });
      picker.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          this.togglePicker(panel, false);
          panel.querySelector('[data-brief-action=switch]').focus();
        } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || (event.key === 'Enter' && event.target === search)) {
          event.preventDefault();
          const rows = Array.from(picker.querySelectorAll('button:not([hidden])'));
          if (!rows.length) return;
          if (event.key === 'Enter') return rows[0].click();
          const index = rows.indexOf(event.target);
          const start = index < 0 ? rows.length : index;
          const next = event.key === 'ArrowDown' ? Math.min(index + 1, rows.length - 1) : Math.max(start - 1, 0);
          rows[next].focus();
        }
      });
    }

    togglePicker(panel, open) {
      const picker = panel.querySelector('.brief-picker');
      const search = picker.querySelector('[name=actorFilter]');
      this.pickerQuery = open ? '' : null;
      panel.querySelector('[data-brief-action=switch]').setAttribute('aria-expanded', String(open));
      picker.hidden = !open;
      if (open) {
        search.value = '';
        filterRows(picker, '');
        picker.querySelector('[data-picker-empty]').hidden = true;
        picker.querySelector('.brief-options').scrollTop = 0;
        search.focus({preventScroll: true});
      }
    }

    async handleButton(button, panel) {
      const {briefAction: action, id} = button.dataset;
      if (action === 'switch') return this.togglePicker(panel, this.pickerQuery === null);
      if (action === 'chat') return openLastRoll(id);
      if (action === 'actor' || action === 'section') {
        if (action === 'actor') { this.selected = id; this.expandedItem = null; this.pickerQuery = null; }
        else { this.section = id; this.expandedItem = null; }
        this.query = '';
        await this.render();
        const scroll = this.element.querySelector('.brief-scroll');
        if (scroll) scroll.scrollTop = 0;
        if (action === 'actor') this.element.querySelector('[data-brief-action=switch]')?.focus({preventScroll: true});
        return;
      }
      const token = pinnedToken(panel.dataset.actorId, panel.dataset.tokenUuid);
      const actor = token?.actor ?? game.actors.get(panel.dataset.actorId);
      if (!canUse(actor)) return;
      if (action === 'remove') return this.setPinned(actor.id, false);
      if (action === 'sheet') return actor.sheet.render({force: true, token: token ?? undefined});
      if (action === 'skill' && Object.hasOwn(actor.system.skills, button.dataset.ability))
        return game.ffg.DiceHelpers.rollSkillByKey(token ? {tokenUuid: token.uuid} : actor.id, button.dataset.ability);
      if (action === 'talent' || (action === 'item' && isCarriedEquipment(actor.items.get(id)))) {
        this.expandedItem = this.expandedItem === id ? null : id;
        return this.render();
      }
      const item = actor.items.get(id);
      if (action === 'weapon' && item?.type === 'weapon' && isCarriedEquipment(item)) return game.ffg.DiceHelpers.rollItem(item.id, actor.id, undefined, undefined, {actor, tokenUuid: token?.uuid});
    }
  }

  CONFIG.ui[tabName] = CharacterSidebar;
  const tabs = Object.entries(CONFIG.ui.sidebar.TABS);
  tabs.splice(tabs.findIndex(([id]) => id === 'chat') + 1, 0, [tabName, {icon:'fa-solid fa-address-card', tooltip:'SWFFG.UI.CharacterSidebar.Title'}]);
  CONFIG.ui.sidebar.TABS = Object.fromEntries(tabs);
});

let frame;
function refresh(actorId) {
  const tab = ui[tabName];
  if (!tab?.rendered || (!tab.active && !tab.popout?.rendered)) return;
  if (actorId && actorId !== tab.selected && actorId !== tab.popout?.selected) return;
  frame ??= requestAnimationFrame(() => { frame = null; void tab.render(); });
}
for (const hook of ['createActor','deleteActor']) Hooks.on(hook, actor => { if (isPersonalActor(actor)) refresh(); });
function refreshPinnedToken(token) {
  if (game.user.isGM && ui[tabName]?.rendered && [...characterPins().values()].includes(token.uuid)) refresh();
}
Hooks.on('updateToken', (token, changes) => {
  if (fieldsAffect(changes, ['name', 'actorId', 'actorLink', 'delta'])) refreshPinnedToken(token);
});
Hooks.on('deleteToken', refreshPinnedToken);
Hooks.on('deleteScene', () => { if (game.user.isGM) refresh(); });
Hooks.on('updateActor', (actor, changes) => refresh(fieldsAffect(changes, identityFields) ? null : actor.id));
for (const type of ['Item','ActiveEffect']) {
  for (const event of ['create','update','delete']) Hooks.on(event + type, document => {
    const actor = document.parent?.documentName === 'Actor' ? document.parent : document.parent?.parent;
    if (actor?.documentName === 'Actor') refresh(actor.id);
  });
}
Hooks.on('updateUser', (user, changes) => {
  if (user.id === game.user.id && fieldsAffect(changes, ['role','character'])) { lastRoll = undefined; refresh(); }
});
for (const hook of ['createChatMessage','updateChatMessage','deleteChatMessage']) {
  Hooks.on(hook, message => {
    if (!message.isRoll && lastRoll?.id !== message.id) return;
    lastRoll = undefined;
    const tab = ui[tabName];
    tab?.updateChatLink();
    tab?.popout?.updateChatLink();
  });
}

