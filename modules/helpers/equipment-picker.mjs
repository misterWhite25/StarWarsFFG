import {medicalItemType} from './medical-item-type.mjs';
import {possessionData} from './inventory-location.js';

const moduleId='swffg-compendium-bilingual-steelers-equipment',packId=moduleId+'.en-items';
const types=new Set(['weapon','armour','gear','shipweapon','shipattachment']),storedTypes=new Set(['weapon','armour','gear']);
const windows=new Map(),queues=new Map();
let pickerStyles;
function loadPickerStyles(){
 if(pickerStyles)return pickerStyles;
 pickerStyles=new Promise((resolve,reject)=>{
  let link=document.querySelector('link[data-equipment-picker]');
  if(link?.sheet){resolve();return;}
  const existing=!!link;if(!link){link=document.createElement('link');link.rel='stylesheet';link.href=new URL('../../styles/equipment-picker.css',import.meta.url).href;link.dataset.equipmentPicker='';}
  link.addEventListener('load',()=>resolve(),{once:true});
  link.addEventListener('error',()=>{link.remove();pickerStyles=null;reject(Error(game.i18n.localize("SWFFG.UI.Equipment.EquipmentStyleFailed")));},{once:true});
  if(!existing)document.head.append(link);
 });return pickerStyles;
}
const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('fr');
const el=(tag,css,text)=>{const node=document.createElement(tag);if(css)node.className=css;if(text!==undefined)node.textContent=text;return node;};
const label=type=>game.i18n.localize('TYPES.Item.'+type);
const allowed=sheet=>sheet.rendered&&sheet.isEditable&&sheet.actor.isOwner&&sheet.actor.verifyEditModeIsNotEnabled();
export function equipmentPack(){const pack=game.packs.get(packId);return game.modules.get(moduleId)?.active&&pack?.documentName==='Item'&&pack.testUserPermission(game.user,'OBSERVER')?pack:null;}
function guard(sheet){if(!allowed(sheet))throw Error(game.i18n.localize("SWFFG.UI.Equipment.SheetCannotReceiveEquipment"));}
function matchesType(type,filter,stored){return types.has(type)&&(!stored||storedTypes.has(type))&&(filter==='all'||type===filter);}
export async function equipmentEntries(){
 const pack=equipmentPack();if(!pack)throw Error(game.i18n.localize("SWFFG.UI.Equipment.EquipmentPackUnavailable"));
 const index=await pack.getIndex({fields:['type','img']});let bilingual=[];
 try{const response=await fetch('modules/'+moduleId+'/catalogue-index.json',{cache:'no-cache'});if(response.ok)bilingual=await response.json();}catch { /* Translations are optional; retain pack names when the bilingual index cannot be read. */ }
 const names=new Map(bilingual.filter(row=>row.uuid?.startsWith('Compendium.'+packId+'.Item.')).map(row=>[row.uuid.split('.').at(-1),row.names]));
 return Array.from(index).filter(row=>types.has(row.type)).map(row=>{
  const translations=names.get(row._id),name=translations?.[game.i18n.lang==='fr'?'fr':'en']||row.name;
  return {id:row._id,type:row.type,img:row.img,name,search:normalize([row.name,translations?.fr,translations?.en,label(row.type)].filter(Boolean).join(' '))};
 }).sort((a,b)=>a.name.localeCompare(b.name,game.i18n.lang,{numeric:true,sensitivity:'base'}));
}
export function addEquipmentFromPack(sheet,id,{type='all',stored=false,quantity=1}={}){
 const key=sheet.actor.uuid,previous=queues.get(key)??Promise.resolve();
 const task=previous.catch(()=>{}).then(async()=>{
  guard(sheet);const pack=equipmentPack();if(!pack)throw Error(game.i18n.localize("SWFFG.UI.Equipment.EquipmentPackNoLongerAvailable"));
  if(!Number.isSafeInteger(quantity)||quantity<1||quantity>9999)throw Error(game.i18n.localize("SWFFG.UI.Equipment.EquipmentQuantityInvalid"));
  const source=await pack.getDocument(id);guard(sheet);
  if(equipmentPack()!==pack||!source||source.pack!==packId||!matchesType(source.type,type,stored))throw Error(game.i18n.localize("SWFFG.UI.Equipment.EquipmentCategoryUnavailable"));
  let data=source.toObject(false);delete data._id;delete data.folder;
  data.effects=source.effects.map(effect=>effect.toObject());data._stats={compendiumSource:source.uuid};
  const medicalType=medicalItemType(source);
  if(medicalType){data.flags??={};data.flags.starwarsffg??={};data.flags.starwarsffg.config??={};data.flags.starwarsffg.config.medicalType=medicalType;}
  data.system??={};data.system.quantity??={};data.system.quantity.value=quantity;
  if(['weapon','armour'].includes(data.type)){
   data.system.equippable??={};data.system.equippable.equipped=false;
   for(const effect of data.effects)if(effect.name!=='(inherent)')effect.disabled=true;
  }
  if(stored)data=possessionData(data);
  else if(storedTypes.has(data.type)){data.flags??={};data.flags.starwarsffg??={};data.flags.starwarsffg.inventoryLocation='carried';}
  const [created]=await sheet.actor.createEmbeddedDocuments('Item',[data]);
  if(!created)throw Error(game.i18n.localize("SWFFG.UI.Equipment.EquipmentCreationRejected"));return created;
 });queues.set(key,task);task.finally(()=>{if(queues.get(key)===task)queues.delete(key);}).catch(()=>{});return task;
}
class EquipmentPicker extends foundry.applications.api.ApplicationV2{
 static DEFAULT_OPTIONS={classes:['starwarsffg','themed','ffg-equipment-picker'],window:{resizable:true},position:{width:720,height:640}};
 constructor(sheet,{type,stored,createBlank}){
  const key=sheet.actor.uuid+':'+(stored?'stored':type);super({id:'ffg-equipment-picker-'+key.replace(/[^a-z0-9]/gi,'-'),window:{title:game.i18n.format(stored?"SWFFG.UI.Equipment.AddPossessionTitle":"SWFFG.UI.Equipment.AddEquipmentTitle",{name:sheet.actor.name})},position:{width:Math.min(720,innerWidth-32),height:Math.min(640,innerHeight-40)}});
  this.key=key;this.sheet=sheet;this.type=type;this.stored=stored;this.createBlank=createBlank;this.page=0;this.query='';this.busy=false;this.entries=null;
 }
 async _renderHTML(){
  if(this.root)return this.root;
  // Resolve styling and data while the window is still detached.
  const [,loaded]=await Promise.all([loadPickerStyles(),equipmentEntries().then(entries=>({entries}),error=>({error}))]);
  this.entries=loaded.entries??[];this.loadError=loaded.error;
  this.root=el('section','ffg-equipment-picker-content');
  const tools=el('div','ffg-equipment-picker-tools'),searchLabel=el('label','',game.i18n.localize("SWFFG.UI.Equipment.Search"));this.search=el('input');this.search.type='search';this.search.placeholder=game.i18n.localize("SWFFG.UI.Equipment.BilingualNamePlaceholder");this.search.setAttribute('aria-label',game.i18n.localize("SWFFG.UI.Equipment.SearchEquipment"));searchLabel.append(this.search);tools.append(searchLabel);
  if(this.stored){const categoryLabel=el('label','',game.i18n.localize("SWFFG.UI.Equipment.Category"));this.category=el('select');this.category.setAttribute('aria-label',game.i18n.localize("SWFFG.UI.Equipment.Category"));for(const type of ['all',...storedTypes]){const option=el('option','',type==='all'?game.i18n.localize("SWFFG.UI.Equipment.AllCategories"):label(type));option.value=type;this.category.append(option);}categoryLabel.append(this.category);tools.append(categoryLabel);this.category.addEventListener('change',()=>{this.page=0;this.refresh();});}
  const quantityLabel=el('label','ffg-equipment-picker-quantity',game.i18n.localize("SWFFG.UI.Equipment.Quantity"));this.quantity=el('input');this.quantity.type='number';this.quantity.min='1';this.quantity.max='9999';this.quantity.step='1';this.quantity.value='1';this.quantity.setAttribute('aria-label',game.i18n.localize("SWFFG.UI.Equipment.QuantityToAdd"));quantityLabel.append(this.quantity);tools.append(quantityLabel);
  this.search.addEventListener('input',()=>{this.query=this.search.value;this.page=0;this.refresh();});
  this.counter=el('p','ffg-equipment-picker-note',game.i18n.localize("SWFFG.UI.Equipment.LoadingCompendium"));this.counter.setAttribute('aria-live','polite');
  this.results=el('div','ffg-equipment-picker-results');this.results.setAttribute('aria-label',game.i18n.localize("SWFFG.UI.Equipment.CompendiumEquipment"));
  const pagination=el('div','ffg-equipment-picker-pagination');this.previous=el('button','',game.i18n.localize("SWFFG.UI.Equipment.Previous"));this.next=el('button','',game.i18n.localize("SWFFG.UI.Equipment.Next"));this.position=el('span');
  for(const [button,delta]of [[this.previous,-1],[this.next,1]]){button.type='button';button.addEventListener('click',()=>{this.page+=delta;this.refresh();this.results.scrollTop=0;});}pagination.append(this.previous,this.position,this.next);
  this.message=el('p','ffg-equipment-picker-feedback');this.message.setAttribute('role','status');this.message.hidden=true;
  const footer=el('footer');this.blank=el('button','',game.i18n.localize("SWFFG.UI.Equipment.CreateBlankEquipment"));this.blank.type='button';this.blank.addEventListener('click',()=>{void this.newItem();});const close=el('button','',game.i18n.localize("SWFFG.UI.Equipment.Close"));close.type='button';close.addEventListener('click',()=>{void this.close();});footer.append(this.blank,close);
  this.root.append(tools,this.counter,this.results,pagination,this.message,footer);
  this.refresh();
  if(this.loadError){this.counter.textContent=game.i18n.localize("SWFFG.UI.Equipment.SearchUnavailable");this.showMessage(this.loadError.message,true);this.previous.disabled=this.next.disabled=true;}
  return this.root;
 }
 _replaceHTML(result,content){content.replaceChildren(result);}
 async _onRender(context,options){
  await super._onRender(context,options);
  if(options.isFirstRender)this.search.focus({preventScroll:true});
 }
 _onClose(options){super._onClose(options);if(windows.get(this.key)===this)windows.delete(this.key);}
 showMessage(message,error=false){this.message.textContent=message;this.message.hidden=false;this.message.classList.toggle('is-error',error);}
 refresh(){
  if(!this.entries)return;
  const tokens=normalize(this.query).trim().split(/\s+/).filter(Boolean),filter=this.stored?this.category.value:this.type;
  const rows=this.entries.filter(row=>matchesType(row.type,filter,this.stored)&&tokens.every(token=>row.search.includes(token))),pages=Math.max(1,Math.ceil(rows.length/40));this.page=Math.max(0,Math.min(pages-1,this.page));
  this.counter.textContent=game.i18n.format(rows.length===1?"SWFFG.UI.Equipment.EquipmentResultOne":"SWFFG.UI.Equipment.EquipmentResultMany",{count:rows.length});this.position.textContent=(this.page+1)+' / '+pages;this.previous.disabled=this.busy||this.page===0;this.next.disabled=this.busy||this.page>=pages-1;
  this.results.replaceChildren();
  if(!rows.length)this.results.append(el('p','ffg-equipment-picker-note',game.i18n.localize("SWFFG.UI.Equipment.NoEquipmentMatch")));
  for(const entry of rows.slice(this.page*40,(this.page+1)*40)){
   const row=el('div','ffg-equipment-picker-row');row.dataset.entryId=entry.id;
   const image=el('img');image.src=entry.img||'icons/svg/item-bag.svg';image.alt='';image.loading='lazy';
   const text=el('div','ffg-equipment-picker-name');text.append(el('strong','',entry.name),el('small','',label(entry.type)));
   const preview=el('button','ffg-equipment-picker-preview');preview.type='button';preview.title=game.i18n.format("SWFFG.UI.Equipment.PreviewSheet",{name:entry.name});preview.setAttribute('aria-label',preview.title);const icon=el('i','fa-solid fa-book-open');icon.setAttribute('aria-hidden','true');preview.append(icon);preview.disabled=this.busy;preview.addEventListener('click',()=>{void this.preview(entry);});
   const add=el('button','ffg-equipment-picker-add',game.i18n.localize("SWFFG.UI.Equipment.Add"));add.type='button';add.disabled=this.busy;add.setAttribute('aria-label',game.i18n.format("SWFFG.UI.Equipment.AddNamedEquipment",{name:entry.name}));add.addEventListener('click',()=>{void this.add(entry);});
   row.append(image,text,preview,add);this.results.append(row);
  }
  this.quantity.disabled=this.busy;this.blank.disabled=this.busy;this.search.disabled=this.busy;if(this.category)this.category.disabled=this.busy;
 }
 async preview(entry){try{const pack=equipmentPack();if(!pack)throw Error(game.i18n.localize("SWFFG.UI.Equipment.CompendiumUnavailable"));const item=await pack.getDocument(entry.id);if(!item)throw Error(game.i18n.localize("SWFFG.UI.Equipment.SheetUnavailable"));await item.sheet.render({force:true});}catch(error){this.showMessage(error.message,true);}}
 async add(entry){
  if(this.busy)return;const quantity=Number(this.quantity.value);this.busy=true;this.refresh();
  try{const created=await addEquipmentFromPack(this.sheet,entry.id,{type:this.type,stored:this.stored,quantity});this.showMessage(game.i18n.format("SWFFG.UI.Equipment.AddedEquipment",{name:entry.name,quantity:quantity>1?' × '+quantity:'',destination:this.stored?game.i18n.localize("SWFFG.UI.Equipment.PossessionsDestination"):game.i18n.localize("SWFFG.UI.Equipment.CarriedDestination"),actor:this.sheet.actor.name}));return created;}
  catch(error){this.showMessage(error.message,true);}finally{this.busy=false;if(this.rendered)this.refresh();}
 }
 async newItem(){if(this.busy)return;try{guard(this.sheet);await this.close({animate:false});await this.createBlank();}catch(error){ui.notifications.warn(error.message);}}
}
export async function openEquipmentPicker(sheet,{type='all',stored=false,createBlank}={}){
 if((!stored&&!types.has(type))||!equipmentPack())return false;guard(sheet);
 const key=sheet.actor.uuid+':'+(stored?'stored':type);let app=windows.get(key);
 if(!app){app=new EquipmentPicker(sheet,{type,stored,createBlank});windows.set(key,app);}await app.render({force:true});if(app.minimized)await app.maximize();app.bringToFront();return true;
}
