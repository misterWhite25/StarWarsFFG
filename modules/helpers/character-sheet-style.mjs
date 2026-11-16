const actorTypes=new Set(['character','minion','rival','nemesis']);

/** Presentation classes preserve the native actor sheets and their controls. */
function styleCharacterSheet(app){
  if(app.document?.documentName!=='Actor'||!app.element?.classList?.contains('v2'))return;
  app.element.classList.toggle('ffg-character-sheet',actorTypes.has(app.document.type));
  app.element.classList.toggle('ffg-vehicle-sheet',app.document.type==='vehicle');
}
Hooks.once('init',()=>{
  for(const name of ['character-sheets.css','vehicle-sheets.css']){
    const link=document.createElement('link');link.rel='stylesheet';link.dataset.ffgCharacterSheets='';
    link.href=new URL('../../styles/'+name,import.meta.url).href;document.head.append(link);
  }
});
Hooks.once('ready',()=>{
  // Place the scoped stylesheet after the legacy sheet styles in both themes.
  for(const link of document.head.querySelectorAll('link[data-ffg-character-sheets]'))document.head.append(link);
  for(const app of foundry.applications.instances.values())styleCharacterSheet(app);
});
Hooks.on('renderActorSheetFFGV2',styleCharacterSheet);
