const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function acquisitionNotice(actor,item,cost){
 const available=Number(actor.system.experience.available);const valid=Number.isFinite(cost)&&cost>=0;
 const title=escape(item.name);
 const needsCareer=item.type==='specialization'&&!Array.from(actor.items??[]).some(owned=>owned.type==='career');
 const unavailable=game.i18n.localize(needsCareer?"SWFFG.UI.Actor.CreationNeedsCareer":"SWFFG.UI.Actor.CreationUnknownCost");
 const price=valid?game.i18n.format("SWFFG.UI.Actor.CreationPurchasePrice",{cost,available}):unavailable;
 return `<p style="text-align:justify"><strong>${title}</strong> - ${price}</p><p style="text-align:justify">${game.i18n.localize("SWFFG.UI.Actor.CreationGrantNotice")}</p>${item.type==='specialization'?'<p style="text-align:justify">'+game.i18n.localize("SWFFG.UI.Actor.CreationSpecializationNotice")+'</p>':''}`;
}
export function creationGuideHTML(actor){
 const items=Array.from(actor.items??[]),names=type=>items.filter(i=>i.type===type).map(i=>escape(i.name)).join(', ')||game.i18n.localize("SWFFG.UI.Actor.CreationNotSpecified");
 return game.i18n.format("SWFFG.UI.Actor.CreationGuideBody",{name:escape(actor.name),available:escape(actor.system.experience.available),total:escape(actor.system.experience.total),species:names('species'),career:names('career'),specializations:names('specialization')});
}
export async function showCreationGuide(actor){const {LegacyDialogV2}=await import('../applications/legacy-dialog-v2.js');return new LegacyDialogV2({title:game.i18n.format("SWFFG.UI.Actor.CreationTitle",{name:actor.name}),content:creationGuideHTML(actor),buttons:{close:{label:game.i18n.localize('SWFFG.ButtonClose')}}},{classes:['starwarsffg','themed'],width:700}).render(true);}
