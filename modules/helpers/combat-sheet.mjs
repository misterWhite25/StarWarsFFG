import {showCombatReference} from './combat-quick-reference.mjs';

const types=new Set(['character','minion','rival','nemesis','vehicle']);
const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const usefulSkills=new Set(['cool','vigilance','perception','discipline','athletics','coordination','resilience','medicine','mechanics','pilotingplanetary','pilotingspace','brawl','melee','rangedlight','rangedheavy','gunnery','lightsaber']);
const sheetWindow=sheet=>sheet.element?.ownerDocument.defaultView??window;
const isPrimaryDetached=sheet=>sheet.window.windowId===sheet.id&&sheetWindow(sheet)!==window;
function sheetViewport(sheet){
  const win=sheetWindow(sheet);
  if(!isPrimaryDetached(sheet))return {width:win.innerWidth,height:win.innerHeight};
  // A detached window can grow beyond its current viewport, within the screen's usable area.
  return {width:win.screen.availWidth-(win.outerWidth-win.innerWidth),height:win.screen.availHeight-(win.outerHeight-win.innerHeight)};
}
const combatSheetSize=sheet=>{const viewport=sheetViewport(sheet);return {width:Math.min(520,Math.floor(viewport.width*.94)),height:Math.min(660,Math.floor(viewport.height*.92))};};
export async function resizeActorSheet(sheet,position){
  if(!isPrimaryDetached(sheet)){sheet.setPosition(position);return;}
  const win=sheetWindow(sheet),viewport=sheetViewport(sheet);
  const width=Math.min(viewport.width,position.width??win.innerWidth),height=Math.min(viewport.height,position.height??win.innerHeight);
  // Foundry synchronizes browser resizes to the primary sheet, but setPosition alone
  // does not resize the browser window. Resize it first to allow the full view to grow.
  if(Math.abs(win.innerWidth-width)>1||Math.abs(win.innerHeight-height)>1){
    await new Promise(resolve=>{
      const done=()=>{win.removeEventListener('resize',done);clearTimeout(timer);resolve();};
      const timer=setTimeout(done,200);win.addEventListener('resize',done,{once:true});
      win.resizeTo(Math.ceil(width+win.outerWidth-win.innerWidth),Math.ceil(height+win.outerHeight-win.innerHeight));
    });
  }
  if(!sheet.rendered||sheetWindow(sheet)!==win)return;
  // Use the actual viewport if the browser or OS limited the requested size.
  sheet.setPosition({left:0,top:0,width:win.innerWidth,height:win.innerHeight,scale:1});
  await new Promise(resolve=>win.requestAnimationFrame(resolve));
}
export async function fitCombatSheet(sheet){
  await resizeActorSheet(sheet,combatSheetSize(sheet));
  const win=sheetWindow(sheet);
  await new Promise(resolve=>win.requestAnimationFrame(resolve));
  if(!sheet.rendered||!sheet._ffgCombatMode)return;
  const view=sheet.element.querySelector('.ffg-combat-layout'),content=sheet.element.querySelector('.window-content');if(!view||!content)return;
  const height=Math.ceil(view.getBoundingClientRect().bottom-sheet.element.getBoundingClientRect().top+content.scrollTop+parseFloat(win.getComputedStyle(content).paddingBottom)+3);
  await resizeActorSheet(sheet,{height:Math.min(Math.floor(sheetViewport(sheet).height*.92),Math.max(320,height))});
}

function node(tag,cls,text){const element=document.createElement(tag);if(cls)element.className=cls;if(text!=null)element.textContent=text;return element;}
function button(label,callback,cls=''){
  const result=node('button',cls,label);result.type='button';
  result.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();Promise.resolve(callback(event,result)).catch(error=>{console.error('Star Wars FFG | Vue combat',error);ui.notifications.error(error.message);});});
  return result;
}
function panel(parent,title,cls){
  const section=node('section','ffg-combat-panel '+cls),header=node('header','ffg-combat-panel-heading');
  header.append(node('h3','',title));section.append(header);parent.append(section);return {section,header};
}
function appendIf(parent,element){if(element)parent.append(element);return element;}
function empty(parent,text){parent.append(node('p','ffg-combat-empty',text));}
function promoteAction(element,parent,fallbackIcon='fa-bolt'){
  if(!element)return;
  element.classList.add('ffg-combat-action');
  const label=element.getAttribute('aria-label')||element.title||element.textContent.trim();
  if(label){element.setAttribute('aria-label',label);element.title=label;}
  const icons=[...element.querySelectorAll('i,svg,img')];
  if(!icons.length){const icon=node('i','fa-solid '+(element.matches('.ffg-dodge-reaction')?'fa-person-running':fallbackIcon));icon.setAttribute('aria-hidden','true');icons.push(icon);}
  element.replaceChildren(...icons);
  parent.append(element);
}

