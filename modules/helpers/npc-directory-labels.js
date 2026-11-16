/** Show an NPC's real document type without changing its stored name. */
export function annotateNpcDirectory(app, html) {
  const root = html?.querySelectorAll ? html : html?.[0];
  if (!root) return;
  for (const row of root.querySelectorAll('.directory-item.document.actor[data-entry-id]')) {
    const actor = app.collection?.get?.(row.dataset.entryId) ?? game.actors?.get(row.dataset.entryId);
    if (!['minion', 'rival', 'nemesis'].includes(actor?.type)) continue;
    const link = row.querySelector('.entry-name');
    if (!link) continue;
    row.classList.add('ffg-npc-directory-entry');
    let name = link.querySelector('.ffg-npc-directory-name');
    if (!name) {
      name = document.createElement('span');
      name.className = 'ffg-npc-directory-name';
      name.append(...Array.from(link.childNodes));
      link.append(name);
    }
    let label = link.querySelector('.ffg-npc-directory-type');
    if (!label) {
      label = document.createElement('span');
      label.className = 'ffg-npc-directory-type';
      link.append(label);
    }
    label.dataset.npcType = actor.type;
    label.textContent = game.i18n.localize(`SWFFG.ActorDirectory.Type.${actor.type}`);
  }
}
