import {createSharedWindowSession} from './shared-window-session.mjs';
import {renderSharedWindowControls} from './shared-window-controls.mjs';

let session, sharedSheet, applying=0, closing=false, queue=Promise.resolve();
const temporaryPages=new Map();
const sharingRoots=new WeakSet();
const disabledControls=new WeakMap();
const report=error=>{console.error('Star Wars FFG | Journal partagé',error);ui.notifications.warn(error.message);};
const cleanView=view=>typeof view?.uuid==='string'&&view.uuid.length<512&&typeof view.pageId==='string'&&/^[a-zA-Z0-9]{16}$/.test(view.pageId)
  ?{uuid:view.uuid,pageId:view.pageId}:null;
const isShared=app=>session?.state.open&&session.state.view?.uuid===app.document?.uuid;
const canStop=()=>game.user.isGM||session?.canNavigate();

function restorePermissions(entry){
  for(const id of temporaryPages.get(entry.uuid)??[]){
    const page=entry.pages.get(id);
    if(page)page.ownership=foundry.utils.deepClone(page._source.ownership);
  }
  temporaryPages.delete(entry.uuid);
}

/** Inspect persisted ownership: a temporary invitation must never grant the right
 * to reveal another page. Page-level inheritance follows the native document. */
function canRead(page,user){
  if(user.isGM)return true;
  const parent=page.parent,levels=CONST.DOCUMENT_OWNERSHIP_LEVELS;
  if(parent.pack)return game.packs.get(parent.pack)?.testUserPermission(user,levels.OBSERVER)??false;
  const level=doc=>doc._source.ownership?.[user.id]??doc._source.ownership?.default??levels.NONE;
  const own=level(page);
  return (own===levels.INHERIT?level(parent):own)>=levels.OBSERVER;
}

async function resolveView(view){
  const entry=await fromUuid(view?.uuid??'');
  const page=entry?.documentName==='JournalEntry'?entry.pages.get(view.pageId):null;
  if(!page)throw Error(game.i18n.localize("SWFFG.UI.Interface.JournalPageUnavailable"));
  return {entry,page};
}

async function validateRequest({user,request,state}){
  if(!['open','navigate'].includes(request.action))return;
  const view=cleanView(request.view);
  if(!view)throw Error(game.i18n.localize("SWFFG.UI.Interface.ChooseJournalPage"));
  if(request.action==='open'&&state.open)throw Error(game.i18n.localize("SWFFG.UI.Interface.JournalAlreadyShared"));
  if(request.action==='navigate'&&view.uuid!==state.view?.uuid)throw Error(game.i18n.localize("SWFFG.UI.Interface.DifferentJournalSession"));
  const {page}=await resolveView(view);
  // A new responsible participant may continue to show the already shared page.
  const unchanged=state.open&&view.uuid===state.view?.uuid&&view.pageId===state.view?.pageId;
  if(!unchanged&&!canRead(page,user))throw Error(game.i18n.localize("SWFFG.UI.Interface.JournalReadPermission"));
}

function renderSharingControl(app){
  const root=app.element;
  if(!root?.querySelector)return;
  const footer=root.querySelector('.journal-sidebar > footer.action-buttons');
  if(!footer)return;
  let label=root.querySelector('.ffg-journal-sharing');
  if(!label){
    label=document.createElement('label');label.className='ffg-journal-sharing';
    label.innerHTML=`<input type="checkbox" aria-label="${game.i18n.localize("SWFFG.UI.Interface.SharedJournalView")}"><span>${game.i18n.localize("SWFFG.UI.Interface.SharedView")}</span><small></small>`;
    label.addEventListener('pointerdown',event=>event.stopPropagation());
    label.addEventListener('mousedown',event=>event.stopPropagation());
    label.addEventListener('click',event=>event.stopPropagation());
    label.querySelector('input').addEventListener('change',async event=>{
      event.target.disabled=true;
      try{
        if(event.target.checked)await session.request('open',{view:{uuid:app.document.uuid,pageId:app.pageId}});
        else await session.request('close');
      }catch(error){report(error);}finally{renderSharingControl(app);}
    });
    footer.before(label);
  }
  if(label.nextElementSibling!==footer)footer.before(label);
  if(!sharingRoots.has(root)){
    sharingRoots.add(root);
    // Followers can scroll and read, while page selection stays with the responsible user.
    root.addEventListener('click',event=>{
      if(!isShared(app))return;
      const action=event.target.closest('[data-action]')?.dataset.action;
      const blocked=['nextPage','previousPage','toggleMode','goToHeading','editPage','createPage','deletePage'];
      if((!session.canNavigate()&&blocked.includes(action))||action==='toggleMode'){
        event.preventDefault();event.stopImmediatePropagation();
      }
    },true);
  }
  const active=isShared(app),owner=active&&session.canNavigate(),page=app.document.pages.get(app.pageId);
  label.querySelector('input').checked=active;
  label.querySelector('input').disabled=active?!canStop():!page||!canRead(page,game.user);
  const name=active?game.users.get(session.state.navigatorId)?.name:'';
  label.querySelector('small').textContent=name?game.i18n.format("SWFFG.UI.Interface.JournalResponsible",{name}):'';
  label.title=active?(owner?game.i18n.localize("SWFFG.UI.Interface.JournalOwnerHint"):game.i18n.localize("SWFFG.UI.Interface.JournalSharedHint")): game.i18n.localize("SWFFG.UI.Interface.JournalShareHint");
  for(const button of root.querySelectorAll('[data-action="nextPage"],[data-action="previousPage"],[data-action="toggleMode"]')){
    const blocked=active&&(button.dataset.action==='toggleMode'||!owner);
    if(blocked){
      if(!disabledControls.has(button))disabledControls.set(button,button.disabled);
      button.disabled=true;
    }else if(disabledControls.has(button)){
      button.disabled=disabledControls.get(button);disabledControls.delete(button);
    }
  }
}

