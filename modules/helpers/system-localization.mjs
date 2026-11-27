/** Resolve text using the current Foundry client's language. */
export function localizeSystem(key, values) {
  const i18n = globalThis.game?.i18n;
  if (values) {
    const args = Object.fromEntries(Object.entries(values).map(([name, value]) =>
      [name, value?.localizationKey ? localizeSystem(value.localizationKey) : value]));
    return i18n?.format?.(key, args) ?? key;
  }
  return i18n?.localize?.(key) ?? key;
}

/** Retain the key and arguments so another client can display the same error in its own language. */
export function localizedSystemError(key, values) {
  return Object.assign(new Error(localizeSystem(key, values)), {localization: {key, values}});
}

export function errorFromLocalization(localization, fallback) {
  const {key, values} = localization ?? {};
  return typeof key === "string" && key.startsWith("SWFFG.") ? localizedSystemError(key, values) : new Error(fallback);
}
