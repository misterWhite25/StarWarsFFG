import DiceHelpers,{get_dice_pool} from './dice-helpers.js';
import {DicePoolFFG} from '../dice/pool.js';
import {canonicalCrewSkill} from './crew-role-definitions.mjs';
import {resolveCrewActor,removeIntegratedCrewProfile} from './integrated-crew.mjs';
import {showShipIconPicker,shipIconGlyph} from "./vehicle-deck-icons.mjs";
import {arrangeVehiclePlan,restoreVehicleSheet,fitVehiclePlanImage} from "./vehicle-plan-layout.mjs";
import {createSharedWindowSession} from "./shared-window-session.mjs";

const scope = "starwarsffg";
const flag = "vehicleDeck";
const path = "flags.starwarsffg.vehicleDeck";
const sessions = new Map();
const windows = new Map();
const deck = ship => ship.getFlag(scope, flag) ?? {};
const hasPlan = ship => Boolean(String(deck(ship).image ?? '').trim());
const mapEnabled = ship => hasPlan(ship) && !!deck(ship).enabled;
function refreshModeControl(mode,ship) {
  mode.checked=mapEnabled(ship);
  mode.disabled=!hasPlan(ship);
  mode.title=hasPlan(ship)?'':game.i18n.localize("SWFFG.UI.Vehicle.ChooseDeckForMap");
  if(mode.parentElement)mode.parentElement.title=mode.title;
}
function normalizeDeckSource(data) {
  const plan=data.flags?.[scope]?.[flag];
  return !!plan?.enabled && !String(plan.image ?? '').trim();
}
Hooks.on('preCreateActor',actor=>{
  if(actor.type==='vehicle' && normalizeDeckSource(actor.toObject()))actor.updateSource({[path+'.enabled']:false});
});
Hooks.on('preUpdateActor',(actor,changes)=>{
  if(actor.type!=='vehicle')return;
  const next=foundry.utils.mergeObject(actor.toObject(),foundry.utils.expandObject(changes),{inplace:false,applyOperators:true});
  if(normalizeDeckSource(next)) {
    foundry.utils.setProperty(changes,path+'.enabled',false);
    foundry.utils.setProperty(changes,path+'.epoch',foundry.utils.randomID());
  }
});
const isWorldShip = ship => ship?.type === "vehicle" && !ship.isToken && !ship.pack && game.actors.get(ship.id) === ship;
const warn = error => { console.warn("Star Wars FFG | Plan intérieur", error); ui.notifications.warn(error.message); };
const run = fn => event => { event.preventDefault(); Promise.resolve(fn(event)).catch(warn); };

