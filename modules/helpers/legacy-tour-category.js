const legacyKeys = new Set(['starwarsffg.character', 'starwarsffg.edit-mode']);
let registered = false;

export function registerLegacyTourCategory() {
  if (registered) return;
  const prototype = foundry.applications.sidebar.apps.ToursManagement.prototype;
  const prepareCategories = prototype._prepareCategoryData;
  // Foundry groups by package namespace. Keep the original tour keys so saved
  // progress and native play/reset actions still address the same presentations.
  prototype._prepareCategoryData = function () {
    const categories = prepareCategories.call(this);
    const system = categories.system;
    const entries = system?.entries.filter(entry => legacyKeys.has(entry.id)) ?? [];
    if (entries.length) {
      system.entries = system.entries.filter(entry => !legacyKeys.has(entry.id));
      categories['starwarsffg-legacy'] = {
        id: 'starwarsffg-legacy',
        label: 'Star Wars FFG - Legacy',
        entries,
      };
    }
    return categories;
  };
  registered = true;
}
