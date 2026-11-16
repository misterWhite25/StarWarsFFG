import {fitPortraitGrid,PORTRAIT_POSITIONS,PORTRAIT_SIZES} from './shared-portrait-layout.mjs';
const SCOPE='starwarsffg';
export const PORTRAITS_ENABLED='enableSharedPortraits';
export const PORTRAITS_STATE='sharedPortraits';
const TYPES=new Set(['character','minion','rival','nemesis']);
let writes=Promise.resolve(),boundsObserver,layoutFrame;
const portraitPreviews=new Map();
const fail=error=>{console.error('Star Wars FFG | Portraits partagés',error);ui.notifications.warn(error.message);};

function enabled(){return game.settings.get(SCOPE,PORTRAITS_ENABLED)===true;}
function cleanState(value={}){
  const seen=new Set(),portraits=[];
  for(const entry of Array.isArray(value.portraits)?value.portraits:[]){
    if(typeof entry?.uuid!=='string'||entry.uuid.length>512||seen.has(entry.uuid)||typeof entry.img!=='string')continue;
    seen.add(entry.uuid);
    portraits.push({uuid:entry.uuid,img:entry.img.slice(0,4096),name:typeof entry.name==='string'?entry.name.trim().slice(0,80):''});
  }
  const layout=PORTRAIT_POSITIONS.includes(value.layout)?value.layout:'right';
  return {layout,size:Object.hasOwn(PORTRAIT_SIZES,value.size)?value.size:'auto',portraits,focus:portraits.some(p=>p.uuid===value.focus)?value.focus:null};
}
export function sharedPortraitState(){return cleanState(game.settings.get(SCOPE,PORTRAITS_STATE));}
function requireGM(){if(!game.user.isGM)throw Error(game.i18n.localize("SWFFG.UI.Interface.GMOnlyPortraits"));}
function change(edit){
  requireGM();
  const result=writes.catch(()=>{}).then(async()=>{
    requireGM();
    if(!enabled())throw Error(game.i18n.localize("SWFFG.UI.Interface.EnablePortraitsFirst"));
    const state=sharedPortraitState();
    await edit(state);
    const next=cleanState(state);
    if(JSON.stringify(next)!==JSON.stringify(sharedPortraitState()))await game.settings.set(SCOPE,PORTRAITS_STATE,next);
    return next;
  });
  writes=result;return result;
}

/** Only a file reference and the explicitly public name are broadcast. No actor
 * data or ownership changes are involved, even for a completely private NPC. */
export async function addSharedPortrait(actor){
  return change(async state=>{
    if(actor?.documentName!=='Actor'||!TYPES.has(actor.type))throw Error(game.i18n.localize("SWFFG.UI.Interface.ChoosePersonalActor"));
    if(state.portraits.some(p=>p.uuid===actor.uuid))return;
    if(!actor.img)throw Error(game.i18n.localize("SWFFG.UI.Interface.NoPortraitImage"));
    state.portraits.push({uuid:actor.uuid,img:actor.img,name:''});
  });
}
export function editSharedPortrait(uuid,{name,move,focus,remove}={}){
  return change(state=>{
    const index=state.portraits.findIndex(p=>p.uuid===uuid);
    if(index<0)return;
    if(typeof name==='string')state.portraits[index].name=name;
    if(move===-1||move===1){
      const target=index+move;
      if(target>=0&&target<state.portraits.length)[state.portraits[index],state.portraits[target]]=[state.portraits[target],state.portraits[index]];
    }
    if(focus===true)state.focus=state.focus===uuid?null:uuid;
    if(remove)state.portraits.splice(index,1);
  });
}
export function setPortraitLayout(layout){return change(state=>{state.layout=layout;});}
export function setPortraitSize(size){return change(state=>{state.size=size;});}
export function hideSharedPortraits(){return change(state=>{state.portraits=[];state.focus=null;});}

function image(src,name){
  const img=document.createElement('img');img.src=src;img.alt=name;img.draggable=false;
  img.addEventListener('error',()=>{img.hidden=true;img.parentElement?.classList.add('ffg-portrait-unavailable');},{once:true});
  return img;
}
function element(tag,className,text){
  const node=document.createElement(tag);if(className)node.className=className;
  if(text!==undefined)node.textContent=text;return node;
}