function skillSection(sheet,source,parent){
  const skills=source.querySelector('.skillsTablesGrid');if(!skills)return;
  const {section,header}=panel(parent,game.i18n.localize("SWFFG.UI.CombatSheet.Skills"),'ffg-combat-skills');
  const grid=skills.querySelector('.skillsGrid'),groups=[];
  for(const column of grid.querySelectorAll(':scope>.skillColumnGrid')){
    let group;
    for(const row of [...column.children]){
      if(row.querySelector('.skillsHeader')){group=node('div','skillTypeGrid skillColumnGrid');groups.push(group);}
      if(!group){group=node('div','skillTypeGrid skillColumnGrid');groups.push(group);}
      group.append(row);
    }
  }
  const merged=new Map();
  for(const group of groups){const key=normalize(group.querySelector('.skillsHeader>div')?.textContent);const existing=merged.get(key);if(existing){for(const row of [...group.children])if(row.querySelector('.skill'))existing.append(row);}else merged.set(key,group);}
  groups.splice(0,groups.length,...merged.values());
  for(const group of groups){
    const rows=[...group.querySelectorAll('.skill')];
    group.dataset.combatOrder=rows.some(row=>normalize(row.dataset.skilltype).includes('combat')||['brawl','melee','rangedlight','rangedheavy','gunnery','lightsaber'].includes(normalize(row.dataset.ability)))?'0':'1';
    for(const row of rows){
      const key=row.dataset.ability,skill=sheet.actor.system.skills?.[key];
      row.closest('.skillTable').dataset.combatUseful=String(usefulSkills.has(normalize(key))||!!skill?.useForInitiative||normalize(row.dataset.skilltype).includes('combat'));
    }
  }
  groups.sort((a,b)=>Number(a.dataset.combatOrder)-Number(b.dataset.combatOrder));grid.replaceChildren(...groups);
  const apply=()=>{
    for(const group of groups){
      const rows=[...group.querySelectorAll('.skillTable:has(.skill)')];
      for(const row of rows)row.hidden=!sheet._ffgCombatAllSkills&&row.dataset.combatUseful!=='true';
      group.hidden=!rows.some(row=>!row.hidden);
    }
  };
  const toggle=button('',()=>{sheet._ffgCombatAllSkills=!sheet._ffgCombatAllSkills;update();},'ffg-combat-filter');
  function update(){apply();toggle.textContent=sheet._ffgCombatAllSkills?game.i18n.localize("SWFFG.UI.CombatSheet.EssentialSkills"):game.i18n.localize("SWFFG.UI.CombatSheet.AllSkills");toggle.setAttribute('aria-pressed',String(!!sheet._ffgCombatAllSkills));}
  header.append(toggle);section.append(skills);update();
}

