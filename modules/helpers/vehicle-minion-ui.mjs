import {vehicleMinionGroup,setVehicleMinionGroup,vehicleMinionCriticalChange} from './vehicle-minion-group.mjs';

const el=(tag,css,text)=>{const node=document.createElement(tag);if(css)node.className=css;if(text!==undefined)node.textContent=String(text);return node;};
export function activateVehicleMinionGroup(sheet){
  const vehicle=sheet.actor,table=sheet.element?.querySelector('.vehicle-crew-table');
  if(vehicle?.type!=='vehicle'||!table)return;
  const npc=vehicle.flags?.starwarsffg?.npcVehicle;
  if(npc?.version===1&&npc.type==='minion'){drawMinionCards(sheet);return;}
  if(npc?.version===1||!game.user.isGM||vehicle.pack||!sheet.isEditable)return;
  sheet.element.querySelector('[data-vehicle-minion-config]')?.remove();
  const state=vehicleMinionGroup(vehicle),configuredCount=vehicle.flags?.starwarsffg?.vehicleMinionGroup?.count??state.count??1,section=el('section','ffg-vehicle-minion-config');section.dataset.vehicleMinionConfig='';
  const heading=el('label','ffg-vehicle-minion-toggle'),enabled=el('input');enabled.type='checkbox';enabled.checked=state.enabled;enabled.dataset.vehicleMinionEnabled='';
  heading.append(enabled,document.createTextNode('Groupe de véhicules sbires'));section.append(heading);
  const row=el('div','ffg-vehicle-minion-fields'),countLabel=el('label','','Effectif initial'),count=el('input');
  count.type='number';count.min='1';count.max='100';count.step='1';count.value=String(configuredCount);count.disabled=!state.enabled;count.dataset.vehicleMinionCount='';countLabel.append(count);row.append(countLabel);
  const summary=el('strong','',state.enabled?`${state.alive} / ${state.count} appareils survivants`:'Un pion par véhicule');summary.dataset.vehicleMinionSurvivors='';row.append(summary);section.append(row);
  if(state.enabled)section.append(el('p','ffg-auto-crew-help',`Coque du groupe : ${state.damage} / ${state.totalHull}. Seuil individuel : ${state.hullPerVehicle}.`));
  const save=async event=>{
    event.stopPropagation();const requested=Number(count.value);
    if(!Number.isInteger(requested)||requested<1||requested>100){count.value=String(configuredCount);return;}
    enabled.disabled=count.disabled=true;
    try{
      const generated=(vehicle.flags?.starwarsffg?.crew??[]).some(member=>!member.integrated&&game.actors.get(member.actor_id)?.flags?.starwarsffg?.autoCrew?.vehicleUuid===vehicle.uuid);
      if(enabled.checked&&generated){const {convertCrew}=await import('./auto-crew-ui.mjs');if(!await convertCrew(vehicle)){enabled.checked=state.enabled;return;}}
      await setVehicleMinionGroup(vehicle,{enabled:enabled.checked,count:requested});await sheet.render({force:true});
    }
    catch(error){ui.notifications.warn(error.message);enabled.checked=state.enabled;count.value=String(configuredCount);}
    finally{enabled.disabled=false;count.disabled=!enabled.checked;}
  };
  enabled.addEventListener('change',save);count.addEventListener('change',save);
  table.before(section);
}