/** Enlarge only the publicly displayed image on this client. No actor UUID is
 * passed to the popout, and opening it never changes or broadcasts shared state. */
async function zoomPortrait(uuid){
  const portrait=enabled()&&sharedPortraitState().portraits.find(p=>p.uuid===uuid);
  if(!portrait)return;
  const title=portrait.name||game.i18n.localize("SWFFG.UI.Interface.SharedPortrait");
  let preview=portraitPreviews.get(uuid);
  if(preview&&(preview.options.src!==portrait.img||preview.options.window.title!==title)){
    await preview.close();preview=null;
  }
  if(!preview){
    preview=new foundry.applications.apps.ImagePopout({src:portrait.img,showTitle:true,window:{title}});
    portraitPreviews.set(uuid,preview);
  }
  await preview.render({force:true});preview.bringToFront();
}

function renderPortraits(){
  let root=document.getElementById('ffg-shared-portraits');
  const state=sharedPortraitState();
  if(!enabled()||!state.portraits.length){root?.remove();return;}
  if(!root){
    root=element('section','ffg-shared-portraits');root.id='ffg-shared-portraits';
    root.setAttribute('aria-label',game.i18n.localize("SWFFG.UI.Interface.SharedPortraits"));root.setAttribute('aria-live','polite');
    document.body.append(root);
  }
  root.dataset.layout=state.layout;
  const cards=state.portraits.map(p=>{
    const card=element('figure','ffg-shared-portrait');card.dataset.portraitUuid=p.uuid;
    card.classList.toggle('is-focused',state.focus===p.uuid);
    card.classList.toggle('is-muted',Boolean(state.focus&&state.focus!==p.uuid));
    const art=element('div','ffg-shared-portrait-art');
    const fallback=element('i','fa-solid fa-user');fallback.setAttribute('aria-hidden','true');
    art.append(fallback,image(p.img,p.name||game.i18n.localize("SWFFG.UI.Interface.SharedPortrait")));
    const zoom=element('button','ffg-portrait-zoom');zoom.type='button';
    zoom.title=p.name?game.i18n.format("SWFFG.UI.Interface.EnlargeNamedPortrait",{name:p.name}):game.i18n.localize("SWFFG.UI.Interface.EnlargePortrait");zoom.setAttribute('aria-label',zoom.title);
    const loupe=element('i','fa-solid fa-magnifying-glass-plus');loupe.setAttribute('aria-hidden','true');zoom.append(loupe);
    for(const type of ['pointerdown','mousedown','dblclick'])zoom.addEventListener(type,event=>event.stopPropagation());
    zoom.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();zoomPortrait(p.uuid).catch(fail);});
    art.append(zoom);
    card.append(art);
    if(p.name)card.append(element('figcaption','',p.name));
    return card;
  });
  root.replaceChildren(...cards);scheduleBounds();
}

/** Adapt the overlay to this client's sidebar and hotbar. It never intercepts
 * canvas input and stays below document windows and Foundry's own controls. */
