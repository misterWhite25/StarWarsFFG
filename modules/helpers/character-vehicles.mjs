import {setCombatSheetMode,fitCombatSheet} from './combat-sheet.mjs';

const characterTypes=new Set(['character','minion','rival','nemesis']);
const opening=new Map(),choices=new Map();
function characterUuids(actor){
 const uuids=new Set([actor.uuid]);
 if(actor.isToken){const base=actor.token?.baseActor??game.actors.get(actor.id);if(base)uuids.add(base.uuid);}
 return uuids;
}
export function ownedVehicles(actor){
 if(!characterTypes.has(actor?.type)||actor.pack||!actor.testUserPermission(game.user,'OBSERVER'))return [];
 const uuids=characterUuids(actor);
 return game.actors.filter(vehicle=>{
  if(vehicle.type!=='vehicle'||vehicle.isToken||!vehicle.testUserPermission(game.user,'OBSERVER'))return false;
  const owners=vehicle.getFlag('starwarsffg','vehicleOwners');
  return Array.isArray(owners)&&owners.some(owner=>uuids.has(owner?.uuid));
 }).sort((a,b)=>a.name.localeCompare(b.name,'fr',{numeric:true,sensitivity:'base'}));
}
async function chooseVehicle(vehicles,combat){
 const content=document.createElement('div'),label=document.createElement('label'),select=document.createElement('select');
 label.textContent=game.i18n.localize("SWFFG.UI.Vehicle.Vehicle");select.name='vehicleId';select.setAttribute('aria-label',game.i18n.localize("SWFFG.UI.Vehicle.VehicleToOpen"));
 for(const vehicle of vehicles){const option=document.createElement('option');option.value=vehicle.id;option.textContent=vehicle.name;select.append(option);}label.append(select);content.append(label);
 return foundry.applications.api.DialogV2.wait({
  classes:['starwarsffg','themed','ffg-owned-vehicle-choice'],window:{title:combat?game.i18n.localize("SWFFG.UI.Vehicle.ChooseVehicleCombat"):game.i18n.localize("SWFFG.UI.Vehicle.ChooseVehicle")},position:{width:Math.min(420,window.innerWidth-32)},content,rejectClose:false,
  buttons:[{action:'open',label:combat?game.i18n.localize("SWFFG.UI.Vehicle.OpenInCombat"):game.i18n.localize("SWFFG.UI.Vehicle.OpenSheetButton"),default:true,callback:(_event,button)=>button.form.elements.vehicleId.value},{action:'cancel',label:game.i18n.localize("SWFFG.UI.Vehicle.Cancel"),callback:()=>null}]
 });
}
async function openVehicle(character,vehicleId,combat){
 const previous=opening.get(vehicleId)??Promise.resolve();
 const task=previous.catch(()=>{}).then(async()=>{
  const vehicle=ownedVehicles(character).find(actor=>actor.id===vehicleId);
  if(!vehicle)throw Error(game.i18n.localize("SWFFG.UI.Vehicle.OwnedVehicleUnavailable"));
  const sheet=vehicle.sheet;
  if(!sheet.rendered){
   // Build the requested view immediately, without displaying the full sheet first.
   sheet._ffgCombatMode=combat;await sheet.render({force:true});
   if(combat){sheet._ffgCombatFullPosition={...sheet.position};sheet._ffgCombatFullWindowId=sheet.window.windowId;await fitCombatSheet(sheet);}
  }else await setCombatSheetMode(sheet,combat);
  if(sheet.minimized)await sheet.maximize();sheet.bringToFront();return sheet;
 });
 opening.set(vehicleId,task);
 try{return await task;}finally{if(opening.get(vehicleId)===task)opening.delete(vehicleId);}
}
export async function openCharacterVehicle(character,{combat=false}={}){
 const key=character.uuid+':'+Boolean(combat);if(choices.has(key))return choices.get(key);
 const task=(async()=>{
  const vehicles=ownedVehicles(character);if(!vehicles.length)throw Error(game.i18n.localize("SWFFG.UI.Vehicle.NoAccessibleOwnedVehicle"));
  const id=vehicles.length===1?vehicles[0].id:await chooseVehicle(vehicles,Boolean(combat));
  if(!id)return null;return openVehicle(character,id,Boolean(combat));
 })();choices.set(key,task);
 try{return await task;}finally{if(choices.get(key)===task)choices.delete(key);}
}
export function renderOwnedVehicleLinks(sheet){
 const root=sheet.element;if(!root?.querySelectorAll||!characterTypes.has(sheet.actor?.type))return;
 for(const button of root.querySelectorAll('.ffg-open-owned-vehicle'))button.remove();
 const vehicles=ownedVehicles(sheet.actor);if(!vehicles.length)return;
 const compact=!!sheet._ffgCombatMode,container=compact?root.querySelector('.ffg-combat-actions'):root.querySelector('.sheet-tabs');
 if(!container)return;
 const button=document.createElement('button');button.type='button';button.className='ffg-open-owned-vehicle '+(compact?'ffg-combat-action':'ffg-summary-button');button.dataset.ownedVehicleMode='full';
 const title=vehicles.length===1?game.i18n.format("SWFFG.UI.Vehicle.OpenSheet",{name:vehicles[0].name}):game.i18n.format("SWFFG.UI.Vehicle.OpenOwnedVehicle",{count:vehicles.length});
 button.title=title;button.setAttribute('aria-label',title);
 const icon=document.createElement('span');icon.className='ffg-owned-vehicle-xwing';icon.setAttribute('aria-hidden','true');button.append(icon);
 if(!compact&&vehicles.length>1){const count=document.createElement('small');count.className='ffg-owned-vehicle-count';count.textContent=String(vehicles.length);count.setAttribute('aria-hidden','true');button.append(count);}
 button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();void openCharacterVehicle(sheet.actor,{combat:false}).catch(error=>ui.notifications.warn(error.message));});container.append(button);
}
let refreshTimer;
function refreshLinks(){
 clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>{for(const sheet of foundry.applications.instances.values())if(sheet.rendered&&sheet.actor&&characterTypes.has(sheet.actor.type))renderOwnedVehicleLinks(sheet);},40);
}
Hooks.on('renderActorSheetFFGV2',renderOwnedVehicleLinks);
for(const hook of ['createActor','updateActor','deleteActor','updateUser'])Hooks.on(hook,refreshLinks);
Hooks.once('init',()=>{const link=document.createElement('link');link.rel='stylesheet';link.href=new URL('../../styles/character-vehicles.css',import.meta.url).href;document.head.append(link);});
