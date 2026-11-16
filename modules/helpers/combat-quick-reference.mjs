import {combatReferences} from './combat-quick-reference-data.mjs';

const windows=new Map();
const localize=value=>game.i18n.localize(value);
const translated=value=>Array.isArray(value)?value.map(translated):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,translated(item)])):typeof value==='string'&&value.startsWith('SWFFG.UI.CombatReference.')?localize(value):value;
const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase(game.i18n.lang);
const element=(tag,css,text)=>{const node=document.createElement(tag);if(css)node.className=css;if(text!==undefined)node.textContent=text;return node;};
function textWithDice(text){
 const fragment=document.createDocumentFragment();
 for(const part of text.split(/(\[(?:BO|SE|DI)\])/g)){
  const die={'[BO]':['blue',localize('SWFFG.UI.CombatReference.DieBoost')],'[SE]':['black',localize('SWFFG.UI.CombatReference.DieSetback')],'[DI]':['purple',localize('SWFFG.UI.CombatReference.DieDifficulty')]}[part];
  if(!die){fragment.append(document.createTextNode(part));continue;}
  const image=element('img','ffg-combat-reference-die');image.src=`systems/starwarsffg/images/dice/starwars/${die[0]}.png`;image.alt=die[1];image.title=die[1];image.width=18;image.height=18;fragment.append(image);
 }return fragment;
}
function loadStyles(){
 if(document.querySelector('link[data-combat-reference]'))return;
 const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('../../styles/combat-quick-reference.css',import.meta.url).href;link.dataset.combatReference='';document.head.append(link);
}
class CombatReference extends foundry.applications.api.ApplicationV2{
 static DEFAULT_OPTIONS={classes:['starwarsffg','themed','ffg-combat-reference'],window:{resizable:true},position:{width:850,height:760}};
 constructor(kind){
  const data=translated(combatReferences[kind]);super({id:'ffg-combat-reference-'+kind,window:{title:data.title},position:{width:Math.min(850,window.innerWidth-32),height:Math.min(760,window.innerHeight-40)}});
  this.kind=kind;this.data=data;this.category='all';this.query='';
 }
 async _renderHTML(){
  if(this.root){this.refresh();return this.root;}
  this.root=element('section','ffg-combat-reference-content');
  const heading=element('header','ffg-combat-reference-heading');heading.append(element('p','ffg-combat-reference-eyebrow',localize('SWFFG.UI.CombatReference.Heading')),element('h2','',this.data.title),element('p','ffg-combat-reference-subtitle',this.data.subtitle));
  const budget=element('div','ffg-combat-reference-budget');
  for(const [label,value]of this.data.budget){const cell=element('div');cell.append(element('strong','',label),element('span','',value));budget.append(cell);}
  const reminder=element('p','ffg-combat-reference-note',this.data.reminder);
  const tools=element('div','ffg-combat-reference-tools'),label=element('label','',localize('SWFFG.UI.CombatReference.Search'));
  this.search=element('input');this.search.type='search';this.search.placeholder=localize('SWFFG.UI.CombatReference.SearchPlaceholder');this.search.addEventListener('input',()=>{this.query=this.search.value;this.refresh();});label.append(this.search);
  const filters=element('div','ffg-combat-reference-filters');filters.setAttribute('aria-label',localize('SWFFG.UI.CombatReference.ActivityTypes'));
  for(const [value,title]of [['all',localize('SWFFG.UI.CombatReference.All')],['incidentals',localize('SWFFG.UI.CombatReference.Incidentals')],['maneuvers',localize('SWFFG.UI.CombatReference.Maneuvers')],['actions',localize('SWFFG.UI.CombatReference.Actions')]]){
   const button=element('button','',title);button.type='button';button.dataset.category=value;button.setAttribute('aria-pressed',String(value===this.category));
   button.addEventListener('click',()=>{this.category=value;this.refresh();});filters.append(button);
  }
  this.counter=element('span','ffg-combat-reference-count');this.counter.setAttribute('aria-live','polite');filters.append(this.counter);tools.append(label,filters);
  this.body=element('div','ffg-combat-reference-body');this.body.tabIndex=0;this.body.setAttribute('aria-label',localize('SWFFG.UI.CombatReference.Body'));
  const source=element('footer','ffg-combat-reference-source',this.data.source);
  this.root.append(heading,budget,reminder,tools,this.body,source);this.refresh();return this.root;
 }
 _replaceHTML(result,content){content.replaceChildren(result);}
 refresh(){
  const query=normalize(this.query);this.body.replaceChildren();let count=0;
  for(const button of this.root.querySelectorAll('[data-category]'))button.setAttribute('aria-pressed',String(button.dataset.category===this.category));
  for(const group of this.data.groups){
   if(this.category!=='all'&&this.category!==group.key)continue;
   const rows=group.rows.filter(row=>(!row.minSize||typeof this.silhouette!=='number'||this.silhouette>=row.minSize)&&(!query||normalize([row.name,row.detail,row.condition,group.title].join(' ')).includes(query)));if(!rows.length)continue;
   const section=element('section','ffg-combat-reference-group');section.dataset.group=group.key;
   section.append(element('h3','',group.title),element('p','ffg-combat-reference-note',group.caption));
   const list=element('dl');
   for(const row of rows){
    const entry=element('div','ffg-combat-reference-entry'),term=element('dt','',row.name),detail=element('dd');
    if(row.condition)term.append(element('small','',row.condition));detail.append(textWithDice(row.detail));entry.append(term,detail);list.append(entry);count++;
   }section.append(list);this.body.append(section);
  }
  this.counter.textContent=game.i18n.format(count===1?'SWFFG.UI.CombatReference.CountOne':'SWFFG.UI.CombatReference.CountMany',{count});
  if(!count)this.body.append(element('p','ffg-combat-reference-note',localize('SWFFG.UI.CombatReference.Empty')));
  if(this.data.aids&&(this.category==='all'||this.category==='maneuvers'||this.category==='actions')){
   const aids=element('div','ffg-combat-reference-aids');
   for(const aid of this.data.aids){
    if(query&&!normalize(JSON.stringify(aid)).includes(query))continue;
    if(this.category==='maneuvers'&&aid.category!=='maneuvers')continue;
    if(this.category==='actions'&&aid.category!=='actions')continue;
    const section=element('section','ffg-combat-reference-aid');section.append(element('h3','',aid.title));
    const list=element('dl');for(const [name,text]of aid.rows){const row=element('div'),term=element('dt','',name),detail=element('dd');detail.append(textWithDice(text));row.append(term,detail);list.append(row);}
    section.append(list,element('p','ffg-combat-reference-note',aid.note));aids.append(section);
   }if(aids.childElementCount)this.body.append(aids);
  }
  this.body.scrollTop=0;
 }
 _onClose(options){super._onClose(options);if(windows.get(this.kind)===this)windows.delete(this.kind);}
}
export async function showCombatReference(kind,options={}){
 if(!Object.hasOwn(combatReferences,kind))throw Error(localize('SWFFG.UI.CombatReference.Unknown'));loadStyles();
 let app=windows.get(kind);if(!app){app=new CombatReference(kind);windows.set(kind,app);}app.silhouette=typeof options.silhouette==='number'?options.silhouette:null;await app.render({force:true});app.bringToFront();return app;
}