function el(tag, cls, value) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (value != null) node.textContent = value;
  return node;
}
function button(label, action, cls) {
  const node = el("button", cls, label);
  node.type = "button";
  node.addEventListener("click", run(action));
  return node;
}
function portrait(actor) {
  return actor.prototypeToken?.texture?.src || actor.img || "icons/svg/mystery-man.svg";
}
function roster(ship) {
  const people = new Map();
  for (const entry of ship.getFlag(scope,"crew") ?? []) {
    const actor = resolveCrewActor(entry,ship);
    if (!actor) continue;
    const key = "a"+actor.id;
    if (!people.has(key)) people.set(key, {key, actorId:actor.id, name:actor.name, img:portrait(actor), crew:true, roles:[]});
    const member = people.get(key);
    if (entry.role && !member.roles.includes(entry.role)) member.roles.push(entry.role);
  }
  for (const member of Object.values(deck(ship).passengers ?? {})) {
    if (people.has(member.key)) continue;
    const actor = resolveCrewActor(member,ship);
    people.set(member.key, {...member, name:member.tokenUuid ? member.name : actor?.name ?? member.name,
      img:member.tokenUuid ? member.img : actor ? portrait(actor) : member.img, crew:false});
  }
  return people;
}
function passenger(document) {
  const token = document?.documentName === "Token" ? document : null;
  const actor = token ? token.actor : document;
  if (!actor || actor.documentName !== "Actor" || !["character","minion","rival","nemesis"].includes(actor.type) || actor.pack) {
    throw Error(game.i18n.localize("SWFFG.UI.Vehicle.ChooseWorldCharacter"));
  }
  if (!actor.visible) throw Error(game.i18n.localize("SWFFG.UI.Vehicle.CharacterUnavailable"));
  const distinct = token && !token.actorLink;
  return {key:distinct ? "t"+token.parent.id+"_"+token.id : "a"+actor.id, actorId:actor.id,
    tokenUuid:distinct ? token.uuid : null, name:token?.name ?? actor.name,
    img:token?.texture?.src ?? portrait(actor)};
}
function assertOwner(ship) {
  if ((!isWorldShip(ship)&&!(ship.isToken&&ship.flags?.starwarsffg?.npcVehicle?.version===1&&game.user.isGM)) || !ship.isOwner) throw Error(game.i18n.localize("SWFFG.UI.Vehicle.DeckOwnerConfiguration"));
}
function point(event, image) {
  const box = image.getBoundingClientRect();
  if (!box.width || !box.height) throw Error(game.i18n.localize("SWFFG.UI.Vehicle.DeckMustBeLoaded"));
  const clamp = v => Math.max(0,Math.min(1,v));
  return {x:clamp((event.clientX-box.left)/box.width), y:clamp((event.clientY-box.top)/box.height)};
}
async function board(ship, documents, position) {
  assertOwner(ship);
  if(ship.flags?.starwarsffg?.npcVehicle?.version===1)throw Error('Ce véhicule PNJ utilise des postes simplifiés. Choisissez un véhicule indépendant pour affecter des personnages.');
  const aboard = roster(ship);
  const updates = {};
  for (const doc of documents) {
    const member = passenger(doc);
    if (!aboard.has(member.key)) updates[path+".passengers."+member.key] = member;
    if (position) updates[path+".positions."+member.key] = position;
  }
  if (Object.keys(updates).length) await ship.update(updates);
}
async function removePassenger(ship,key) {
  assertOwner(ship);
  const member=deck(ship).passengers?.[key];
  if(member?.integrated)return removeIntegratedCrewProfile(ship,member.actorId);
  await ship.update({[path+".passengers.-="+key]:null,[path+".positions.-="+key]:null});
}
async function droppedDocument(event) {
  let data;
  try { data = JSON.parse(event.dataTransfer.getData("text/plain")); } catch { return null; }
  if (!["Actor","Token"].includes(data.type)) return null;
  return data.uuid ? fromUuid(data.uuid) : data.type==="Actor" ? game.actors.get(data.id) : null;
}
function bindBoarding(zone, ship) {
  zone.addEventListener("dragover",event=>{ if(ship.isOwner){event.preventDefault();event.stopPropagation();} });
  zone.addEventListener("drop",event=>{
    event.preventDefault();event.stopImmediatePropagation();
    (async()=>{
      const doc = await droppedDocument(event);
      if(!doc) throw Error(game.i18n.localize("SWFFG.UI.Vehicle.DropPassenger"));
      await board(ship,[doc]);
    })().catch(warn);
  },true);
}
function mayMove(ship,member,user) {
  if (!member || !user?.active) return false;
  if (user.isGM || ship.testUserPermission(user,"OWNER")) return true;
  const token = member.tokenUuid && fromUuidSync(member.tokenUuid);
  const actor = token?.actor ?? game.actors.get(member.actorId);
  return actor?.testUserPermission(user,"OWNER") ?? false;
}
function writer(ship) {
  return game.users.activeGM ?? game.users.filter(u=>u.active && ship.testUserPermission(u,"OWNER")).sort((a,b)=>a.id.localeCompare(b.id))[0];
}
function moveUpdate(key,position) {
  return position ? {[path+".positions."+key]:position} : {[path+".positions.-="+key]:null};
}
async function move(ship,key,position) {
  if(!mayMove(ship,roster(ship).get(key),game.user)) throw Error(game.i18n.localize("SWFFG.UI.Vehicle.MoveOwnedCharacters"));
  if(ship.isOwner) return ship.update(moveUpdate(key,position));
  if(!writer(ship)) throw Error(game.i18n.localize("SWFFG.UI.Vehicle.ConnectedOwnerForPosition"));
  await game.user.setFlag(scope,"deckMove",{id:foundry.utils.randomID(),shipId:ship.id,key,position,epoch:deck(ship).epoch});
}
Hooks.on("updateUser",(user,changes,_options,author)=>{
  if(!changes.flags?.[scope]?.deckMove || author!==user.id)return;
  const cmd=user.getFlag(scope,"deckMove"), ship=game.actors.get(cmd?.shipId);
  if(!isWorldShip(ship)||writer(ship)?.id!==game.user.id||!mapEnabled(ship)||deck(ship).epoch!==cmd.epoch)return;
  if(!mayMove(ship,roster(ship).get(cmd.key),user))return;
  const p=cmd.position;
  if(p!==null && (!p || ![p.x,p.y].every(v=>Number.isFinite(v)&&v>=0&&v<=1)))return;
  ship.update(moveUpdate(cmd.key,p)).catch(warn);
});