function weaponSection(sheet,source,parent){
  const vehicle=sheet.actor.type==='vehicle';
  const list=source.querySelector(vehicle?'ul.items:has(>.items-header .item-add.shipweapon)':'ul.items:has(>.items-header .item-add.weapon)');
  const {section,header}=panel(parent,vehicle?'Armement':game.i18n.localize("SWFFG.UI.CombatSheet.Weapons"),'ffg-combat-weapons');
  if(!list){empty(section,game.i18n.localize("SWFFG.UI.CombatSheet.NoWeapon"));return;}
  const rows=[...list.querySelectorAll(':scope>.items-list>.item')];
  const labels=[...list.querySelector('.items-header').children].map(cell=>cell.textContent.trim());
  const equipped=rows.some(row=>sheet.actor.items.get(row.dataset.itemId)?.system.equippable?.equipped);
  for(const row of rows){
    const item=sheet.actor.items.get(row.dataset.itemId);if(!item)continue;
    row.dataset.combatEquipped=String(vehicle||!equipped||!!item.system.equippable?.equipped);
    [...row.children].forEach((cell,index)=>{cell.dataset.combatLabel=labels[index]??'';});
    const details=[];
    const cells=[...row.children];
    details.push(game.i18n.format("SWFFG.UI.CombatSheet.DamageShort",{damage:cells[2].textContent.trim()}),game.i18n.format("SWFFG.UI.CombatSheet.CriticalShort",{critical:cells[4].textContent.trim()}),cells[3].textContent.trim());
    if(vehicle&&cells[1].textContent.trim())details.push(game.i18n.format("SWFFG.UI.CombatSheet.ArcSummary",{arc:cells[1].textContent.trim()}));
    if(vehicle&&item.flags.starwarsffg?.config?.enableAmmo)details.push(game.i18n.format("SWFFG.UI.CombatSheet.AmmoSummary",{ammo:cells[5].textContent.trim()}));
    const qualities=item.system.adjusteditemmodifier??item.system.itemmodifier??[];
    for(const quality of qualities){if(quality?.name){const rank=Number(quality.system?.rank_current??quality.system?.rank??quality.rank);details.push(quality.name+(rank>1?' '+rank:''));}}
    if(item.system.special?.value)details.push(String(item.system.special.value));
    if(item.type==='weapon'&&item.flags.starwarsffg?.config?.enableAmmo)details.push(game.i18n.format("SWFFG.UI.CombatSheet.AmmunitionCount",{current:item.system.ammo?.value??0,max:item.system.ammo?.max??0}));
    if(details.length)row.querySelector('.item-name')?.append(node('small','ffg-combat-weapon-note',details.join(' · ')));
  }
  const apply=()=>{for(const row of rows)row.hidden=!sheet._ffgCombatAllWeapons&&row.dataset.combatEquipped!=='true';};
  if(rows.some(row=>row.dataset.combatEquipped==='false')){
    const toggle=button('',()=>{sheet._ffgCombatAllWeapons=!sheet._ffgCombatAllWeapons;update();},'ffg-combat-filter');
    function update(){apply();toggle.textContent=sheet._ffgCombatAllWeapons?game.i18n.localize("SWFFG.UI.CombatSheet.EquippedWeapons"):game.i18n.localize("SWFFG.UI.CombatSheet.AllWeapons");toggle.setAttribute('aria-pressed',String(!!sheet._ffgCombatAllWeapons));}
    header.append(toggle);update();
  }else apply();
  section.append(list);if(!rows.length)empty(section,game.i18n.localize("SWFFG.UI.CombatSheet.NoWeapon"));
}

function armorSection(sheet,source,parent){
  const list=source.querySelector('ul.items:has(>.items-header .item-add.armour)');
  const {section}=panel(parent,game.i18n.localize("SWFFG.UI.CombatSheet.WornArmor"),'ffg-combat-armor');
  let count=0;
  if(list){
    for(const row of list.querySelectorAll(':scope>.items-list>.item')){
      const item=sheet.actor.items.get(row.dataset.itemId);row.hidden=!item?.system.equippable?.equipped;
      if(row.hidden)continue;count++;
      const cells=[...row.children];row.querySelector('.item-name')?.append(node('small','ffg-combat-weapon-note',game.i18n.format("SWFFG.UI.CombatSheet.ArmorStats",{soak:cells[3].textContent.trim(),defense:cells[2].textContent.trim()})));
    }
    if(count)section.append(list);
  }
  if(!count)empty(section,game.i18n.localize("SWFFG.UI.CombatSheet.NoWornArmor"));
}

