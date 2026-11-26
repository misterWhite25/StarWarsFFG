const types=new Set(['weapon','armour','gear']);
export const isInventoryEquipment=item=>types.has(item?.type);
export const isPossession=item=>isInventoryEquipment(item)&&item.flags?.starwarsffg?.inventoryLocation==='possession';
export const isCarriedEquipment = item => isInventoryEquipment(item) && !isPossession(item) && (item.type === 'gear' || item.system?.equippable?.equipped === true);
export function possessionUpdate(stored) {
 return {'flags.starwarsffg.inventoryLocation':stored?'possession':'carried',...(stored?{'system.equippable.equipped':false}:{})};
}
export function possessionData(data) {
 const result=structuredClone(data);delete result._id;
 result.flags??={};result.flags.starwarsffg??={};result.flags.starwarsffg.inventoryLocation='possession';
 result.system??={};result.system.equippable??={};result.system.equippable.equipped=false;
 return result;
}