async function setDeckImage(ship,value) {
  assertOwner(ship);
  const src=String(value??'').trim();
  if(src && /^(?:javascript|data|blob|file):/i.test(src))throw Error(game.i18n.localize("SWFFG.UI.Vehicle.ChooseImageOrURL"));
  await ship.update({[path+'.image']:src,...(!src?{[path+'.enabled']:false,[path+'.epoch']:foundry.utils.randomID()}:{})});
}

async function setDeckMode(ship,enabled) {
  assertOwner(ship);
  enabled=!!enabled;
  if(enabled && !hasPlan(ship))throw Error(game.i18n.localize("SWFFG.UI.Vehicle.ChooseDeckForMap"));
  const app=windows.get(ship.id);
  if(app?._changingMode || enabled===mapEnabled(ship))return;
  const bar=app?.element?.querySelector('.ffg-deck-settings-bar');
  const close=app?.element?.querySelector('.window-header [data-action="close"]');
  if(app) {
    app._changingMode=true;
    app._preserveNextOpen=enabled;
    app.shared=false;
    bar?.setAttribute('aria-busy','true');
    for(const field of bar?.querySelectorAll('input,button')??[])field.disabled=true;
    if(close)close.disabled=true;
  }
  try {
    await ship.update({[path+'.enabled']:enabled,[path+'.epoch']:foundry.utils.randomID()});
    syncShip(ship);
    if(app && enabled) {
      await sessions.get(ship.id)?.request('open');
      app.shared=true;
    }
  } catch(error) {
    if(app) {
      app.shared=mapEnabled(ship) && !!sessions.get(ship.id)?.state.open;
      app._preserveNextOpen=false;
    }
    throw error;
  } finally {
    if(app) {
      app._changingMode=false;
      bar?.removeAttribute('aria-busy');
      for(const field of bar?.querySelectorAll('input,button')??[])field.disabled=false;
      const mode=bar?.querySelector('.ffg-deck-map-toggle input');
      if(mode)refreshModeControl(mode,ship);
      if(close)close.disabled=false;
      if(app._closeWithSheet){delete app._closeWithSheet;await closePlanWithSheet(app);}
    }
  }
}

function createPlanSettings(ship) {
  const bar=el('div','ffg-deck-settings-bar');
  bar.setAttribute('aria-label',game.i18n.localize("SWFFG.UI.Vehicle.DeckSettings"));
  const imageLabel=el('label');
  imageLabel.append(document.createTextNode(game.i18n.localize("SWFFG.UI.Vehicle.DeckPlan")));
  const input=el('input');
  input.type='text';input.value=deck(ship).image??'';input.placeholder=game.i18n.localize("SWFFG.UI.Vehicle.ImagePath");
  input.setAttribute('aria-label',game.i18n.localize("SWFFG.UI.Vehicle.DeckPlanImage"));
  input.addEventListener('change',event=>{
    event.stopPropagation();
    setDeckImage(ship,input.value).catch(error=>{input.value=deck(ship).image??'';warn(error);});
  });
  imageLabel.append(input);bar.append(imageLabel);
  if(game.user.can('FILES_BROWSE')) {
    const browse=button('',async()=>{
      assertOwner(ship);
      const picker=new foundry.applications.apps.FilePicker.implementation({type:'image',current:deck(ship).image??'',callback:value=>setDeckImage(ship,value).catch(warn)});
      await picker.browse(undefined,{render:false});
      await picker.render({force:true});
    },'ffg-deck-browse');
    const icon=el('i','fa-solid fa-folder-open');icon.setAttribute('aria-hidden','true');
    browse.append(icon);browse.title=game.i18n.localize("SWFFG.UI.Vehicle.ChooseImage");browse.setAttribute('aria-label',game.i18n.localize("SWFFG.UI.Vehicle.ChooseImage"));
    bar.append(browse);
  }
  const iconPicker=button('',()=>showShipIconPicker(ship),'ffg-deck-icon-button');
  iconPicker.append(shipIconGlyph(ship),document.createTextNode(game.i18n.localize("SWFFG.UI.Vehicle.Icon")));
  iconPicker.title=game.i18n.localize("SWFFG.UI.Vehicle.MapButtonIcon");
  iconPicker.setAttribute('aria-label',game.i18n.localize("SWFFG.UI.Vehicle.MapButtonIcon"));
  bar.append(iconPicker);
  const modeLabel=el('label','ffg-deck-map-toggle');
  const mode=el('input');mode.type='checkbox';mode.checked=mapEnabled(ship);
  mode.setAttribute('aria-label',game.i18n.localize("SWFFG.UI.Vehicle.MapMode"));
  mode.addEventListener('change',async event=>{
    event.stopPropagation();mode.disabled=true;
    try {
      await setDeckMode(ship,mode.checked);
    } catch(error) { warn(error); }
    finally { refreshModeControl(mode,ship); }
  });
  modeLabel.append(mode,document.createTextNode(game.i18n.localize("SWFFG.UI.Vehicle.MapMode")));bar.append(modeLabel);
  refreshModeControl(mode,ship);
  return bar;
}

