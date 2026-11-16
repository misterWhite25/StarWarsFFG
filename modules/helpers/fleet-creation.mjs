import {FACTIONS,validateFleetRows,getFleetAffiliations,matchesFleetFaction} from './fleet-model.mjs';
import {getFleetVehicleDocument,AFFILIATION_OVERRIDES_SETTING} from './fleet-catalogue.mjs';
import {completeAutoCrew} from './auto-crew.mjs';
const scope='starwarsffg',pending=new Map();
const tr=(key,data)=>data?game.i18n.format('SWFFG.Fleet.'+key,data):game.i18n.localize('SWFFG.Fleet.'+key);
const cleanName=value=>String(value??'').replace(/\u2014/g,'-').replace(/[\r\n\t]/g,' ').trim();
const runtimeFlags=new Set(['npcVehicle','integratedCrew','vehicleMinionGroup','crew','autoCrew','fleet','vehicleOwners','vehicleMalfunctions','vehicleMaintenance','vehicleLogbook','npcActions','npcInitiativeShadow','npcInitiativeShadowToken','groundMovementState','groundRelations','spaceCombatRoll','spaceCombatState','fullThrottle','timedTalentModifiers','crewSkillChoices']);
function cleanRuntime(flags={}){
  const result=structuredClone(flags),system=result[scope]??={};
  for(const key of Object.keys(system))if(runtimeFlags.has(key)||/^(combat|spaceCombat|npcInitiative)/i.test(key))delete system[key];
  if(system.vehicleDeck){system.vehicleDeck.passengers={};delete system.vehicleDeck.epoch;delete system.vehicleDeck.focus;}
  const voyage=result['swffg-compendium-bilingual-steelers-core_rule']?.voyageResources;
  if(voyage){for(const key of ['history','pending','receipts','revision'])delete voyage[key];}
  return result;
}
function permanentEffects(effects){
  return (effects??[]).filter(effect=>{
    if(effect.flags?.[scope]?.vehicleMalfunction)return false;
    const duration=effect.duration??effect.system?.duration??{};
    return !(Number(duration.seconds)>0||Number(duration.rounds)>0||Number(duration.turns)>0);
  });
}
/** Fresh hull and embedded identities, while retaining art, permanent upgrades and stat blocks. */
export function fleetVehicleData(source,{name,faction,crewType,folderId,disposition=0,newId,randomID=()=>foundry.utils.randomID(),affiliations=[]}={}){
  const data=structuredClone(typeof source.toObject==='function'?source.toObject():source),oldUuid=source.uuid??(data._id?'Actor.'+data._id:null),ids=new Map();
  const actorId=newId??randomID();
  delete data._id;delete data._stats;delete data.sort;delete data.parent;delete data.pack;
  data._id=actorId;data.type='vehicle';data.name=cleanName(name??data.name);data.folder=folderId;data.ownership={default:0};
  data.flags=cleanRuntime(data.flags);data.flags[scope].loaded=true;data.flags[scope].crew=[];
  data.flags[scope].vehicleDirectory='vehicles';data.flags[scope].vehicleInActors=false;
  data.flags[scope].campOverride=disposition;data.flags[scope].fleetAffiliations=[...affiliations];
  data.flags[scope].fleet={version:1,faction,crewType,sourceUuid:source.uuid??oldUuid};
  data.prototypeToken={...data.prototypeToken,name:data.name,actorLink:false,disposition,flags:cleanRuntime(data.prototypeToken?.flags)};
  data.prototypeToken.flags[scope].campOverride=disposition;
  for(const key of ['_id','actorId','delta','_stats'])delete data.prototypeToken[key];
  data.items=(data.items??[]).filter(item=>item.type!=='criticaldamage');
  for(const item of data.items){if(item._id)ids.set(item._id,randomID());}
  const resetEffects=effects=>permanentEffects(effects).map(effect=>{const copy={...effect,_id:randomID()};delete copy._stats;return copy;});
  data.effects=resetEffects(data.effects);
  for(const item of data.items){item._id=ids.get(item._id)??randomID();delete item._stats;item.flags=cleanRuntime(item.flags);item.effects=resetEffects(item.effects);}
  const rewrite=(node)=>{
    if(!node||typeof node!=='object')return;
    for(const [key,value]of Object.entries(node)){
      if(typeof value==='string'){
        if(['itemId','item_id','weaponId','weapon_id'].includes(key)&&ids.has(value))node[key]=ids.get(value);
        else if(['origin','actorUuid','parentUuid'].includes(key)&&oldUuid&&value.startsWith(oldUuid)){
          let next='Actor.'+actorId+value.slice(oldUuid.length);
          for(const [oldId,id]of ids)next=next.replace('.Item.'+oldId,'.Item.'+id);node[key]=next;
        }
      }else rewrite(value);
    }
  };rewrite(data.effects);for(const item of data.items)rewrite(item);
  const typography=node=>{
    if(!node||typeof node!=='object')return;
    for(const [key,value]of Object.entries(node)){
      if(typeof value==='string'&&['name','biography','description','longDesc'].includes(key))node[key]=value.replace(/\u2014/g,'-');
      else if(value&&typeof value==='object')typography(value);
    }
  };typography(data);
  for(const key of ['hullTrauma','systemStrain'])if(data.system?.stats?.[key])data.system.stats[key].value=0;
  return data;
}
function validateRequest(request){
  if(!game.user.isGM)throw Error(tr('GMOnly'));
  const name=cleanName(request?.name),faction=request?.faction,disposition=Number(request?.disposition??0);
  if(!name||name.length>100)throw Error(tr('InvalidName'));
  if(!FACTIONS.some(entry=>entry.id===faction))throw Error(tr('InvalidFaction'));
  if(![-1,0,1].includes(disposition))throw Error(tr('InvalidDisposition'));
  return {name,faction,disposition,rows:validateFleetRows(request?.rows,{maxShips:100})};
}
async function buildFleet(request,{onProgress}={}){
  let saved={};try{saved=game.settings.get(scope,AFFILIATION_OVERRIDES_SETTING)??{};}catch { /* If affiliation overrides cannot be read, retain the empty map and use catalogue defaults. */ }
  const sources=new Map();
  // Resolve and validate the whole selection before creating any world document.
  for(const row of request.rows){
    if(sources.has(row.uuid))continue;
    const source=await getFleetVehicleDocument(row.uuid);
    if(!matchesFleetFaction(source,request.faction,saved))throw Error(tr('FactionMismatch',{name:source.name}));
    const snapshot=source.toObject();
    sources.set(row.uuid,{source:{uuid:source.uuid,name:source.name,toObject:()=>structuredClone(snapshot)},affiliations:getFleetAffiliations(source,saved)});
  }
  if(!game.user.isGM)throw Error(tr('GMOnly'));
  for(const row of request.rows)if((row.groupSize??1)>1){const data=sources.get(row.uuid).source.toObject(),hull=Number(data.system?.stats?.hullTrauma?.max);if(!Number.isFinite(hull)||hull<=0)throw Error('Renseignez un seuil de coque individuel supérieur à zéro pour créer un groupe.');}
  const transaction=foundry.utils.randomID(),folders=[],shipIds=[],crewIds=[],plannedIds=new Set();
  const total=request.rows.reduce((sum,row)=>sum+row.count,0);let folder;
  try{
    folder=await Folder.create({name:request.name,type:'Actor',flags:{[scope]:{fleetFolder:true,fleetTransaction:transaction,fleetFaction:request.faction}}});if(!folder)throw Error(tr('CreationFailed'));folders.push(folder);
    let crewFolder=null;
    if(request.rows.some(row=>row.crewMode==='detailed')){crewFolder=await Folder.create({name:tr('CrewFolder'),type:'Actor',folder:folder.id,flags:{[scope]:{fleetCrewFolder:true,fleetTransaction:transaction}}});if(!crewFolder)throw Error(tr('CreationFailed'));folders.push(crewFolder);}
    for(const row of request.rows){
      const {source,affiliations}=sources.get(row.uuid);
      for(let index=0;index<row.count;index++){
        if(!game.user.isGM)throw Error(tr('GMOnly'));
        const id=foundry.utils.randomID();plannedIds.add(id);
        const data=fleetVehicleData(source,{name:cleanName(source.name)+' '+String(shipIds.length+1).padStart(2,'0'),newId:id,faction:request.faction,crewType:row.crewType,folderId:folder.id,disposition:request.disposition,affiliations});
        data.flags[scope].fleet.transaction=transaction;
        if((row.groupSize??1)>1)data.flags[scope].vehicleMinionGroup={enabled:true,count:row.groupSize};
        const ship=await Actor.create(data,{keepId:true,ffgVehicleChoice:row.crewMode==='detailed'?{mode:'independent'}:{mode:'npc',type:row.crewType,quality:row.quality,groupSize:row.groupSize??1,astromech:row.astromech}});if(!ship)throw Error(tr('CreationFailed'));
        shipIds.push(ship.id);
        const crew=await completeAutoCrew(ship,{actorType:row.crewType,mode:row.crewMode??'integrated',...(row.crewMode==='detailed'?{folderId:crewFolder.id}:{}),quality:row.quality,astromech:row.astromech});crewIds.push(...(crew.actors??[]));
        try{onProgress?.({done:shipIds.length,total,name:ship.name});}catch(error){console.warn('Star Wars FFG | Fleet progress',error);}
      }
    }
    return {folderId:folder.id,shipIds,crewIds};
  }catch(error){
    const uuids=new Set([...plannedIds].map(id=>'Actor.'+id));
    const disposable=Array.from(game.actors).filter(actor=>
      plannedIds.has(actor.id)&&actor.flags?.[scope]?.fleet?.transaction===transaction||uuids.has(actor.flags?.[scope]?.autoCrew?.vehicleUuid));
    for(const actor of disposable.reverse())try{await actor.delete();}catch(cleanup){console.error('Star Wars FFG | Fleet actor cleanup',cleanup);}
    for(const current of folders.reverse()){
      const occupied=Array.from(game.actors).some(actor=>(actor.folder?.id??actor.folder)===current.id)||Array.from(game.folders).some(child=>(child.folder?.id??child.folder)===current.id);
      if(!occupied)try{await current.delete();}catch(cleanup){console.error('Star Wars FFG | Fleet folder cleanup',cleanup);}
    }
    throw error;
  }
}
/** Duplicate simultaneous submits share a transaction; a later intentional creation stays possible. */
export function createFleet(request,options={}){
  const validated=validateRequest(request),key=JSON.stringify(validated);
  if(pending.has(key))return pending.get(key);
  const task=buildFleet(validated,options).finally(()=>{if(pending.get(key)===task)pending.delete(key);});
  pending.set(key,task);return task;
}
