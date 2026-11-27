import {localizedSystemError} from "./system-localization.mjs";
import {FACTIONS,getVehicleAffiliations,isVehicleUuid,normalizeVehicleAffiliations} from './vehicle-factions-model.mjs';
const scope='starwarsffg',tr=key=>game.i18n.localize('SWFFG.VehicleFactions.'+key);
// Preserve existing world settings and vehicle metadata when removing fleet generation.
const AFFILIATION_OVERRIDES_SETTING='fleetAffiliationOverrides';
let writeQueue=Promise.resolve();
const el=(tag,css,text)=>{const node=document.createElement(tag);if(css)node.className=css;if(text!==undefined)node.textContent=text;return node;};
function overrides(){
  try{const saved=game.settings.get(scope,AFFILIATION_OVERRIDES_SETTING);return saved&&typeof saved==='object'&&!Array.isArray(saved)?saved:{};}catch{return {};}
}
async function setVehicleAffiliations(entryOrUuid,factions){
  if(!game.user.isGM)throw localizedSystemError("SWFFG.UI.Operations.VehicleFactionsGMOnly");
  const uuid=typeof entryOrUuid==='string'?entryOrUuid:entryOrUuid?.uuid;
  if(!isVehicleUuid(uuid))throw localizedSystemError("SWFFG.UI.Operations.InvalidModelReference");
  if(!Array.isArray(factions)||factions.some(value=>!['empire','alliance','pirates','hutt','other'].includes(value)))throw localizedSystemError("SWFFG.UI.Operations.ChooseFactions");
  const cleaned=normalizeVehicleAffiliations(factions);
  const task=writeQueue.catch(()=>{}).then(async()=>{
    const saved=structuredClone(overrides());saved[uuid]=cleaned;
    await game.settings.set(scope,AFFILIATION_OVERRIDES_SETTING,saved);return cleaned;
  });writeQueue=task;return task;
}
function stylesheet(){if(document.querySelector('link[data-vehicle-factions-style]'))return;const link=el('link');link.rel='stylesheet';link.href=new URL('../../styles/vehicle-factions.css',import.meta.url).href;link.dataset.vehicleFactionsStyle='';document.head.append(link);}
function sheetFactions(sheet){
  const actor=sheet.actor,host=sheet.element?.querySelector('[data-vehicle-factions]');
  if(!game.user.isGM||actor?.type!=='vehicle'||!host)return;
  const entry={uuid:actor.uuid,name:actor.name,flags:actor.flags};host.replaceChildren();
  const heading=el('header','vehicle-sheet-factions-heading'),title=el('h3','',tr('Title')),info=el('i','fa-solid fa-circle-info');
  info.title=tr('Help');info.setAttribute('aria-label',info.title);heading.append(title,info);host.append(heading);
  const list=el('div','vehicle-sheet-faction-list');host.append(list);
  const overrides=()=>game.settings.get(scope,AFFILIATION_OVERRIDES_SETTING)??{};
  const selected=()=>getVehicleAffiliations(entry,overrides());
  const inputs=[];let pending=0;
  const status=el('p','vehicle-factions-note vehicle-sheet-factions-status');status.setAttribute('role','status');
  for(const faction of FACTIONS){
    const label=el('label'),check=el('input'),name=el('span','',tr('Faction.'+faction.id));
    check.type='checkbox';check.dataset.vehicleFaction=faction.id;check.checked=selected().includes(faction.id);inputs.push(check);label.append(check,name);list.append(label);
    check.addEventListener('change',event=>{
      event.stopPropagation();const chosen=inputs.filter(input=>input.checked).map(input=>input.dataset.vehicleFaction);pending++;status.textContent=tr('Saving');
      void setVehicleAffiliations(entry,chosen).catch(error=>{ui.notifications.warn(error.message);}).finally(()=>{
        pending--;if(pending)return;status.textContent='';const saved=selected();for(const input of inputs)input.checked=saved.includes(input.dataset.vehicleFaction);
      });
    });
  }
  host.append(status);
}
Hooks.once('init',()=>{game.settings.register(scope,AFFILIATION_OVERRIDES_SETTING,{scope:'world',config:false,type:Object,default:{}});stylesheet();});
Hooks.on('renderActorSheetFFGV2',sheetFactions);