function passengerSkillKey(actor,key){
  const canonical=canonicalCrewSkill(key);
  return Object.keys(actor?.system?.skills??{}).find(name=>canonicalCrewSkill(name)===canonical);
}
function passengerSkillCell(ship,member,key){
  const cell=el('td','ffg-passenger-skill-column');cell.dataset.skillLabel=game.i18n.localize('SWFFG.SkillsName'+key);const actor=resolveCrewActor(member,ship),skillKey=passengerSkillKey(actor,key);
  const skill=actor?.system?.skills?.[skillKey],characteristic=actor?.system?.characteristics?.[skill?.characteristic];
  if(!skill||!characteristic){cell.textContent='-';return cell;}
  const label=game.i18n.localize('SWFFG.SkillsName'+key);
  const mayRoll=actor=>!!actor&&(game.user.isGM||!member.integrated&&actor.testUserPermission(game.user,'OWNER'));
  const control=button('',async()=>{
    const current=roster(ship).get(member.key),actor=current&&!current.crew?resolveCrewActor(current,ship):null;
    if(!mayRoll(actor))throw Error('Vous ne pouvez pas lancer les compétences de ce passager.');
    const fresh=passengerSkillKey(actor,key);
    if(!fresh)throw Error('Cette compétence est indisponible.');
    return DiceHelpers.rollSkillByKey(actor,fresh);
  },'ffg-passenger-skill');
  control.dataset.passengerSkill=key;control.dataset.passengerActor=member.actorId;control.disabled=!mayRoll(actor);
  control.title=label+' · '+game.i18n.localize('SWFFG.Ranked')+' '+String(skill.rank??0);
  control.setAttribute('aria-label',label+' - '+member.name);
  const preview=get_dice_pool(actor,skillKey,new DicePoolFFG({difficulty:0})).renderPreview();
  if(preview.querySelector('img'))control.append(preview);else control.textContent='0';
  cell.append(control);return cell;
}

