import {activateNpcVehicle} from './npc-vehicle-ui.mjs';
import {integratedCrewProfiles,resolveCrewActor,convertAutoCrewToIntegrated,removeIntegratedCrewProfile} from './integrated-crew.mjs';
const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
function stylesheet(){if(document.querySelector('link[data-auto-crew]'))return;const link=el('link');link.rel='stylesheet';link.href=new URL('../../styles/auto-crew.css',import.meta.url).href;link.dataset.autoCrew='';document.head.append(link);}
Hooks.once('ready',stylesheet);
export async function convertCrew(vehicle){
  const wrapper=el('div'),body=el('section'),info=el('p','Les profils créés automatiquement seront intégrés au vaisseau avec leurs compétences et leurs talents.');body.className='ffg-auto-crew-dialog-content';info.className='ffg-auto-crew-help';body.append(info);wrapper.append(body);
  const label=el('label'),check=el('input');check.type='checkbox';check.name='cleanup';label.append(check,document.createTextNode('Retirer les fiches automatiques devenues inutiles'));body.append(label);
  const chosen=await foundry.applications.api.DialogV2.wait({classes:['starwarsffg','themed','ffg-auto-crew-dialog'],window:{title:'Intégrer l’équipage automatique'},position:{width:450},content:wrapper,rejectClose:false,
    buttons:[{action:'convert',label:'Intégrer',callback:(_event,button)=>({cleanup:button.form.elements.cleanup.checked})},{action:'cancel',label:'Annuler',callback:()=>false}]});
  if(!chosen||typeof chosen!=='object'||Array.isArray(chosen)||typeof chosen.cleanup!=='boolean')return false;
  await convertAutoCrewToIntegrated(vehicle,chosen);await vehicle.sheet.render({force:true});return true;
}
export function activateAutoCrew(sheet){
  if(activateNpcVehicle(sheet))return;
  const vehicle=sheet.actor;if(vehicle?.type!=='vehicle'||vehicle.pack||!game.user.isGM||!sheet.isEditable)return;
  stylesheet();
  const table=sheet.element?.querySelector('.vehicle-crew-table');if(!table)return;
  for(const control of sheet.element.querySelectorAll('[data-integrated-crew-profile]'))control.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();void Promise.resolve().then(()=>resolveCrewActor(control.dataset.integratedCrewProfile,vehicle)?.sheet.render({force:true})).catch(error=>ui.notifications.error(error.message));});
  for(const control of sheet.element.querySelectorAll('[data-integrated-crew-skill]'))control.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();void Promise.resolve().then(async()=>{const {default:DiceHelpers}=await import('./dice-helpers.js');return DiceHelpers.rollSkillByKey(control.dataset.integratedCrewSkill,control.dataset.skill);}).catch(error=>ui.notifications.error(error.message));});
  for(const control of sheet.element.querySelectorAll('[data-integrated-crew-remove]'))control.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();void removeIntegratedCrewProfile(vehicle,control.dataset.integratedCrewRemove).catch(error=>ui.notifications.error(error.message));});
  if(sheet.element.querySelector('[data-legacy-crew-toolbar]'))return;
  const bar=el('div');bar.className='ffg-auto-crew-toolbar';bar.dataset.legacyCrewToolbar='';
  const generated=(vehicle.getFlag('starwarsffg','crew')??[]).some(member=>!member.integrated&&game.actors.get(member.actor_id)?.flags?.starwarsffg?.autoCrew?.vehicleUuid===vehicle.uuid);
  if(generated){const convert=el('button','Intégrer l’équipage automatique');convert.type='button';convert.dataset.convertIntegratedCrew='';convert.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();void convertCrew(vehicle).catch(error=>ui.notifications.error(error.message));});bar.append(convert);}
  const integrated=integratedCrewProfiles(vehicle).filter(profile=>(vehicle.getFlag('starwarsffg','crew')??[]).some(member=>member.actor_id===profile.id));if(integrated.length){const badge=el('small',`${integrated.length} postes intégrés`);badge.className='ffg-integrated-crew-count';bar.append(badge);}
  if(bar.childElementCount)table.before(bar);
}