function pilotage(dialog){
  if(!session)return;
  const state=session.state;
  renderSharedWindowControls('journal',{
    title:game.i18n.localize("SWFFG.UI.Interface.SharedJournal"),ownerLabel:game.i18n.localize("SWFFG.UI.Interface.Owner"),ownerAria:game.i18n.localize("SWFFG.UI.Interface.SharedJournalOwner"),
    shared:state.open,open:state.open,ownerId:state.navigatorId,
    onModeChange:async enabled=>{
      if(enabled)throw Error(game.i18n.localize("SWFFG.UI.Interface.OpenJournalToShare"));
      await session.request('close');
    },
    onOwnerChange:target=>session.request('handoff',{target}),refresh:()=>pilotage()
  },dialog);
}

async function applyState(state){
  applying++;
  try{
    if(!state.open||!state.view){
      if(sharedSheet){
        closing=true;
        try{if(sharedSheet.rendered)await sharedSheet.close();}
        finally{restorePermissions(sharedSheet.document);closing=false;}
      }
      sharedSheet=null;return;
    }
    const {entry,page}=await resolveView(state.view);
    const app=entry.sheet;
    if(sharedSheet&&sharedSheet!==app){
      closing=true;
      try{if(sharedSheet.rendered)await sharedSheet.close();}
      finally{restorePermissions(sharedSheet.document);closing=false;}
    }
    sharedSheet=app;
    if(page.getUserLevel(game.user)<CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER){
      if(!temporaryPages.has(entry.uuid))temporaryPages.set(entry.uuid,new Set());
      temporaryPages.get(entry.uuid).add(page.id);
      page.ownership[game.user.id]=CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
    }
    const mode=foundry.applications.sheets.journal.JournalEntrySheet.VIEW_MODES.SINGLE;
    if(!app.rendered||app.pageId!==page.id||app.mode!==mode){
      await app.render({force:true,tempOwnership:true,mode,pageId:page.id});
    }
    renderSharingControl(app);
  }finally{applying--;pilotage();}
}

Hooks.once('ready',async()=>{
  session=createSharedWindowSession({
    scope:'starwarsffg',stateKey:'sharedJournalState',requestKey:'sharedJournalRequest',
    initialView:true,sanitizeView:cleanView,validateRequest,
    validateState:(user,state)=>state.writerId===user.id&&(user.isGM||user.id===(game.users.activeGM??game.users.filter(u=>u.active).sort((a,b)=>a.id.localeCompare(b.id))[0])?.id),
    onState:state=>{queue=queue.catch(report).then(()=>applyState(state));return queue;},onError:report
  });
  await session.start();
});
Hooks.on('renderJournalEntrySheet',app=>{
  if(!session)return;
  renderSharingControl(app);
  if(!applying&&isShared(app)&&!session.canNavigate()&&app.pageId!==session.state.view?.pageId){
    queue=queue.catch(report).then(()=>applyState(session.state));
    return;
  }
  if(!applying&&isShared(app)&&session.canNavigate()&&app.pageId!==session.state.view?.pageId){
    session.publishView({uuid:app.document.uuid,pageId:app.pageId});
  }
});
Hooks.on('closeJournalEntrySheet',app=>{
  restorePermissions(app.document);
  if(!closing&&isShared(app)&&canStop())session.request('close').catch(report);
});
Hooks.on('renderDialogV2',app=>pilotage(app));
Hooks.on('deleteJournalEntry',entry=>{
  if(session?.state.open&&session.state.view?.uuid===entry.uuid&&canStop())session.request('close').catch(report);
});
Hooks.on('deleteJournalEntryPage',page=>{
  if(session?.state.open&&session.state.view?.uuid===page.parent.uuid&&session.state.view?.pageId===page.id&&canStop())session.request('close').catch(report);
});

Hooks.once('init',()=>{
  const link=document.createElement('link');link.rel='stylesheet';
  link.href=new URL('../../styles/shared-journal.css',import.meta.url).href;
  document.head.append(link);
});
