const coreRulePowers = 'swffg-compendium-bilingual-steelers-core_rule.en-talents';

export async function forcePowerPurchaseOptions() {
  const configured = game.settings.get('starwarsffg','forcePowerCompendiums').split(',').map(id => id.trim()).filter(Boolean);
  const sources = new Set([...configured,coreRulePowers]);
  const powers = game.items.filter(item => item.type === 'forcepower');
  for (const source of sources) {
    const pack = game.packs.get(source);
    if (!pack?.visible) continue;
    const entries = await pack.getDocuments({type__in:['forcepower']});
    powers.push(...entries.filter(item => item.type === 'forcepower'));
  }
  const selectableItems = powers.map(item => ({
    name:item.name,
    id:item.id,
    source:item.uuid,
    cost:item.system.base_cost,
    requiredForceRating:Number(item.system.required_force_rating)
  })).sort((a,b) => a.name.localeCompare(b.name,game.i18n.lang));
  const groups = [...new Set(selectableItems.map(item => item.requiredForceRating))].sort((a,b) => a-b);
  return {selectableItems,groups};
}