function drawPassengers(app,ship) {
  const section=app.element?.querySelector('[data-vehicle-passengers-sheet]');
  if(!section)return;
  const combatPanel=app.element.querySelector('.ffg-combat-crew');
  if(combatPanel&&!combatPanel.contains(section))combatPanel.append(section);
  const editable=ship.isOwner && app.isEditable;
  const members=[...roster(ship).values()].filter(member=>!member.crew);
  const table=el('table','ffg-basic-table ffg-deck-passengers-table');
  const head=el('thead'),heading=el('tr'),title=el('th',null,game.i18n.format("SWFFG.UI.Vehicle.Passengers",{count:members.length}));
  title.scope='col';heading.append(title);
  for(const key of ['Computers','Mechanics','Leadership']){const label=el('th','ffg-passenger-skill-column',game.i18n.localize('SWFFG.SkillsName'+key));label.scope='col';heading.append(label);}
  if(editable)heading.append(el('th','ffg-basic-table-controls'));
  head.append(heading);table.append(head);
  const body=el('tbody');
  for(const member of members) {
    const row=el('tr');row.dataset.passenger=member.key;
    const cell=el('td'),name=el('span','ffg-deck-passenger-name');
    const image=el('img');image.src=member.img;image.alt='';
    name.append(image,document.createTextNode(member.name));
    if(member.integrated){name.dataset.integratedPassenger=member.actorId;name.tabIndex=0;name.style.cursor='pointer';name.setAttribute('role','button');name.title='Ouvrir le profil intégré';const open=()=>resolveCrewActor(member,ship)?.sheet.render({force:true});name.addEventListener('click',open);name.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();open();}});}
    cell.append(name);row.append(cell);
    for(const key of ['Computers','Mechanics','Leadership'])row.append(passengerSkillCell(ship,member,key));
    if(editable) {
      const actions=el('td','ffg-basic-table-controls');
      const remove=button('',()=>removePassenger(ship,member.key),'ffg-deck-remove-passenger');
      remove.title=game.i18n.format("SWFFG.UI.Vehicle.RemovePassenger",{name:member.name});remove.setAttribute('aria-label',game.i18n.format("SWFFG.UI.Vehicle.RemovePassenger",{name:member.name}));
      const icon=el('i','fa-solid fa-trash');icon.setAttribute('aria-hidden','true');
      remove.append(icon);actions.append(remove);row.append(actions);
    }
    body.append(row);
  }
  if(!members.length) {
    const row=el('tr'),cell=el('td','ffg-deck-passengers-empty',editable?game.i18n.localize("SWFFG.UI.Vehicle.DropPassengerHere"):game.i18n.localize("SWFFG.UI.Vehicle.NoPassengers"));
    cell.colSpan=editable?5:4;row.append(cell);body.append(row);
  }
  table.append(body);section.replaceChildren(table);
  if(editable&&ship.flags?.starwarsffg?.npcVehicle?.version!==1) {
    const zone=el('div','ffg-deck-drop');
    zone.append(el('span',null,game.i18n.localize("SWFFG.UI.Vehicle.AddPassengers")));
    section.append(zone);bindBoarding(section,ship);
  }
}

function drawSheet(app) {
  const ship=app.actor;
  const section=app.element?.querySelector("[data-vehicle-deck-sheet]");
  if(ship?.type==='vehicle'&&ship.isToken){drawPassengers(app,ship);return;}
  if(!section || !isWorldShip(ship))return;
  const data=deck(ship);
  section.replaceChildren(el("h3",null,game.i18n.localize("SWFFG.UI.Vehicle.DeckPlan")));
  if(ship.isOwner && app.isEditable){
    const fields=el("div","ffg-deck-settings");
    const input=el("input");input.type="text";input.value=data.image??"";input.placeholder=game.i18n.localize("SWFFG.UI.Vehicle.ImagePath");
    input.setAttribute("aria-label",game.i18n.localize("SWFFG.UI.Vehicle.DeckPlanImage"));
    const setImage=value=>setDeckImage(ship,value);
    input.addEventListener("change",event=>{
      event.stopPropagation();
      setImage(input.value).catch(error=>{input.value=deck(ship).image??"";warn(error);});
    });
    fields.append(input);
    if(game.user.can("FILES_BROWSE"))fields.append(button(game.i18n.localize("SWFFG.UI.Vehicle.ChooseImage"),async()=>{
      const picker=new foundry.applications.apps.FilePicker.implementation({type:"image",current:input.value,callback:value=>setImage(value).catch(warn)});
      await picker.browse(undefined,{render:false});
      await picker.render({force:true});
    }));
    const label=el("label","ffg-deck-mode");
    const mode=el("input");mode.type="checkbox";mode.checked=mapEnabled(ship);
    mode.addEventListener("change",async event=>{
      event.stopPropagation();
      mode.disabled=true;
      try{
        await setDeckMode(ship,mode.checked);
      }catch(error){warn(error);}finally{refreshModeControl(mode,ship);}
    });
    label.append(mode,document.createTextNode(game.i18n.localize("SWFFG.UI.Vehicle.MapModeSidebarHint")));
    section.append(fields,label);
    refreshModeControl(mode,ship);
  }
  if(data.image || ship.isOwner) section.append(button(game.i18n.localize("SWFFG.UI.Vehicle.ViewDeck"),()=>show(ship,false)));
  drawPassengers(app,ship);
}
Hooks.on("renderActorSheetFFGV2",drawSheet);

