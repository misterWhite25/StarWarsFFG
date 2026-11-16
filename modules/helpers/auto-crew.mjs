import {npcVehicle,synchronizeNpcVehicle} from './npc-vehicle.mjs';
import {completeIntegratedCrew,resolveCrewActor} from './integrated-crew.mjs';
import {planAutoCrew,autoCrewProfile,AUTO_CREW_VERSION,passengerFromCrew} from './auto-crew-model.mjs';
import {editVehicleCrew} from './crew-assignments.mjs';
import {getSystemDataDefaults} from '../data-models/system-data-models.js';
const scope='starwarsffg';let folderQueue=Promise.resolve();
const tr=(key,data)=>data?game.i18n.format('SWFFG.AutoCrew.'+key,data):game.i18n.localize('SWFFG.AutoCrew.'+key);
const json=value=>JSON.stringify(value??null);
export function autoCrewStationLabel(station){return tr('Role.'+station.kind)+(station.weaponName?' - '+station.weaponName:'');}
function requireVehicle(vehicle){
  if(!game.user.isGM)throw Error(tr('GMOnly'));
  if(vehicle?.type!=='vehicle'||vehicle.pack||!vehicle.isOwner)throw Error(tr('WorldVehicleOnly'));
}
async function crewFolder(vehicle,createdFolders){
  const task=folderQueue.catch(()=>{}).then(async()=>{
    let root=game.folders.find(folder=>folder.type==='Actor'&&folder.getFlag(scope,'autoCrewRoot'));
    if(!root){root=await Folder.create({name:tr('Folder'),type:'Actor',flags:{[scope]:{autoCrewRoot:true}}});createdFolders.push(root);}
    let folder=game.folders.find(folder=>folder.type==='Actor'&&folder.getFlag(scope,'autoCrewVehicle')===vehicle.uuid);
    if(!folder){folder=await Folder.create({name:vehicle.name,type:'Actor',folder:root.id,flags:{[scope]:{autoCrewVehicle:vehicle.uuid}}});createdFolders.push(folder);}
    return folder;
  });folderQueue=task;return task;
}
/** Serialized with manual assignment. Only created actors and unconfigured weapons are changed. */
export async function completeAutoCrew(vehicle,options={}){
  requireVehicle(vehicle);
  if(npcVehicle(vehicle)){await synchronizeNpcVehicle(vehicle);return {mode:'npc',created:0,actors:[],profiles:Object.keys(vehicle.flags.starwarsffg.npcVehicle.stations)};}
  if(options.mode!=='detailed')return completeIntegratedCrew(vehicle,options);
  const actorType=options.actorType??'rival';
  if(!['minion','rival','nemesis'].includes(actorType))throw Error(tr('InvalidActorType'));
  const requestedFolder=options.folderId===undefined?null:game.folders.get(options.folderId);
  if(options.folderId!==undefined&&requestedFolder?.type!=='Actor')throw Error(tr('InvalidFolder'));
  const created=[],createdFolders=[],changedWeapons=[];let result;
  try{
    await editVehicleCrew(vehicle,async current=>{
      requireVehicle(vehicle);
      const plan=planAutoCrew(vehicle,options,id=>resolveCrewActor(id,vehicle),current);
      const stations=options.stations?plan.stations.filter(station=>options.stations.includes(station.key)):plan.stations;
      result={created:0,weapons:plan.weaponUpdates.length,layout:plan.layout,actors:[]};
      if(!stations.length&&!plan.weaponUpdates.length&&json(plan.crew)===json(current))return null;
      const folder=stations.length?(requestedFolder??await crewFolder(vehicle,createdFolders)):null;
      const disposition=Number(vehicle.getFlag(scope,'campOverride')??vehicle.prototypeToken?.disposition??0);
      const entries=[],passengers=plan.passengers;
      for(const station of stations){
        const type=station.kind==='astromech'?'rival':actorType;
        const label=autoCrewStationLabel(station),system=autoCrewProfile(getSystemDataDefaults(type),station,options.quality??'standard',type);
        system.biography='<p>'+tr('GenericProfile')+'</p>';
        const actor=await Actor.create({name:vehicle.name+' - '+label,type,folder:folder.id,
          img:station.kind==='astromech'?'icons/svg/cog.svg':'systems/starwarsffg/images/defaults/actors/'+type+'.png',system,
          ownership:{default:0},prototypeToken:{actorLink:false,disposition},
          flags:{[scope]:{loaded:true,campOverride:disposition,automaticStats:{enabled:false},autoCrew:{version:AUTO_CREW_VERSION,vehicleUuid:vehicle.uuid,station:station.key,kind:station.kind,quality:options.quality??'standard'}}}
        });
        if(!actor)throw Error(tr('CreationFailed'));created.push(actor);
        const role=['engineer','operator'].includes(station.kind)?tr('Role.'+station.kind):station.role;
        const entry={actor_id:actor.id,actor_name:actor.name,role,link:null,...(station.weaponId?{weapon_id:station.weaponId}:{})};
        entries.push(entry);if(station.passenger){const passenger=passengerFromCrew(entry,actor);passengers[passenger.key]=passenger;}
      }
      if(json(vehicle.getFlag(scope,'crew')??[])!==json(current))throw Error(tr('Changed'));
      for(const update of plan.weaponUpdates){
        const item=vehicle.items.get(update.id);if(!item||json(item.getFlag(scope,'weaponCrew'))!==json(update.before))throw Error(tr('Changed'));
      }
      if(plan.weaponUpdates.length){
        changedWeapons.push(...plan.weaponUpdates);
        await vehicle.updateEmbeddedDocuments('Item',plan.weaponUpdates.map(update=>({_id:update.id,['flags.'+scope+'.weaponCrew']:update.after})));
      }
      result.created=created.length;result.actors=created.map(actor=>actor.id);
      await vehicle.update({['flags.'+scope+'.crew']:[...plan.crew,...entries.filter(entry=>!passengers['a'+entry.actor_id])],['flags.'+scope+'.vehicleDeck.passengers']:passengers});
      return null;
    });
    return result;
  }catch(error){
    const linked=new Set([...(vehicle.getFlag(scope,'crew')??[]).map(member=>member.actor_id),...Object.values(vehicle.flags?.[scope]?.vehicleDeck?.passengers??{}).map(member=>member.actorId)]);
    if(!created.some(actor=>linked.has(actor.id))){
      for(const update of changedWeapons){
        const item=vehicle.items.get(update.id);if(!item||json(item.getFlag(scope,'weaponCrew'))!==json(update.after))continue;
        try{await item.update(update.before===undefined?{['flags.'+scope+'.-=weaponCrew']:null}:{['flags.'+scope+'.weaponCrew']:update.before});}catch(cleanup){console.error('Star Wars FFG | Auto crew weapon cleanup',cleanup);}
      }
      for(const actor of created)try{await actor.delete();}catch(cleanup){console.error('Star Wars FFG | Auto crew actor cleanup',cleanup);}
      for(const folder of createdFolders.reverse())if(!game.actors.some(actor=>actor.folder?.id===folder.id)&&!game.folders.some(child=>child.folder?.id===folder.id))try{await folder.delete();}catch(cleanup){console.error('Star Wars FFG | Auto crew folder cleanup',cleanup);}
    }
    throw error;
  }
}
