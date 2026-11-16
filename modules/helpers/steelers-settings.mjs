/** Reorder native rows without replacing their inputs or save handlers. */
const originalMenus=['rulesetSettings','combatSettings','actorSettings','xpSpendingSettings','localizationSettings','groupManagerSettings'];
const steelersOrder=['bannerGallery','groundRangeDistances','enableSharedPortraits','enablePlayerCharacterPortraits','enableGalacticMarket','enableGMHotbar','steelersCompendiumLayout','enableSceneStorage'];
export function groupSteelersSettings(app){
 const root=app.element;if(!root?.querySelector)return;
 const records=new Map();
 for(const button of root.querySelectorAll('button[data-action="openSubmenu"][data-key^="starwarsffg."]')){
  const row=button.closest('.form-group');if(!row)continue;
  const key=button.dataset.key.slice('starwarsffg.'.length);
  for(const hint of row.querySelectorAll(':scope>.hint'))hint.remove();
  records.set(row,{row,key,menu:true,original:originalMenus.includes(key)});
 }
 for(const input of root.querySelectorAll('[name^="starwarsffg."]')){
  const row=input.closest('.form-group');if(!row||records.has(row))continue;
  const key=input.name.slice('starwarsffg.'.length);records.set(row,{row,key,menu:false,original:false});
 }
 if(!records.size)return;
 let parent=records.keys().next().value.parentElement;
 while(parent?.matches('.ffg-original-settings,.ffg-steelers-settings'))parent=parent.parentElement;
 const doc=root.ownerDocument;
 const section=(css,title)=>{
  let group=root.querySelector('.'+css);
  if(!group){group=doc.createElement('fieldset');group.className=css;const legend=doc.createElement('legend');legend.textContent=title;group.append(legend);}
  return group;
 };
 const original=section('ffg-original-settings',game.i18n.localize("SWFFG.UI.Interface.OriginalSettings")),steelers=section('ffg-steelers-settings',game.i18n.localize("SWFFG.UI.Interface.SteelersSystem"));
 parent.prepend(original);original.after(steelers);
 const list=Array.from(records.values());
 const rank=entry=>entry.original?(entry.menu?originalMenus.indexOf(entry.key):originalMenus.length+1):(steelersOrder.includes(entry.key)?steelersOrder.indexOf(entry.key):steelersOrder.length+1);
 list.sort((a,b)=>rank(a)-rank(b));
 for(const entry of list){
  const group=entry.original?original:steelers;
  if(!entry.row.querySelector('[data-steelers-search]')){const search=doc.createElement('span');search.hidden=true;search.dataset.searchable='';search.dataset.steelersSearch='';entry.row.append(search);}
  entry.row.querySelector('[data-steelers-search]').textContent=entry.original?game.i18n.localize("SWFFG.UI.Interface.OriginalSettingsSearch"):game.i18n.localize("SWFFG.UI.Interface.SteelersSystem");
  group.append(entry.row);
 }
 let sourceNote=original.querySelector('.ffg-original-source-note');
 if(!sourceNote){
  sourceNote=doc.createElement('p');sourceNote.className='ffg-original-source-note';
  const link=doc.createElement('a');link.href='https://github.com/StarWarsFoundryVTT/StarWarsFFG';link.textContent='Star Wars FFG';link.target='_blank';link.rel='noopener noreferrer';
  sourceNote.append(doc.createTextNode(game.i18n.localize("SWFFG.UI.Interface.OriginalSystemSource")),link,doc.createTextNode('.'));
 }
 original.append(sourceNote);
}
Hooks.once('init',()=>{
 const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('../../styles/steelers-settings.css',import.meta.url).href;document.head.append(link);
});
Hooks.on('renderSettingsConfig',groupSteelersSettings);
