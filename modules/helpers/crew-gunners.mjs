import {assignCrewRoles} from './crew-assignments.mjs';
export const isGunner=role=>['gunner','artilleur'].includes(String(role??'').trim().toLowerCase());
export const gunnerWeapons=items=>Array.from(items??[]).filter(w=>w.type==='shipweapon'&&w.flags?.starwarsffg?.weaponCrew?.gunner===true);
const id=w=>w.id??w._id;
const tr=k=>game.i18n.localize(`SWFFG.Crew.WeaponAssignment.${k}`);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
/** Preserve valid bindings first, then allocate old unbound crew in their existing order. */
export function bindGunners(crew,items){
  const weapons=gunnerWeapons(items),available=new Set(weapons.map(id)),used=new Set();
  const result=crew.map(e=>({...e}));
  for(const entry of result.filter(e=>isGunner(e.role))){
    if(available.has(entry.weapon_id)&&!used.has(entry.weapon_id))used.add(entry.weapon_id);
    else delete entry.weapon_id;
  }
  const free = weapons.filter(weapon => !used.has(id(weapon))).values();
  for (const entry of result) {
    if (!isGunner(entry.role) || entry.weapon_id) continue;
    const weapon = free.next().value;
    if (!weapon) break;
    entry.weapon_id = id(weapon);
  }
  return result;
}
export function vehicleCrew(vehicle) {
  return bindGunners(vehicle.getFlag('starwarsffg', 'crew') ?? [], vehicle.items);
}

async function chooseReplacement(choices,{targeted=false}={}){
  return foundry.applications.api.DialogV2.wait({window:{title:tr('Title')},classes:['starwarsffg','themed'],content:`<p>${tr(targeted?'OccupiedPrompt':'Full')}</p><label>${tr('Choose')}<select name="gunner-weapon">${choices.map(c=>`<option value="${esc(c.weaponId)}">${esc(c.weaponName)} - ${esc(c.occupantName)}</option>`).join('')}</select></label>`,buttons:[{action:'replace',label:tr('Replace'),callback:(_event,_button,dialog)=>dialog.element.querySelector('[name="gunner-weapon"]').value},{action:'cancel',label:tr('Cancel'),callback:()=>null}],rejectClose:false});
}
/** Called within the vehicle crew transaction. Cancel never writes partial role changes. */
export async function assignArmedCrew(vehicle,current,member,roles,link,{choose=chooseReplacement,notify=key=>ui.notifications.warn(tr(key)),weaponId=null}={}){
  const initial=bindGunners(current,vehicle.items);
  let next=assignCrewRoles(initial,member,roles,link);
  if(!roles.some(isGunner))return bindGunners(next,vehicle.items);
  const weapons=gunnerWeapons(vehicle.items);
  if(!weapons.length){notify('None');return null;}
  next=bindGunners(next,vehicle.items);
  const own=next.find(e=>e.actor_id===member.id&&isGunner(e.role));
  if(weaponId&&!weapons.some(w=>id(w)===weaponId)){notify('Stale');return null;}
  if(!weaponId&&own.weapon_id)return next;
  if(weaponId){
    const occupied=next.some(e=>isGunner(e.role)&&e.actor_id!==member.id&&e.weapon_id===weaponId);
    if(!occupied){own.weapon_id=weaponId;return next;}
  }
  const snapshot=JSON.stringify(vehicle.getFlag('starwarsffg','crew')??[]),weaponSnapshot=weapons.map(id).join('|');
  const choices=weapons.filter(w=>!weaponId||id(w)===weaponId).map(w=>({weaponId:id(w),weaponName:w.name,occupantName:next.find(e=>isGunner(e.role)&&e.weapon_id===id(w))?.actor_name??''}));
  const selected=await choose(choices,{targeted:Boolean(weaponId)});
  if(!selected)return null;
  if(JSON.stringify(vehicle.getFlag('starwarsffg','crew')??[])!==snapshot||gunnerWeapons(vehicle.items).map(id).join('|')!==weaponSnapshot){notify('Stale');return null;}
  if(!choices.some(c=>c.weaponId===selected)){notify('Stale');return null;}
  next=next.filter(e=>!isGunner(e.role)||e.weapon_id!==selected||e.actor_id===member.id);
  next.find(e=>e.actor_id===member.id&&isGunner(e.role)).weapon_id=selected;
  return next;
}

export function parseCrewSelections(selections,gunnerRole='Gunner'){
  const weapons=[...new Set((selections??[]).filter(v=>String(v).startsWith('@weapon:')).map(v=>v.slice(8)))];
  const roles=[...new Set((selections??[]).filter(v=>!String(v).startsWith('@weapon:')))];
  if(weapons.length&&!roles.some(isGunner))roles.push(gunnerRole);
  return {roles,weaponId:weapons[0]??null,valid:weapons.length<=1};
}
export function crewWeaponChoices(crew,items,memberId){
  const bound=bindGunners(crew,items);
  return gunnerWeapons(items).map(w=>{
    const occupant=bound.find(e=>isGunner(e.role)&&e.weapon_id===id(w));
    return {value:`@weapon:${id(w)}`,weaponId:id(w),name:w.name,occupant:occupant?.actor_name??'',selected:occupant?.actor_id===memberId};
  });
}
