import {isInventoryEquipment,isPossession,possessionUpdate,possessionData} from './inventory-location.js';
const allowed=sheet=>sheet.isEditable&&sheet.actor.isOwner&&sheet.actor.verifyEditModeIsNotEnabled();
export async function moveInventoryEquipment(sheet,itemId,stored){
 if(!allowed(sheet))return false;
 const item=sheet.actor.items.get(itemId);
 if(!isInventoryEquipment(item))throw Error('Cet équipement n’est plus présent sur la fiche.');
 await item.update(possessionUpdate(stored));
 const current=sheet.actor.items.get(itemId);
 if(!current||isPossession(current)!==stored)throw Error('Le rangement de cet équipement n’a pas été enregistré.');
 // Foundry refreshes the actor sheet after this embedded Item update.
 // A second forced render resets the inventory view and can race with that refresh.
 return true;
}
export async function dropPossession(sheet,event,item) {
 if(!event.target?.closest?.('[data-possession-section]')||!isInventoryEquipment(item))return false;
 if(!allowed(sheet))return true;
 if(item.parent?.uuid===sheet.actor.uuid)await item.update(possessionUpdate(true));
 else {
  const data=item.toObject(false);data.effects=item.effects.map(effect=>effect.toObject());
  await sheet.actor.createEmbeddedDocuments('Item',[possessionData(data)]);
 }
 return true;
}
export function activateInventoryPossessions(sheet) {
 if(!['character','minion','rival','nemesis'].includes(sheet.actor.type))return;
 for(const row of sheet.element.querySelectorAll('.items-list > .item[data-item-id]')){
  const item=sheet.actor.items.get(row.dataset.itemId);if(!isInventoryEquipment(item)||!sheet.isEditable)continue;
  if(row.querySelector('.ffg-possession-toggle'))continue;
  const button=document.createElement('button');button.type='button';button.className='ffg-possession-toggle';
  const stored=isPossession(item);button.title=stored?'Transporter cet équipement':'Ranger dans Possession (non transporté)';button.setAttribute('aria-label',button.title+' : '+item.name);
  const icon=document.createElement('i');icon.className=stored?'fa-solid fa-person-walking-luggage':'fa-solid fa-box-archive';icon.setAttribute('aria-hidden','true');button.append(icon);
  button.addEventListener('click',async event=>{event.preventDefault();event.stopPropagation();if(button.disabled)return;button.disabled=true;try{const current=sheet.actor.items.get(item.id);await moveInventoryEquipment(sheet,item.id,!isPossession(current));}catch(error){ui.notifications.error(error.message);}finally{button.disabled=false;}});
  button.addEventListener('dblclick',event=>event.stopPropagation());
  row.querySelector('.item-controls')?.prepend(button);
 }
 const add=sheet.element.querySelector('[data-possession-add]');if(!add)return;
 add.disabled=!sheet.isEditable;
 add.addEventListener('click',async event=>{
  event.preventDefault();event.stopPropagation();if(!allowed(sheet))return;
  const content=document.createElement('div');content.innerHTML='<label>Type d’équipement<select name="possession-type"><option value="weapon">Arme</option><option value="armour">Armure</option><option value="gear">Matériel</option></select></label><label>Nom<input type="text" name="possession-name" value="Nouvelle possession" required></label><p>Équipement possédé, non transporté. Aucun encombrement ni effet appliqué au personnage.</p>';
  const choice=await foundry.applications.api.DialogV2.wait({classes:['starwarsffg','themed'],window:{title:'Ajouter une possession'},position:{width:360},content,buttons:[{action:'create',label:'Ajouter',default:true,callback:(_event,button)=>({type:button.form.elements['possession-type'].value,name:button.form.elements['possession-name'].value.trim()})},{action:'cancel',label:'Annuler'}],close:()=>null,rejectClose:false});
  if(!choice||choice==='cancel'||!choice.name||!['weapon','armour','gear'].includes(choice.type)||!allowed(sheet))return;
  const [created]=await sheet.actor.createEmbeddedDocuments('Item',[possessionData({name:choice.name,type:choice.type,system:{quantity:{value:1}}})]);created?.sheet?.render(true);
 });
}
