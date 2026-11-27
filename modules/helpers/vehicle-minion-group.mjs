import {localizedSystemError} from "./system-localization.mjs";
const scope='starwarsffg',flag='vehicleMinionGroup';
export const DEFAULT_VEHICLE_GROUP_SKILLS=['Piloting: Space','Piloting: Planetary','Gunnery'];
const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z]/g,'');
const finite=value=>Number.isFinite(Number(value))?Number(value):0;

/** Stored hull threshold is per vehicle; sheets and token bars display the group's total. */
export function vehicleMinionGroup(vehicle){
  const config=vehicle?.flags?.[scope]?.[flag]??{},enabled=vehicle?.type==='vehicle'&&config.enabled===true;
  const count=Number.isInteger(Number(config.count))?Math.max(1,Math.min(100,Number(config.count))):1;
  const hullPerVehicle=Math.max(0,finite(vehicle?.system?.stats?.hullTrauma?.max));
  const damage=Math.max(0,finite(vehicle?.system?.stats?.hullTrauma?.value));
  // Match the system's existing minion rule: damage must exceed an individual threshold.
  const destroyed=enabled&&hullPerVehicle>0?Math.min(count,Math.max(0,Math.ceil(damage/hullPerVehicle)-1)):0;
  const alive=enabled?Math.max(0,count-destroyed):1;
  const skillKeys=Array.isArray(config.skillKeys)?config.skillKeys.filter(key=>typeof key==='string'):DEFAULT_VEHICLE_GROUP_SKILLS;
  return {enabled,count:enabled?count:1,alive,destroyed,hullPerVehicle,totalHull:hullPerVehicle*(enabled?count:1),damage,
    skillRank:Math.min(5,Math.max(0,alive-1)),skillKeys:[...skillKeys]};
}

export function vehicleGroupSkillRank(vehicle,key,skill={}){
  const group=vehicleMinionGroup(vehicle);
  if(!group.enabled)return null;
  const selected=skill.groupskill===true||group.skillKeys.some(name=>normalize(name)===normalize(key));
  return selected?group.skillRank:null;
}

/** Mutates only the caller's detached profile copy, before native Actor preparation. */
export function applyVehicleMinionSkills(data,vehicle){
  const group=vehicleMinionGroup(vehicle);if(!group.enabled)return data;
  for(const [key,skill]of Object.entries(data.system?.skills??{})){
    const rank=vehicleGroupSkillRank(vehicle,key,skill);
    if(rank!==null){skill.groupskill=true;skill.rank=rank;}
  }
  if(data.type==='minion'){
    data.system.quantity={...data.system.quantity,max:group.alive,value:group.alive};
    // Vehicle hull damage owns casualties; do not count the profile's body wounds again.
    if(data.system.stats?.wounds)data.system.stats.wounds.value=0;
  }
  return data;
}

export function requireLivingVehicleGroup(vehicle){
  const group=vehicleMinionGroup(vehicle);
  if(group.enabled&&!group.alive)throw localizedSystemError("SWFFG.UI.Operations.GroupOutOfCombat");
  return group;
}

export async function setVehicleMinionGroup(vehicle,options={}){
  const previous=vehicle?.flags?.[scope]?.[flag]??{},enabled=options.enabled,count=options.count??previous.count??1,skillKeys=options.skillKeys??previous.skillKeys??DEFAULT_VEHICLE_GROUP_SKILLS;
  if(!globalThis.game?.user?.isGM||vehicle?.type!=='vehicle'||vehicle.pack||!vehicle.isOwner)throw localizedSystemError("SWFFG.UI.Operations.GroupGMOnly");
  if(typeof enabled!=='boolean'||!Number.isInteger(Number(count))||Number(count)<1||Number(count)>100)throw localizedSystemError("SWFFG.UI.Operations.GroupCount");
  if(!Array.isArray(skillKeys)||skillKeys.length>30||skillKeys.some(key=>typeof key!=='string'||!key.trim()||key.length>100))throw localizedSystemError("SWFFG.UI.Operations.GroupInvalidSkills");
  const hull=Number(vehicle.system?.stats?.hullTrauma?.max);
  if(enabled&&(!Number.isFinite(hull)||hull<=0))throw localizedSystemError("SWFFG.UI.Operations.IndividualHullThreshold");
  await vehicle.setFlag(scope,flag,{version:1,enabled,count:Number(count),skillKeys:[...new Set(skillKeys)]});
  return vehicleMinionGroup(vehicle);
}

/** Repairs may restore surviving hulls, but cannot bring back vehicles already lost. */
export function vehicleGroupRepairValue(vehicle,proposed){
  const group=vehicleMinionGroup(vehicle),value=Math.max(0,finite(proposed));
  return group.enabled&&group.destroyed?Math.max(value,Math.min(group.damage,group.destroyed*group.hullPerVehicle+Math.min(1,group.hullPerVehicle))):value;
}

/** One critical adds precisely one member's hull threshold, with safe before/after undo data. */
export function vehicleMinionCriticalChange(vehicle){
  const group=requireLivingVehicleGroup(vehicle);
  if(!group.enabled||group.hullPerVehicle<=0)throw localizedSystemError("SWFFG.UI.Operations.InvalidMinionVehicle");
  return {actor:vehicle.uuid,path:'system.stats.hullTrauma.value',before:group.damage,after:group.damage+group.hullPerVehicle+(group.damage===0?Math.min(1,group.hullPerVehicle):0)};
}

/** Resolve damage before recording transactions, so undo tracks the real resource. */
export function vehicleDamageResource(vehicle,key){
  return key==='systemStrain'&&vehicleMinionGroup(vehicle).enabled?'hullTrauma':key;
}

/** Catch direct stress writes too, without turning stress recovery into hull repairs. */
export function convertVehicleMinionStress(vehicle,changes){
  if(!vehicleMinionGroup(vehicle).enabled)return changes;
  const get=key=>Object.hasOwn(changes,'system.stats.'+key+'.value')?changes['system.stats.'+key+'.value']:changes.system?.stats?.[key]?.value;
  const write=(key,value)=>{
    const path='system.stats.'+key+'.value';
    if(Object.hasOwn(changes,path))changes[path]=value;
    else {changes.system??={};changes.system.stats??={};changes.system.stats[key]??={};changes.system.stats[key].value=value;}
  };
  const proposed=get('systemStrain');
  if(proposed===undefined||proposed===null||!Number.isFinite(Number(proposed)))return changes;
  const current=finite(vehicle.system?.stats?.systemStrain?.value),damage=Math.max(0,Number(proposed)-current);
  write('systemStrain',current);
  if(damage>0){const hull=get('hullTrauma');write('hullTrauma',Math.max(0,hull===undefined?finite(vehicle.system?.stats?.hullTrauma?.value):finite(hull))+damage);}
  return changes;
}
