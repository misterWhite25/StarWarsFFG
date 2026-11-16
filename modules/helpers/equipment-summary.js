import {summarizeItemQualities} from './item-view-data.mjs';
import {renderSummary,summaryDialog} from './summary-render.mjs';
/** Hide bibliography in this summary without changing the stored item description. */
export function equipmentDescription(html) {
  return String(html ?? '')
    // Imported descriptions append a heading inside a paragraph, followed by book/page lines.
    .replace(/<p\b[^>]*>\s*<h[1-6]\b[^>]*>\s*(?:sources?|r[ée]f[ée]rences?)\s*:?\s*<\/h[1-6]>[\s\S]*?<\/p>/gi, '')
    // Other imports use a single paragraph with an optional bold/italic source label.
    .replace(/<p\b[^>]*>\s*(?:<(?:em|strong|b|i)\b[^>]*>\s*)*(?:sources?|r[ée]f[ée]rences?)(?:\s+bibliographiques?)?(?:\s+de\s+l['’]import)?\s*:[\s\S]*?<\/p>/gi, '')
    // Hide import/editorial notes, while preserving paragraphs with real game rules.
    .replace(/<p\b[^>]*>\s*(?:<(?:em|strong|b|i)\b[^>]*>\s*)*Profil\s+(?:repris\s+du\s+compendium|normalis[ée]\s+depuis\s+le\s+compendium|import[ée]\s+(?:depuis|du)\s+(?:le\s+)?compendium|issu\s+du\s+compendium)[\s\S]*?<\/p>/gi, '')
    .trim();
}
const value = field => field && typeof field === 'object' ? (field.adjusted ?? field.value ?? '-') : (field ?? '-');
export function equippedItems(actor) {
  return Array.from(actor.items ?? []).filter(item => !(item?.flags?.starwarsffg?.inventoryLocation==='possession') && item.system?.equippable?.equipped === true)
    .sort((a,b) => ({weapon:0,armour:1}[a.type] ?? 2) - ({weapon:0,armour:1}[b.type] ?? 2) || a.name.localeCompare(b.name,game.i18n.lang));
}
export function equipmentStats(item) {
  const s=item.system ?? {};
  const stats=[];
  if (item.type==='weapon') stats.push([game.i18n.localize("SWFFG.UI.Equipment.Damage"),value(s.damage)],[game.i18n.localize("SWFFG.UI.Equipment.Critical"),value(s.crit)],[game.i18n.localize("SWFFG.UI.Equipment.Range"),s.range?.label ?? value(s.range)]);
  if (item.type==='armour') stats.push([game.i18n.localize("SWFFG.UI.Equipment.Soak"),value(s.soak)],[game.i18n.localize("SWFFG.UI.Equipment.Defense"),value(s.defence)]);
  if (s.quantity != null) stats.push([game.i18n.localize("SWFFG.UI.Equipment.Quantity"),value(s.quantity)]);
  return stats;
}
const append=(parent,tag,text)=>{const el=document.createElement(tag);if(text!=null)el.textContent=text;parent.append(el);return el;};
export async function showEquipmentSummary(sheet, refresh=false, anchor=sheet.element) {
  if (refresh && !sheet._equipmentSummary?.rendered) return;
  if (!refresh && sheet._equipmentSummary?.rendered) {sheet._equipmentSummary.bringToFront();return;}
  return renderSummary(sheet,'_equipmentSummary',refresh,async current=>{
  const actor=sheet.actor, content=document.createElement('div');
  const body=append(content,'div');
  body.className='ffg-equipment-summary-body';
  body.style.cssText='max-height:min(360px,42vh);overflow:auto;font-size:12px;line-height:1.4;padding-right:6px';
  const enc=actor.system?.stats?.encumbrance;
  if(enc) append(body,'p',game.i18n.format("SWFFG.UI.Equipment.EquipmentEncumbrance",{value:enc.value??0,max:enc.max??'-'})).style.fontWeight='bold';
  const items=equippedItems(actor);
  if(!items.length) append(body,'p',game.i18n.localize("SWFFG.UI.Equipment.NoEquippedItem"));
  const enrich=html=>foundry.applications.ux.TextEditor.enrichHTML(equipmentDescription(html),{secrets:actor.isOwner,relativeTo:actor});
  for(const [type,label] of [['weapon',game.i18n.localize("SWFFG.UI.Equipment.Weapons")],['armour',game.i18n.localize("SWFFG.UI.Equipment.Armor")],['other',game.i18n.localize("SWFFG.UI.Equipment.OtherEquipment")]]) {
    const group=items.filter(i=>type==='other'?!['weapon','armour'].includes(i.type):i.type===type);
    if(!group.length) continue;
    append(body,'h2',label).style.cssText='font-size:14px;color:var(--ffg-ink,#582323);padding:0 8px;margin:12px 0 4px';
    for(const item of group) {
      if(!current())return;
      const section=append(body,'section');section.className='ffg-equipment-summary-entry';section.style.cssText='padding:8px;border-bottom:1px solid #8886';
      append(section,'h3',item.name).style.cssText='font-size:14px;margin:0 0 4px;color:var(--ffg-ink,#582323)';
      append(section,'p',equipmentStats(item).map(([key,v])=>`${key} : ${key===game.i18n.localize("SWFFG.UI.Equipment.Range")?game.i18n.localize(String(v)):v}`).join(' · ')).style.cssText='margin:0 0 5px;font-weight:bold';
      const description=item.system?.description;
      if(description) {const text=append(section,'div');text.className='ffg-equipment-description';text.innerHTML=await enrich(description);}
      // Qualities are view data assembled from the weapon and its attachments, not persisted system fields.
      const qualities=summarizeItemQualities(item.system);
      for(const quality of Object.values(qualities ?? {})) {
        const data=quality.item ?? quality;
        const details=append(section,'details');details.className='ffg-equipment-quality';details.dataset.summaryKey=(item.id??item._id??item.name)+':'+quality.name;
        const summary=append(details,'summary');
        append(summary,'h4',`${quality.name ?? data.name ?? game.i18n.localize("SWFFG.UI.Equipment.Quality")}${data.totalRanks!=null?' - '+data.totalRanks:''}`);
        const explanation=data.description ?? data.system?.description;
        if(explanation) {const text=append(details,'div');text.className='ffg-equipment-description';text.innerHTML=await enrich(explanation);}
      }
      if(item.system?.special?.value) {const text=append(section,'div');text.className='ffg-equipment-description';text.innerHTML=await enrich(item.system.special.value);}
    }
  }
  if(!current())return;
  if(refresh) {await sheet._equipmentSummary.setContent(content);return;}
  const width=Math.min(360,window.innerWidth-24), bounds=anchor.getBoundingClientRect();
  const left=bounds.right+8+width<=window.innerWidth?bounds.right+8:Math.max(0,bounds.left-width-8);
  sheet._equipmentSummary=summaryDialog({
    classes:['starwarsffg','themed','ffg-equipment-summary'],window:{title:game.i18n.format("SWFFG.UI.Equipment.EquipmentSummaryTitle",{name:actor.name}),resizable:true},
    position:{width,left,top:Math.max(0,Math.min(bounds.top,window.innerHeight-200))},content,
    buttons:[{action:'close',label:game.i18n.localize("SWFFG.UI.Equipment.Close")}]
  });
  await sheet._equipmentSummary.render({force:true});
  });
}
