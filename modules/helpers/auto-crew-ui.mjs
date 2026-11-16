import {activateNpcVehicle} from './npc-vehicle-ui.mjs';
import {planAutoCrew} from './auto-crew-model.mjs';
import {completeAutoCrew,autoCrewStationLabel} from './auto-crew.mjs';
import {integratedCrewProfiles,resolveCrewActor,convertAutoCrewToIntegrated,removeIntegratedCrewProfile} from './integrated-crew.mjs';
import {vehicleMinionGroup} from './vehicle-minion-group.mjs';
const tr=key=>game.i18n.localize('SWFFG.AutoCrew.'+key);
const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
function stylesheet(){if(document.querySelector('link[data-auto-crew]'))return;const link=el('link');link.rel='stylesheet';link.href=new URL('../../styles/auto-crew.css',import.meta.url).href;link.dataset.autoCrew='';document.head.append(link);}
Hooks.once('ready',stylesheet);
const readOptions=root=>Object.fromEntries(['mode','actorType','quality','astromech'].map(key=>[key,root.querySelector('[name='+key+']').value]));
function field(parent,name,label,choices,current){
  const wrap=el('label',label),select=el('select');select.name=name;
  for(const [value,text]of choices){const option=el('option',text);option.value=value;option.defaultSelected=value===current;select.append(option);}select.value=current;wrap.append(select);parent.append(wrap);return select;
}
export async function showAutoCrew(vehicle,anchor){
  if(!game.user.isGM||vehicle?.type!=='vehicle'||vehicle.pack||!vehicle.isOwner)return;
  if(vehicle.sheet._autoCrewDialog?.rendered){vehicle.sheet._autoCrewDialog.bringToFront();return;}
  stylesheet();
  const wrapper=el('div'),content=el('section');content.className='ffg-auto-crew-dialog-content';wrapper.append(content);
  const intro=el('p','Les postes intégrés se jouent depuis le vaisseau, sans créer de fiches de personnages. Les membres déjà affectés sont conservés. Mécaniciens et techniciens sont placés dans Passagers.');intro.className='ffg-auto-crew-help';content.append(intro);
  const fields=el('div');fields.className='ffg-auto-crew-fields';content.append(fields);
  field(fields,'mode','Équipage',vehicle.flags?.starwarsffg?.vehicleCreationMode==='independent'?[['detailed','Personnages détaillés']]:[['integrated','PNJ intégré, sans fiches'],['detailed','Personnages détaillés']],vehicle.flags?.starwarsffg?.vehicleCreationMode==='independent'?'detailed':'integrated');
  const grouped=vehicleMinionGroup(vehicle).enabled;
  const type=field(fields,'actorType','Profil',[['minion','Sbire'],['rival','Rival'],['nemesis','Némésis']],grouped?'minion':'rival');type.disabled=grouped;
  for(const [name,key,choices]of [['quality','QualityLabel',['novice','standard','veteran']],['astromech','AstromechLabel',['auto','yes','no']]])
    field(fields,name,tr(key),choices.map(value=>[value,tr((name==='quality'?'Quality.':'Astromech.')+value)]),name==='quality'?'standard':'auto');
  const summary=el('strong');summary.dataset.autoCrewSummary='';content.append(summary);
  const list=el('div');list.className='ffg-auto-crew-stations';list.dataset.autoCrewStations='';content.append(list);
  const note=el('p',tr('WeaponHelp'));note.className='ffg-auto-crew-help';content.append(note);
  const app=new foundry.applications.api.DialogV2({classes:['starwarsffg','themed','ffg-auto-crew-dialog'],window:{title:tr('Title')+' - '+vehicle.name,resizable:true},position:{width:560},content:wrapper,
    buttons:[{action:'complete',label:tr('Apply'),callback:async(_event,_button,dialog)=>{
      const root=dialog.element,options=readOptions(root);if(grouped)options.actorType='minion';
      options.stations=[...root.querySelectorAll('[data-auto-crew-station]:checked')].map(input=>input.value);
      const result=await completeAutoCrew(vehicle,options);
      ui.notifications.info(options.mode==='integrated'?`${result.integrated??result.created??0} postes intégrés préparés.`:game.i18n.format('SWFFG.AutoCrew.Created',{count:result.created}));return result;
    }},{action:'cancel',label:tr('Cancel')}]
  });
  vehicle.sheet._autoCrewDialog=app;await app.render({force:true});
  const root=app.element;
  const preview=()=>{
    const options=readOptions(root),plan=planAutoCrew(vehicle,options,id=>resolveCrewActor(id,vehicle)),list=root.querySelector('[data-auto-crew-stations]');list.replaceChildren();
    for(const station of plan.stations){const row=el('label'),check=el('input');check.type='checkbox';check.value=station.key;check.dataset.autoCrewStation='';check.checked=true;row.append(check,document.createTextNode(autoCrewStationLabel(station)+(station.passenger?' · Passagers':'')));list.append(row);}
    root.querySelector('[data-auto-crew-summary]').textContent=`${plan.stations.length} poste(s) à compléter${options.mode==='integrated'?' dans le vaisseau':''}`;
    if(!plan.stations.length)list.append(el('p',tr('Complete')));
    root.querySelector('[data-action=complete]').disabled=!plan.stations.length&&!plan.weaponUpdates.length&&JSON.stringify(plan.crew)===JSON.stringify(vehicle.getFlag('starwarsffg','crew')??[]);
  };
  for(const select of root.querySelectorAll('select'))select.addEventListener('change',preview);preview();
}
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
  if(sheet.element.querySelector('[data-auto-crew-open]'))return;
  const bar=el('div');bar.className='ffg-auto-crew-toolbar';const button=el('button');button.type='button';button.dataset.autoCrewOpen='';button.title=tr('Help');
  const icon=el('i');icon.className='fa-solid fa-users-gear';icon.setAttribute('aria-hidden','true');button.append(icon,document.createTextNode(tr('Title')));
  button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();void showAutoCrew(vehicle,sheet.element).catch(error=>ui.notifications.error(error.message));});bar.append(button);
  const generated=(vehicle.getFlag('starwarsffg','crew')??[]).some(member=>!member.integrated&&game.actors.get(member.actor_id)?.flags?.starwarsffg?.autoCrew?.vehicleUuid===vehicle.uuid);
  if(generated){const convert=el('button','Intégrer l’équipage automatique');convert.type='button';convert.dataset.convertIntegratedCrew='';convert.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();void convertCrew(vehicle).catch(error=>ui.notifications.error(error.message));});bar.append(convert);}
  const integrated=integratedCrewProfiles(vehicle).filter(profile=>(vehicle.getFlag('starwarsffg','crew')??[]).some(member=>member.actor_id===profile.id));if(integrated.length){const badge=el('small',`${integrated.length} postes intégrés`);badge.className='ffg-integrated-crew-count';bar.append(badge);}
  table.before(bar);
}