class VehicleDeck extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS={classes:["ffg-deck-window"],position:{width:950,height:660},window:{resizable:true}};
  constructor(ship){super({id:"ffg-deck-"+ship.id,window:{title:game.i18n.format("SWFFG.UI.Vehicle.DeckWindowTitle",{name:ship.name})}});this.shipId=ship.id;}
  get ship(){return game.actors.get(this.shipId);}
  async _renderHTML(){
    const ship=this.ship,data=deck(ship),people=roster(ship),positions=data.positions??{};
    const root=el("div","ffg-deck-workspace"),main=el("main","ffg-deck-chart");
    if(ship.isOwner)root.append(createPlanSettings(ship));
    root.append(main);
    if(this.selected && !people.has(this.selected))this.selected=null;
    if(!data.image){main.append(el("p","ffg-deck-empty",game.i18n.localize("SWFFG.UI.Vehicle.NoDeckPlan")));return root;}
    const surface=el("div","ffg-deck-surface"),image=el("img","ffg-deck-image");
    image.alt=game.i18n.format("SWFFG.UI.Vehicle.DeckPlanOf",{name:ship.name});image.draggable=false;
    if(this.measuredImage?.src===data.image)surface.style.setProperty("--deck-ratio",String(this.measuredImage.ratio));
    else surface.style.visibility="hidden";
    image.addEventListener("load",()=>{
      this.measuredImage={src:data.image,ratio:image.naturalWidth/image.naturalHeight};
      surface.style.setProperty("--deck-ratio",String(this.measuredImage.ratio));
      surface.style.visibility="";
    });
    image.addEventListener("error",()=>main.replaceChildren(el("p","ffg-deck-empty",game.i18n.format("SWFFG.UI.Vehicle.MapImageUnavailable",{image:data.image}))));
    image.src=data.image;
    surface.append(image);main.append(surface);
    const place=(event,key)=>move(ship,key,point(event,image));
    image.addEventListener("click",run(event=>{
      if(!this.selected)return;
      return place(event,this.selected);
    }));
    for(const person of people.values()){
      const spot=positions[person.key];
      if(!spot || !Number.isFinite(spot.x)||!Number.isFinite(spot.y))continue;
      const pin=el("button","ffg-deck-pin");pin.type="button";
      pin.style.left=(spot.x*100)+"%";pin.style.top=(spot.y*100)+"%";
      pin.title=person.name;pin.dataset.person=person.key;pin.setAttribute("aria-label",person.name);
      pin.setAttribute("aria-pressed",String(this.selected===person.key));
      const img=el("img");img.draggable=false;img.src=person.img;img.alt="";
      pin.append(img);surface.append(pin);
      if(!mayMove(ship,person,game.user)){pin.disabled=true;continue;}
      pin.addEventListener("click",run(()=>{this.selected=person.key;return this.render();}));
      pin.addEventListener("pointerdown",event=>{
        if(event.button!==0)return;
        event.preventDefault();pin.setPointerCapture(event.pointerId);
        const startX=event.clientX,startY=event.clientY;
        const drag=e=>{const p=point(e,image);pin.style.left=p.x*100+"%";pin.style.top=p.y*100+"%";};
        const finish=e=>{
          pin.removeEventListener("pointermove",drag);pin.removeEventListener("pointerup",finish);pin.removeEventListener("pointercancel",finish);
          if(e.type==="pointerup" && Math.hypot(e.clientX-startX,e.clientY-startY)>2){
            this.selected=person.key;place(e,person.key).catch(warn);
          }else{if(e.type==="pointerup")this.selected=person.key;this.render();}
        };
        pin.addEventListener("pointermove",drag);pin.addEventListener("pointerup",finish);pin.addEventListener("pointercancel",finish);
      });
      pin.addEventListener("keydown",event=>{
        const step={ArrowLeft:[-.01,0],ArrowRight:[.01,0],ArrowUp:[0,-.01],ArrowDown:[0,.01]}[event.key];
        if(!step)return;
        event.preventDefault();
        move(ship,person.key,{x:Math.max(0,Math.min(1,spot.x+step[0])),y:Math.max(0,Math.min(1,spot.y+step[1]))}).catch(warn);
      });
    }
    surface.addEventListener("dragover",event=>{if(ship.isOwner)event.preventDefault();});
    surface.addEventListener("drop",run(async event=>{
      const doc=await droppedDocument(event);
      if(doc)await board(ship,[doc],point(event,image));
    }));
    return root;
  }
  async _renderFrame(options){
    const frame=await super._renderFrame(options);
    frame.classList.add('ffg-deck-layout-pending');
    return frame;
  }
  async _onRender(context,options){
    await super._onRender(context,options);
    const source=deck(this.ship).image??'';
    if(this.layoutBounds && this.fittedImageSource!==source){
      const left=this.position.left,top=this.position.top;
      await fitVehiclePlanImage(this.ship,this,{left,top,width:Math.max(200,innerWidth-left-12),height:Math.max(200,innerHeight-top-12)});
    }
  }
  _replaceHTML(result,content){content.replaceChildren(result);}
  async close(options={}){
    if(this._changingMode && !options.local)return;
    const session=sessions.get(this.shipId);
    if(this.shared && session?.state.open && !options.local){
      if(game.user.isGM||session.canNavigate())return session.request("close");
      return ui.notifications.info(game.i18n.localize("SWFFG.UI.Vehicle.SharedDeckWindowHint"));
    }
    await super.close(options);
    if(windows.get(this.shipId)===this)windows.delete(this.shipId);
    if(!this.rendered && !options.keepCompanionLayout)await restoreVehicleSheet(this);
  }
}

