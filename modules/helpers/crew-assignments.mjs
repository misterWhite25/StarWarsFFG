const pending=new Map();
const station=role=>({pilot:'pilot',pilote:'pilot',copilot:'copilot',copilote:'copilot'})[String(role??'').toLowerCase().replace(/[^a-z]/g,'')];
/** Only the newly assigned pilot/copilot replaces the previous occupant. Other stations survive. */
export function assignCrewRoles(crew,member,roles,link=null){
  const selected=[...new Set(roles??[])];
  const reserved=new Set(selected.map(station).filter(Boolean));
  const others=crew.filter(e=>e.actor_id!==member.id&&(!station(e.role)||!reserved.has(station(e.role))));
  const own=selected.map(role=>{
    const existing=crew.find(e=>e.actor_id===member.id&&e.role===role);
    return existing?{...existing}:{actor_id:member.id,actor_name:member.name,role,link};
  });
  return [...others.map(e=>({...e})),...own];
}
/** Read after the preceding write so quick successive assignments do not restore an old pilot. */
export async function editVehicleCrew(vehicle,edit){
  const key=vehicle.uuid??vehicle.id,previous=pending.get(key)??Promise.resolve();
  const next=previous.catch(()=>{}).then(async()=>{
    const current=vehicle.getFlag('starwarsffg','crew')??[];
    const updated=await edit(current);
    if (updated && JSON.stringify(updated) !== JSON.stringify(current)) {
      if (updated.length) await vehicle.setFlag('starwarsffg', 'crew', updated);
      else await vehicle.unsetFlag('starwarsffg', 'crew');
    }
    return updated;
  });
  pending.set(key,next);try{return await next;}finally{if(pending.get(key)===next)pending.delete(key);}
}