async function showPowers(sheet){
  if(sheet._ffgCombatPowersWindow?.rendered){sheet._ffgCombatPowersWindow.bringToFront();return;}
  const content=node('div');
  const max=Number(sheet.actor.system.stats?.forcePool?.max)||0,committed=Number(sheet.actor.system.stats?.forcePool?.value)||0;
  content.append(node('p','',game.i18n.format("SWFFG.UI.CombatSheet.ForceAvailable",{available:Math.max(0,max-committed),max})));
  for(const item of sheet.actor.items.filter(item=>['forcepower','signatureability'].includes(item.type))){
    const row=node('div','ffg-combat-power-row');row.append(node('strong','',item.name));
    row.append(button(game.i18n.localize("SWFFG.UI.CombatSheet.Sheet"),()=>item.sheet.render({force:true}),'ffg-combat-filter'));
    const native=sheet.element.querySelector(`.tab[data-tab=talents] .item[data-item-id="${CSS.escape(item.id)}"] .item-fp`);
    if(native&&sheet.isEditable){
      const roll=button(game.i18n.localize("SWFFG.UI.CombatSheet.Roll"),()=>{
        const target=sheet.element.querySelector(`.tab[data-tab=talents] .item[data-item-id="${CSS.escape(item.id)}"] .item-fp`);
        if(!target)throw Error(game.i18n.localize("SWFFG.UI.CombatSheet.PowerMissing"));(target.querySelector('i')??target).click();
      },'ffg-combat-weapon-roll');roll.setAttribute('aria-label',game.i18n.format("SWFFG.UI.CombatSheet.RollPower",{name:item.name}));row.append(roll);
    }
    content.append(row);
  }
  sheet._ffgCombatPowersWindow=new foundry.applications.api.DialogV2({classes:['starwarsffg','themed','ffg-combat-power-dialog'],window:{title:game.i18n.format("SWFFG.UI.CombatSheet.PowerTitle",{name:sheet.actor.name})},position:{width:440},content,buttons:[{action:'close',label:game.i18n.localize("SWFFG.UI.CombatSheet.Close")}],rejectClose:false});
  await sheet._ffgCombatPowersWindow.render({force:true});
  // DialogV2 serializes initial content; restore the live nodes and their listeners.
  sheet._ffgCombatPowersWindow.element.querySelector('.dialog-content').replaceChildren(...content.childNodes);
}

function compactIdentity(sheet,source,bar){
  const fields=source.querySelector('.header-fields'),name=fields?.querySelector('input[name=name]');if(!name)return;
  const portrait=fields.querySelector('.profile-block');
  const original=sheet.actor.type==='minion'?fields.querySelector('.ffg-combat-minion-identity'):sheet.actor.type==='vehicle'?name.closest('.container.item-name')?.parentElement:fields.querySelector(':scope>.container:first-child');
  const identity=node('div','ffg-combat-identity'),title=node('div','ffg-combat-name');
  name.title=sheet.actor.name;
  appendIf(identity,portrait);title.append(name);identity.append(title,bar);fields.prepend(identity);
  if(original)original.hidden=true;
}

