/** Accept nested and dotted Foundry changes, including deletion operators. */
export function changedFields(changes,prefix=''){
  const paths=[];
  for(const [key,value]of Object.entries(changes??{})){
    const path=(prefix?prefix+'.':'')+key.replace(/(^|\.)-=/g,'$1');
    if(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length)paths.push(...changedFields(value,path));
    else paths.push(path);
  }
  return paths;
}
export function fieldsAffect(changes,fields){
  const paths=changedFields(changes);
  return !paths.length||paths.some(path=>fields.some(field=>path===field||path.startsWith(field+'.')||field.startsWith(path+'.')));
}
export const identityFields=['name','img','type','ownership'];
export const passengerFields=[...identityFields,'prototypeToken','system.skills','system.characteristics','flags','effects','system.quantity'];
export const ownedVehicleFields=[...identityFields,'flags.starwarsffg.vehicleOwners'];

export const isDocumentMetadataField=path=>path==='_id'||path==='_stats'||path.startsWith('_stats.');
