/** Reuse the sidebar directory presentation inside Steelers compendiums. */
const SYSTEM='starwarsffg';
const SETTING='steelersCompendiumLayout';
const PREFIX='swffg-compendium-bilingual-steelers-';
const MARKER='ffg-steelers-compendium-layout';

function isSteelersDirectory(app){
  const pack=app.collection;
  return typeof pack?.collection==='string'&&pack.collection.startsWith(PREFIX)&&game.packs.get(pack.collection)===pack&&app.element?.classList.contains('compendium-directory');
}

export function styleSteelersCompendium(app){
  if(!isSteelersDirectory(app))return;
  const root=app.element,enabled=game.settings.get(SYSTEM,SETTING);
  if(enabled){
    root.classList.add(MARKER,'ffg-session-directory-layout');
    for(const header of root.querySelectorAll('.directory-list li.folder > .folder-header')){
      const color=header.style.backgroundColor;
      if(color)header.style.setProperty('--npc-folder-native',color);
      else header.style.removeProperty('--npc-folder-native');
    }
  }else if(root.classList.contains(MARKER)){
    root.classList.remove(MARKER,'ffg-session-directory-layout');
    for(const header of root.querySelectorAll('.directory-list li.folder > .folder-header'))header.style.removeProperty('--npc-folder-native');
  }
}

function refreshOpenDirectories(){
  for(const app of foundry.applications.instances.values())if(app.rendered)styleSteelersCompendium(app);
}

Hooks.once('init',()=>{
  game.settings.register(SYSTEM,SETTING,{
    name:'SWFFG.CompendiumStyle.Enable',hint:'SWFFG.CompendiumStyle.Hint',
    scope:'world',config:true,type:Boolean,default:true,onChange:refreshOpenDirectories
  });
  const href=new URL('../../styles/npc-session-directory.css',import.meta.url).href;
  if(![...document.querySelectorAll('link[rel=stylesheet]')].some(link=>link.href.split('?')[0]===href)){
    const link=document.createElement('link');link.rel='stylesheet';link.href=href;link.dataset.ffgCompendiumDirectoryStyle='';document.head.append(link);
  }
});
Hooks.on('renderCompendium',styleSteelersCompendium);
Hooks.once('ready',refreshOpenDirectories);
