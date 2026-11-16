const scope='starwarsffg';
export function rewriteIntegratedCrewReferences(value,before,after){
  if(typeof value==='string')return before&&value.includes(before)?value.split(before).join(after):value;
  if(Array.isArray(value))return value.map(entry=>rewriteIntegratedCrewReferences(entry,before,after));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,entry])=>[key,rewriteIntegratedCrewReferences(entry,before,after)]));
  return value;
}
/** A copied hull receives independent crew identities and therefore independent action budgets. */
export function prepareIntegratedCrewCopy(data,vehicleId,randomID=()=>globalThis.foundry.utils.randomID()){
  const source=data.flags?.[scope]?.integratedCrew;if(!source?.profiles)return {};
  const profiles={},ids=new Map(),vehicleUuid='Actor.'+vehicleId;
  for(const [oldId,old]of Object.entries(source.profiles)){
    const id=randomID(),oldVehicle=old.data?.flags?.[scope]?.autoCrew?.vehicleUuid??'Actor.'+(data._id??vehicleId);
    let profile=rewriteIntegratedCrewReferences(old,oldVehicle+'.Crew.'+oldId,vehicleUuid+'.Crew.'+id);
    profile=rewriteIntegratedCrewReferences(profile,oldVehicle,vehicleUuid);profile.id=id;profile.data._id=id;
    profile.data.flags??={};profile.data.flags[scope]??={};profile.data.flags[scope].autoCrew??={};profile.data.flags[scope].autoCrew.vehicleUuid=vehicleUuid;
    profiles[id]=profile;ids.set(oldId,id);
  }
  const crew=(data.flags?.[scope]?.crew??[]).map(member=>member.integrated&&ids.has(member.actor_id)?{...member,actor_id:ids.get(member.actor_id),vehicle_id:vehicleId}:structuredClone(member));
  const deck=data.flags?.[scope]?.vehicleDeck??{},passengers={},positions=structuredClone(deck.positions??{});
  for(const [key,member] of Object.entries(deck.passengers??{})){
    const id=member.integrated&&ids.get(member.actorId),nextKey=id?'a'+id:key;
    passengers[nextKey]=id?{...structuredClone(member),key:nextKey,actorId:id,vehicle_id:vehicleId}:structuredClone(member);
    if(id){passengers['-='+key]=null;if(Object.hasOwn(positions,key)){positions[nextKey]=positions[key];delete positions[key];positions['-='+key]=null;}}
  }
  for(const [before,after]of ids){
    const key='a'+before,nextKey='a'+after;
    if(key!==nextKey&&Object.hasOwn(positions,key)){positions[nextKey]=positions[key];delete positions[key];positions['-='+key]=null;}
  }
  return {['flags.'+scope+'.integratedCrew']:{...structuredClone(source),profiles},['flags.'+scope+'.crew']:crew,...(deck.passengers?{['flags.'+scope+'.vehicleDeck.passengers']:passengers}:{}),...(deck.positions?{['flags.'+scope+'.vehicleDeck.positions']:positions}:{})};
}
