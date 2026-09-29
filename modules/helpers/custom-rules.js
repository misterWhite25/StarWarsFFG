export const TONIO_RULES_SETTING = "enableTonioCustomRules";

export function tonioRulesEnabled(settings = game.settings) {
  return settings.get("starwarsffg", TONIO_RULES_SETTING) === true;
}

/** The first net success confirms the hit but adds no weapon damage under Tonio's rules. */
export function weaponSuccessDamage(successes, tonioRules = false) {
  const value = Number.isFinite(Number(successes)) ? Number(successes) : 0;
  return Math.max(0, value - (tonioRules ? 1 : 0));
}
