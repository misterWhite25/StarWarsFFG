import {applyPilotagePool} from "./pilotage-mj.js";
export const GM_DIFFICULTY_SETTING = "gmDifficulty";
export const NEGATIVE_DICE = ["difficulty", "challenge", "setback"];
export function normalizeDifficulty(value = {}) {
  const result = {enabled: value.enabled === true};
  for (const key of NEGATIVE_DICE) result[key] = Number.isFinite(Number(value[key])) ? Math.max(0, Math.floor(Number(value[key]))) : 0;
  return result;
}
export function gmDifficulty(pool) {
  if (pool?._ignoreGMDifficulty) return normalizeDifficulty();
  try { return normalizeDifficulty(globalThis.game?.settings?.get("starwarsffg", GM_DIFFICULTY_SETTING)); }
  catch { return normalizeDifficulty(); }
}
export function effectivePool(pool, config = gmDifficulty(pool)) {
  const result = Object.assign(Object.create(Object.getPrototypeOf(pool)), pool);
  if(pool._pilotageResolved) return result;
  if(config.enabled) {
    for(const key of NEGATIVE_DICE) result[key]=config[key];
    result.remsetback=0;
  }
  const final=applyPilotagePool(result);
  final._gmResolved=true;
  final._pilotageResolved=true;
  return final;
}
export function changeGMDifficulty(config, downgrade = false) {
  if (downgrade) {
    if (config.challenge > 0) { config.challenge--; config.difficulty++; }
  } else if (config.difficulty > 0) { config.difficulty--; config.challenge++; }
  else config.difficulty++;
  return config;
}
export function registerGMDifficulty() {
  game.settings.register('starwarsffg', GM_DIFFICULTY_SETTING, {
    scope: 'world', config: false, type: Object,
    default: normalizeDifficulty({difficulty: 2}), onChange: () => Hooks.callAll('ffgGMDifficultyChanged')
  });
}
