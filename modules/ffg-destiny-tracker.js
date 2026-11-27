import { FormApplicationV2 } from "./applications/form-application-v2.js";
import { changeDestinyPool } from "./helpers/reviewed-destiny.js";
import { DicePoolFFG } from "./dice/pool.js";

/** Manage the shared Destiny pool and its chat controls. */
export default class DestinyTracker extends FormApplicationV2 {
  constructor(object={}, options={}) {
    super(object, options);

    this.pendingFlips = new Map();
    this.menu = options.menu ?? [];
  }

  /** @override */
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "destiny-tracker",
      classes: ["starwarsffg"],
      title: game.i18n.localize("SWFFG.UI.Root.DestinyTracker"),
      // This HUD is anchored by CSS, independently of ApplicationV2 window positioning.
      window: { frame: false, positioned: false },
      template: "systems/starwarsffg/templates/ffg-destiny-tracker.html",
    });
  }

  /** @override */
  getData() {
    // Get current value
    let destinyPool = { light: game.settings.get("starwarsffg", "dPoolLight"), dark: game.settings.get("starwarsffg", "dPoolDark") };
    let destinyPoolLabel = { light: game.settings.get("starwarsffg", "destiny-pool-light"), dark: game.settings.get("starwarsffg", "destiny-pool-dark") };

    // filter menu based on role.

    const menu = this.menu.map((item, index) => ({...item, index})).filter(item => !item.minimumRole || game.user.hasRole(item.minimumRole));

    // Return data
    return {
      destinyPool,
      destinyPoolLabel,
      isGM: game.user.isGM,
      menu,
      theme: game.settings.get("starwarsffg", "dicetheme"),
    };
  }

  /* -------------------------------------------- */

  /** @override */
  _updateObject(_event, _formData) {};

  /** @override */
  async close(_options = {}) {};

  /** @override */
  activateListeners(html) {
    this._activatePositionHandle();
    html.find(".dropdown-content a").click(event => {
      event.preventDefault();
      this.menu[event.currentTarget.dataset.value]?.callback();
    });
    html.find(".destiny-points").click(event => {
      const side = event.currentTarget.dataset.group === "dPoolLight" ? "light" : "dark";
      const action = event.shiftKey ? "add" : event.ctrlKey || event.metaKey ? "remove" : "flip";
      this._changePoints(side, action).catch(error => ui.notifications.warn(error.message));
    });

    if (this._globalListenersInstalled) return;
    this._globalListenersInstalled = true;
    const rollSelector = ".ffg-destiny-roll";
    const bindRoll = element => $(element).off("click.ffgDestiny", rollSelector).on("click.ffgDestiny", rollSelector,
      event => this.OnClickRollDestiny(event).catch(error => ui.notifications.warn(error.message)));
    for (const button of document.querySelectorAll(rollSelector)) {
      const message = button.closest("[data-message-id]");
      if (message) bindRoll(message);
    }
    Hooks.on("renderChatMessageHTML", (message, element) => {
      if (message.content.includes("ffg-destiny-roll")) bindRoll(element);
    });
    game.socket.on("system.starwarsffg", (message, senderId) =>
      this._handleDestinyMessage(message, senderId).catch(error => ui.notifications.warn(error.message)));
  }

  async _changePoints(side, action) {
    if (action !== "flip" && !game.user.isGM) throw Error(game.i18n.localize("SWFFG.UI.Root.DestinyGMOnly"));
    const type = game.i18n.localize(game.settings.get("starwarsffg", "destiny-pool-" + side));
    const other = side === "light" ? "dark" : "light";
    const delta = action === "add" ? 1 : -1;
    const otherDelta = action === "flip" ? 1 : 0;
    let pool;
    if (game.user.isGM) {
      const change = await changeDestinyPool(side === "light" ? delta : otherDelta, side === "dark" ? delta : otherDelta);
      pool = change.after;
    } else {
      if (!game.users.activeGM) throw Error(game.i18n.localize("SWFFG.UI.Root.DestinyNoGM"));
      pool = await this._requestFlip(side);
    }
    const flipType = other === "light" ? "dPoolLight" : "dPoolDark";
    const escape = foundry.utils.escapeHTML;
    const content = action === "flip" ? `<div class="destiny-flip ${flipType}">
      <div class="destiny-title">${game.i18n.localize("SWFFG.DestinyFlipMessage")}: <span>${escape(type)}</span></div>
      ${["dark","light"].map(key => `<div class="destiny-left ${key !== other} ${key}">${escape(game.i18n.localize(game.settings.get("starwarsffg", "destiny-pool-" + key)))} ${game.i18n.localize("SWFFG.DestinyFlipRemaining")}: ${pool[key]}</div>`).join("")}
      </div>` : game.i18n.format(action === "add" ? "SWFFG.UI.Root.DestinyAdded" : "SWFFG.UI.Root.DestinyRemoved", {type: escape(type)});
    await ChatMessage.create({author: game.user.id, content});
  }

  _requestFlip(side) {
    const id = foundry.utils.randomID();
    const gmId = game.users.activeGM.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingFlips.delete(id);
        reject(Error(game.i18n.localize("SWFFG.UI.Root.DestinyNoReply")));
      }, 15000);
      this.pendingFlips.set(id, {gmId, finish: reply => {
        clearTimeout(timer);
        if (reply.error) reject(Error(game.i18n.localize(reply.error)));
        else if ([reply.pool?.light, reply.pool?.dark].every(n => Number.isSafeInteger(n) && n >= 0)) resolve(reply.pool);
        else reject(Error(game.i18n.localize("SWFFG.UI.Root.DestinyWriteFailed")));
      }});
      game.socket.emit("system.starwarsffg", {destinyFlip: side, id}, {recipients: [gmId]});
    });
  }

  _destinyRequest(chatId) {
    const message = chatId && game.messages.get(chatId);
    const isRequest = entry => entry?.author?.isGM && (entry.getFlag("starwarsffg", "destinyRequest")
      || entry.content.includes('class="ffg-destiny-roll"'));
    if (!isRequest(message)) return null;
    return game.messages.contents.findLast(isRequest)?.id === chatId ? message : null;
  }

  _alreadyRolled(request, userId) {
    if (request.getFlag("starwarsffg", "destinyRollers." + userId)) return true;
    if (request.getFlag("starwarsffg", "destinyRequest")) return false;
    // Older requests tracked rolls in a client setting on the GM who posted the prompt.
    if (game.user.id !== request.author.id) return false;
    const key = "destinyrollers" + userId;
    if (!game.settings.settings.has("starwarsffg." + key)) {
      game.settings.register("starwarsffg", key, {scope: "client", config: false, default: false, type: Boolean});
    }
    return game.settings.get("starwarsffg", key);
  }

  async _handleDestinyMessage(message, senderId) {
    if (!message || !senderId) return;
    const pending = this.pendingFlips.get(message.destinyFlipResult);
    if (pending && senderId === pending.gmId) {
      this.pendingFlips.delete(message.destinyFlipResult);
      pending.finish(message);
      return;
    }
    if (message.canIRollDestinyResponse === game.user.id && !game.user.isGM) {
      if (senderId !== this.rollApproval?.gmId || message.destinyChatId !== this.rollApproval.chatId) return;
      this.rollApproval = null;
      if (message.rolled) return ui.notifications.warn(game.i18n.localize("SWFFG.DestinyAlreadyRolled"));
      const roll = await this._rollDestiny();
      game.socket.emit("system.starwarsffg", {destiny: game.user.id, light: roll.ffg.light, dark: roll.ffg.dark,
        destinyChatId: message.destinyChatId}, {recipients: [senderId]});
      return;
    }
    if (!game.user.isGM || !game.users.has(senderId)) return;
    if (["light","dark"].includes(message.destinyFlip) && typeof message.id === "string" && game.users.activeGM?.id === game.user.id) {
      const light = message.destinyFlip === "light" ? -1 : 1;
      let response;
      try { response = {pool: (await changeDestinyPool(light, -light)).after}; }
      catch (error) {
        const empty = "SWFFG.UI.Talent.DestinyEmpty";
        response = {error: error.message === game.i18n.localize(empty) ? empty : "SWFFG.UI.Root.DestinyWriteFailed"};
      }
      game.socket.emit("system.starwarsffg", {destinyFlipResult: message.id, ...response}, {recipients: [senderId]});
      return;
    }
    if (message.canIRollDestiny !== senderId && message.destiny !== senderId) return;
    const request = this._destinyRequest(message.destinyChatId);
    if (!request || (request.author.active ? request.author.id : game.users.activeGM?.id) !== game.user.id) return;
    if (message.canIRollDestiny === senderId) {
      const rolled = this._alreadyRolled(request, senderId);
      game.socket.emit("system.starwarsffg", {canIRollDestinyResponse: senderId, rolled, destinyChatId: request.id}, {recipients: [senderId]});
    } else if (message.destiny === senderId) {
      const {light, dark} = message;
      if (![light, dark].every(n => Number.isInteger(n) && n >= 0) || ![1, 2].includes(light + dark) || (light && dark)) return;
      await changeDestinyPool(light, dark, {
        used: () => !this._destinyRequest(request.id) || this._alreadyRolled(request, senderId),
        record: () => request.setFlag("starwarsffg", "destinyRollers." + senderId, true)
      });
    }
  }

  /** Keep this HUD movable without using the standard window frame. */
  _activatePositionHandle() {
    this._positionEvents?.abort();
    this._positionEvents = new AbortController();
    const { signal } = this._positionEvents;
    const element = this.element;
    const handle = element.querySelector(".destiny-drag-handle");
    const key = `starwarsffg.destiny-position.${game.world.id}.${game.user.id}`;
    const place = ({ left: requestedLeft, top: requestedTop }) => {
      const bounds = element.getBoundingClientRect();
      const left = Math.max(0, Math.min(requestedLeft, window.innerWidth - bounds.width));
      const top = Math.max(0, Math.min(requestedTop, window.innerHeight - bounds.height));
      Object.assign(element.style, { left: `${left}px`, top: `${top}px`, bottom: "auto", right: "auto" });
      return { left, top };
    };
    try {
      const saved = JSON.parse(window.localStorage.getItem(key));
      if (Number.isFinite(saved?.left) && Number.isFinite(saved?.top)) place(saved);
    } catch { /* Storage can be unavailable in private browser sessions. */ }
    let drag;
    handle.addEventListener("pointerdown", event => {
      if (event.button !== 0 || drag) return;
      event.preventDefault();
      event.stopPropagation();
      const bounds = element.getBoundingClientRect();
      drag = { id: event.pointerId, x: event.clientX - bounds.left, y: event.clientY - bounds.top };
      handle.setPointerCapture(event.pointerId);
    }, { signal });
    handle.addEventListener("pointermove", event => {
      if (drag?.id !== event.pointerId) return;
      place({ left: event.clientX - drag.x, top: event.clientY - drag.y });
    }, { signal });
    const finish = event => {
      if (drag?.id !== event.pointerId) return;
      drag = null;
      if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
      const bounds = element.getBoundingClientRect();
      try {
        window.localStorage.setItem(key, JSON.stringify({ left: bounds.left, top: bounds.top }));
      } catch { /* Moving the HUD still works without persistent storage. */ }
    };
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
      handle.addEventListener(type, finish, { signal });
    }
    window.addEventListener("resize", () => {
      const bounds = element.getBoundingClientRect();
      place({ left: bounds.left, top: bounds.top });
    }, { signal });
  }

  // Click event for Roll Destiny Chat Message
  async OnClickRollDestiny(event) {
    event.preventDefault();
    event.stopPropagation();
    if (!game.user.isGM) {
      if (!game.users.activeGM) throw Error(game.i18n.localize("SWFFG.UI.Root.DestinyNoGM"));
      const destinyChatId = event.currentTarget.closest("[data-message-id]")?.dataset.messageId;
      const request = this._destinyRequest(destinyChatId);
      if (!request) return ui.notifications.warn(game.i18n.localize("SWFFG.UI.Root.DestinyRequestExpired"));
      const gm = request.author.active ? request.author : game.users.activeGM;
      this.rollApproval = {chatId: request.id, gmId: gm.id};
      game.socket.emit("system.starwarsffg", {canIRollDestiny: game.user.id, destinyChatId}, {recipients: [gm.id]});
      return;
    }
    const roll = await this._rollDestiny();
    await changeDestinyPool(roll.ffg.light, roll.ffg.dark);
  }

  async _rollDestiny() {
    const pool = new DicePoolFFG({
      force: 1,
    });

    const roll = new game.ffg.RollFFG(pool.renderDiceExpression());
    await roll.toMessage({
      author: game.user.id,
      flavor: `${game.i18n.localize("SWFFG.Rolling")} ${game.i18n.localize("SWFFG.DestinyPool")}...`,
    });

    return roll;
  }
}