function updateBounds(){
  const root=document.getElementById('ffg-shared-portraits');if(!root)return;
  const state=sharedPortraitState();
  const nodeRect=node=>{
    const r=node?.getBoundingClientRect();
    return r?.width&&r.height&&r.right>0&&r.bottom>0&&r.left<innerWidth&&r.top<innerHeight&&getComputedStyle(node).visibility!=='hidden'?r:null;
  };
  const rect=id=>nodeRect(document.getElementById(id));
  const sidebar=rect('sidebar'),controls=rect('scene-controls'),hotbar=rect('hotbar'),players=rect('players');
  // The navigation wrapper spans the entire screen height, even when empty.
  // Measure its actual scene buttons instead of treating that wrapper as opaque.
  const nav=[...document.querySelectorAll('#scene-navigation .ui-control')].map(nodeRect).filter(Boolean);
  const navigation=nav.length?{left:Math.min(...nav.map(r=>r.left)),right:Math.max(...nav.map(r=>r.right)),bottom:Math.max(...nav.map(r=>r.bottom))}:null;
  let left=Math.min(innerWidth-16,Math.max(12,controls?.right+12||12));
  if(navigation&&navigation.bottom>innerHeight*.35&&navigation.left<innerWidth*.5)left=Math.min(innerWidth-16,Math.max(left,navigation.right+12));
  const right=Math.max(left+1,Math.min(innerWidth-12,sidebar?sidebar.left-12:innerWidth-12));
  const top=Math.min(innerHeight-16,Math.max(56,navigation&&navigation.bottom<=innerHeight*.35?navigation.bottom+12:0));
  let bottom=Math.max(top+1,Math.min(innerHeight-12,hotbar&&hotbar.top>innerHeight*.4?hotbar.top-12:innerHeight-12));
  if(state.layout==='bottom'&&players)left=Math.min(right-1,Math.max(left,players.right+12));
  if(state.layout==='left'&&players&&players.left<left+Math.min(440,(right-left)*.34))bottom=Math.max(top+1,Math.min(bottom,players.top-12));
  const grid=fitPortraitGrid({count:state.portraits.length,width:right-left,height:bottom-top,position:state.layout,size:state.size,named:state.portraits.some(p=>p.name)});
  if(!grid?.columns)return;
  const horizontal=['top','bottom'].includes(state.layout);
  const x=horizontal?left+(right-left-grid.width)/2:state.layout==='left'?left:right-grid.width;
  const y=horizontal?(state.layout==='top'?top:bottom-grid.height):top+(bottom-top-grid.height)/2;
  Object.assign(root.style,{left:x+'px',top:y+'px',width:grid.width+'px',height:grid.height+'px'});
  for(const [key,value]of Object.entries({columns:grid.columns,'card-width':grid.cardWidth+'px','card-height':grid.cardHeight+'px','image-height':grid.imageHeight+'px',gap:grid.gap+'px','caption-height':grid.captionHeight+'px','caption-size':Math.max(9,Math.min(12,grid.cardWidth*.10))+'px'}))root.style.setProperty('--portrait-'+key,value);
  root.dataset.positioned='true';
}
function scheduleBounds(){if(!layoutFrame)layoutFrame=requestAnimationFrame(()=>{layoutFrame=null;updateBounds();});}
function observeBounds(){
  boundsObserver?.disconnect();boundsObserver=new ResizeObserver(scheduleBounds);
  for(const node of [document.body,...['sidebar','scene-controls','hotbar','players','scene-navigation'].map(id=>document.getElementById(id))])if(node)boundsObserver.observe(node);
  for(const node of document.querySelectorAll('#scene-navigation .scene-navigation-menu'))boundsObserver.observe(node);
  scheduleBounds();
}

