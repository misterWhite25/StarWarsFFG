import {initiativeContext, initiativeLabel} from "../space-combat/initiative.mjs";

const setting = "showCombatTurnBanner";
let banner;

Hooks.once("init", () => {
  game.settings.register("starwarsffg", setting, {
    name: "SWFFG.CombatTurn.SettingName",
    hint: "SWFFG.CombatTurn.SettingHint",
    scope: "user",
    config: true,
    type: Boolean,
    default: true,
    onChange: refreshTurnBanner
  });
});

function refreshTurnBanner() {
  const scene = game.scenes?.current;
  const host = document.getElementById("ui-top");
  if (!game.ready || !scene || !host || !game.settings.get("starwarsffg", setting)) return banner?.remove();

  const spatial = scene.getFlag("starwarsffg", "spaceCombatScene");
  const context = spatial ? initiativeContext() : initiativeContext(game.combats.active ?? null);
  const label = initiativeLabel(context);
  if (!label) return banner?.remove();

  if (!banner) {
    banner = document.createElement("div");
    banner.id = "ffg-combat-turn-banner";
    banner.setAttribute("role", "status");
    banner.setAttribute("aria-atomic", "true");
  }
  if (banner.parentElement !== host) host.append(banner);
  if (banner.textContent !== label) banner.textContent = label;
}

for (const hook of ["ready", "canvasReady", "createCombat", "updateCombat", "deleteCombat",
  "createCombatant", "updateCombatant", "deleteCombatant", "renderCombatTracker"]) {
  Hooks.on(hook, refreshTurnBanner);
}
Hooks.on("canvasTearDown", () => banner?.remove());
Hooks.on("updateToken", (_token, changes) => {
  if ("name" in changes || "hidden" in changes || "disposition" in changes) refreshTurnBanner();
});
Hooks.on("updateSetting", setting => {
  if (setting.key === "starwarsffg.spaceCombatBoard") refreshTurnBanner();
});
