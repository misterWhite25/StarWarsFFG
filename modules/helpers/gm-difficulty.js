import {applyPilotagePool,showPilotageMJ} from "./pilotage-mj.js";
export const GM_DIFFICULTY_SETTING = "gmDifficulty";
export const NEGATIVE_DICE = ["difficulty", "challenge", "setback"];
export function normalizeDifficulty(value = {}) {
  const result = {enabled: value.enabled === true};
  for (const key of NEGATIVE_DICE) result[key] = Number.isFinite(Number(value[key])) ? Math.max(0, Math.floor(Number(value[key]))) : 0;
  return result;
}
export function gmDifficulty() {
  try { return normalizeDifficulty(globalThis.game?.settings?.get("starwarsffg", GM_DIFFICULTY_SETTING)); }
  catch { return normalizeDifficulty(); }
}
export function effectivePool(pool, config = gmDifficulty()) {
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
const summary = config => `${config.difficulty} violets · ${config.challenge} rouges · ${config.setback} noirs`;
function refresh() {
  const config = gmDifficulty();
  for (const button of document.querySelectorAll('.ffg-gm-difficulty')) {
    const label = config.enabled ? `Pilotage MJ · difficulté active : ${summary(config)}` : 'Pilotage MJ · difficulté commune désactivée';
    button.setAttribute('aria-label', label);
    button.setAttribute('data-tooltip', label);
    button.classList.toggle('active', config.enabled);
    button.setAttribute('aria-pressed', String(config.enabled));
  }
  Hooks.callAll('ffgGMDifficultyChanged');
}
export function changeGMDifficulty(config, downgrade = false) {
  if (downgrade) {
    if (config.challenge > 0) { config.challenge--; config.difficulty++; }
  } else if (config.difficulty > 0) { config.difficulty--; config.challenge++; }
  else config.difficulty++;
  return config;
}
export async function showGMDifficulty() {
  return showPilotageMJ(gmDifficulty(), {
    saveDifficulty: config => game.settings.set('starwarsffg', GM_DIFFICULTY_SETTING, normalizeDifficulty(config)),
    changeDifficulty: changeGMDifficulty
  });
}
export function registerGMDifficulty() {
  game.settings.register('starwarsffg', GM_DIFFICULTY_SETTING, {
    scope: 'world', config: false, type: Object,
    default: normalizeDifficulty({difficulty: 2}), onChange: refresh
  });
}
export function renderGMDifficultyButton(_app, html) {
  if (!game.user.isGM) return;
  const root = html instanceof HTMLElement ? html : html?.[0];
  const anchor = root?.querySelector('#message-modes, #roll-privacy') ?? document.querySelector('#message-modes, #roll-privacy');
  if (!anchor || anchor.parentElement.querySelector('.ffg-gm-difficulty')) return;
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'ffg-gm-difficulty ui-control icon fa-light fa-sliders';
  button.addEventListener('click', showGMDifficulty);
  anchor.after(button); refresh();
}
