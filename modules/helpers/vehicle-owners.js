const pending = new Map();
const characterTypes = new Set(['character','minion','rival','nemesis']);
export const isVehicleOwnerActor = actor => actor?.documentName === 'Actor' && characterTypes.has(actor.type);
const ownerEntries = actor => actor.getFlag('starwarsffg','vehicleOwners') ?? [];
const allowed = sheet => sheet.actor.type === 'vehicle' && sheet.isEditable && sheet.actor.isOwner;
const localize = key => game.i18n.localize(`SWFFG.VehicleOwners.${key}`);

async function changeOwners(sheet, transform) {
  if(!allowed(sheet))return false;
  const key = sheet.actor.uuid;
  const previous = pending.get(key) ?? Promise.resolve();
  const next = previous.catch(()=>{}).then(async()=>{
    if(!allowed(sheet))return false;
    const before = ownerEntries(sheet.actor);
    const after = transform(before);
    if(after === before)return false;
    await sheet.actor.setFlag('starwarsffg','vehicleOwners',after);
    return true;
  });
  pending.set(key,next);
  try{return await next;}finally{if(pending.get(key)===next)pending.delete(key);}
}

export async function addVehicleOwner(sheet, actor) {
  if(!allowed(sheet))return false;
  if(!isVehicleOwnerActor(actor)){ui.notifications.warn(localize('CharactersOnly'));return false;}
  return changeOwners(sheet, owners => owners.some(o=>o.uuid===actor.uuid)?owners:[...owners,{uuid:actor.uuid,name:actor.name,img:actor.img}]);
}
export async function removeVehicleOwner(sheet, uuid) {
  return changeOwners(sheet, owners => owners.filter(o=>o.uuid!==uuid));
}

export async function prepareVehicleOwners(actor) {
  return Promise.all(ownerEntries(actor).map(async entry=>{
    // A stale UUID still has the last known name and portrait stored on the vehicle.
    const document = await fromUuid(entry.uuid).catch(() => null);
    return {uuid:entry.uuid,name:document?.name??entry.name,img:document?.img??entry.img,
      missing:!document,canOpen:!!document?.testUserPermission(game.user,'OBSERVER')};
  }));
}

/** Intercept this drop before the sheet-wide crew-registration hook runs. */
export async function dropVehicleOwner(sheet,event) {
  if(sheet.actor.type!=='vehicle'||!event.target?.closest?.('.ffg-vehicle-owners'))return false;
  event.preventDefault();
  if(!allowed(sheet))return true;
  const data=foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
  if(data.type!=='Actor'){ui.notifications.warn(localize('CharactersOnly'));return true;}
  const actor=await Actor.implementation.fromDropData(data);
  await addVehicleOwner(sheet,actor);
  return true;
}

export function activateVehicleOwners(sheet) {
  if(sheet.actor.type!=='vehicle')return;
  const root=sheet.element.querySelector('.ffg-vehicle-owners');
  if(!root)return;
  root.addEventListener('dragover',event=>{
    if(allowed(sheet)){event.preventDefault();root.classList.add('owner-drop-active');}
  });
  root.addEventListener('dragleave',event=>{if(!root.contains(event.relatedTarget))root.classList.remove('owner-drop-active');});
  root.addEventListener('drop',()=>root.classList.remove('owner-drop-active'));
  root.addEventListener('click',async event=>{
    const control=event.target.closest('[data-owner-action]');
    if(!control)return;
    event.preventDefault();event.stopPropagation();
    const uuid=control.closest('[data-owner-uuid]')?.dataset.ownerUuid;
    if(control.dataset.ownerAction==='remove')await removeVehicleOwner(sheet,uuid);
    else {
      const owner=await fromUuid(uuid);
      if(owner?.testUserPermission(game.user,'OBSERVER'))owner.sheet.render(true);
    }
  });
}
