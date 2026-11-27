import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import {setTimeout as delay} from "node:timers/promises";
import {loadSystemModule} from "../load-system-module.mjs";

async function fixture() {
  const values = new Map([["dPoolLight", 1], ["dPoolDark", 0]]);
  const messages = [], listeners = {socket: 0, chat: 0};
  const rolled = new Set();
  const request = {id:"request", author:{id:"gm", isGM:true, active:true}, content:"",
    getFlag: (_scope, key) => key === "destinyRequest" || rolled.has(key),
    setFlag: async (_scope, key) => { await delay(1); rolled.add(key); }};
  const game = {
    messages: {get: id => id === request.id ? request : null, contents: [request]},
    user: {id: "gm", isGM: true}, users: {activeGM: {id: "gm"}, has: id => id === "player"},
    settings: {
      settings: new Map(),
      get: (_scope, key) => values.get(key),
      register(scope, key) { this.settings.set(scope + "." + key, true); },
      async set(_scope, key, value) { await delay(2); values.set(key, value); }
    },
    i18n: {localize: key => key, format: key => key},
    socket: {on: () => listeners.socket++}
  };
  const html = {find() { return this; }, off() { return this; }, on() { return this; }, click() { return this; }};
  const context = vm.createContext({game, CONFIG: {FFG: {DestinyGM:"gm"}}, ChatMessage: {create: data => messages.push(data)},
    foundry: {utils: {escapeHTML: String}}, document: {querySelectorAll: () => []}, $: () => html, Hooks: {on: () => listeners.chat++}});
  const module = await loadSystemModule("ffg-destiny-tracker.js", context, {
    "applications/form-application-v2.js": {FormApplicationV2: class {}},
    "dice/pool.js": {DicePoolFFG: class {}}
  });
  const hud = new module.namespace.default();
  return {hud, values, messages, listeners, html, rolled};
}

test("Destiny flips serialize with HUD clicks, preserve pool size and never spend a missing point", async () => {
  const {hud, values, messages} = await fixture();
  const flips = await Promise.allSettled([hud._changePoints("light","flip"),hud._changePoints("light","flip")]);
  assert.deepEqual(flips.map(f => f.status), ["fulfilled", "rejected"]);
  assert.equal(values.get("dPoolLight"), 0);
  assert.equal(values.get("dPoolDark"), 1);
  assert.equal(messages.length, 1);
  await assert.rejects(hud._changePoints("light","remove"));
  await Promise.all([hud._changePoints("light","add"), hud._changePoints("light","remove")]);
  assert.equal(values.get("dPoolLight"), 0);
  assert.equal(messages.length, 3);
});

test("re-rendering the HUD subscribes once and duplicate reports of a player's starting roll count once", async () => {
  const {hud, values, listeners, html, rolled} = await fixture();
  hud._activatePositionHandle = () => {};
  hud.activateListeners(html);
  hud.activateListeners(html);
  assert.deepEqual(listeners,{socket:1,chat:1});
  const report = {destiny:"player",light:0,dark:2,destinyChatId:"request"};
  await hud._handleDestinyMessage(report,"other-user");
  assert.equal(values.get("dPoolDark"), 0);
  await Promise.all([hud._handleDestinyMessage(report,"player"),hud._handleDestinyMessage(report,"player")]);
  assert.equal(values.get("dPoolDark"), 2);
  assert.equal(rolled.has("destinyRollers.player"), true);
});
