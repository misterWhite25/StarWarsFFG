import {vehicleMinionGroup,setVehicleMinionGroup,vehicleMinionCriticalChange} from './vehicle-minion-group.mjs';

const el=(tag,css,text)=>{const node=document.createElement(tag);if(css)node.className=css;if(text!==undefined)node.textContent=String(text);return node;};
export function activateVehicleMinionGroup(sheet){
  const vehicle=sheet.actor,table=sheet.element?.querySelector('.vehicle-crew-table');
  if(vehicle?.type!=='vehicle'||!table)return;
  const npc=vehicle.flags?.starwarsffg?.npcVehicle;
  if(npc?.version===1 && npc.type==='minion') drawMinionCards(sheet);
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
