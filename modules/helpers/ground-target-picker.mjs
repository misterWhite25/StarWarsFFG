import {isGroundToken} from './ground-movement-state.mjs';
let pending;
const docsFor=sheet=>[...new Set([document,sheet.element?.ownerDocument].filter(Boolean))];
async function finish(target,{cancelled=false,restore=true}={}){
 const pick=pending;if(!pick)return;pending=null;
 for(const doc of pick.docs)doc.removeEventListener('keydown',pick.escape,true);
 if(pick.notice)ui.notifications.remove(pick.notice);
 try{
  if(canvas.ready&&canvas.scene?.id===pick.sceneId){
   if(cancelled)canvas.tokens.setTargets(pick.previousTargets,{mode:'replace'});
   else if(target)target.setTarget(true,{releaseOthers:true});
   if(game.activeTool==='target')await ui.controls.render({control:pick.control,tool:pick.tool});
  }
 }finally{
  try{await pick.onChange?.();if(pick.hiddenElements?.length)await new Promise(resolve=>requestAnimationFrame(resolve));}
  finally{
   for(const state of pick.hiddenElements??[]){
    if(!restore&&state.app===pick.sheet)continue;
    const {element,display,priority,aria,app}=state;
    if(display)element.style.setProperty('display',display,priority);else element.style.removeProperty('display');
    if(aria===null)element.removeAttribute('aria-hidden');else element.setAttribute('aria-hidden',aria);
    if(app.rendered)for(const [selector,top,left]of state.scrolls){const node=app.element.querySelector(selector);if(node){node.scrollTop=top;node.scrollLeft=left;}}
   }
   if(restore&&pick.sheet.rendered)pick.sheet.bringToFront();
  }
 }
}
export async function chooseGroundTarget(sheet,source,onChange,options={}){
 if(!canvas.ready||!options.sourceOptional&&(!source?.object||!source.actor.isOwner))throw Error(game.i18n.localize("SWFFG.UI.Ground.ActorTokenRequired"));
 if(pending)await finish(null,{cancelled:true});
 const pick={sheet,sourceUuid:source?.uuid??null,canTarget:options.canTarget??isGroundToken,sceneId:canvas.scene.id,control:ui.controls.control?.name??'tokens',tool:game.activeTool??'select',previousTargets:[...game.user.targets].map(token=>token.id),docs:docsFor(sheet),onChange};
 pick.escape=event=>{if(event.key!=='Escape')return;event.preventDefault();event.stopImmediatePropagation();void finish(null,{cancelled:true}).catch(error=>ui.notifications.warn(error.message));};
 pending=pick;
 try{
  canvas.tokens.setTargets([],{mode:'replace'});
  pick.hiddenElements=[];
  for(const app of [...new Set([sheet,...options.hideApps??[]])]){
   const element=app.element;if(!element||!app.rendered)continue;
   if(element.ownerDocument.defaultView!==window){window.focus();continue;}
   const scrolls=['.window-content','.sheet-body','.sheet-tabs','.ffg-combat-layout',...Array.from(element.querySelectorAll('.tab[data-tab]'),tab=>'.tab[data-tab="'+CSS.escape(tab.dataset.tab)+'"]')].flatMap(selector=>{const node=element.querySelector(selector);return node?[[selector,node.scrollTop,node.scrollLeft]]:[];});
   pick.hiddenElements.push({app,element,scrolls,display:element.style.getPropertyValue('display'),priority:element.style.getPropertyPriority('display'),aria:element.getAttribute('aria-hidden')});
   element.style.setProperty('display','none','important');element.setAttribute('aria-hidden','true');
  }
  await ui.controls.render({control:'tokens',tool:'target'});
  if(pending!==pick)return;
  for(const doc of pick.docs)doc.addEventListener('keydown',pick.escape,true);
  pick.notice=ui.notifications.info(game.i18n.localize("SWFFG.UI.Ground.PickTargetNotice"),{permanent:true});
 }catch(error){await finish(null,{cancelled:true});throw error;}
}
export function cancelGroundTarget(sheet){if(pending&&(!sheet||pending.sheet===sheet))void finish(null,{cancelled:true,restore:!sheet}).catch(error=>ui.notifications.warn(error.message));}
export const choosingGroundTarget=sheet=>pending?.sheet===sheet;
Hooks.on('targetToken',(user,token,targeted)=>{
 if(!pending||user.id!==game.user.id||!targeted)return;
 if(!pending.canTarget(token.document)||token.document.uuid===pending.sourceUuid||!game.user.isGM&&(!token.isVisible||token.document.hidden)){
  token.setTarget(false);ui.notifications.warn(game.i18n.localize("SWFFG.UI.Ground.ChooseVisibleTarget"));return;
 }
 void finish(token).catch(error=>ui.notifications.warn(error.message));
});
Hooks.on('canvasTearDown',()=>cancelGroundTarget());
Hooks.on('deleteToken',token=>{if(pending?.sourceUuid===token.uuid)cancelGroundTarget();});
