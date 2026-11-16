import {actorDirectoryGroup} from './vehicle-directory.js';
import {showCreditPayment} from './pilotage-credit-payments.mjs';
import {isInventoryEquipment,isPossession} from './inventory-location.js';

const windows=new Map(),types=new Set(['character','minion','rival','nemesis']);
const SYSTEM='starwarsffg',INCLUDED='pilotageAssetsIncluded';
const format={format:value=>Number(value).toLocaleString(game.i18n.lang,{maximumFractionDigits:2})};
const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr');
function guard(){if(!game.user.isGM)throw Error(game.i18n.localize("SWFFG.UI.Pilotage.GMOnlyOverview"));}
export function isPilotageAssetsIncluded(actor){
 if(!types.has(actor?.type)||actor.isToken)return false;
 const choice=actor.getFlag(SYSTEM,INCLUDED);
 return typeof choice==='boolean'?choice:actorDirectoryGroup(actor)==='actors';
}
function actors(){guard();return game.actors.filter(isPilotageAssetsIncluded).sort((a,b)=>a.name.localeCompare(b.name,'fr',{numeric:true,sensitivity:'base'}));}
const number=value=>value===null||value===undefined||value===''?null:Number.isFinite(Number(value))?Number(value):null;
function balances(actor){
 const credits=actor.system.stats?.credits,carried=number(credits?.value);
 const reserve=credits?.reserve===undefined?(carried===null?null:0):number(credits.reserve);
 return [carried,reserve,carried===null||reserve===null?null:carried+reserve];
}
function element(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
function button(label,callback){const node=element('button','',label);node.type='button';node.addEventListener('click',()=>{try{guard();Promise.resolve(callback()).catch(error=>ui.notifications.error(error.message));}catch(error){ui.notifications.error(error.message);}});return node;}
function loadStyles(){
 if(document.querySelector('link[data-pilotage-assets]'))return;
 const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('../../styles/pilotage-assets.css',import.meta.url).href;link.dataset.pilotageAssets='';document.head.append(link);
}

class PilotageAssets extends foundry.applications.api.ApplicationV2{
 static DEFAULT_OPTIONS={classes:['starwarsffg','themed','ffg-calculation-dialog','pilotage-assets-window'],window:{resizable:true},position:{width:1180,height:600}};
 constructor(kind,{shared=false,snapshot=null,session=null}={}){
  super({id:'ffg-pilotage-'+(shared?'shared-':'')+kind,window:{title:shared?game.i18n.format("SWFFG.UI.Pilotage.SharedTitle",{title:kind==='credits'?game.i18n.localize("SWFFG.UI.Pilotage.CharacterCredits"):game.i18n.localize("SWFFG.UI.Pilotage.CharacterEquipment")}):(kind==='credits'?game.i18n.localize("SWFFG.UI.Pilotage.CharacterCredits"):game.i18n.localize("SWFFG.UI.Pilotage.CharacterEquipment"))},position:{width:Math.min(kind==='credits'?780:1180,window.innerWidth-32),height:kind==='credits'?660:620}});
  this.kind=kind;this.shared=shared;this.snapshot=snapshot;this.shareSession=session;this.query='';this.hooks=[];
 }
 async _renderHTML(){
  if(!this.shared)guard();
  if(!this.root){
   this.root=element('section','pilotage-assets-content');
   const toolbar=element('div','pilotage-assets-toolbar'),label=element('label','pilotage-assets-search',game.i18n.localize("SWFFG.UI.Pilotage.Search"));
   this.search=element('input');this.search.type='search';this.search.placeholder=this.kind==='credits'?game.i18n.localize("SWFFG.UI.Pilotage.CharacterNamePlaceholder"):game.i18n.localize("SWFFG.UI.Pilotage.CharacterOrItemPlaceholder");
   this.search.addEventListener('input',()=>{this.query=this.search.value;this.refreshContent();});label.append(this.search);
   this.count=element('span','pilotage-assets-count');this.count.setAttribute('aria-live','polite');toolbar.append(label);
   if(!this.shared&&this.kind==='credits'){const pay=button(game.i18n.localize("SWFFG.UI.Pilotage.GroupPayment"),()=>showCreditPayment(actors));pay.className='pilotage-assets-group-payment';pay.dataset.groupPayment='';pay.title=game.i18n.localize("SWFFG.UI.Pilotage.GroupPaymentHint");toolbar.append(pay);}
   if(!this.shared){
    const sharing=element('div','pilotage-assets-sharing');
    const share=button(game.i18n.localize("SWFFG.UI.Pilotage.ShareWithTable"),async()=>{await publishSharedAssets(this.kind);await this.close({animate:false});});share.dataset.shareAssets=this.kind;share.title=game.i18n.localize("SWFFG.UI.Pilotage.ShareWithTableHint");
    this.stopShare=button(game.i18n.localize("SWFFG.UI.Pilotage.StopSharing"),()=>stopSharedAssets(this.kind));this.stopShare.dataset.stopShareAssets=this.kind;sharing.append(share,this.stopShare);toolbar.append(sharing);
   }
   const note=element('p','pilotage-assets-note',this.shared?game.i18n.localize("SWFFG.UI.Pilotage.SharedViewHint"):this.kind==='credits'?game.i18n.localize("SWFFG.UI.Pilotage.CreditOverviewHint"):game.i18n.localize("SWFFG.UI.Pilotage.EquipmentOverviewHint"));
   note.prepend(this.count,document.createTextNode(' · '));
   this.body=element('div','pilotage-assets-scroll');this.body.tabIndex=0;this.body.setAttribute('aria-label',game.i18n.localize("SWFFG.UI.Pilotage.HorizontalCharacters"));this.root.append(...(this.shared?[]:[toolbar]),note,this.body);
  }
  this.refreshContent();return this.root;
 }
 _replaceHTML(result,content){const left=this.body.scrollLeft,top=this.body.scrollTop;content.replaceChildren(result);this.body.scrollLeft=left;this.body.scrollTop=top;}
 async _onRender(context,options){
  await super._onRender(context,options);
  this.element.classList.toggle('pilotage-assets-shared',this.shared);
  if(this.shared||this.hooks.length)return;
  const refresh=()=>{clearTimeout(this.timer);this.timer=setTimeout(()=>{if(!this.rendered)return;if(!game.user.isGM){void this.close();return;}this.refreshContent();},40);};
  for(const name of ['createActor','updateActor','deleteActor','createItem','updateItem','deleteItem','updateUser'])this.hooks.push([name,Hooks.on(name,refresh)]);
 }
 _onClose(options){super._onClose(options);clearTimeout(this.timer);for(const [name,id]of this.hooks)Hooks.off(name,id);this.hooks=[];if(this.shared){dismissedShares.set(this.kind,this.shareSession);if(sharedWindows.get(this.kind)===this)sharedWindows.delete(this.kind);}else if(windows.get(this.kind)===this)windows.delete(this.kind);}
 actorLink(actor){
  if(this.shared){const name=element('span','pilotage-assets-readonly-actor',actor.name),image=element('img');image.src=actor.img;image.alt='';image.width=28;image.height=28;name.prepend(image);return name;}
  const link=button(actor.name,()=>actor.sheet.render({force:true}));link.className='pilotage-assets-actor';link.dataset.actorId=actor.id;
  const image=element('img');image.src=actor.img;image.alt='';image.width=28;image.height=28;link.prepend(image);link.title=game.i18n.format("SWFFG.UI.Pilotage.OpenSheet",{name:actor.name});return link;
 }
 refreshSharingControls(){if(this.stopShare)this.stopShare.hidden=!sharedState()[this.kind]?.session;}
 refreshContent(){
  if(!this.shared){guard();this.refreshSharingControls();}const query=normalize(this.query),columns=element('div','pilotage-assets-columns'),scrolls=new Map();
  for(const card of this.body.querySelectorAll('[data-asset-actor]'))scrolls.set(card.dataset.assetActor,card.querySelector('.pilotage-assets-column-body')?.scrollTop??0);
  let count=0;
  for(const actor of (this.shared?this.snapshot:actors())){
   const inventory=this.kind==='possessions'?(this.shared?actor.items:actor.items.filter(item=>isInventoryEquipment(item)&&!isPossession(item)&&(item.type==='gear'||item.system.equippable?.equipped===true)).sort((a,b)=>a.name.localeCompare(b.name,'fr',{numeric:true,sensitivity:'base'}))):[];
   const nameMatches=normalize(actor.name).includes(query),items=nameMatches?inventory:inventory.filter(item=>normalize(item.name).includes(query));
   if(query&&!nameMatches&&!items.length)continue;count++;
   const card=element('section','pilotage-assets-column');card.dataset.assetActor=actor.id;
   const header=element('header','pilotage-assets-column-header');header.append(this.actorLink(actor));
   if(this.kind==='possessions')header.append(element('small','',game.i18n.format(items.length===1?"SWFFG.UI.Pilotage.ReferencesOne":"SWFFG.UI.Pilotage.ReferencesMany",{count:items.length})));card.append(header);
   const body=element('div','pilotage-assets-column-body');
   if(this.kind==='credits'){
    const list=element('dl','pilotage-assets-balances');
    for(const [index,value]of (this.shared?actor.balances:balances(actor)).entries()){
     const row=element('div',index===2?'pilotage-assets-balance-total':''),label=element('dt','',[game.i18n.localize("SWFFG.UI.Pilotage.CarriedCredits"),game.i18n.localize("SWFFG.UI.Pilotage.ReserveCredits"),game.i18n.localize("SWFFG.UI.Pilotage.TotalCredits")][index]);
     const cell=element('dd','pilotage-assets-number',value===null?'-':format.format(value));cell.dataset.balance=['carried','reserve','total'][index];if(value===null)cell.title=game.i18n.localize("SWFFG.UI.Pilotage.NotSpecified");row.append(label,cell);list.append(row);
    }body.append(list);
    if(!this.shared){const pay=button(game.i18n.localize("SWFFG.UI.Pilotage.Charge"),()=>showCreditPayment(actors,actor.id));pay.className='pilotage-assets-pay';pay.dataset.payActor=actor.id;body.append(pay);}
   }else if(items.length){
    for(const [type,label]of [['weapon',game.i18n.localize("SWFFG.UI.Pilotage.Weapons")],['armour',game.i18n.localize("SWFFG.UI.Pilotage.Armor")],['gear',game.i18n.localize("SWFFG.UI.Pilotage.Equipment")]]){
     const category=items.filter(item=>item.type===type);if(!category.length)continue;
     const table=element('table','pilotage-assets-items');table.dataset.equipmentCategory=type;table.setAttribute('aria-label',label);
     const thead=element('thead'),tr=element('tr');
     for(const title of [label,game.i18n.localize("SWFFG.UI.Pilotage.Quantity")]){const th=element('th','',title);th.scope='col';tr.append(th);}thead.append(tr);table.append(thead);const tbody=element('tbody');
     for(const item of category){
      const row=element('tr');row.dataset.assetItem=item.id;const cell=element('td'),link=this.shared?element('span'):button('',()=>item.sheet.render({force:true}));link.className='pilotage-assets-item';if(!this.shared)link.title=game.i18n.format("SWFFG.UI.Pilotage.OpenSheet",{name:item.name});
      link.append(element('span','',item.name));
      const quantity=this.shared?item.quantity:number(item.system.quantity?.value);
      cell.append(link);row.append(cell,element('td','pilotage-assets-number',quantity===null?'-':format.format(quantity)));tbody.append(row);
     }table.append(tbody);body.append(table);
    }
   }else body.append(element('p','pilotage-assets-empty',game.i18n.localize("SWFFG.UI.Pilotage.NoEquipment")));
   card.append(body);
   columns.append(card);
  }
  this.count.textContent=game.i18n.format(count===1?"SWFFG.UI.Pilotage.CharactersOne":"SWFFG.UI.Pilotage.CharactersMany",{count});
  const left=this.body.scrollLeft,top=this.body.scrollTop;
  if(!count)this.body.replaceChildren(element('p','pilotage-assets-empty',query?game.i18n.localize("SWFFG.UI.Pilotage.NoSearchMatch"):this.shared?game.i18n.localize("SWFFG.UI.Pilotage.SharedNoCharacters"):game.i18n.localize("SWFFG.UI.Pilotage.NoIncludedCharacters")));
  else this.body.replaceChildren(columns);
  this.body.scrollLeft=left;this.body.scrollTop=top;
  for(const card of this.body.querySelectorAll('[data-asset-actor]'))card.querySelector('.pilotage-assets-column-body').scrollTop=scrolls.get(card.dataset.assetActor)??0;
 }
}

export async function showPilotageAssets(kind){
 guard();if(!['possessions','credits'].includes(kind))throw Error(game.i18n.localize("SWFFG.UI.Pilotage.UnknownOverview"));loadStyles();
 let app=windows.get(kind);if(!app){app=new PilotageAssets(kind);windows.set(kind,app);}
 await app.render({force:true});app.bringToFront();return app;
}
export function setupPilotageAssets(root){
 if(!game.user.isGM||root.querySelector('.pilotage-assets-actions'))return;loadStyles();
 const nav=root.querySelector('.pilotage-left-column');if(!nav)return;
 const actions=element('div','pilotage-assets-actions pilotage-card');actions.setAttribute('aria-label',game.i18n.localize("SWFFG.UI.Pilotage.CharacterOverviews"));
 for(const [kind,label,icon]of [['possessions',game.i18n.localize("SWFFG.UI.Pilotage.Equipment"),'fa-person-walking-luggage'],['credits',game.i18n.localize("SWFFG.UI.Pilotage.Credits"),'fa-coins']]){
  const control=button(label,()=>showPilotageAssets(kind));control.dataset.pilotageAssets=kind;
  if(kind==='possessions'){const hint=game.i18n.localize("SWFFG.UI.Pilotage.CarriedEquipmentHint");control.dataset.tooltip=hint;control.setAttribute('aria-description',hint);}
  const glyph=element('i','fa-solid '+icon);glyph.setAttribute('aria-hidden','true');control.prepend(glyph);actions.append(control);
 }nav.append(actions);
}

export function renderPilotageAssetsField(sheet){
 const actor=sheet.actor,root=sheet.element;if(!types.has(actor?.type)||actor.isToken||!root)return;
 const tab=root.querySelector('.tab[data-tab=general]');if(!tab)return;loadStyles();
 const fr=game.i18n.lang==='fr';let field=tab.querySelector('.ffg-pilotage-assets-field');
 if(!field){
  field=element('div','ffg-pilotage-assets-field');const label=element('label'),caption=element('span','',game.i18n.localize("SWFFG.UI.Pilotage.PilotageAssets.IncludeInGMCreditsAndCarriedEquipment"));
  const input=element('input');input.type='checkbox';input.dataset.pilotageAssetsIncluded='';label.append(caption,input);
  field.append(label,element('p','',game.i18n.localize("SWFFG.UI.Pilotage.PilotageAssets.ShowCreditsAndCarriedEquipmentInBothGM")));
  input.addEventListener('change',async event=>{
   event.stopPropagation();if(!game.user.isGM||!sheet.isEditable){renderPilotageAssetsField(sheet);return;}
   const checked=input.checked;input.disabled=true;
   try{await actor.setFlag(SYSTEM,INCLUDED,checked);}catch(error){ui.notifications.error(error.message);}
   finally{if(sheet.rendered)renderPilotageAssetsField(sheet);}
  });
  const market=tab.querySelector('.ffg-market-participant');if(market)market.after(field);else tab.prepend(field);
 }
 const input=field.querySelector('input');input.checked=isPilotageAssetsIncluded(actor);input.disabled=!game.user.isGM||!sheet.isEditable;
}
Hooks.on('renderActorSheetFFGV2',renderPilotageAssetsField);
Hooks.on('updateActor',actor=>{for(const app of Object.values(actor.apps??{}))if(app.rendered)renderPilotageAssetsField(app);});


// Publish only the displayed information, without giving access to Actor documents.
const SHARED_ASSETS='pilotageAssetsShared',sharedWindows=new Map(),dismissedShares=new Map();
let sharedWrite=Promise.resolve(),sharedRender=Promise.resolve(),sharedTimer;
function sharedState(){return game.settings.get(SYSTEM,SHARED_ASSETS)??{};}
function assetSnapshot(kind){
 return actors().map(actor=>({id:actor.id,name:actor.name,img:actor.img,
  ...(kind==='credits'?{balances:balances(actor)}:{items:actor.items.filter(item=>isInventoryEquipment(item)&&!isPossession(item)&&(item.type==='gear'||item.system.equippable?.equipped===true))
   .sort((a,b)=>a.name.localeCompare(b.name,'fr',{numeric:true,sensitivity:'base'})).map(item=>({id:item.id,name:item.name,type:item.type,quantity:number(item.system.quantity?.value)}))})
 }));
}
function writeSharedState(change){
 const job=sharedWrite.catch(()=>{}).then(async()=>{
  guard();const state=structuredClone(sharedState());if(change(state)===false)return;
  await game.settings.set(SYSTEM,SHARED_ASSETS,state);
 });sharedWrite=job;return job;
}
export async function publishSharedAssets(kind){
 guard();if(!['credits','possessions'].includes(kind))throw Error(game.i18n.localize("SWFFG.UI.Pilotage.UnknownOverview"));
 await writeSharedState(state=>{state[kind]={session:foundry.utils.randomID(),rows:assetSnapshot(kind)};});
 await syncSharedAssets();
 ui.notifications.info(game.i18n.localize("SWFFG.UI.Pilotage.SharedToTable"));
}
export async function stopSharedAssets(kind){
 guard();if(!['credits','possessions'].includes(kind))throw Error(game.i18n.localize("SWFFG.UI.Pilotage.UnknownOverview"));
 await writeSharedState(state=>{state[kind]=null;});
}
function syncSharedAssets(){
 const job=sharedRender.catch(()=>{}).then(async()=>{
  if(!game.ready)return;const state=sharedState();
  for(const kind of ['credits','possessions']){
   const entry=state[kind];let app=sharedWindows.get(kind);
   if(!entry?.session||!Array.isArray(entry.rows)){
    if(app)await app.close({animate:false});continue;
   }
   if(dismissedShares.get(kind)===entry.session)continue;
   loadStyles();
   if(app){
    const reopen=app.shareSession!==entry.session;app.snapshot=entry.rows;app.shareSession=entry.session;
    if(app.rendered)app.refreshContent();else await app.render({force:true});
    if(reopen)app.bringToFront();
   }else{
    app=new PilotageAssets(kind,{shared:true,snapshot:entry.rows,session:entry.session});sharedWindows.set(kind,app);
    await app.render({force:true});app.bringToFront();
   }
  }
  for(const app of windows.values())if(app.rendered)app.refreshSharingControls();
 });sharedRender=job;return job;
}
function refreshSharedAssetData(){
 if(!game.ready||!game.user.isActiveGM)return;
 clearTimeout(sharedTimer);sharedTimer=setTimeout(()=>{
  void writeSharedState(state=>{
   let changed=false;
   for(const kind of ['credits','possessions'])if(state[kind]?.session){
    const rows=assetSnapshot(kind);
    if(JSON.stringify(state[kind].rows)!==JSON.stringify(rows)){state[kind].rows=rows;changed=true;}
   }return changed;
  }).catch(error=>console.error('Star Wars FFG | Shared character overview',error));
 },100);
}
Hooks.once('init',()=>game.settings.register(SYSTEM,SHARED_ASSETS,{scope:'world',config:false,restricted:true,type:Object,default:{credits:null,possessions:null},onChange:()=>{void syncSharedAssets().catch(error=>console.error('Star Wars FFG | Shared character overview',error));}}));
Hooks.once('ready',()=>{void syncSharedAssets();refreshSharedAssetData();});
for(const hook of ['createActor','updateActor','deleteActor','createItem','updateItem','deleteItem','updateUser'])Hooks.on(hook,refreshSharedAssetData);