function action(label,icon,callback){
  const button=element('button','ffg-portrait-action');button.type='button';
  button.title=label;button.setAttribute('aria-label',label);
  const glyph=element('i','fa-solid '+icon);glyph.setAttribute('aria-hidden','true');button.append(glyph);
  button.addEventListener('click',async event=>{
    event.preventDefault();event.stopPropagation();button.disabled=true;
    try{await callback();}catch(error){fail(error);}finally{if(button.isConnected)button.disabled=false;}
  });return button;
}
function renderPanel(app){
  const root=app?.element;
  if(!root?.classList.contains('pilotage-mj-dialog'))return;
  let panel=root.querySelector('.ffg-shared-portraits-controls');
  if(!game.user.isGM||!enabled()){panel?.remove();return;}
  const views=root.querySelector('.pilotage-views-content')??root.querySelector('[data-pilotage-panel="views"]');if(!views)return;
  const state=sharedPortraitState();
  if(!panel){
    panel=element('section','ffg-shared-portraits-controls');
    panel.setAttribute('aria-label',game.i18n.localize("SWFFG.UI.Interface.ManagePortraits"));
    (views.querySelector('.pilotage-movement')??views.querySelector('.pilotage-views-empty'))?.before(panel);if(!panel.parentElement)views.append(panel);

  }
  const heading=element('div','ffg-portrait-panel-heading'),title=element('div','ffg-portrait-panel-title');
  const help=element('button','ffg-portrait-help-trigger');help.type='button';help.setAttribute('aria-label',game.i18n.localize('SWFFG.UI.Interface.PortraitHelp'));
  const glyph=element('i','fa-solid fa-circle-info');glyph.setAttribute('aria-hidden','true');help.append(glyph);
  const tooltip=element('div');tooltip.append(element('p','',game.i18n.localize('SWFFG.UI.Interface.PortraitFitHint')),element('p','',game.i18n.localize(state.portraits.length?'SWFFG.UI.Interface.PortraitPublicNameHint':'SWFFG.UI.Interface.PortraitDirectoryHint')));
  help.dataset.tooltip='';help.dataset.tooltipHtml=tooltip.innerHTML;help.dataset.tooltipClass='ffg-portrait-tooltip';
  help.addEventListener('focus',()=>game.tooltip.activate(help));help.addEventListener('blur',()=>game.tooltip.deactivate());
  help.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();game.tooltip.activate(help);});
  help.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();game.tooltip.deactivate();}});
  title.append(element('h3','',game.i18n.localize('SWFFG.UI.Interface.SharedPortraits')),help);
  heading.append(title,element('span','ffg-portrait-count',game.i18n.format(state.portraits.length===1?'SWFFG.UI.Interface.PortraitOne':'SWFFG.UI.Interface.PortraitMany',{count:state.portraits.length})));
  const toolbar=element('div','ffg-portrait-toolbar'),label=element('label','',game.i18n.localize("SWFFG.UI.Interface.Position"));
  const layout=element('select');layout.setAttribute('aria-label',game.i18n.localize("SWFFG.UI.Interface.PortraitLayout"));
  for(const [value,text]of [['left',game.i18n.localize("SWFFG.UI.Interface.Left")],['right',game.i18n.localize("SWFFG.UI.Interface.Right")],['top',game.i18n.localize("SWFFG.UI.Interface.Top")],['bottom',game.i18n.localize("SWFFG.UI.Interface.Bottom")]]){
    const option=element('option','',text);option.value=value;option.selected=value===state.layout;layout.append(option);
  }
  layout.addEventListener('change',()=>{setPortraitLayout(layout.value).catch(fail);});label.append(layout);
  const sizeLabel=element('label','',game.i18n.localize("SWFFG.UI.Interface.PreferredSize")),size=element('select');size.setAttribute('aria-label',game.i18n.localize("SWFFG.UI.Interface.PortraitSize"));
  for(const [value,text]of [['auto',game.i18n.localize("SWFFG.UI.Interface.Auto")],['small',game.i18n.localize("SWFFG.UI.Interface.Small")],['medium',game.i18n.localize("SWFFG.UI.Interface.Medium")],['large',game.i18n.localize("SWFFG.UI.Interface.Large")],['xlarge',game.i18n.localize("SWFFG.UI.Interface.ExtraLarge")]]){
    const option=element('option','',text);option.value=value;option.selected=value===state.size;size.append(option);
  }
  size.addEventListener('change',()=>{setPortraitSize(size.value).catch(fail);});sizeLabel.append(size);
  const clear=action(game.i18n.localize("SWFFG.UI.Interface.HideAll"),'fa-eye-slash',hideSharedPortraits);clear.append(document.createTextNode(game.i18n.localize("SWFFG.UI.Interface.HideAllWithSpace")));clear.disabled=!state.portraits.length;
  toolbar.append(label,sizeLabel,clear);
  const list=element('ol','ffg-portrait-control-list');
  state.portraits.forEach((p,index)=>{
    const row=element('li','ffg-portrait-control-row');row.dataset.portraitUuid=p.uuid;
    const preview=element('div','ffg-portrait-control-preview');preview.append(image(p.img,''));
    const fields=element('div','ffg-portrait-control-fields');
    // Real names are used only inside this GM-only management panel.
    const actor=fromUuidSync(p.uuid),privateName=actor?.name??game.i18n.format("SWFFG.UI.Interface.UnnamedPortrait",{number:index+1});
    fields.append(element('strong','',privateName));
    const name=element('input');name.type='text';name.maxLength=80;name.value=p.name;
    name.placeholder=game.i18n.localize("SWFFG.UI.Interface.OptionalPublicName");name.setAttribute('aria-label',game.i18n.format("SWFFG.UI.Interface.PortraitPublicName",{number:index+1}));
    name.addEventListener('change',()=>{editSharedPortrait(p.uuid,{name:name.value}).catch(fail);});fields.append(name);
    const tools=element('div','ffg-portrait-row-actions');
    const up=action(game.i18n.localize("SWFFG.UI.Interface.MovePortraitUp"),'fa-arrow-up',()=>editSharedPortrait(p.uuid,{move:-1}));up.disabled=index===0;
    const down=action(game.i18n.localize("SWFFG.UI.Interface.MovePortraitDown"),'fa-arrow-down',()=>editSharedPortrait(p.uuid,{move:1}));down.disabled=index===state.portraits.length-1;
    const focus=action(game.i18n.localize("SWFFG.UI.Interface.FocusPortrait"),'fa-star',()=>editSharedPortrait(p.uuid,{focus:true}));focus.setAttribute('aria-pressed',String(state.focus===p.uuid));
    tools.append(up,down,focus,action(game.i18n.localize("SWFFG.UI.Interface.RemovePortrait"),'fa-xmark',()=>editSharedPortrait(p.uuid,{remove:true})));
    row.append(preview,fields,tools);list.append(row);
  });
  panel.replaceChildren(heading,toolbar,list);
}

