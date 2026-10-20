/** Hide bibliography in this summary without changing the stored item description. */
export function equipmentDescription(html) {
  return String(html ?? '')
    // Imported descriptions append a heading inside a paragraph, followed by book/page lines.
    .replace(/<p\b[^>]*>\s*<h[1-6]\b[^>]*>\s*(?:sources?|r[ée]f[ée]rences?)\s*:?\s*<\/h[1-6]>[\s\S]*?<\/p>/gi, '')
    // Other imports use a single paragraph with an optional bold/italic source label.
    .replace(/<p\b[^>]*>\s*(?:<(?:em|strong|b|i)\b[^>]*>\s*)*(?:sources?|r[ée]f[ée]rences?)\s*:[\s\S]*?<\/p>/gi, '')
    .trim();
}
const value = field => field && typeof field === 'object' ? (field.adjusted ?? field.value ?? '—') : (field ?? '—');
export function equippedItems(actor) {
  return Array.from(actor.items ?? []).filter(item => !(item?.flags?.starwarsffg?.inventoryLocation==='possession') && item.system?.equippable?.equipped === true)
    .sort((a,b) => ({weapon:0,armour:1}[a.type] ?? 2) - ({weapon:0,armour:1}[b.type] ?? 2) || a.name.localeCompare(b.name,'fr'));
}
export function equipmentStats(item) {
  const s=item.system ?? {};
  const stats=[];
  if (item.type==='weapon') stats.push(['Dégâts',value(s.damage)],['Critique',value(s.crit)],['Portée',s.range?.label ?? value(s.range)]);
  if (item.type==='armour') stats.push(['Encaissement',value(s.soak)],['Défense',value(s.defence)]);
  if (s.quantity != null) stats.push(['Quantité',value(s.quantity)]);
  return stats;
}
const append=(parent,tag,text)=>{const el=document.createElement(tag);if(text!=null)el.textContent=text;parent.append(el);return el;};
export async function showEquipmentSummary(sheet, refresh=false) {
  if (refresh && !sheet._equipmentSummary?.rendered) return;
  if (!refresh && sheet._equipmentSummary?.rendered) {sheet._equipmentSummary.bringToFront();return;}
  const actor=sheet.actor, content=document.createElement('div');
  const body=append(content,'div');
  body.className='ffg-equipment-summary-body';
  body.style.cssText='max-height:72vh;overflow:auto;font-size:12px;line-height:1.4;padding-right:6px';
  const enc=actor.system?.stats?.encumbrance;
  if(enc) append(body,'p',`Encombrement total du personnage : ${enc.value ?? 0} / ${enc.max ?? '—'}`).style.fontWeight='bold';
  const items=equippedItems(actor);
  if(!items.length) append(body,'p','Aucun équipement équipé.');
  const enrich=html=>foundry.applications.ux.TextEditor.enrichHTML(equipmentDescription(html),{secrets:actor.isOwner,relativeTo:actor});
  for(const [type,label] of [['weapon','Armes'],['armour','Armures'],['other','Autres équipements']]) {
    const group=items.filter(i=>type==='other'?!['weapon','armour'].includes(i.type):i.type===type);
    if(!group.length) continue;
    append(body,'h2',label).style.cssText='font-size:15px;background:var(--ffg-equipment-heading-bg,#582323);color:var(--ffg-equipment-heading-ink,white);padding:4px 6px;margin:10px 0 0';
    for(const item of group) {
      const section=append(body,'section');section.className='ffg-equipment-summary-entry';section.style.cssText='padding:8px;border-bottom:1px solid #8886';
      append(section,'h3',item.name).style.cssText='font-size:14px;margin:0 0 4px;color:var(--ffg-equipment-name,#582323)';
      append(section,'p',equipmentStats(item).map(([key,v])=>`${key} : ${key==='Portée'?game.i18n.localize(String(v)):v}`).join(' · ')).style.cssText='margin:0 0 6px;font-weight:bold';
      const description=item.system?.description;
      if(description) append(section,'div').innerHTML=await enrich(description);
      // Qualities are view data assembled from the weapon and its attachments, not persisted system fields.
      const itemContext=await item.sheet?.getData?.();
      const qualities=itemContext?.data?.doNotSubmit?.qualities;
      for(const quality of Object.values(qualities ?? {})) {
        const data=quality.item ?? quality;
        append(section,'h4',`${quality.name ?? data.name ?? 'Propriété'}${data.totalRanks!=null?' — '+data.totalRanks:''}`).style.cssText='font-size:12px;margin:6px 0 2px';
        const explanation=data.description ?? data.system?.description;
        if(explanation) append(section,'div').innerHTML=await enrich(explanation);
      }
      if(item.system?.special?.value) append(section,'div').innerHTML=await enrich(item.system.special.value);
    }
  }
  if(refresh) {sheet._equipmentSummary.options.content=content;await sheet._equipmentSummary.render({force:true});return;}
  const width=Math.min(460,window.innerWidth-24), bounds=sheet.element.getBoundingClientRect();
  const left=bounds.right+8+width<=window.innerWidth?bounds.right+8:Math.max(0,bounds.left-width-8);
  sheet._equipmentSummary=new foundry.applications.api.DialogV2({
    classes:['starwarsffg','themed','ffg-equipment-summary'],window:{title:`Équipement — ${actor.name}`,resizable:true},
    position:{width,left,top:Math.max(0,Math.min(bounds.top,window.innerHeight-200))},content,
    buttons:[{action:'close',label:'Fermer'}]
  });
  await sheet._equipmentSummary.render({force:true});
}
