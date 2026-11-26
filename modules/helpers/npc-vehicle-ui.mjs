import {npcVehicle,npcVehicleData,copyNpcVehicle,npcStationActor,synchronizeNpcVehicle,ensureNpcInitiativeSkills} from './npc-vehicle.mjs';
const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
export async function chooseVehicleMode(name=''){
  const content=el('div'),body=el('section');body.style.cssText='display:grid;gap:12px;font:13px/1.4 Arial,sans-serif';content.append(body);
  const details=el('div');details.style.cssText='display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 12px;align-items:start';
  const field=(label,name,choices)=>{const wrap=el('label',label),select=el('select');select.name=name;wrap.style.minWidth='0';select.style.cssText='display:block;box-sizing:border-box;width:100%;min-width:0;margin-top:3px';for(const [value,label]of choices){const option=el('option',label);option.value=value;select.append(option);}wrap.append(select);details.append(wrap);return select;};
  const mode=field('Utilisation','vehicleMode',[['independent','Véhicule indépendant'],['npc','Véhicule PNJ']]);
  const type=field('Type de PNJ','npcType',[['minion','Sbire'],['rival','Rival'],['nemesis','Némésis']]);
  type.options[1].defaultSelected=true;
  const quality=field('Compétences','npcQuality',[['novice','Novice'],['standard','Standard'],['veteran','Vétéran']]);
  quality.options[1].defaultSelected=true;
  const astro=field('Astromech','npcAstromech',[['auto','Selon le modèle'],['yes','Oui'],['no','Non']]);
  const note=el('p');note.dataset.vehicleModeNote='';note.style.cssText='margin:0;text-align:justify;font-style:italic';body.append(details,note);
  const update=()=>{const npc=mode.value==='npc';type.parentElement.hidden=quality.parentElement.hidden=astro.parentElement.hidden=!npc;note.textContent=npc?'Les compétences des postes sont enregistrées dans le véhicule. Aucun personnage n’est créé. Pour les sbires, réglez l’effectif sur chaque pion une fois posé sur la scène.':'Fiche classique : ajoutez vos acteurs dans Équipage et Passagers.';};mode.addEventListener('change',update);update();
  const chosen=await foundry.applications.api.DialogV2.wait({classes:['starwarsffg','themed','ffg-vehicle-mode'],window:{title:'Créer un véhicule'+(name?' - '+name:'')},position:{width:520},content,rejectClose:false,render:(_event,dialog)=>{
    const root=dialog.element,mode=root.querySelector('[name=vehicleMode]');
    const update=()=>{const npc=mode.value==='npc';for(const name of ['npcType','npcQuality','npcAstromech'])root.querySelector('[name='+name+']').parentElement.hidden=!npc;root.querySelector('[data-vehicle-mode-note]').textContent=npc?'Les compétences des postes sont enregistrées dans le véhicule. Aucun personnage n’est créé. Pour les sbires, réglez l’effectif sur chaque pion une fois posé sur la scène.':'Fiche classique : ajoutez vos acteurs dans Équipage et Passagers.';};
    mode.addEventListener('change',update);update();
  },buttons:[{action:'continue',label:'Continuer',callback:(_event,button)=>({mode:button.form.elements.vehicleMode.value,type:button.form.elements.npcType.value,quality:button.form.elements.npcQuality.value,astromech:button.form.elements.npcAstromech.value})},{action:'cancel',label:'Annuler',callback:()=>false}]});
  return chosen&&typeof chosen==='object'&&['independent','npc'].includes(chosen.mode)?chosen:null;
}
export async function prepareVehicleCreation(vehicle,operation,user){
  if(vehicle.type!=='vehicle'||vehicle.pack||vehicle.parent||user.id!==game.user.id)return true;
  let choice=operation.ffgVehicleChoice;
  if(!choice&&(operation.fromCompendium||operation.ffgVehicleCreationUI)){
    choice=await chooseVehicleMode(vehicle.name);if(!choice)return false;
  }
  if(choice?.mode==='npc')vehicle.updateSource(npcVehicleData(vehicle,choice));
  else if(choice?.mode==='independent'){
    const changes={'flags.starwarsffg.vehicleCreationMode':'independent'};
    if(npcVehicle(vehicle))Object.assign(changes,{'flags.starwarsffg.-=npcVehicle':null,'flags.starwarsffg.crew':[],'flags.starwarsffg.vehicleDeck.passengers':null,'flags.starwarsffg.vehicleMinionGroup':{enabled:false,count:1},'prototypeToken.actorLink':true});
    vehicle.updateSource(changes);
  }else if(npcVehicle(vehicle))vehicle.updateSource(copyNpcVehicle(vehicle));
  return true;
}
export async function editNpcSkills(vehicle,id){
  if(!game.user.isGM)return;
  await ensureNpcInitiativeSkills(vehicle);
  const posts=vehicle.flags.starwarsffg.npcVehicle.stations,post=posts[id];if(!post)return;
  const content=el('div'),body=el('section');body.style.cssText='display:grid;gap:5px;font:12px/1.4 Arial,sans-serif';content.append(body);
  const title=el('p','Compétences du poste PNJ. Aptitude et rang déterminent les dés du jet.');title.style.textAlign='justify';body.append(title);
  for(const [key,pool]of Object.entries(post.skills)){
    if(key.startsWith('Piloting:')&&key!==(vehicle.system.spaceShip?'Piloting: Space':'Piloting: Planetary'))continue;
    const row=el('div');row.style.cssText='display:grid;grid-template-columns:1fr 80px 80px;gap:6px;align-items:center';row.append(el('span',npcStationActor(id,vehicle).system.skills[key]?.label??key));
    for(const [field,label]of [['ability','Aptitude'],['rank','Rang']]){const wrap=el('label',label),input=el('input');input.type='number';input.min='0';input.max=field==='ability'?'6':'5';input.name=key+'.'+field;input.defaultValue=pool[field];input.style.textAlign='center';wrap.append(input);row.append(wrap);}body.append(row);
  }
  return foundry.applications.api.DialogV2.wait({classes:['starwarsffg','themed','ffg-npc-skills'],window:{title:post.name+' - Compétences'},position:{width:450},content,rejectClose:false,buttons:[{action:'save',label:'Enregistrer',callback:async(_event,button)=>{
    const skills=structuredClone(post.skills);for(const input of button.form.querySelectorAll('input')){const [key,field]=[input.name.slice(0,input.name.lastIndexOf('.')),input.name.slice(input.name.lastIndexOf('.')+1)];const value=Number(input.value);if(!Number.isInteger(value)||value<0||value>Number(input.max))throw Error('Valeur de compétence invalide.');skills[key][field]=value;}
    await vehicle.update({['flags.starwarsffg.npcVehicle.stations.'+id+'.skills']:skills});return true;
  }},{action:'cancel',label:'Annuler',callback:()=>false}]});
}
export function activateNpcVehicle(sheet){
  const vehicle=sheet.actor;if(!npcVehicle(vehicle))return false;
  for(const control of sheet.element.querySelectorAll('[data-integrated-crew-profile]'))control.addEventListener('click',event=>{event.preventDefault();void editNpcSkills(vehicle,control.dataset.integratedCrewProfile);});
  for(const control of sheet.element.querySelectorAll('[data-integrated-crew-remove]'))control.addEventListener('click',async event=>{event.preventDefault();const {removeNpcStation}=await import('./npc-vehicle.mjs');await removeNpcStation(vehicle,control.dataset.integratedCrewRemove);});
  for(const control of sheet.element.querySelectorAll('.vehicle-crew-table .crew-roll,.vehicle-crew-table .crew-gunnery-roll'))control.addEventListener('click',event=>{
    event.preventDefault();event.stopImmediatePropagation();
    const row=control.closest('[data-actor-id]'),actor=npcStationActor(row?.dataset.actorId,vehicle);if(!actor||!game.user.isGM)return;
    const pilot=['pilot','copilot','astromech'].includes(actor._integratedCrew.kind),key=control.classList.contains('crew-gunnery-roll')||!pilot?'Gunnery':vehicle.system.spaceShip?'Piloting: Space':'Piloting: Planetary';
    import('./dice-helpers.js').then(({default:DiceHelpers})=>DiceHelpers.rollSkillByKey(actor,key)).catch(error=>ui.notifications.warn(error.message));
  },true);
  const table=sheet.element.querySelector('.vehicle-crew-table');if(table){const badge=el('div','Véhicule PNJ · '+({minion:'Sbires',rival:'Rival',nemesis:'Némésis'}[vehicle.flags.starwarsffg.npcVehicle.type]));badge.className='ffg-auto-crew-toolbar';badge.style.cssText='font-size:12px;justify-content:flex-start';table.before(badge);}
  return true;
}
if(globalThis.Hooks)for(const hook of ['createItem','deleteItem','updateItem'])Hooks.on(hook,item=>{
  if(!game.user.isGM||!npcVehicle(item.parent)||item.type!=='shipweapon')return;
  if(game.actors.get(item.parent.id)!==item.parent)return;
  void synchronizeNpcVehicle(item.parent).catch(error=>ui.notifications.warn(error.message));
});
if(globalThis.Hooks)Hooks.on('updateActor',(vehicle,changes)=>{
  if(!game.user.isGM||!npcVehicle(vehicle)||game.actors.get(vehicle.id)!==vehicle)return;
  if(changes.system?.stats?.silhouette||Object.hasOwn(changes,'system.stats.silhouette.value'))void synchronizeNpcVehicle(vehicle).catch(error=>ui.notifications.warn(error.message));
});

if(globalThis.Hooks){
  const migrateInitiative=vehicle=>{if(game.users.activeGM?.id===game.user.id&&npcVehicle(vehicle))void ensureNpcInitiativeSkills(vehicle).catch(error=>ui.notifications.warn(error.message));};
  Hooks.once('ready',async()=>{
    if(game.users.activeGM?.id!==game.user.id)return;
    try{
      for(const vehicle of game.actors)if(npcVehicle(vehicle))await ensureNpcInitiativeSkills(vehicle);
      for(const scene of game.scenes)for(const token of scene.tokens)if(!token.actorLink&&npcVehicle(token.actor))await ensureNpcInitiativeSkills(token.actor);
    }catch(error){ui.notifications.warn(error.message);}
  });
  Hooks.on('createActor',migrateInitiative);
  Hooks.on('createToken',token=>migrateInitiative(token.actor));
}
