import {FACTIONS,FLEET_PRESETS,matchesFleetFaction,vehicleClass,normalizeFleetText,getFleetAffiliations} from './fleet-model.mjs';
import {getFleetCatalogue,setFleetAffiliations,AFFILIATION_OVERRIDES_SETTING} from './fleet-catalogue.mjs';
import {createFleet} from './fleet-creation.mjs';
const scope='starwarsffg',tr=(key,data)=>data?game.i18n.format('SWFFG.Fleet.'+key,data):game.i18n.localize('SWFFG.Fleet.'+key);
const el=(tag,css,text)=>{const node=document.createElement(tag);if(css)node.className=css;if(text!==undefined)node.textContent=text;return node;};
const button=(text,action,css='')=>{const node=el('button',css,text);node.type='button';node.addEventListener('click',action);return node;};
function selectField(label,values,current,change){
  const field=el('label','fleet-field',label),select=el('select');for(const [value,text]of values){const option=el('option','',text);option.value=value;option.selected=value===current;select.append(option);}select.value=current;select.addEventListener('change',()=>change(select.value));field.append(select);return field;
}
function stylesheet(){if(document.querySelector('link[data-fleet-builder]'))return;const link=el('link');link.rel='stylesheet';link.href=new URL('../../styles/fleet-builder.css',import.meta.url).href;link.dataset.fleetBuilder='';document.head.append(link);}
let currentApp;
export async function showFleetAffiliations(entry){
  if(!game.user.isGM)return;
  const outer=el('div'),body=el('section','fleet-affiliations');outer.append(body);body.append(el('p','fleet-note',tr('AffiliationsHelp')));
  const overrides=game.settings.get(scope,AFFILIATION_OVERRIDES_SETTING)??{};
  for(const faction of FACTIONS){const label=el('label'),check=el('input');check.type='checkbox';check.name=faction.id;check.defaultChecked=getFleetAffiliations(entry,overrides).includes(faction.id);label.append(check,document.createTextNode(tr('Faction.'+faction.id)));body.append(label);}
  const result=await foundry.applications.api.DialogV2.wait({classes:['starwarsffg','themed'],window:{title:tr('Affiliations')+' - '+entry.name},position:{width:400},content:outer,rejectClose:false,buttons:[{action:'save',label:tr('Save'),callback:(_event,_button,app)=>FACTIONS.filter(f=>app.element.querySelector('[name='+f.id+']').checked).map(f=>f.id)},{action:'cancel',label:tr('Cancel'),callback:()=>false}]});
  if(Array.isArray(result)){await setFleetAffiliations(entry,result);return true;}return false;
}
function entryText(entry){return [entry.name,entry.names?.fr,entry.names?.en,entry.key].filter(Boolean).join(' ');}
function choose(entries,kind,faction,pattern){
  const pool=entries.filter(entry=>matchesFleetFaction(entry,faction)&&(pattern?pattern.test(entryText(entry)):vehicleClass(entry)===kind));
  return pool.sort((a,b)=>{
    const score=entry=>entry.origin==='world'?2:0;
    const preference=entry=>faction==='alliance'?(/t.?65.?b|x.wing/i.test(entryText(entry))?10:0):faction==='empire'?(/tie.ln|tie fighter|chasseur tie/i.test(entryText(entry))?10:0):0;
    return preference(b)+score(b)-preference(a)-score(a)||a.name.localeCompare(b.name);
  })[0];
}
export async function showFleetBuilder(){
  if(!game.user.isGM)return;
  if(currentApp?.rendered){currentApp.bringToFront();return currentApp;}
  stylesheet();
  const outer=el('div'),placeholder=el('section','fleet-builder-body',tr('Loading'));outer.append(placeholder);
  const app=new foundry.applications.api.DialogV2({classes:['starwarsffg','themed','fleet-builder'],window:{title:tr('Title'),resizable:true},position:{width:Math.min(1100,innerWidth-32),height:Math.min(850,innerHeight-40)},content:outer,buttons:[{action:'close',label:tr('Close')}]});
  currentApp=app;await app.render({force:true});
  const host=app.element.querySelector('.fleet-builder-body'),state={entries:[],rows:[],faction:'alliance',preset:'squadron',astromech:'auto',crewMode:'integrated',disposition:1,busy:false,name:tr('DefaultName'),search:'',all:false,next:0};host.replaceChildren();
  const setup=el('div','fleet-setup'),nameLabel=el('label','fleet-field',tr('NameLabel')),name=el('input');name.type='text';name.maxLength=100;name.value=state.name;name.dataset.fleetName='';name.addEventListener('input',()=>state.name=name.value);nameLabel.append(name);setup.append(nameLabel);
  const factionField=selectField(tr('FactionLabel'),FACTIONS.map(f=>[f.id,tr('Faction.'+f.id)]),state.faction,value=>{state.faction=value;state.rows=[];state.disposition=value==='alliance'?1:-1;campField.querySelector('select').value=String(state.disposition);renderCatalogue();renderRows();});factionField.querySelector('select').dataset.fleetFaction='';setup.append(factionField);
  const preset=selectField(tr('PresetLabel'),Object.keys(FLEET_PRESETS).map(key=>[key,tr('Preset.'+key)]),state.preset,value=>{state.preset=value;});preset.querySelector('select').dataset.fleetPreset='';setup.append(preset);
  const campField=selectField(tr('CampLabel'),[['1',tr('Camp.ally')],['-1',tr('Camp.enemy')],['0',tr('Camp.neutral')]],'1',value=>{state.disposition=Number(value);});setup.append(campField);
  const astro=selectField(tr('AstromechLabel'),[['auto',tr('Astromech.auto')],['yes',tr('Astromech.yes')],['no',tr('Astromech.no')]],'auto',value=>{state.astromech=value;});astro.querySelector('select').dataset.fleetAstromech='';setup.append(astro);host.append(setup);
  const tools=el('div','fleet-tools'),crewMode=selectField(tr('CrewModeLabel'),[['integrated',tr('CrewMode.integrated')],['detailed',tr('CrewMode.detailed')]],state.crewMode,value=>state.crewMode=value),propose=button(tr('Propose'),()=>proposeRows(false)),raid=button(tr('Raid'),()=>proposeRows(true));propose.dataset.fleetPropose='';raid.dataset.fleetRaid='';crewMode.querySelector('select').dataset.fleetCrewMode='';tools.append(crewMode,propose,raid,el('small','fleet-note',tr('PresetHelp')));host.append(tools);
  const status=el('p','fleet-status');status.setAttribute('role','status');status.dataset.fleetStatus='';host.append(status);
  const columns=el('div','fleet-columns'),catalogue=el('section','fleet-catalogue'),composition=el('section','fleet-composition');columns.append(catalogue,composition);host.append(columns);
  catalogue.append(el('h3','',tr('Models')));const search=el('input');search.type='search';search.placeholder=tr('Search');search.setAttribute('aria-label',tr('Search'));search.addEventListener('input',()=>{state.search=search.value;renderCatalogue();});catalogue.append(search);
  const allLabel=el('label','fleet-show-all'),all=el('input');all.type='checkbox';all.dataset.fleetAll='';all.addEventListener('change',()=>{state.all=all.checked;renderCatalogue();});allLabel.append(all,document.createTextNode(tr('ShowAll')));catalogue.append(allLabel);
  const modelList=el('div','fleet-model-list');modelList.dataset.fleetModels='';catalogue.append(modelList);
  const heading=el('header','fleet-composition-heading');heading.append(el('h3','',tr('Composition')));const total=el('strong');total.dataset.fleetTotal='';heading.append(total);composition.append(heading);
  const rows=el('div','fleet-rows');rows.dataset.fleetRows='';composition.append(rows,el('p','fleet-note',tr('CrewHelp')));
  const create=button(tr('Create'),async()=>{
    if(state.busy)return;
    state.busy=true;setBusy(true);status.textContent=tr('Creating');
    try{
      const result=await createFleet({name:state.name,faction:state.faction,disposition:state.disposition,rows:state.rows.map(({uuid,count,crewType,quality,groupSize})=>({uuid,count,crewType:groupSize>1?'minion':crewType,quality,groupSize,crewMode:groupSize>1?'integrated':state.crewMode,astromech:state.astromech}))},{onProgress:({done,total,name})=>{status.textContent=tr('Progress',{done,total,name});}});
      ui.notifications.info(tr('Created',{name:state.name,count:result.shipIds.length}));await app.close();void ui.vehicles?.render({force:true});
    }catch(error){status.textContent=error.message;ui.notifications.warn(error.message);}
    finally{state.busy=false;if(app.rendered)setBusy(false);}
  },'fleet-create');create.dataset.fleetCreate='';create.disabled=true;composition.append(create);
  function setBusy(busy){for(const control of host.querySelectorAll('button,input,select'))control.disabled=busy;if(!busy){renderCatalogue();renderRows();}}
  function addRow(entry,count=1,crewType=vehicleClass(entry)==='fighter'?'minion':'rival'){
    state.rows.push({id:++state.next,uuid:entry.uuid,count,crewType,quality:'standard',groupSize:1});renderRows();
  }
  function renderCatalogue(){
    modelList.replaceChildren();const query=normalizeFleetText(state.search);
    for(const entry of state.entries.filter(e=>(state.all||matchesFleetFaction(e,state.faction))&&(!query||normalizeFleetText(entryText(e)).includes(query)))){
      const compatible=matchesFleetFaction(entry,state.faction),row=el('article','fleet-model'),img=el('img');img.src=entry.img??'systems/starwarsffg/images/defaults/actors/vehicle.png';img.alt='';row.append(img);
      const label=el('div','fleet-model-label'),title=el('strong','',entry.name),info=el('small','',entry.affiliationSource==='suggestion'?tr('Suggested'):entry.affiliations.length?entry.affiliations.map(f=>tr('Faction.'+f)).join(', '):tr('Unclassified'));title.title=entry.packLabel??tr('WorldModels');label.append(title,info);row.append(label);
      const add=button('+',()=>addRow(entry),'fleet-add');add.title=add.ariaLabel=tr('AddModel',{name:entry.name});add.disabled=state.busy||!compatible;add.dataset.fleetAdd=entry.uuid;
      const tags=button('⚑',async()=>{try{if(await showFleetAffiliations(entry)){state.entries=await getFleetCatalogue();renderCatalogue();renderRows();}}catch(error){status.textContent=error.message;}},'fleet-tags');tags.title=tags.ariaLabel=tr('ModelFactions',{name:entry.name});tags.disabled=state.busy;tags.dataset.fleetTags=entry.uuid;row.append(add,tags);modelList.append(row);
    }
    if(!modelList.childElementCount)modelList.append(el('p','fleet-note',tr('NoModels')));
  }
  function updateTotal(){
    const units=state.rows.reduce((sum,row)=>sum+(Number(row.count)||0),0),ships=state.rows.reduce((sum,row)=>sum+(Number(row.count)||0)*(Number(row.groupSize)||1),0);
    total.textContent=tr(ships!==units?'UnitsTotal':'Count',{count:units})+(ships!==units?' · '+tr('ShipsTotal',{count:ships}):'');
  }
  function renderRows(){
    rows.replaceChildren();updateTotal();const grouped=state.rows.some(row=>row.groupSize>1);if(grouped)state.crewMode='integrated';crewMode.querySelector('select').value=state.crewMode;crewMode.querySelector('select').disabled=state.busy||grouped;
    for(const row of state.rows){
      const entry=state.entries.find(e=>e.uuid===row.uuid),card=el('article','fleet-row'),title=el('strong','',entry?.name??row.uuid);card.dataset.fleetRow=String(row.id);card.append(title);
      const remove=button('×',()=>{state.rows=state.rows.filter(r=>r.id!==row.id);renderRows();},'fleet-remove');remove.title=remove.ariaLabel=tr('Remove');card.append(remove);
      const fields=el('div','fleet-row-fields'),countLabel=el('label','fleet-field',tr(row.groupSize>1?'Groups':'Quantity')),count=el('input');count.type='number';count.min=1;count.max=100;count.step=1;count.value=String(row.count);count.dataset.fleetQuantity='';count.addEventListener('input',()=>{row.count=Number(count.value);updateTotal();});countLabel.append(count);fields.append(countLabel);
      const crewField=selectField(tr('CrewLabel'),['minion','rival','nemesis'].map(type=>[type,tr('Crew.'+type)]),row.groupSize>1?'minion':row.crewType,value=>{row.crewType=value;});crewField.querySelector('select').disabled=row.groupSize>1;
      const groupLabel=el('label','fleet-field',tr('GroupSize')),groupSize=el('input');groupSize.type='number';groupSize.min=1;groupSize.max=100;groupSize.step=1;groupSize.value=String(row.groupSize??1);groupSize.dataset.fleetGroupSize='';groupSize.addEventListener('change',()=>{const value=Number(groupSize.value);row.groupSize=Number.isInteger(value)&&value>=1&&value<=100?value:1;if(row.groupSize>1)row.crewType='minion';renderRows();});groupLabel.append(groupSize);
      fields.append(groupLabel,crewField,selectField(tr('QualityLabel'),['novice','standard','veteran'].map(value=>[value,tr('Quality.'+value)]),row.quality,value=>{row.quality=value;}));card.append(fields);rows.append(card);
    }
    if(!state.rows.length)rows.append(el('p','fleet-note',tr('Empty')));create.disabled=state.busy||!state.rows.length;
  }
  function proposeRows(bombing){
    if(state.busy)return;
    status.textContent='';
    if(bombing){state.faction='alliance';factionField.querySelector('select').value='alliance';state.preset='squadron';preset.querySelector('select').value='squadron';state.disposition=1;campField.querySelector('select').value='1';}
    const fighter=choose(state.entries,'fighter',state.faction),escort=choose(state.entries,'escort',state.faction),capital=choose(state.entries,'capital',state.faction);
    const wanted=FLEET_PRESETS[state.preset];
    const bomber=bombing?choose(state.entries,'fighter','alliance',/y[ -]?wing/i):null,xwing=bombing?choose(state.entries,'fighter','alliance',/x[ -]?wing/i):null;
    if(bombing&&(!bomber||!xwing)||!bombing&&((wanted.fighters&&!fighter)||(wanted.escorts&&!escort)||(wanted.capital&&!capital))){status.textContent=tr('MissingModels');return;}
    state.rows=[];
    if(bombing){addRow(bomber,3,'minion');addRow(bomber,1,'rival');addRow(xwing,2,'minion');}
    else{
      if(wanted.fighters>1)addRow(fighter,wanted.fighters-1,'minion');if(wanted.fighters)addRow(fighter,1,'rival');
      if(wanted.escorts)addRow(escort,wanted.escorts,'rival');if(wanted.capital)addRow(capital,wanted.capital,'rival');
    }
    renderCatalogue();renderRows();
  }
  try{state.entries=await getFleetCatalogue();renderCatalogue();renderRows();}catch(error){status.textContent=error.message;create.disabled=true;}return app;
}
function directoryButton(app){
  if(!game.user.isGM||!app.element||app.element.querySelector('[data-open-fleet-builder]'))return;
  const anchor=app.element.querySelector('.header-actions,.directory-header,.header-search');if(!anchor)return;
  const open=button(tr('Title'),()=>void showFleetBuilder().catch(error=>ui.notifications.error(error.message)),'fleet-open');open.dataset.openFleetBuilder='';anchor.append(open);
}
function sheetFactions(sheet){
  const actor=sheet.actor,host=sheet.element?.querySelector('[data-vehicle-factions]');
  if(!game.user.isGM||actor?.type!=='vehicle'||!host)return;
  const entry={uuid:actor.uuid,name:actor.name,flags:actor.flags};host.replaceChildren();
  const heading=el('header','fleet-sheet-factions-heading'),title=el('h3','',tr('FactionsTab')),info=el('i','fa-solid fa-circle-info');
  info.title=tr('AffiliationsHelp');info.setAttribute('aria-label',info.title);heading.append(title,info);host.append(heading);
  const list=el('div','fleet-sheet-faction-list');host.append(list);
  const overrides=()=>game.settings.get(scope,AFFILIATION_OVERRIDES_SETTING)??{};
  const selected=()=>getFleetAffiliations(entry,overrides());
  const inputs=[];let pending=0;
  const status=el('p','fleet-note fleet-sheet-factions-status');status.setAttribute('role','status');
  for(const faction of FACTIONS){
    const label=el('label'),check=el('input'),name=el('span','',tr('Faction.'+faction.id));
    check.type='checkbox';check.dataset.vehicleFaction=faction.id;check.checked=selected().includes(faction.id);inputs.push(check);label.append(check,name);list.append(label);
    check.addEventListener('change',event=>{
      event.stopPropagation();const chosen=inputs.filter(input=>input.checked).map(input=>input.dataset.vehicleFaction);pending++;status.textContent=tr('SavingFactions');
      void setFleetAffiliations(entry,chosen).catch(error=>{ui.notifications.warn(error.message);}).finally(()=>{
        pending--;if(pending)return;status.textContent='';const saved=selected();for(const input of inputs)input.checked=saved.includes(input.dataset.vehicleFaction);
      });
    });
  }
  host.append(status);
}
Hooks.once('init',()=>{game.settings.register(scope,AFFILIATION_OVERRIDES_SETTING,{scope:'world',config:false,type:Object,default:{}});stylesheet();});
Hooks.once('ready',()=>directoryButton(ui.vehicles));
Hooks.on('renderVehicleDirectory',directoryButton);
Hooks.on('renderActorSheetFFGV2',sheetFactions);