function positionMinionCards(sheet){
  const cards=sheet.element?.querySelector('[data-vehicle-minion-cards]');if(!cards)return;
  const combat=sheet.element.querySelector('.ffg-combat-left');
  if(combat){if(cards.parentElement!==combat)combat.prepend(cards);return;}
  const anchor=sheet.element.querySelector('.dashboard-row-1');
  if(anchor&&cards.nextElementSibling!==anchor)anchor.before(cards);
}
function drawMinionCards(sheet){
  const vehicle=sheet.actor,state=vehicleMinionGroup(vehicle),editable=game.user.isGM&&vehicle.isOwner&&sheet.isEditable&&!vehicle.pack;
  sheet.element.querySelector('[data-vehicle-minion-cards]')?.remove();
  const cards=el('section','ffg-vehicle-minion-cards');cards.dataset.vehicleMinionCards='';
  const block=(title)=>{const card=el('article','ffg-vehicle-stat ffg-vehicle-minion-card');card.append(el('h3','',title));const values=el('div','ffg-vehicle-stat-values');card.append(values);cards.append(card);return values;};
  const label=(parent,title,control)=>{const wrap=el('label');wrap.append(el('span','',title),control);parent.append(wrap);};
  const quantities=block(game.i18n.localize('SWFFG.MinionQuantity'));
  const count=el('input');count.type='number';count.min='1';count.max='100';count.step='1';count.value=String(state.count);count.disabled=!editable;count.dataset.vehicleMinionCount='';
  count.setAttribute('aria-label',game.i18n.localize('SWFFG.MinionQuantityMax'));
  if(!vehicle.isToken)count.title='Effectif du modèle. Chaque pion posé sur la scène conserve ensuite son propre groupe.';
  const alive=el('input');alive.type='text';alive.value=String(state.alive);alive.disabled=true;alive.dataset.vehicleMinionAlive='';alive.setAttribute('aria-label',game.i18n.localize('SWFFG.MinionQuantityAlive'));
  label(quantities,game.i18n.localize('SWFFG.MinionQuantityMax'),count);label(quantities,game.i18n.localize('SWFFG.MinionQuantityAlive'),alive);
  const eliminate=block(game.i18n.localize('SWFFG.Actors.Sheets.Token.KillMinion.Label'));
  const buttons=[];let pending=false;
  const perform=async action=>{
    if(pending||!editable||!game.user.isGM)return;
    pending=true;count.disabled=true;for(const button of buttons)button.disabled=true;
    try{await action();await sheet.render({force:true});}
    catch(error){ui.notifications.warn(error.message);count.value=String(vehicleMinionGroup(vehicle).count);}
    finally{pending=false;if(count.isConnected)count.disabled=!editable;for(const button of buttons)if(button.isConnected)button.disabled=!editable||!vehicleMinionGroup(vehicle).alive||vehicleMinionGroup(vehicle).hullPerVehicle<=0;}
  };
  count.addEventListener('change',event=>{
    event.stopPropagation();const value=Number(count.value);
    if(!Number.isInteger(value)||value<1||value>100){count.value=String(vehicleMinionGroup(vehicle).count);return;}
    void perform(()=>setVehicleMinionGroup(vehicle,{enabled:true,count:value}));
  });
  for(const [id,text,icons]of [['one','SWFFG.Actors.Sheets.Token.KillMinion.KillMinion',['fa-skull-crossbones']],['all','SWFFG.Actors.Sheets.Token.KillMinion.KillGroup',['fa-skull-crossbones','fa-person','fa-skull-crossbones']]]){
    const button=el('button','ffg-vehicle-minion-eliminate');button.type='button';button.dataset.vehicleMinionEliminate=id;
    button.title=button.ariaLabel=id==='one'?'Éliminer un appareil du groupe':'Éliminer tous les appareils du groupe';
    button.disabled=!editable||!state.alive||state.hullPerVehicle<=0;
    for(const icon of icons){const glyph=el('i','fa-solid '+icon);glyph.setAttribute('aria-hidden','true');button.append(glyph);}
    button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();void perform(async()=>{
      const group=vehicleMinionGroup(vehicle);if(!group.alive)return;
      const damage=id==='one'?vehicleMinionCriticalChange(vehicle).after:Math.max(group.damage,group.totalHull+1);
      await vehicle.update({'system.stats.hullTrauma.value':damage});
    });});buttons.push(button);label(eliminate,game.i18n.localize(text),button);
  }
  const anchor=sheet.element.querySelector('.dashboard-row-1')??sheet.element.querySelector('.vehicle-crew-table');
  if(anchor)anchor.before(cards);positionMinionCards(sheet);
}
if(globalThis.Hooks)Hooks.on('renderActorSheetFFGV2',positionMinionCards);
