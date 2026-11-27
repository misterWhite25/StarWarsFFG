import {legacyMotivations, summarizeItemQualities} from './item-view-data.mjs';

const l=key=>game.i18n.localize(key),p=key=>l('SWFFG.UI.Pdf.'+key);
const clean=value=>String(value??'').replace(/[\u2011-\u2014]/g,'-');
const scalar=value=>value&&typeof value==='object'?(value.adjusted??value.value??value.current??value.uses??value.label??''):(value??'');
const validUrl=(value,base)=>{if(!value)return '';try{const url=new URL(value,base);return ['http:','https:'].includes(url.protocol)||url.protocol==='data:'&&/^data:image\//i.test(value)?url.href:'';}catch{return '';}};
const symbols={AB:'ABILITY',ABILITY:'ABILITY',PR:'PROFICIENCY',PROFICIENCY:'PROFICIENCY',DI:'DIFFICULTY',DIFFICULTY:'DIFFICULTY',CH:'CHALLENGE',CHALLENGE:'CHALLENGE',BO:'BOOST',BOOST:'BOOST',SE:'SETBACK',SETBACK:'SETBACK',FO:'FORCE',FORCE:'FORCE',SU:'SUCCESS',AD:'ADVANTAGE',TR:'TRIUMPH',FA:'FAILURE',TH:'THREAT',DE:'DESPAIR',LI:'LIGHT',DA:'DARK',RS:'REMOVESETBACK',REMSETBACK:'REMOVESETBACK'};
const resultSymbols=new Set(['SUCCESS','ADVANTAGE','TRIUMPH','FAILURE','THREAT','DESPAIR']);
const dieClass=symbol=>'rule-die'+(resultSymbols.has(symbol)?' rule-symbol':'')+(['LIGHT','DARK'].includes(symbol)?' force-pip':'');

function element(doc,tag,text,cls){const el=doc.createElement(tag);if(text!==undefined)el.textContent=clean(text);if(cls)el.className=cls;return el;}
function section(doc,parent,title){const el=element(doc,'section',undefined,'pdf-section');el.append(element(doc,'h2',title));parent.append(el);return el;}
function table(doc,parent,head,rows,layout='',title=''){
 const el=element(doc,'table',undefined,layout),thead=element(doc,'thead'),tr=element(doc,'tr');
 if (title) {
  const columnGroup = element(doc, 'colgroup');
  columnGroup.append(...head.map(() => element(doc, 'col')));
  el.append(columnGroup);
  const heading = element(doc, 'th', undefined, 'inventory-heading');
  heading.colSpan = head.length;
  heading.append(element(doc, 'h2', title));
  thead.insertRow().append(heading);
 }
 for(const label of head){const heading=element(doc,'th',label);heading.scope='col';tr.append(heading);}thead.append(tr);el.append(thead);
 const tbody=element(doc,'tbody');
 for(const row of rows){
  const tr=element(doc,'tr');
  if (typeof row === 'string') {
   tr.className = 'skill-group';
   const label = element(doc, 'th', row);
   label.colSpan = head.length;
   tr.append(label);
  } else {
   for(const value of row){const td=element(doc,'td');if(value?.nodeType)td.append(value);else td.textContent=clean(value);tr.append(td);}
  }
  tbody.append(tr);
 }
 el.append(tbody);parent.append(el);return el;
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
 const box=element(doc,'div',undefined,'stat');box.append(element(doc,'span',label),element(doc,'strong',value));if(note)box.append(element(doc,'small',note));parent.append(box);return box;
}
function combatStat(doc, parent, label, values) {
 const box = element(doc, 'div', undefined, 'combat-stat');
 box.append(element(doc, 'h3', label));
 const columns = element(doc, 'div', undefined, 'combat-stat-values');
 for (const [value, caption] of values) {
  const column = element(doc, 'div');
  column.append(element(doc, 'strong', value ?? 0));
  if (caption) column.append(element(doc, 'small', caption));
  columns.append(column);
 }
 box.append(columns);parent.append(box);
}
function inventoryStatus(item) {
 if (item.flags?.starwarsffg?.inventoryLocation === 'possession') return p('Possession');
 return item.system?.equippable?.equipped ? p('Equipped') : p('Carried');
}
function inventoryTables(doc, root, items) {
 const name = l('SWFFG.SkillsName'), quantity = p('QuantityShort'), encumbrance = p('EncumbranceShort');
 const groups = [
  {
   types: ['weapon', 'shipweapon'], label: 'Weapons', layout: 'weapons-table',
   columns: [name, p('Skill'), l('SWFFG.UI.Equipment.Damage'), p('CriticalShort'), l('SWFFG.UI.Equipment.Range'), p('Qualities')],
   row(item, data) {
    const skill = scalar(data.skill), range = data.range?.label || scalar(data.range);
    const qualities = summarizeItemQualities(data).map(({name, totalRanks}) => name + (totalRanks > 1 ? ' ' + totalRanks : ''));
    return [item.name, l(CONFIG.FFG.skills[skill]?.label ?? String(skill)), scalar(data.damage), scalar(data.crit), l(String(range)), qualities.join(', ')];
   }
  },
  {
   types: ['armour'], label: 'Armor', layout: 'armor-table',
   columns: [name, quantity, l('SWFFG.Soak'), l('SWFFG.Defense'), encumbrance, p('Status')],
   row: (item, data) => [item.name, scalar(data.quantity), scalar(data.soak), scalar(data.defence), scalar(data.encumbrance), inventoryStatus(item)]
  },
  {
   types: ['gear', 'itemattachment', 'itemmodifier'], label: 'Gear', layout: 'gear-table',
   columns: [name, quantity, encumbrance, l('SWFFG.ItemsPrice'), l('SWFFG.ItemsRarity'), p('Status')],
   row: (item, data) => [item.name, scalar(data.quantity), scalar(data.encumbrance), scalar(data.price), scalar(data.rarity), inventoryStatus(item)]
  }
 ];
 for (const {types, label, layout, columns, row} of groups) {
  const entries = items.filter(item => types.includes(item.type));
  if (!entries.length) continue;
  const group = element(doc, 'section', undefined, 'pdf-section inventory-section');
  root.append(group);
  const title = l('SWFFG.UI.Equipment.' + label);
  const rows = entries.map(item => {
   const data = item.system ?? {};
   const cells = row(item, data).map(value => value === '' ? '-' : value);
   const attachments = (data.itemattachment ?? []).map(attachment => attachment?.name).filter(Boolean);
   if (attachments.length) {
    const identity = element(doc, 'span', item.name);
    identity.append(element(doc, 'small', l('SWFFG.ItemAttachments') + ' · ' + attachments.join(', '), 'inventory-attachments'));
    cells[0] = identity;
   }
   return cells;
  });
  table(doc, group, columns, rows, 'inventory-table ' + layout, title);
 }
 return new Set(groups.flatMap(group => group.types));
}

export async function buildCharacterPrintDocument(actor,doc,{base=window.location.href}={}){
 if(actor?.type!=='character'||actor.limited||!actor.testUserPermission(game.user,'OBSERVER'))throw Error(p('Permission'));
 const [{get_dice_pool},{DicePoolFFG}]=await Promise.all([import('./dice-helpers.js'),import('../dice/pool.js')]);
 const root=element(doc,'main'),system=actor.system,items=Array.from(actor.items??[]),describe=html=>printableDescription(doc,html,actor,base);
 const narrativeLabels = {
  obligation: 'SWFFG.DescriptionObligation', duty: 'SWFFG.DescriptionDuty', morality: 'SWFFG.DescriptionMorality',
 };
 const byType = new Map();
 for (const item of items) {
  const subtype = item.system?.type;
  const type = item.type === 'obligation' && Object.hasOwn(narrativeLabels, subtype) ? subtype : item.type;
  if (!byType.has(type)) byType.set(type, []);
  byType.get(type).push(item);
 }
 const summary = element(doc, 'section', undefined, 'summary');
 const header = element(doc, 'header', undefined, 'identity');
 const portrait = validUrl(actor.img, base);
 if (portrait && !portrait.endsWith('/mystery-man.svg')) {
  const img = element(doc, 'img', undefined, 'portrait');
  img.src = portrait;
  img.alt = actor.name;
  header.append(img);
 }
 const identity = element(doc, 'div', undefined, 'identity-content');
 identity.append(element(doc, 'small', p('CharacterSheet'), 'identity-kicker'), element(doc, 'h1', actor.name));
 const general = system.general ?? {};
 const particulars = element(doc, 'dl', undefined, 'identity-details');
 for (const [key, label] of Object.entries({
  gender: 'SWFFG.Gender', age: 'SWFFG.Age', height: 'SWFFG.Height',
  build: 'SWFFG.Build', hair: 'SWFFG.Hair', eyes: 'SWFFG.Eyes',
 })) {
  const value = scalar(general[key]);
  if (!String(value).trim()) continue;
  const field = element(doc, 'div');
  field.append(element(doc, 'dt', l(label)), element(doc, 'dd', value));
  particulars.append(field);
 }
 if (particulars.childElementCount) identity.append(particulars);
 header.append(identity);
 const brand = element(doc, 'img', undefined, 'identity-brand');
 brand.src = new URL('../../images/character-pdf-wordmark.png', import.meta.url).href;
 brand.alt = 'Star Wars';
 header.append(brand);
 const biographyLabel = l('SWFFG.TabBiography');
 const biography = system.biography ? await describe(system.biography) : null;
 const biographyText = biography?.textContent.trim().replace(/\s+/g, ' ') ?? '';
 const hasBiography = Boolean(biographyText || biography?.querySelector('img'));
 // Leave room for the stats and skills when the biography needs more than a few lines.
 const briefBiography = biographyText.length > 0 && biographyText.length <= 420
  && biography.childElementCount <= 2
  && !biography.querySelector('img, table, ul, ol, h1, h2, h3, h4, pre, blockquote, hr, br + br');
 if (briefBiography) {
  const intro = element(doc, 'div', undefined, 'identity-biography');
  intro.append(element(doc, 'h2', biographyLabel), biography);
  header.append(intro);
 }
 summary.append(header);root.append(summary);

 const combat = element(doc, 'div', undefined, 'combat-stats');
 const {soak, wounds, strain, defence} = system.stats ?? {};
 const current = p('Current'), threshold = l('SWFFG.Threshold');
 combatStat(doc, combat, l('SWFFG.Soak'), [[scalar(soak), '']]);
 combatStat(doc, combat, l('SWFFG.Wounds'), [[wounds?.max, threshold], [wounds?.value, current]]);
 combatStat(doc, combat, l('SWFFG.Strain'), [[strain?.max, threshold], [strain?.value, current]]);
 combatStat(doc, combat, l('SWFFG.Defense'), [[defence?.melee, l('SWFFG.UI.Interface.Melee')], [defence?.ranged, l('SWFFG.UI.Interface.Ranged')]]);
 summary.append(combat);

 const characteristics = section(doc, summary, l('SWFFG.TabCharacteristics'));
 characteristics.classList.add('characteristics');
 const traits = element(doc, 'div', undefined, 'traits');
 for (const [key, data] of Object.entries(system.characteristics ?? {})) {
  stat(doc, traits, l(data.label ?? CONFIG.FFG.characteristics?.[key]?.label ?? key), scalar(data));
 }
 characteristics.append(traits);
 const stats = element(doc, 'div', undefined, 'stats');
 const statLabels = {
  soak: 'SWFFG.Soak', wounds: 'SWFFG.Wounds', strain: 'SWFFG.Strain', defence: 'SWFFG.Defense',
  encumbrance: 'SWFFG.Encumbrance', forcePool: 'SWFFG.ForcePool', credits: 'SWFFG.DescriptionCredits',
  medical: 'SWFFG.UI.Pdf.TreatmentsReceived'
 };
 const addStat = (key, data, label) => {
  if (data == null) return;
  const current = data.value ?? 0;
  const limit = key === 'forcePool' ? Math.max(0, data.max - current) : data.max;
  const value = data.max === undefined ? scalar(data) : current + ' / ' + limit;
  if (value === '' || typeof value === 'object') return;
  const note = data.max === undefined ? '' : key === 'forcePool'
   ? textLabel('SWFFG.ForcePoolCommitted') + ' / ' + textLabel('SWFFG.ForcePoolAvailable')
   : p('CurrentThreshold');
  stat(doc, stats, textLabel(label), value, note);
 };
 for (const key of ['encumbrance', 'forcePool', 'credits']) addStat(key, system.stats?.[key], statLabels[key]);
 const xp = stat(doc, stats, l('SWFFG.DescriptionXP'), (system.experience?.available ?? 0) + ' / ' + (system.experience?.total ?? 0), p('AvailableTotal'));
 xp.classList.add('xp-stat');
 if (system.stats?.medical) {
  stat(doc, stats, l(statLabels.medical), (system.stats.medical.uses ?? 0) + ' / 5', p('MedicalSupplies'));
 }
 for (const [key, data] of Object.entries(system.stats ?? {})) {
  if (!Object.hasOwn(statLabels, key) && data?.label) {
   addStat(key, data, data.label);
  }
 }
 if(system.stats?.credits?.reserve!==undefined)stat(doc,stats,p('ReserveCredits'),system.stats.credits.reserve);
 for (const [key, label] of Object.entries({...narrativeLabels, conflict: 'SWFFG.DescriptionConflict'})) {
  const value = system[key]?.value;
  if (value !== undefined && (Number(value) !== 0 || byType.has(key === 'conflict' ? 'morality' : key))) {
   stat(doc, stats, textLabel(label), value);
  }
 }
 const categories = new Map((system.skilltypes ?? []).map(({type, label}) => [type, l(label ?? type)]));
 const skills = Object.entries(system.skills ?? {}).filter(([key, skill]) => skill.custom || CONFIG.FFG.skills[key]);
 const skillName = ([key, skill]) => l(skill.label ?? CONFIG.FFG.skills[key]?.label ?? key);
 for (const [, skill] of skills) {
  if (!categories.has(skill.type)) categories.set(skill.type, skill.type ? textLabel('SWFFG.Skills' + skill.type).replace(/^Skills /, '') : p('Skills'));
 }
 const categoryOrder = [...categories.keys()];
 skills.sort((a, b) => categoryOrder.indexOf(a[1].type) - categoryOrder.indexOf(b[1].type)
  || skillName(a).localeCompare(skillName(b), game.i18n.lang));
 const skillsSection=section(doc,summary,p('Skills')),columns=element(doc,'div',undefined,'skill-columns');skillsSection.append(columns);
 const skillRows=skills.map(([key,skill])=>{
  const roll=element(doc,'span',undefined,'skill-pool');
  if(system.characteristics?.[skill.characteristic]){
   const pool=get_dice_pool(actor,key,new DicePoolFFG({difficulty:0}));const preview=pool.renderPreview();
   for(const img of preview.querySelectorAll('img')){const copy=img.cloneNode();copy.src=validUrl(img.getAttribute('src'),base);copy.removeAttribute('style');copy.width=13;copy.height=13;const symbol=Object.values(symbols).find(name=>validUrl(CONFIG.FFG[name+'_ICON'],base)===copy.src);if(symbol)copy.className=dieClass(symbol);roll.append(copy);}
  }
  const characteristic = CONFIG.FFG.characteristics?.[skill.characteristic];
  const career = skill.careerskill ? element(doc, 'span', p('Yes'), 'career-mark') : '-';
  const rank = skill.rank ?? 0;
  const rankCell = element(doc, 'span', undefined, 'skill-rank');
  const track = element(doc, 'span', undefined, 'rank-track');
  track.setAttribute('aria-hidden', 'true');
  for (let step = 0; step < 5; step++) {
   track.append(element(doc, 'span', undefined, step < rank ? 'filled' : ''));
  }
  rankCell.append(element(doc, 'span', rank), track);
  return {
   category: categories.get(skill.type),
   cells: [skillName([key, skill]), l(characteristic?.abrev ?? characteristic?.label ?? skill.characteristic ?? ''), career, rankCell, roll],
  };
 });
 const midpoint = Math.ceil(skillRows.length / 2);
 const split = [0, -1, 1, -2, 2, -3, 3, -4, 4].map(offset => midpoint + offset)
  .find(index => index > 0 && index < skillRows.length && skillRows[index - 1].category !== skillRows[index].category) ?? midpoint;
 for (const column of [skillRows.slice(0, split), skillRows.slice(split)]) {
  if (!column.length) continue;
  const rows = [];
  let category;
  for (const skill of column) {
   if (skill.category !== category) {
    category = skill.category;
    rows.push(category);
   }
   rows.push(skill.cells);
  }
  table(doc, columns, [p('Skill'), p('Characteristic'), l('SWFFG.SkillsCS'), p('Rank'), l('SWFFG.SkillsRoll')], rows);
 }
 summary.append(stats);
 const entry=async(parent,name,description,meta='')=>{const card=element(doc,'article',undefined,'entry');card.append(element(doc,'h3',name));if(meta)card.append(element(doc,'div',meta,'meta'));if(description)card.append(description.nodeType ? description : await describe(description));parent.append(card);return card;};
 const continuation = element(doc, 'div', undefined, 'continuation');
 const inventory = inventoryTables(doc, continuation, items);
 const profile = section(doc, continuation, biographyLabel);
 if (hasBiography && !briefBiography) profile.append(biography);
 for (const [label, html] of [['SWFFG.NotableFeature', general.features], ['SWFFG.Notes', general.notes]]) {
  if (!html) continue;
  const description = await describe(html);
  if (description.textContent.trim() || description.querySelector('img')) await entry(profile, textLabel(label), description);
 }
 const attributes = Object.entries(system.attributes ?? {}).filter(([, field]) => field?.value !== undefined && field.value !== '');
 if (attributes.length) table(doc, profile, [p('Field'), p('Value')], attributes.map(([key, field]) => [field.label ?? key, scalar(field)]));
 if (!profile.querySelector('.description, table')) profile.remove();

 const talents = Array.from(actor.talentList ?? []);
 if (talents.length) {
  const group = section(doc, continuation, l('SWFFG.Talents'));
  table(doc, group, [l('SWFFG.Talent'), p('Rank')],
   talents.map(talent => [talent.name, talent.isRanked ? talent.rank ?? 1 : '-']), 'talents-table');
 }
 const excludedTypes = new Set([...inventory, 'talent', 'species', 'career', 'specialization']);
 const olderMotivations = legacyMotivations(general);
 if (olderMotivations.length && !byType.has('motivation')) byType.set('motivation', []);
 const itemTypes = [...byType.keys()].filter(type => !excludedTypes.has(type));
 const priority=['forcepower','signatureability','ability','criticalinjury','obligation','duty','morality','motivation','background'];itemTypes.sort((a,b)=>(priority.indexOf(a)<0?99:priority.indexOf(a))-(priority.indexOf(b)<0?99:priority.indexOf(b)));
 for(const type of itemTypes){
  const title = textLabel(narrativeLabels[type] ?? 'TYPES.Item.' + type);
  const group = section(doc, continuation, title);
  for (const item of byType.get(type)) {
   const data = item.system ?? {};
   let details;
   if (type === 'morality' || type === 'motivation') {
    const value = type === 'morality' ? data.subtype : data.type;
    const choices = type === 'morality' ? 'obligationSubTypes' : 'motivationTypes';
    const match = Object.values(CONFIG.FFG.characterCreator?.[choices] ?? {})
     .find(option => option.value.toLowerCase() === String(value).toLowerCase());
    details = match ? l(match.label) : value;
   } else {
    details = [['severity','SWFFG.Severity'],['magnitude','SWFFG.MotivationMagnitude']]
     .filter(([key]) => scalar(data[key]) !== '')
     .map(([key, label]) => textLabel(label) + ' : ' + scalar(data[key])).join(' · ');
   }
   const card=await entry(group,item.name,data.description,details);
   if(item.system?.special?.value)card.append(await describe(item.system.special.value));
   const upgrades=item.powerUpgrades??Object.values(item.system?.upgrades??{}).filter(upgrade=>upgrade?.islearned);
   for(const upgrade of upgrades)await entry(card,upgrade.name,upgrade.description,p('Rank')+' '+(upgrade.rank??1));
  }
  if (type === 'motivation') {
   for (const {category, type: kind, description} of olderMotivations) {
    const text = element(doc, 'div', undefined, 'description legacy-motivation-text');
    if (description) text.append(element(doc, 'p', description));
    await entry(group, category || kind || title, description ? text : null, category ? kind : '');
   }
  }
 }
 const effectField=key=>{
  const parts=String(key).split('.'),kind=parts[1],name=parts[2],suffix=parts[3];
  const label=kind==='stats'?statLabels[name]:kind==='skills'?CONFIG.FFG.skills[name]?.label:kind==='characteristics'?CONFIG.FFG.characteristics[name]?.label:undefined;
  if(!label)return key;
  const detail={boost:'SWFFG.UI.Pilotage.Boost',setback:'SWFFG.UI.Pilotage.Setback',rank:'SWFFG.SkillsRank',max:'SWFFG.Threshold'}[suffix];
  return l(label)+(detail?' - '+l(detail):'');
 };
 const effects=Array.from(actor.effects??[]);if(effects.length){const group=section(doc,continuation,textLabel('SWFFG.TabEffects'));for(const effect of effects){const card=await entry(group,effect.name,effect.description,effect.disabled?p('Inactive'):p('Active'));if(effect.changes?.length)table(doc,card,[p('Field'),p('Operation'),p('Value')],effect.changes.map(change=>[effectField(change.key),p(['Custom','Multiply','Add','Minimum','Maximum','Replace'][change.mode]??'Custom'),change.value]));}}
 const logs=actor.getFlag('starwarsffg','xpLog')??[];if(logs.length){const group=section(doc,continuation,textLabel('SWFFG.TabXpLog'));table(doc,group,[p('Description'),textLabel('SWFFG.DescriptionXP'),p('AvailableTotal')],logs.map(log=>[log.description??log.action??'',log.xp?.cost??'',(log.xp?.available??'')+' / '+(log.xp?.total??'')]),'xp-table');}
 if (continuation.childElementCount) {
  const masthead = element(doc, 'header', undefined, 'continuation-heading');
  const mark = brand.cloneNode();
  mark.alt = '';
  masthead.append(element(doc, 'p', actor.name), mark);
  continuation.prepend(masthead);
  root.append(continuation);
 }
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
 // Print the texture as artwork so it is included with browser backgrounds disabled.
 const paper = element(doc, 'img', undefined, 'sheet-paper');
 paper.alt = '';
 paper.src = new URL('../../images/bgWindow.jpg', import.meta.url).href;
 body.prepend(paper);
 const toolbar=element(doc,'nav',undefined,'print-toolbar'),hint=element(doc,'span',p('SaveHint')),button=element(doc,'button',p('Export'));button.type='button';button.addEventListener('click',()=>popup.print());toolbar.append(hint,button);doc.body.replaceChildren(toolbar,body);
 await styled;await doc.fonts.ready;
 const images=[...doc.images];await Promise.race([Promise.all(images.map(img=>img.decode().catch(()=>{}))),new Promise(resolve=>setTimeout(resolve,8000))]);
 if(popup.closed)return;for(const image of images)if(!image.complete||!image.naturalWidth)image.replaceWith(doc.createTextNode(clean(image.alt)));
 popup.focus();popup.print();
}
