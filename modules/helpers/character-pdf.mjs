import {summarizeItemQualities} from './item-view-data.mjs';

const l=key=>game.i18n.localize(key),p=key=>l('SWFFG.UI.Pdf.'+key);
const clean=value=>String(value??'').replace(/[\u2011-\u2014]/g,'-');
const scalar=value=>value&&typeof value==='object'?(value.adjusted??value.value??value.current??value.uses??value.label??''):(value??'');
const validUrl=(value,base)=>{if(!value)return '';try{const url=new URL(value,base);return ['http:','https:'].includes(url.protocol)||url.protocol==='data:'&&/^data:image\//i.test(value)?url.href:'';}catch{return '';}};
const symbols={AB:'ABILITY',ABILITY:'ABILITY',PR:'PROFICIENCY',PROFICIENCY:'PROFICIENCY',DI:'DIFFICULTY',DIFFICULTY:'DIFFICULTY',CH:'CHALLENGE',CHALLENGE:'CHALLENGE',BO:'BOOST',BOOST:'BOOST',SE:'SETBACK',SETBACK:'SETBACK',FO:'FORCE',FORCE:'FORCE',SU:'SUCCESS',AD:'ADVANTAGE',TR:'TRIUMPH',FA:'FAILURE',TH:'THREAT',DE:'DESPAIR',LI:'LIGHT',DA:'DARK',RS:'REMOVESETBACK',REMSETBACK:'REMOVESETBACK'};
const resultSymbols=new Set(['SUCCESS','ADVANTAGE','TRIUMPH','FAILURE','THREAT','DESPAIR']);
const dieClass=symbol=>'rule-die'+(resultSymbols.has(symbol)?' rule-symbol':'')+(['LIGHT','DARK'].includes(symbol)?' force-pip':'');

function element(doc,tag,text,cls){const el=doc.createElement(tag);if(text!==undefined)el.textContent=clean(text);if(cls)el.className=cls;return el;}
function section(doc,parent,title){const el=element(doc,'section',undefined,'pdf-section');el.append(element(doc,'h2',title));parent.append(el);return el;}
function table(doc,parent,head,rows){
 const el=element(doc,'table'),thead=element(doc,'thead'),tr=element(doc,'tr');
 for(const label of head)tr.append(element(doc,'th',label));thead.append(tr);el.append(thead);
 const tbody=element(doc,'tbody');for(const row of rows){const tr=element(doc,'tr');for(const value of row){const td=element(doc,'td');if(value?.nodeType)td.append(value);else td.textContent=clean(value);tr.append(td);}tbody.append(tr);}el.append(tbody);parent.append(el);return el;
}
function textLabel(key){const value=l(key);return value===key?key.split('.').at(-1).replace(/([a-z])([A-Z])/g,'$1 $2'):value;}

/** Keep rich rules text, but remove active content and honor the reader's secret visibility. */
export async function printableDescription(doc,html,actor,base){
 const enriched=await foundry.applications.ux.TextEditor.enrichHTML(String(html??''),{secrets:actor.isOwner,relativeTo:actor,async:true});
 const inert=new DOMParser().parseFromString(enriched,'text/html'),fragment=element(doc,'div',undefined,'description');
 inert.body.querySelectorAll('script,style,link,meta,base,iframe,object,embed,form,input,button,textarea,select,audio,video,canvas').forEach(el=>el.remove());
 // Foundry's enrichers replace markers with font glyphs. Convert those before
 // stripping interface classes, so the printed rules do not depend on that font.
 for(const glyph of inert.body.querySelectorAll('.dietype')){
  const names=[...glyph.classList].map(name=>({REMSETBACK:'REMOVESETBACK'}[name.toUpperCase()]??name.toUpperCase()));
  const symbol=names.find(name=>CONFIG.FFG[name+'_ICON']);
  if(!symbol){
   const label=names.find(name=>['FORCEPOINT','RESTRICTED','ADDDIFFICULTY','UPDIFFICULTY','CANCELTHREAT'].includes(name));
   if(label)glyph.replaceWith(inert.createTextNode(p(label)));
   continue;
  }
  const count=Math.max(1,glyph.textContent.trim().length),nodes=[];
  for(let i=0;i<(count>10?1:count);i++){
   const img=element(inert,'img');img.src=validUrl(CONFIG.FFG[symbol+'_ICON'],base);img.alt='['+symbol+']';nodes.push(img);
  }
  if(count>10)nodes.push(inert.createTextNode(' × '+count));glyph.replaceWith(...nodes);
 }
 for(const el of inert.body.querySelectorAll('*')){
  for(const attr of [...el.attributes])if(!['src','alt','colspan','rowspan'].includes(attr.name))el.removeAttribute(attr.name);
  if(el.tagName==='IMG'){
   const src=validUrl(el.getAttribute('src'),base);if(!src){el.remove();continue;}el.src=src;
   const symbol=Object.values(symbols).find(name=>validUrl(CONFIG.FFG[name+'_ICON'],base)===src);
   if(symbol)el.className=dieClass(symbol);
  }
 }
 fragment.append(...Array.from(inert.body.childNodes,node=>doc.importNode(node,true)));
 const walker=doc.createTreeWalker(fragment,4),nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
 for(const node of nodes){
  const text=clean(node.nodeValue),pattern=/\[([A-Z]+)\]|:([a-z]+):/gi;let from=0,match,parts=[];
  while((match=pattern.exec(text))){const symbol=symbols[(match[1]??match[2]).toUpperCase()],src=CONFIG.FFG[symbol+'_ICON'];if(!symbol||!src)continue;
   parts.push(doc.createTextNode(text.slice(from,match.index)));const img=element(doc,'img');img.src=validUrl(src,base);img.alt=match[0];img.className=dieClass(symbol);parts.push(img);from=pattern.lastIndex;
  }
  if(parts.length){parts.push(doc.createTextNode(text.slice(from)));node.replaceWith(...parts);}else node.nodeValue=text;
 }
 return fragment;
}

function stat(doc,parent,label,value,note=''){
 const box=element(doc,'div',undefined,'stat');box.append(element(doc,'span',label),element(doc,'strong',value));if(note)box.append(element(doc,'small',note));parent.append(box);
}
function itemStats(item){
 const s=item.system??{},rows=[];
 const inventory=['weapon','armour','gear','shipweapon'].includes(item.type);
 for(const [key,label]of [['damage','SWFFG.UI.Equipment.Damage'],['crit','SWFFG.UI.Equipment.Critical'],['range','SWFFG.UI.Equipment.Range'],['skill','SWFFG.SkillsName'],['soak','SWFFG.Soak'],['defence','SWFFG.Defense'],['quantity','SWFFG.UI.Equipment.Quantity'],['encumbrance','SWFFG.Encumbrance'],['price','SWFFG.Price'],['rarity','SWFFG.Rarity'],['severity','SWFFG.Severity'],['magnitude','SWFFG.MotivationMagnitude']]){
  if(!inventory&&!['severity','magnitude'].includes(key))continue;
  if(s[key]===undefined)continue;
  let value=scalar(s[key]);
  if(key==='skill'){if(!value)continue;value=l(CONFIG.FFG.skills[value]?.label??String(value));}
  if(key==='range')value=l(String(s[key]?.label??value));
  if(value!=='')rows.push((key==='skill'?p('Skill'):textLabel(label))+' : '+value);
 }
 if(['weapon','armour','gear'].includes(item.type))rows.push(item.flags?.starwarsffg?.inventoryLocation==='possession'?p('Possession'):s.equippable?.equipped?p('Equipped'):p('Carried'));
 return rows.join(' · ');
}

export async function buildCharacterPrintDocument(actor,doc,{base=window.location.href}={}){
 if(actor?.type!=='character'||actor.limited||!actor.testUserPermission(game.user,'OBSERVER'))throw Error(p('Permission'));
 const [{get_dice_pool},{DicePoolFFG}]=await Promise.all([import('./dice-helpers.js'),import('../dice/pool.js')]);
 const root=element(doc,'main'),system=actor.system,items=Array.from(actor.items??[]),describe=html=>printableDescription(doc,html,actor,base);
 const summary=element(doc,'section',undefined,'summary'),header=element(doc,'header',undefined,'identity'),identity=element(doc,'div');
 identity.append(element(doc,'small','Star Wars FFG'),element(doc,'h1',actor.name));
 for(const [type,label]of [['species','SWFFG.Species'],['career','SWFFG.Career'],['specialization','SWFFG.Specializations']]){
  const names=items.filter(item=>item.type===type).map(item=>item.name);if(names.length)identity.append(element(doc,'p',textLabel(label)+' : '+names.join(', ')));
 }
 header.append(identity);const portrait=validUrl(actor.img,base);if(portrait){const img=element(doc,'img',undefined,'portrait'+(portrait.endsWith('/mystery-man.svg')?' placeholder':''));img.src=portrait;img.alt=actor.name;header.append(img);}summary.append(header);root.append(summary);
 const traits=element(doc,'div',undefined,'traits');for(const [key,data]of Object.entries(system.characteristics??{}))stat(doc,traits,l(data.label??CONFIG.FFG.characteristics?.[key]?.label??key),scalar(data));summary.append(traits);
 const stats=element(doc,'div',undefined,'stats');
 const statLabels={wounds:'SWFFG.Wounds',strain:'SWFFG.Strain',soak:'SWFFG.Soak',defence:'SWFFG.Defense',encumbrance:'SWFFG.Encumbrance',credits:'SWFFG.DescriptionCredits',forcePool:'SWFFG.ForcePool',medical:'SWFFG.Medical'};
 for(const [key,data]of Object.entries(system.stats??{})){
  if(!Object.hasOwn(statLabels,key)&&!data?.label)continue;
  if(key==='defence'){stat(doc,stats,textLabel(statLabels[key]),(data.melee??0)+' / '+(data.ranged??0),textLabel('SWFFG.DefenseMelee')+' / '+textLabel('SWFFG.DefenseRanged'));continue;}
  if(data==null||typeof scalar(data)==='object')continue;
  const value=data.max!==undefined?(data.value??0)+' / '+data.max:scalar(data);if(value==='')continue;
  stat(doc,stats,textLabel(statLabels[key]??data.label??key),value,data.max!==undefined?(key==='forcePool'?textLabel('SWFFG.ForcePoolCommitted')+' / '+textLabel('SWFFG.ForcePoolAvailable'):p('CurrentThreshold')):'');
 }
 stat(doc,stats,textLabel('SWFFG.DescriptionXP'),(system.experience?.available??0)+' / '+(system.experience?.total??0),p('AvailableTotal'));
 if(system.stats?.credits?.reserve!==undefined)stat(doc,stats,p('ReserveCredits'),system.stats.credits.reserve);
 for(const [key,label]of [['obligation','SWFFG.DescriptionObligation'],['duty','SWFFG.DescriptionDuty'],['morality','SWFFG.DescriptionMorality'],['conflict','SWFFG.DescriptionConflict']])if(system[key]?.value!==undefined&&(Number(system[key].value)!==0||items.some(item=>item.type===(key==='conflict'?'morality':key))))stat(doc,stats,textLabel(label),system[key].value);
 summary.append(stats);
 const skills=Object.entries(system.skills??{}).filter(([key,skill])=>skill.custom||CONFIG.FFG.skills[key]).sort(([a,x],[b,y])=>l(x.label??CONFIG.FFG.skills[a]?.label??a).localeCompare(l(y.label??CONFIG.FFG.skills[b]?.label??b),game.i18n.lang));
 const skillsSection=section(doc,summary,p('Skills')),columns=element(doc,'div',undefined,'skill-columns');skillsSection.append(columns);
 const skillRows=skills.map(([key,skill])=>{
  const roll=element(doc,'span',undefined,'skill-pool');
  if(system.characteristics?.[skill.characteristic]){
   const pool=get_dice_pool(actor,key,new DicePoolFFG({difficulty:0}));const preview=pool.renderPreview();
   for(const img of preview.querySelectorAll('img')){const copy=img.cloneNode();copy.src=validUrl(img.getAttribute('src'),base);copy.removeAttribute('style');copy.width=13;copy.height=13;const symbol=Object.values(symbols).find(name=>validUrl(CONFIG.FFG[name+'_ICON'],base)===copy.src);if(symbol)copy.className=dieClass(symbol);roll.append(copy);}
  }
  const characteristic=CONFIG.FFG.characteristics?.[skill.characteristic];
  return [l(skill.label??CONFIG.FFG.skills[key]?.label??key),l(characteristic?.abrev??characteristic?.label??skill.characteristic??''),skill.careerskill?p('Yes'):'-',skill.rank??0,roll];
 });
 const mid=Math.ceil(skillRows.length/2);for(const rows of [skillRows.slice(0,mid),skillRows.slice(mid)])table(doc,columns,[textLabel('SWFFG.SkillsName'),p('Characteristic'),textLabel('SWFFG.SkillsCS'),textLabel('SWFFG.SkillsRank'),textLabel('SWFFG.SkillsRoll')],rows);
 const entry=async(parent,name,description,meta='')=>{const card=element(doc,'article',undefined,'entry');card.append(element(doc,'h3',name));if(meta)card.append(element(doc,'div',meta,'meta'));if(description)card.append(await describe(description));parent.append(card);return card;};
 const talents=Array.from(actor.talentList??[]);if(talents.length){const group=section(doc,root,textLabel('SWFFG.Talents'));for(const talent of talents){const details=[l(talent.activationLabel??talent.activation??''),talent.isRanked?p('Rank')+' '+talent.rank:'',...(talent.source??[]).map(source=>source.name)].filter(Boolean);await entry(group,talent.name,talent.description,details.join(' · '));}}
 const itemTypes=[...new Set(items.map(item=>item.type))].filter(type=>type!=='talent');
 const priority=['weapon','armour','gear','forcepower','signatureability','ability','criticalinjury','obligation','duty','morality','motivation','background','species','career','specialization'];itemTypes.sort((a,b)=>(priority.indexOf(a)<0?99:priority.indexOf(a))-(priority.indexOf(b)<0?99:priority.indexOf(b)));
 for(const type of itemTypes){
  const group=section(doc,root,textLabel('TYPES.Item.'+type));
  for(const item of items.filter(item=>item.type===type)){
   const card=await entry(group,item.name,item.system?.description,itemStats(item));
   if(item.system?.special?.value)card.append(await describe(item.system.special.value));
   for(const quality of summarizeItemQualities(item.system))await entry(card,quality.name+' '+quality.totalRanks,quality.description);
   for(const attachment of item.system?.itemattachment??[])await entry(card,attachment.name,attachment.system?.description);
   const upgrades=item.powerUpgrades??Object.values(item.system?.upgrades??{}).filter(upgrade=>upgrade?.islearned);
   for(const upgrade of upgrades)await entry(card,upgrade.name,upgrade.description,p('Rank')+' '+(upgrade.rank??1));
  }
 }
 const general=system.general??{},bio=section(doc,root,textLabel('SWFFG.TabGeneralBiography'));
 const fields=Object.entries({gender:'SWFFG.Gender',age:'SWFFG.Age',height:'SWFFG.Height',build:'SWFFG.Build',hair:'SWFFG.Hair',eyes:'SWFFG.Eyes'}).filter(([key])=>general[key]!==''&&general[key]!=null);
 if(fields.length)table(doc,bio,[p('Field'),p('Value')],fields.map(([key,label])=>[textLabel(label),general[key]]));
 for(const [label,html]of [['SWFFG.NotableFeature',general.features],['SWFFG.Notes',general.notes],['SWFFG.TabBiography',system.biography]])if(html)await entry(bio,textLabel(label),html);
 const attributes=Object.entries(system.attributes??{}).filter(([,field])=>field?.value!==undefined&&field.value!=='');if(attributes.length)table(doc,bio,[p('Field'),p('Value')],attributes.map(([key,field])=>[field.label??key,scalar(field)]));
 if(!bio.querySelector('article,table'))bio.remove();
 const effectField=key=>{
  const parts=String(key).split('.'),kind=parts[1],name=parts[2],suffix=parts[3];
  const label=kind==='stats'?statLabels[name]:kind==='skills'?CONFIG.FFG.skills[name]?.label:kind==='characteristics'?CONFIG.FFG.characteristics[name]?.label:undefined;
  if(!label)return key;
  const detail={boost:'SWFFG.UI.Pilotage.Boost',setback:'SWFFG.UI.Pilotage.Setback',rank:'SWFFG.SkillsRank',max:'SWFFG.Threshold'}[suffix];
  return l(label)+(detail?' - '+l(detail):'');
 };
 const effects=Array.from(actor.effects??[]);if(effects.length){const group=section(doc,root,textLabel('SWFFG.TabEffects'));for(const effect of effects){const card=await entry(group,effect.name,effect.description,effect.disabled?p('Inactive'):p('Active'));if(effect.changes?.length)table(doc,card,[p('Field'),p('Operation'),p('Value')],effect.changes.map(change=>[effectField(change.key),p(['Custom','Multiply','Add','Minimum','Maximum','Replace'][change.mode]??'Custom'),change.value]));}}
 const logs=actor.getFlag('starwarsffg','xpLog')??[];if(logs.length){const group=section(doc,root,textLabel('SWFFG.TabXpLog'));table(doc,group,[p('Date'),p('Description'),textLabel('SWFFG.DescriptionXP'),p('AvailableTotal')],logs.map(log=>[log.date??'',log.description??log.action??'',log.xp?.cost??'',(log.xp?.available??'')+' / '+(log.xp?.total??'')]));}
 return root;
}

export async function exportCharacterPdf(actor,popup){
 if(popup.closed)return;
 const doc=popup.document,base=window.location.href;
 const body=await buildCharacterPrintDocument(actor,doc,{base});if(popup.closed)return;
 const titleText=clean(actor.name)+' - '+p('CharacterSheet');doc.documentElement.lang=game.i18n.lang;doc.head.replaceChildren();
 const charset=element(doc,'meta');charset.setAttribute('charset','UTF-8');doc.head.append(charset);
 const title=element(doc,'title',titleText),style=element(doc,'link');style.rel='stylesheet';style.href=new URL('../../styles/character-pdf.css',import.meta.url).href;
 const styled=new Promise(resolve=>{style.onload=resolve;style.onerror=resolve;});doc.head.append(title,style);
 const toolbar=element(doc,'nav',undefined,'print-toolbar'),hint=element(doc,'span',p('SaveHint')),button=element(doc,'button',p('Export'));button.type='button';button.addEventListener('click',()=>popup.print());toolbar.append(hint,button);doc.body.replaceChildren(toolbar,body);
 await styled;await doc.fonts.ready;
 const images=[...doc.images];await Promise.race([Promise.all(images.map(img=>img.decode().catch(()=>{}))),new Promise(resolve=>setTimeout(resolve,8000))]);
 if(popup.closed)return;for(const image of images)if(!image.complete||!image.naturalWidth)image.replaceWith(doc.createTextNode(clean(image.alt)));
 popup.focus();popup.print();
}