function compactVitals(sheet,source){
  if(sheet.actor.type==='vehicle')return;
  const fields=source.querySelector('.header-fields'),vitals=node('section','ffg-combat-vitals');
  vitals.setAttribute('aria-label',game.i18n.localize("SWFFG.UI.CombatSheet.ActorStatus"));
  for(const resource of [...fields.querySelectorAll('.resource')]){
    const inputs=[...resource.querySelectorAll('.block-value>input')],controls=[...resource.querySelectorAll('.minion-control')];
    if(!inputs.length&&!controls.length)continue;
    const names=inputs.map(input=>input.name).join(' ');
    const kind=names.includes('.wounds.')?'wounds':names.includes('.strain.')?'strain':names.includes('.soak.')?'soak':names.includes('.defence.')?'defence':names.includes('.quantity.')?'quantity':names.includes('.unit_wounds.')?'unit-wounds':'controls';
    const titles={wounds:game.i18n.localize("SWFFG.UI.CombatSheet.Wounds"),strain:game.i18n.localize("SWFFG.UI.CombatSheet.Strain"),soak:game.i18n.localize("SWFFG.UI.CombatSheet.Soak"),defence:game.i18n.localize("SWFFG.UI.CombatSheet.Defense"),quantity:game.i18n.localize("SWFFG.UI.CombatSheet.Minions"),'unit-wounds':game.i18n.localize("SWFFG.UI.CombatSheet.UnitWounds"),controls:game.i18n.localize("SWFFG.UI.CombatSheet.Neutralize")};
    const row=node('div','ffg-combat-vital');row.dataset.combatStat=kind;
    const label=node('span','ffg-combat-vital-label',titles[kind]+' :'),values=node('span','ffg-combat-vital-values');row.append(label,values);
    if(controls.length){for(const control of controls)values.append(control);}
    else if(kind==='defence'){
      for(const [key,title]of [['melee',game.i18n.localize("SWFFG.UI.CombatSheet.Melee")],['ranged',game.i18n.localize("SWFFG.UI.CombatSheet.Ranged")]]){
        const input=inputs.find(input=>input.name.endsWith('.'+key));if(!input)continue;
        const caption=node('span','ffg-combat-defense-label',title+' :');values.append(caption,input);input.setAttribute('aria-label',game.i18n.format("SWFFG.UI.CombatSheet.DefenseAria",{type:title}));
      }
    }else{
      const current=inputs.find(input=>input.name.endsWith('.value'))??inputs[0],max=inputs.find(input=>input.name.endsWith('.max'));
      if(current){current.setAttribute('aria-label',game.i18n.format("SWFFG.UI.CombatSheet.VitalCurrentAria",{stat:titles[kind],value:max?game.i18n.localize("SWFFG.UI.CombatSheet.CurrentValue"):game.i18n.localize("SWFFG.UI.CombatSheet.Value")}));values.append(current);}
      if(max&&max!==current){const slash=node('span','ffg-combat-vital-divider','/');slash.setAttribute('aria-hidden','true');max.classList.add('ffg-combat-limit');max.setAttribute('aria-label',game.i18n.format("SWFFG.UI.CombatSheet.VitalThresholdAria",{stat:titles[kind]}));values.append(slash,max);}
    }
    resource.remove();vitals.append(row);
  }
  if(vitals.children.length){fields.querySelector('.ffg-combat-identity').after(vitals);for(const container of fields.querySelectorAll(':scope>.container,:scope>.ffg-combat-minion-stats'))if(!container.querySelector('input,button,.minion-control'))container.hidden=true;}
}

function prepareCombatAids(sheet,source){
  if(sheet.actor.type==='vehicle')return;
  const sidebar=source.querySelector('.sheet-tabs');if(!sidebar)return;
  for(const [kind,title,icon]of [['personal',game.i18n.localize("SWFFG.UI.CombatSheet.PersonalCombatTurn"),'fa-person-rifle'],['space',game.i18n.localize("SWFFG.UI.CombatSheet.VehicleCombatTurn"),'fa-shuttle-space']]){
    const action=button('',()=>showCombatReference(kind),'ffg-summary-button ffg-sheet-combat-aid');
    action.title=title;action.setAttribute('aria-label',title);action.dataset.combatAid=kind;
    const glyph=node('i','fa-solid '+icon);glyph.setAttribute('aria-hidden','true');action.append(glyph);sidebar.append(action);
  }
}

function compactMedical(sheet,source){
  if(sheet.actor.type==='vehicle')return;
  const vitals=source.querySelector('.ffg-combat-vitals');if(!vitals)return;
  const original=source.querySelector('.attribute:has(.resetMedical)');
  const label=original?.querySelector('.block-title')?.textContent.trim()||sheet.actor.flags.starwarsffg?.config?.medicalItemName||game.i18n.localize('SWFFG.DefaultMedicalItemName');
  let controls=original?.querySelector('.block-attribute');
  if(!controls){
    controls=node('div','block-attribute');
    const counter=node('div',''),minus=node('i','fas fa-minus-circle medical'),plus=node('i','fas fa-plus-circle medical');
    counter.append(minus,document.createTextNode(' '+(sheet.actor.system.stats?.medical?.uses??0)+'/5 '),plus);
    const reset=node('button','resetMedical');reset.type='button';reset.value='resetUses';reset.append(node('i','fas fa-recycle'));controls.append(counter,reset);
  }
  const row=node('div','ffg-combat-vital ffg-combat-medical');row.dataset.combatStat='medical';
  row.append(node('span','ffg-combat-vital-label',label+' :'),controls);vitals.append(row);original?.remove();
  controls.setAttribute('aria-label',label);
  for(const icon of controls.querySelectorAll('.medical')){
    const plus=icon.classList.contains('fa-plus-circle');
    icon.title=plus?game.i18n.localize("SWFFG.UI.CombatSheet.UseMedicalItem"):game.i18n.localize("SWFFG.UI.CombatSheet.AdjustMedicalCounter");icon.setAttribute('aria-label',icon.title);
    if(sheet.isEditable){
      icon.setAttribute('role','button');icon.tabIndex=0;
      icon.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();event.stopPropagation();icon.click();}});
    }else icon.hidden=true;
  }
  const reset=controls.querySelector('.resetMedical');
  if(reset){reset.title=game.i18n.localize("SWFFG.UI.CombatSheet.RequestMedicalRest");reset.setAttribute('aria-label',reset.title);reset.disabled=!sheet.isEditable;}
}

