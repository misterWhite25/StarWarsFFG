import {localizedSystemError} from "./system-localization.mjs";
import {npcVehicle,npcStationActor,removeNpcStation} from './npc-vehicle.mjs';
import {planAutoCrew,autoCrewProfile,AUTO_CREW_VERSION,passengerFromCrew} from './auto-crew-model.mjs';
import {editVehicleCrew} from './crew-assignments.mjs';
import {getSystemDataDefaults} from '../data-models/system-data-models.js';
import {applyVehicleMinionSkills,vehicleMinionGroup} from './vehicle-minion-group.mjs';
import {rewriteIntegratedCrewReferences} from './integrated-crew-model.mjs';

const scope='starwarsffg',flag='integratedCrew',cache=new Map(),pending=new Map();
const clone=value=>foundry.utils.deepClone(value);
const path=id=>'flags.'+scope+'.'+flag+'.profiles.'+id;
const tr=key=>game.i18n.localize('SWFFG.AutoCrew.'+key);
const active=(vehicle,id)=>(vehicle?.flags?.[scope]?.crew??[]).some(member=>member.integrated&&member.actor_id===id)||Object.values(vehicle?.flags?.[scope]?.vehicleDeck?.passengers??{}).some(member=>member.integrated&&member.actorId===id);
export function integratedCrewProfiles(vehicle){if(npcVehicle(vehicle))return Object.values(vehicle.flags.starwarsffg.npcVehicle.stations);return Object.values(vehicle?.flags?.[scope]?.[flag]?.profiles??{}).filter(profile=>active(vehicle,profile.id));}
export function integratedCrewVehicle(actor){return actor?._integratedCrew?.vehicle??null;}
export function integratedCrewGroupSignature(actor){const vehicle=integratedCrewVehicle(actor);if(!vehicle)return null;const group=vehicleMinionGroup(vehicle);return JSON.stringify([group.enabled,group.count,group.alive,group.hullPerVehicle]);}
function findProfile(value,vehicle){
  const id=typeof value==='string'?value:value?.actor_id??value?.actorId??value?.id;
  if(!id)return null;
  if(value?.vehicle_id)vehicle=game.actors.get(value.vehicle_id)??vehicle;
  const match=String(id).match(/^Actor\.([^.]+)\.Crew\.([^.]+)(?:\.|$)/);
  if(match){vehicle=game.actors.get(match[1]);return vehicle&&active(vehicle,match[2])&&vehicle.flags?.[scope]?.[flag]?.profiles?.[match[2]]?{vehicle,profile:vehicle.flags[scope][flag].profiles[match[2]]}:null;}
  if(active(vehicle,id)&&vehicle?.flags?.[scope]?.[flag]?.profiles?.[id])return {vehicle,profile:vehicle.flags[scope][flag].profiles[id]};
  for(const candidate of game.actors??[])if(candidate.type==='vehicle'&&active(candidate,id)&&candidate.flags?.[scope]?.[flag]?.profiles?.[id])return {vehicle:candidate,profile:candidate.flags[scope][flag].profiles[id]};
  return null;
}
function serial(vehicle,fn){
  const key=vehicle.uuid,task=(pending.get(key)??Promise.resolve()).catch(()=>{}).then(fn);pending.set(key,task);
  return task.finally(()=>{if(pending.get(key)===task)pending.delete(key);});
}
function rawProfile(vehicle,id){const profile=vehicle.flags?.[scope]?.[flag]?.profiles?.[id];if(!profile)throw localizedSystemError("SWFFG.UI.Operations.IntegratedStationMissing");return profile;}
function changedData(data,changes){return foundry.utils.mergeObject(clone(data),foundry.utils.expandObject(changes),{inplace:false,applyOperators:true});}
async function writeProfile(vehicle,id,change){
  if(!game.user.isGM)throw localizedSystemError("SWFFG.UI.Operations.ManageIntegratedGMOnly");
  return serial(vehicle,async()=>{
    const profile=rawProfile(vehicle,id),next=await change(clone(profile));
    await vehicle.update({[path(id)]:next});
    const actor=cache.get(vehicle.uuid+':'+id)?.actor;if(actor)hydrateActor(actor,vehicle,next);
    return actor??resolveCrewActor({actor_id:id,vehicle_id:vehicle.id});
  });
}
function bindEmbedded(actor){
  for(const type of ['Item','ActiveEffect'])for(const document of actor.getEmbeddedCollection(type)??[]){
    document.update=async changes=>{await actor.updateEmbeddedDocuments(type,[{_id:document.id,...changes}]);return actor.getEmbeddedCollection(type).get(document.id);};
    document.delete=async()=>{await actor.deleteEmbeddedDocuments(type,[document.id]);return document;};
  }
}
function hydrateActor(actor,vehicle,profile){
  const raw=applyVehicleMinionSkills(clone(profile.data),vehicle);
  actor.updateSource(raw);actor.prepareData();actor._integratedCrew={vehicle,id:profile.id,kind:profile.kind,station:profile.station};
  bindEmbedded(actor);
  const cached=cache.get(vehicle.uuid+':'+profile.id);if(cached)cached.signature=JSON.stringify([profile,vehicle.flags?.[scope]?.vehicleMinionGroup,vehicle.system?.stats?.hullTrauma]);
}
function makeActor(vehicle,profile){
  const raw=applyVehicleMinionSkills(clone(profile.data),vehicle),ActorClass=CONFIG.Actor.documentClass;
  const actor=new ActorClass(raw,{temporary:true});
  Object.defineProperty(actor,'uuid',{configurable:true,get:()=>vehicle.uuid+'.Crew.'+profile.id});
  Object.defineProperty(actor,'isOwner',{configurable:true,get:()=>Boolean(game.user.isGM)});
  actor._integratedCrew={vehicle,id:profile.id,kind:profile.kind,station:profile.station};
  actor.update=async changes=>writeProfile(vehicle,profile.id,current=>({...current,data:changedData(current.data,changes)}));
  actor.createEmbeddedDocuments=async(type,documents)=>{
    const field={Item:'items',ActiveEffect:'effects'}[type];if(!field)throw localizedSystemError("SWFFG.UI.Operations.IntegratedUnsupported");
    const added=documents.map(document=>({...clone(document),_id:document._id??foundry.utils.randomID()}));
    await writeProfile(vehicle,profile.id,current=>{current.data[field]=[...(current.data[field]??[]),...added];return current;});
    return added.map(document=>actor.getEmbeddedCollection(type).get(document._id));
  };
  actor.updateEmbeddedDocuments=async(type,updates)=>{
    const field={Item:'items',ActiveEffect:'effects'}[type];if(!field)throw localizedSystemError("SWFFG.UI.Operations.IntegratedUnsupported");
    await writeProfile(vehicle,profile.id,current=>{current.data[field]=(current.data[field]??[]).map(document=>{const update=updates.find(change=>change._id===document._id);return update?changedData(document,update):document;});return current;});
    return updates.map(document=>actor.getEmbeddedCollection(type).get(document._id));
  };
  actor.deleteEmbeddedDocuments=async(type,ids)=>{
    const field={Item:'items',ActiveEffect:'effects'}[type];if(!field)throw localizedSystemError("SWFFG.UI.Operations.IntegratedUnsupported");
    const removed=(actor.getEmbeddedCollection(type)?.contents??[]).filter(document=>ids.includes(document.id));
    await writeProfile(vehicle,profile.id,current=>{current.data[field]=(current.data[field]??[]).filter(document=>!ids.includes(document._id));return current;});return removed;
  };
  actor.prepareData();bindEmbedded(actor);return actor;
}
/** Resolve normal actors and persistent, fully prepared NPC profiles stored inside a vehicle. */
export function resolveCrewActor(value,vehicle=null){
  if(value?.documentName==='Actor')return value;
  if(value?.tokenUuid)return globalThis.fromUuidSync?.(value.tokenUuid)?.actor??null;
  const id=typeof value==='string'?value:value?.actor_id??value?.actorId??value?.id;
  const npc=npcStationActor(value,vehicle);if(npc)return npc;
  const world=game.actors?.get(id);if(world)return world;
  const match=findProfile(value,vehicle);if(!match)return null;
  const {profile}=match;vehicle=match.vehicle;const key=vehicle.uuid+':'+profile.id;
  const signature=JSON.stringify([profile,vehicle.flags?.[scope]?.vehicleMinionGroup,vehicle.system?.stats?.hullTrauma]);
  const existing=cache.get(key);if(existing){if(existing.signature!==signature)hydrateActor(existing.actor,vehicle,profile);return existing.actor;}
  const actor=makeActor(vehicle,profile);cache.set(key,{actor,signature});return actor;
}
export function resolveCrewDocument(uuid){
  if(String(uuid).includes('.NpcStation.'))return npcStationActor(uuid);
  const match=String(uuid??'').match(/^(Actor\.[^.]+\.Crew\.[^.]+)(?:\.(Item|ActiveEffect)\.([^.]+))?$/);
  if(!match)return null;const actor=resolveCrewActor(match[1]);return match[2]?actor?.getEmbeddedCollection(match[2])?.get(match[3])??null:actor;
}
function requireVehicle(vehicle){if(!game.user.isGM||vehicle?.type!=='vehicle'||vehicle.pack||!vehicle.isOwner)throw localizedSystemError("SWFFG.UI.Operations.WorldVehicleGMOnly");}
function labelFor(station){return tr('Role.'+station.kind)+(station.weaponName?' - '+station.weaponName:'');}
function supportDefinitions(vehicle,crew){
  const saved=vehicle.flags?.[scope]?.crewRoleDefinitions;
  const roles=clone(Array.isArray(saved)?saved:saved?.roles??[]);
  for(const [kind,skill]of [['engineer','Mechanics'],['operator','Computers']]){
    const role=tr('Role.'+kind);if(crew.some(member=>member.role===role)&&!roles.some(def=>def.role_name===role))roles.push({role_name:role,role_skill:skill,use_handling:false,use_weapons:false});
  }
  return roles;
}
export async function completeIntegratedCrew(vehicle,options={}){
  requireVehicle(vehicle);const actorType=options.actorType??'rival';if(!['minion','rival','nemesis'].includes(actorType))throw localizedSystemError("SWFFG.UI.Operations.InvalidCrewType");
  let result;
  await editVehicleCrew(vehicle,async current=>{
    const plan=planAutoCrew(vehicle,options,id=>resolveCrewActor(id,vehicle),current);
    const stations=options.stations?plan.stations.filter(station=>options.stations.includes(station.key)):plan.stations;
    if(!stations.length&&!plan.weaponUpdates.length&&JSON.stringify(plan.crew)===JSON.stringify(current)&&JSON.stringify(plan.passengers)===JSON.stringify(vehicle.flags?.[scope]?.vehicleDeck?.passengers??{})){
      result={mode:'integrated',created:0,integrated:0,weapons:0,layout:plan.layout,actors:[],profiles:[]};return null;
    }
    const profiles=clone(vehicle.flags?.[scope]?.[flag]?.profiles??{}),entries=[],passengers=plan.passengers;
    for(const station of stations){
      const id=foundry.utils.randomID(),type=station.kind==='astromech'?'rival':actorType,system=autoCrewProfile(getSystemDataDefaults(type),station,options.quality??'standard',type);
      const name=labelFor(station),role=['engineer','operator'].includes(station.kind)?tr('Role.'+station.kind):station.role;
      const data={_id:id,name,type,img:station.kind==='astromech'?'icons/svg/cog.svg':'systems/starwarsffg/images/defaults/actors/'+type+'.png',system,items:[],effects:[],ownership:{default:0},flags:{[scope]:{loaded:true,automaticStats:{enabled:false},autoCrew:{version:AUTO_CREW_VERSION,vehicleUuid:vehicle.uuid,station:station.key,kind:station.kind,quality:options.quality??'standard'}}}};
      profiles[id]={id,station:station.key,kind:station.kind,quality:options.quality??'standard',data};
      const entry={actor_id:id,actor_name:name,role,link:null,integrated:true,vehicle_id:vehicle.id,...(station.weaponId?{weapon_id:station.weaponId}:{})};
      entries.push(entry);if(station.passenger){const passenger=passengerFromCrew(entry,data);passengers[passenger.key]=passenger;}
    }
    const next=[...plan.crew,...entries.filter(entry=>!passengers['a'+entry.actor_id])],changed=[];
    try{
      if(plan.weaponUpdates.length){changed.push(...plan.weaponUpdates);await vehicle.updateEmbeddedDocuments('Item',plan.weaponUpdates.map(update=>({_id:update.id,['flags.'+scope+'.weaponCrew']:update.after})));}
      if(JSON.stringify(vehicle.getFlag(scope,'crew')??[])!==JSON.stringify(current))throw localizedSystemError("SWFFG.UI.Operations.CrewChanged");
      await vehicle.update({['flags.'+scope+'.'+flag]:{version:1,profiles},['flags.'+scope+'.crew']:next,['flags.'+scope+'.vehicleDeck.passengers']:passengers,['flags.'+scope+'.crewRoleDefinitions']:supportDefinitions(vehicle,next)});
    }catch(error){
      for(const update of changed){const item=vehicle.items.get(update.id);if(JSON.stringify(item?.getFlag(scope,'weaponCrew'))!==JSON.stringify(update.after))continue;await item.update(update.before===undefined?{['flags.'+scope+'.-=weaponCrew']:null}:{['flags.'+scope+'.weaponCrew']:update.before});}
      throw error;
    }
    result={mode:'integrated',created:entries.length,integrated:entries.length,weapons:plan.weaponUpdates.length,layout:plan.layout,actors:[],profiles:entries.map(entry=>entry.actor_id)};
    return null;
  });return result;
}
function referencedActor(id){
  if(Array.from(game.actors??[]).some(actor=>(actor.flags?.[scope]?.crew??[]).some(member=>member.actor_id===id)||Object.values(actor.flags?.[scope]?.vehicleDeck?.passengers??{}).some(member=>member.actorId===id)))return true;
  if(Array.from(game.scenes??[]).some(scene=>Array.from(scene.tokens??[]).some(token=>token.actorId===id)))return true;
  return Array.from(game.combats??[]).some(combat=>Array.from(combat.combatants??[]).some(member=>member.actorId===id));
}
export async function convertAutoCrewToIntegrated(vehicle,{cleanup=false}={}){
  requireVehicle(vehicle);const sources=new Map();let converted=0;
  await editVehicleCrew(vehicle,async current=>{
    const profiles=clone(vehicle.flags?.[scope]?.[flag]?.profiles??{}),mapping=new Map();
    const convert=member=>{
      const source=game.actors.get(member.actor_id),auto=source?.flags?.[scope]?.autoCrew;
      if(member.integrated||!auto||auto.vehicleUuid!==vehicle.uuid)return {...member};
      let id=mapping.get(source.id);
      if(!id){id=foundry.utils.randomID();mapping.set(source.id,id);sources.set(source.id,source);const data=rewriteIntegratedCrewReferences(source.toObject(),source.uuid,vehicle.uuid+'.Crew.'+id);data._id=id;delete data.folder;delete data._stats;data.ownership={default:0};profiles[id]={id,station:auto.station,kind:auto.kind,quality:auto.quality??'standard',data};converted++;}
      return {...member,actor_id:id,actor_name:source.name,integrated:true,vehicle_id:vehicle.id,link:null};
    };
    const passengers=clone(vehicle.flags?.[scope]?.vehicleDeck?.passengers??{}),positions=clone(vehicle.flags?.[scope]?.vehicleDeck?.positions??{});
    for(const [key,passenger]of Object.entries(passengers)){
      const member=convert({...passenger,actor_id:passenger.actorId,actor_name:passenger.name});
      if(member.actor_id===passenger.actorId)continue;
      const next=passengerFromCrew(member,profiles[member.actor_id]?.data);delete passengers[key];passengers['-='+key]=null;passengers[next.key]=next;
      if(Object.hasOwn(positions,key)){positions[next.key]=positions[key];delete positions[key];positions['-='+key]=null;}
    }
    const crew=[];
    for(const original of current){
      const member=convert(original),kind=profiles[member.actor_id]?.kind??game.actors.get(member.actor_id)?.flags?.[scope]?.autoCrew?.kind;
      if(['engineer','operator'].includes(kind)){
        const passenger=passengerFromCrew(member,profiles[member.actor_id]?.data??game.actors.get(member.actor_id));passengers[passenger.key]=passenger;
      }else crew.push(member);
    }
    await vehicle.update({['flags.'+scope+'.'+flag]:{version:1,profiles},['flags.'+scope+'.crew']:crew,['flags.'+scope+'.vehicleDeck.passengers']:passengers,['flags.'+scope+'.vehicleDeck.positions']:positions});return null;
  });
  const removed=[],retained=[];
  if(cleanup)for(const [id,actor]of sources){if(referencedActor(id)){retained.push(id);continue;}await actor.delete();removed.push(id);}
  return {converted,removed,retained};
}
export async function removeIntegratedCrewProfile(vehicle,id){
  if(npcVehicle(vehicle))return removeNpcStation(vehicle,id);
  requireVehicle(vehicle);await editVehicleCrew(vehicle,async current=>{await vehicle.update({['flags.'+scope+'.crew']:current.filter(member=>member.actor_id!==id),['flags.'+scope+'.vehicleDeck.passengers.-=a'+id]:null,['flags.'+scope+'.vehicleDeck.positions.-=a'+id]:null,['flags.'+scope+'.'+flag+'.profiles.-='+id]:null});cache.delete(vehicle.uuid+':'+id);return null;});
}