async function show(ship,shared){
  let app=windows.get(ship.id);
  if(!app){app=new VehicleDeck(ship);windows.set(ship.id,app);}
  if(shared)app.shared=true;
  await app.render({force:true});
  if(app.minimized)await app.maximize();
  try{await arrangeVehiclePlan(ship,app);}
  finally{app.element?.classList.remove('ffg-deck-layout-pending');}
  app.bringToFront();
  return app;
}
export async function openVehicleDeck(ship,{shared=mapEnabled(ship)}={}) {
  if(!isWorldShip(ship))throw Error(game.i18n.localize("SWFFG.UI.Vehicle.ChooseWorldVehicle"));
  if(windows.get(ship.id)?._changingMode)return windows.get(ship.id);
  if(shared && mapEnabled(ship)){
    syncShip(ship);
    const session=sessions.get(ship.id);
    if(!session)return;
    await session.request('open');
    const app=windows.get(ship.id);
    if(app?.rendered){if(app.minimized)await app.maximize();app.bringToFront();}
    return app;
  }
  if(!ship.visible)throw Error(game.i18n.localize("SWFFG.UI.Vehicle.VehicleUnavailable"));
  const app=await show(ship,false);
  if(app.minimized)await app.maximize();
  return app;
}

const revisions=new Map();
function syncShip(ship){
  const data=deck(ship);
  if(!isWorldShip(ship)||!mapEnabled(ship)){
    sessions.get(ship.id)?.destroy();sessions.delete(ship.id);revisions.delete(ship.id);
    if(windows.get(ship.id)?.shared)windows.get(ship.id).close({local:true}).catch(warn);
    return;
  }
  if(revisions.get(ship.id)===data.epoch && sessions.has(ship.id))return;
  sessions.get(ship.id)?.destroy();revisions.set(ship.id,data.epoch);
  let render=Promise.resolve(),lastRequest;
  const session=createSharedWindowSession({
    scope,stateKey:"deckState"+ship.id,requestKey:"deckRequest"+ship.id,
    getMode:()=>({shared:!!game.actors.get(ship.id)&&mapEnabled(ship),epoch:deck(ship).epoch}),
    onError:warn,onState:()=>{
      render=render.catch(warn).then(async()=>{
        if(sessions.get(ship.id)!==session)return;
        const current=windows.get(ship.id);
        if(current?._changingMode){
          if(session.state.open){current.shared=true;current._preserveNextOpen=false;lastRequest=session.state.requestId;}
          return;
        }
        if(session.state.open){
          if(current?._preserveNextOpen){current.shared=true;current._preserveNextOpen=false;}
          else if(!current?.shared || session.state.requestId!==lastRequest)await show(ship,true);
          lastRequest=session.state.requestId;
        }else if(current?.shared)await current.close({local:true});
      });
      return render;
    }
  });
  sessions.set(ship.id,session);session.start().catch(warn);
}
let watched,observer,frame;
function controls(){
  const host=ui.controls?.element??document.querySelector("#scene-controls");
  if(!host)return;
  if(host!==watched){
    observer?.disconnect();watched=host;observer=new MutationObserver(schedule);observer.observe(host,{childList:true,subtree:true});
  }
  const market=host.querySelector("[data-open-galactic-market]")?.closest("li");
  const travel=host.querySelector("[data-open-galactic-travel]")?.closest("li");
  const menu=(market??travel)?.parentElement??host.querySelector("#scene-controls-layers > menu,menu");
  if(!menu)return;
  const space=host.querySelector("[data-open-space-combat]")?.closest("li");
  let anchor=space?.parentElement===menu?space:market??travel;
  const ships=game.actors.filter(ship=>isWorldShip(ship)&&mapEnabled(ship)).sort((a,b)=>a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
  const ids=new Set(ships.map(ship=>ship.id));
  for(const old of host.querySelectorAll("li[data-deck-ship]"))if(!ids.has(old.dataset.deckShip))old.remove();
  for(const ship of ships){
    let row=menu.querySelector('li[data-deck-ship="'+ship.id+'"]');
    if(!row){
      row=el("li");row.dataset.deckShip=ship.id;
      const open=button("",()=>openVehicleDeck(ship),"ui-control icon fa-solid fa-shuttle-space");
      row.append(open);
    }
    const label=game.i18n.format("SWFFG.UI.Vehicle.DeckWindowTitle",{name:ship.name});
    row.firstChild.title=label;row.firstChild.dataset.tooltip=label;row.firstChild.setAttribute("aria-label",label);
    if(anchor){if(anchor.nextElementSibling!==row)anchor.after(row);}
    else if(!row.isConnected)menu.append(row);
    anchor=row;
  }
}
function schedule(){
  if(frame)return;
  frame=requestAnimationFrame(()=>{frame=null;controls();});
}
Hooks.once("ready",()=>{
  for(const ship of game.actors)if(isWorldShip(ship)) {
    syncShip(ship);
    if(game.users.activeGM?.id===game.user.id && normalizeDeckSource(ship.toObject())) {
      ship.update({[path+'.enabled']:false,[path+'.epoch']:foundry.utils.randomID()}).catch(warn);
    }
  }
  schedule();
});
Hooks.on("renderSceneControls",schedule);
Hooks.on("updateActor",(actor,changes)=>{
  for(const app of foundry.applications.instances.values()){
    const vehicle=app.actor;
    if(app.rendered&&vehicle?.type==='vehicle'&&Object.values(deck(vehicle).passengers??{}).some(member=>member.actorId===actor.id))drawPassengers(app,vehicle);
  }
  if(isWorldShip(actor)){syncShip(actor);schedule();}
  for(const [id,app] of windows){
    if(!app.ship || app._changingMode || app.shared&&!mapEnabled(app.ship))continue;
    if(id===actor.id || (changes.name||changes.img||changes.prototypeToken)&&roster(app.ship).has("a"+actor.id))app.render().catch(warn);
  }
});
Hooks.on("createActor",actor=>{if(isWorldShip(actor)){syncShip(actor);schedule();}});
Hooks.on("deleteActor",actor=>{
  sessions.get(actor.id)?.destroy();sessions.delete(actor.id);revisions.delete(actor.id);
  windows.get(actor.id)?.close({local:true}).catch(warn);schedule();
});

// Foundry can update ownership without updateActor hooks; directories still refresh.
function refreshPlanSettingsPermissions(){
  for(const app of windows.values()){
    if(!app.rendered || !app.ship || app._changingMode)continue;
    const shown=!!app.element?.querySelector('.ffg-deck-settings-bar');
    if(shown!==!!app.ship.isOwner)app.render().catch(warn);
  }
}
Hooks.on('renderActorDirectory',refreshPlanSettingsPermissions);
Hooks.on('renderVehicleDirectory',refreshPlanSettingsPermissions);
Hooks.on('updateUser',refreshPlanSettingsPermissions);

Hooks.on('renderActorSheetFFGV2',refreshPlanSettingsPermissions);

async function closePlanWithSheet(plan){
  if(plan._changingMode){plan._closeWithSheet=true;return;}
  const session=sessions.get(plan.shipId);
  const sharedClose=plan.shared && session?.state.open && (game.user.isGM || session.canNavigate());
  await plan.close({local:!sharedClose,keepCompanionLayout:true});
}
Hooks.on('closeActorSheetFFGV2',sheet=>{
  if(sheet.actor?.type!=='vehicle')return;
  const plan=windows.get(sheet.actor.id);
  if(!plan)return;
  if(plan.companionSheet===sheet)delete plan.companionSheet;
  closePlanWithSheet(plan).catch(warn);
});