function refresh(){
  if(!game.ready)return;
  renderPortraits();
  for(const app of foundry.applications.instances.values()){renderPanel(app);}
}
async function refreshSources(){
  if(!enabled()||!game.user.isActiveGM)return;
  await change(async state=>{
    const entries=[];
    for(const p of state.portraits){
      const actor=await fromUuid(p.uuid);
      if(actor&&TYPES.has(actor.type)&&actor.img)entries.push({...p,img:actor.img});
    }
    state.portraits=entries;
  });
}

Hooks.once('init',()=>{
  game.settings.register(SCOPE,PORTRAITS_ENABLED,{
    name:"SWFFG.UI.Interface.EnableSharedPortraits",hint:"SWFFG.UI.Interface.SharedPortraitSettingHint",
    scope:'world',config:true,restricted:true,type:Boolean,default:false,
    onChange:()=>{refresh();refreshSources().catch(fail);}
  });
  game.settings.register(SCOPE,PORTRAITS_STATE,{scope:'world',config:false,restricted:true,type:Object,default:{layout:'right',size:'auto',portraits:[],focus:null},onChange:refresh});
  const link=element('link');link.rel='stylesheet';link.href=new URL('../../styles/shared-portraits.css',import.meta.url).href;document.head.append(link);
});
Hooks.once('ready',()=>{refresh();observeBounds();refreshSources().catch(fail);});
Hooks.on('renderApplicationV2',app=>{
  if(!game.ready)return;
  if(app.element?.classList.contains('pilotage-mj-dialog'))requestAnimationFrame(()=>renderPanel(app));
});
Hooks.on('getActorContextOptions',(app,options)=>{
  options.push({group:'starwarsffg',label:game.i18n.localize("SWFFG.UI.Interface.ShowToGroup"),icon:'fa-solid fa-users-viewfinder',
    visible:li=>game.user.isGM&&enabled()&&TYPES.has(app.collection.get(li.dataset.entryId)?.type),
    onClick:(_event,li)=>{addSharedPortrait(app.collection.get(li.dataset.entryId)).catch(fail);}
  });
});
Hooks.on('updateActor',(actor,changes)=>{
  if(('img' in changes||'type' in changes)&&sharedPortraitState().portraits.some(p=>p.uuid===actor.uuid))refreshSources().catch(fail);
});
Hooks.on('deleteActor',actor=>{if(sharedPortraitState().portraits.some(p=>p.uuid===actor.uuid))refreshSources().catch(fail);});
Hooks.on('userConnected',()=>{refreshSources().catch(fail);});
for(const hook of ['renderSidebar','renderSceneControls','renderHotbar','renderSceneNavigation','renderPlayers','collapseSidebar','canvasReady'])Hooks.on(hook,observeBounds);
window.addEventListener('resize',scheduleBounds);
Hooks.on('closeImagePopout',app=>{
  for(const [uuid,preview]of portraitPreviews)if(preview===app)portraitPreviews.delete(uuid);
});