export async function setCombatSheetMode(sheet,mode){
  if(!types.has(sheet.actor.type)||!sheet.actor.testUserPermission(game.user,'OBSERVER'))throw Error(game.i18n.localize("SWFFG.UI.CombatSheet.SheetNotAccessible"));
  if(!!sheet._ffgCombatMode===mode)return;
  const companion=[...foundry.applications.instances.values()].some(app=>app.rendered&&app.companionSheet===sheet);
  if(mode){sheet._ffgCombatFullPosition={...sheet.position};sheet._ffgCombatFullWindowId=sheet.window.windowId;}
  sheet._ffgCombatMode=mode;await sheet.render({force:true});
  if(mode&&!companion)await fitCombatSheet(sheet);
  else if(!mode&&sheet._ffgCombatFullPosition){
    const saved=sheet._ffgCombatFullPosition;
    const position=sheet._ffgCombatFullWindowId===sheet.window.windowId?saved:{width:saved.width,height:saved.height,scale:saved.scale};
    await resizeActorSheet(sheet,position);delete sheet._ffgCombatFullPosition;delete sheet._ffgCombatFullWindowId;
  }
  sheet.element?.querySelector('.window-content')?.scrollTo({top:0,left:0});
}

export function prepareCombatSheet(sheet,source,context){
  if(!types.has(sheet.actor.type)||context.limited||!sheet.actor.testUserPermission(game.user,'OBSERVER'))return;
  const bar=node('nav','ffg-sheet-mode-switch');bar.setAttribute('aria-label',game.i18n.localize("SWFFG.UI.CombatSheet.SheetView"));
  for(const [mode,label] of [[false,game.i18n.localize("SWFFG.UI.CombatSheet.FullSheet")],[true,'Combat']]){
    const control=button(label,async()=>{
      await setCombatSheetMode(sheet,mode);
    },'ffg-sheet-mode');
    control.dataset.combatMode=String(mode);control.setAttribute('aria-pressed',String(!!sheet._ffgCombatMode===mode));bar.append(control);
  }
  source.insertBefore(bar,source.querySelector('.sheet-header')??source.firstChild);
  prepareCombatAids(sheet,source);
  if(!sheet._ffgCombatMode)return;
  if(sheet.actor.type==='minion'){
    const fields=source.querySelector('.header-fields'),name=fields?.querySelector('.minion-name'),title=name?.querySelector('h1'),portrait=fields?.querySelector('.profile-block');
    if(name&&title){
      const identity=node('div','ffg-combat-minion-identity');appendIf(identity,portrait);identity.append(title);
      const stats=node('div','ffg-combat-minion-stats');
      for(const resource of name.querySelectorAll('.minion-stats>.resource'))stats.append(resource);
      fields.replaceChildren(identity,stats);
      const controls=stats.querySelector('.minion-control')?.closest('.resource');
      if(controls){controls.querySelector('.block-title').textContent=game.i18n.localize("SWFFG.UI.CombatSheet.Neutralize");controls.querySelector('.shadow-left .shadow-text').textContent=game.i18n.localize("SWFFG.UI.CombatSheet.Minion");controls.querySelector('.shadow-right .shadow-text').textContent=game.i18n.localize("SWFFG.UI.CombatSheet.Group");}
    }
  }
  compactIdentity(sheet,source,bar);
  compactVitals(sheet,source);
  compactMedical(sheet,source);
  const view=node('section','sheet-body ffg-combat-layout');view.setAttribute('aria-label',game.i18n.localize("SWFFG.UI.CombatSheet.CombatView"));
  const characteristics=source.querySelector('.tab[data-tab=characteristics]>.grid.grid-6col');
  if(characteristics){
    const names={Brawn:game.i18n.localize("SWFFG.UI.CombatSheet.BrawnShort"),Agility:game.i18n.localize("SWFFG.UI.CombatSheet.AgilityShort"),Intellect:game.i18n.localize("SWFFG.UI.CombatSheet.IntellectShort"),Cunning:game.i18n.localize("SWFFG.UI.CombatSheet.CunningShort"),Willpower:game.i18n.localize("SWFFG.UI.CombatSheet.WillpowerShort"),Presence:game.i18n.localize("SWFFG.UI.CombatSheet.PresenceShort")};
    for(const item of characteristics.querySelectorAll('.characteristic-item')){const label=item.querySelector('.characteristic-label');if(label){label.title=label.textContent.trim();label.textContent=(names[item.dataset.ability]??label.textContent.trim().slice(0,3).toUpperCase())+' :';}}
    const scores=node('section','ffg-combat-characteristics');scores.setAttribute('aria-label',game.i18n.localize("SWFFG.UI.CombatSheet.Characteristics"));scores.append(characteristics);view.append(scores);
  }
  const columns=node('div','ffg-combat-columns'),left=node('div','ffg-combat-left'),right=node('div','ffg-combat-right');columns.append(left,right);view.append(columns);
  const actions=node('div','ffg-combat-actions');right.append(actions);
  for(const action of source.querySelectorAll('.sheet-tabs .ffg-summary-button,.sheet-tabs .ffg-open-vehicle-plan'))promoteAction(action,actions);
  if(sheet.actor.items.some(item=>['forcepower','signatureability'].includes(item.type)))promoteAction(button(game.i18n.localize("SWFFG.UI.CombatSheet.Powers"),()=>showPowers(sheet)),actions,'fa-hand-sparkles');
  if(sheet.actor.type==='vehicle'){
    weaponSection(sheet,source,right);
    const crew=source.querySelector('.tab[data-tab=components]>ul.items:has(.crew_role)')??source.querySelector('.tab[data-tab=components]>ul.items:has(.vehicle-crew-empty)');
    const {section}=panel(left,game.i18n.localize("SWFFG.UI.CombatSheet.Crew"),'ffg-combat-crew');if(crew)section.append(crew);else empty(section,game.i18n.localize("SWFFG.UI.CombatSheet.NoCrew"));
  }else{
    skillSection(sheet,source,left);weaponSection(sheet,source,right);armorSection(sheet,source,right);
  }
  for(const label of view.querySelectorAll('.characteristic-label.ffg-purchase,.talents-header .header-name.ffg-purchase'))label.classList.remove('ffg-purchase');
  source.append(view);
}

function finishCombatSheet(sheet){
  const view=sheet.element?.querySelector('.ffg-combat-layout');if(!view)return;
  const actions=view.querySelector('.ffg-combat-actions');
  for(const action of sheet.element.querySelectorAll('.sheet-tabs .ffg-dodge-reaction'))promoteAction(action,actions);
}
Hooks.on('renderActorSheetFFGV2',finishCombatSheet);
Hooks.on('closeActorSheetFFGV2',sheet=>{if(sheet._ffgCombatPowersWindow?.rendered)void sheet._ffgCombatPowersWindow.close();});
Hooks.once('init',()=>{const link=node('link');link.rel='stylesheet';link.dataset.ffgCombatSheet='';link.href=new URL('../../styles/combat-sheet.css',import.meta.url).href;document.head.append(link);});
Hooks.once('ready',()=>queueMicrotask(()=>{const link=document.head.querySelector('link[data-ffg-combat-sheet]');if(link)document.head.append(link);}));
