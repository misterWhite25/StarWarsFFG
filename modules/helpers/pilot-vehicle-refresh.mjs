import {changedFields,isDocumentMetadataField} from './actor-change-fields.mjs';

const presentation=['img','sort','folder','system.description','system.longDesc','system.desc','flags.starwarsffg.uuid','ownership','system.metadata.tags','system.metadata.sources'];
export function pilotItemAffectsVehicles(changes) {
  const paths=changedFields(changes).filter(path=>!isDocumentMetadataField(path));
  if(!paths.length)return !Object.keys(changes??{}).length;
  return paths.some(path=>!presentation.some(field=>path===field||path.startsWith(field+'.')));
}

/** Recalculate each affected vessel once per burst, without constructing closed sheets. */
export function pilotVehicleRefresher({actors=()=>game.actors?.contents??[],schedule=callback=>Promise.resolve().then(callback)}={}) {
  const pending=new Set();let scheduled=false;
  return actor=>{
    if(!actor)return;
    for(const id of [actor.id,actor.uuid,actor.token?.uuid,actor.token?.document?.uuid])if(id)pending.add(id);
    if(scheduled)return;scheduled=true;
    schedule(()=>{
      const pilots=new Set(pending);pending.clear();scheduled=false;
      for(const vehicle of actors()){
        if(vehicle.type!=='vehicle'||!(vehicle.flags?.starwarsffg?.crew??[]).some(member=>/^(pilot|pilote)$/i.test(String(member.role??'').trim())&&(pilots.has(member.actor_id)||pilots.has(member.tokenUuid))))continue;
        // Native reset already prepares derived data in Foundry 14.
        if(typeof vehicle.reset==='function')vehicle.reset();else vehicle.prepareData?.();
        for(const app of Object.values(vehicle.apps??{}))if(app.rendered)void Promise.resolve(app.render(false)).catch(error=>console.error('Star Wars FFG | Refresh pilot vehicle',error));
      }
    });
  };
}
