const append = (parent, tag, text) => {
  const element = document.createElement(tag);
  if (text != null) element.textContent = text;
  parent.append(element);
  return element;
};

const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
export function summaryTalents(actor) {
  return (actor.talentList ?? []).filter(talent => {
    const owned = actor.items.get(talent.itemId);
    return !owned?.flags?.starwarsffg?.characteristicIncrease?.creationTool &&
      !['augmenter un attribut', 'increase a characteristic'].includes(normalize(talent.name));
  }).map(talent => {
    const activation = normalize(talent.activation || talent.activationLabel);
    const active = activation.includes('active') || activation.includes('actif') || activation.includes('declenche');
    const rank = Number(talent.rank);
    let total = '';
    // Only unconditional, known per-rank bonuses can be summarized this way.
    if (talent.isRanked && Number.isFinite(rank) && rank > 0) {
      const name = normalize(talent.name);
      if (['endurci', 'toughened'].includes(name)) total = `Bonus total : +${2 * rank} au seuil de blessures.`;
      if (['robustesse', 'robuste', 'grit'].includes(name)) total = `Bonus total : +${rank} au seuil de stress.`;
    }
    return {...talent, active, total};
  }).sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, 'fr'));
}

export async function showTalentSummary(sheet, refresh = false) {
  if (refresh && !sheet._talentSummary?.rendered) return;
  if (!refresh && sheet._talentSummary?.rendered) {
    sheet._talentSummary.bringToFront();
    return;
  }
  const actor = sheet.actor;
  const content = document.createElement('div');
  const body = append(content, 'div');
  body.style.cssText = 'max-height:72vh;overflow:auto;font-size:12px;line-height:1.4;padding-right:6px';
  const talents = summaryTalents(actor);
  if (!talents.length) append(body, 'p', 'Aucun talent acquis.');
  for (const talent of talents) {
    const section = append(body, 'section');
    section.style.cssText = 'padding:8px;border-bottom:1px solid #8886;' + (talent.active ? 'background:#dce5e9;border-left:3px solid #687f8b;margin-bottom:5px;border-radius:3px' : '');
    const rank = talent.isRanked ? ` — Rang ${talent.rank}` : '';
    const choice = talent.characteristicChoice ? ` — ${talent.characteristicChoice}` : '';
    append(section, 'h3', `${talent.name}${choice}${rank}`).style.cssText = `font-size:14px;margin:0 0 4px;color:${talent.active ? '#354f5d' : '#582323'}`;
    const owned = actor.items.get(talent.itemId);
    append(section, 'p', talent.active ? 'Déclenché' : 'Passif').style.cssText = 'margin:0 0 5px;opacity:.8';
    if (talent.total) append(section, 'p', talent.total).style.cssText = 'margin:0 0 5px;font-weight:bold';
    const description = append(section, 'div');
    description.innerHTML = await foundry.applications.ux.TextEditor.enrichHTML(talent.description || owned?.system.description || '<p>Aucune description renseignée.</p>', {secrets: actor.isOwner, relativeTo: actor});
  }
  if (refresh) {
    sheet._talentSummary.options.content = content;
    await sheet._talentSummary.render({force:true});
    return;
  }
  const width = Math.min(460, window.innerWidth - 24);
  const bounds = sheet.element.getBoundingClientRect();
  const right = bounds.right + 8;
  const left = right + width <= window.innerWidth ? right : Math.max(0, bounds.left - width - 8);
  sheet._talentSummary = new foundry.applications.api.DialogV2({
    classes: ['starwarsffg', 'themed', 'theme-light'],
    window: {title: `Talents — ${actor.name}`, resizable:true},
    position: {width, left, top: Math.max(0, Math.min(bounds.top, window.innerHeight - 200))},
    content,
    buttons: [{action:'close', label:'Fermer'}]
  });
  await sheet._talentSummary.render({force:true});
}
