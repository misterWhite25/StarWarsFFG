import {bindGunners} from './crew-gunners.mjs';
export const AUTO_CREW_VERSION=1;
export const AUTO_CREW_QUALITIES={novice:{rank:1,characteristic:2},standard:{rank:2,characteristic:3},veteran:{rank:3,characteristic:4}};
const norm=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const roleKind=value=>({pilot:'pilot',pilote:'pilot',copilot:'copilot',copilote:'copilot',gunner:'gunner',artilleur:'gunner',engineer:'engineer',mecanicien:'engineer',ingenieur:'engineer',technicien:'operator',technician:'operator',operator:'operator',operateur:'operator',astromech:'astromech',astromecano:'astromech'})[norm(value)];
const access=weapon=>weapon.flags?.starwarsffg?.weaponCrew??{};
const configured=weapon=>['pilot','copilot','gunner'].some(key=>access(weapon)[key]===true);
export function autoCrewLayout(vehicle){
  const size=Number(vehicle.system?.stats?.silhouette?.value)||0;
  return size<4?'fighter':size===4?'transport':'capital';
}
export function detectsAstromech(vehicle){
  const explicit=vehicle.flags?.starwarsffg?.astromechSocket;
  if(typeof explicit==='boolean')return explicit;
  if(/xwing|ywing|ewing/.test(norm(vehicle.name)))return true;
  const description=String(vehicle.system?.description??vehicle.system?.biography??'').replace(/<[^>]*>/g,' ').toLowerCase();
  if(/(?:sans|aucun|without|no)\s+(?:dro[iï]de\s+)?astrom[eé]/i.test(description))return false;
  return /astromech|astrom[eé]cano/i.test(description);
}
export function supportCrewKind(member,resolveActor=()=>null){
  const kind=resolveActor(member.actor_id??member.actorId)?.flags?.starwarsffg?.autoCrew?.kind??roleKind(member.role);
  return ['engineer','operator'].includes(kind)?kind:null;
}
export function passengerFromCrew(member,actor=null){
  const id=member.actor_id??member.actorId;
  return {key:'a'+id,actorId:id,name:member.actor_name??member.name??actor?.name,img:actor?.img??'icons/svg/mystery-man.svg',tokenUuid:null,role:member.role,integrated:!!member.integrated,...(member.vehicle_id?{vehicle_id:member.vehicle_id}:{})};
}
/** One actor per playable station or battery entry, never per listed crew member/barrel. */
export function planAutoCrew(vehicle,options={},resolveActor=id=>globalThis.game?.actors?.get?.(id),current=vehicle.flags?.starwarsffg?.crew??[]){
  const layout=autoCrewLayout(vehicle);
  if(!Object.hasOwn(AUTO_CREW_QUALITIES,options.quality??'standard'))throw Error('Invalid crew quality');
  if(!['auto','yes','no'].includes(options.astromech??'auto'))throw Error('Invalid astromech option');
  const existing=current.filter(member=>resolveActor(member.actor_id));
  const weaponUpdates=[],weapons=Array.from(vehicle.items??[]).filter(item=>item.type==='shipweapon').map(item=>{
    if(configured(item))return item;
    const turret=/turret|tourelle/i.test(item.name??'');
    const weaponCrew=layout==='fighter'&&!turret?{pilot:true,copilot:false,gunner:false}:{pilot:false,copilot:false,gunner:true};
    weaponUpdates.push({id:item.id??item._id,before:item.flags?.starwarsffg?.weaponCrew===undefined?undefined:structuredClone(item.flags.starwarsffg.weaponCrew),after:weaponCrew});
    return {id:item.id??item._id,name:item.name,type:item.type,flags:{starwarsffg:{weaponCrew}}};
  });
  const passengers=structuredClone(vehicle.flags?.starwarsffg?.vehicleDeck?.passengers??{});
  const supportMembers=existing.filter(member=>supportCrewKind(member,resolveActor));
  for(const member of supportMembers){const passenger=passengerFromCrew(member,resolveActor(member.actor_id));passengers[passenger.key]={...passengers[passenger.key],...passenger};}
  const crew=bindGunners(existing.filter(member=>!supportMembers.includes(member)),weapons),stations=[];
  const has=kind=>[...crew,...Object.values(passengers)].some(member=>roleKind(member.role)===kind||supportCrewKind(member,resolveActor)===kind);
  const add=(key,role,kind,weaponId=null,weaponName=null)=>stations.push({key,role,kind,weaponId,weaponName,...(['engineer','operator'].includes(kind)?{passenger:true}:{})});
  if(!has('pilot'))add('pilot','Pilot','pilot');
  const astromech=options.astromech==='yes'||(options.astromech!=='no'&&detectsAstromech(vehicle));
  const hasDroid=crew.some(member=>roleKind(member.role)==='astromech'||resolveActor(member.actor_id)?.flags?.starwarsffg?.autoCrew?.kind==='astromech'||/astromech|astromec/i.test(member.actor_name??resolveActor(member.actor_id)?.name??''));
  const needsCopilot=layout!=='fighter'||weapons.some(weapon=>access(weapon).copilot&&!access(weapon).pilot&&!access(weapon).gunner);
  if(astromech&&!hasDroid)add('astromech',has('copilot')?'Astromech':'Co-Pilot','astromech');
  else if(needsCopilot&&!has('copilot'))add('copilot','Co-Pilot','copilot');
  for(const weapon of weapons){
    const id=weapon.id??weapon._id;
    if(access(weapon).gunner&&!crew.some(member=>roleKind(member.role)==='gunner'&&member.weapon_id===id))add('gunner:'+id,'Gunner','gunner',id,weapon.name);
  }
  const support=Number(vehicle.system?.stats?.silhouette?.value)>=4;
  if(support&&!has('engineer'))add('engineer','Engineer','engineer');
  if(support&&!has('operator'))add('operator','Operator','operator');
  return {layout,astromech,stations,weaponUpdates,crew,passengers};
}
export function autoCrewProfile(base,station,quality='standard',actorType='rival'){
  if(!['minion','rival','nemesis'].includes(actorType))throw Error('Invalid crew actor type');
  const system=structuredClone(base),level=AUTO_CREW_QUALITIES[quality];if(!level)throw Error('Invalid crew quality');
  for(const characteristic of Object.values(system.characteristics??{}))characteristic.value=2;
  for(const skill of Object.values(system.skills??{}))skill.rank=0;
  const specialty=['pilot','copilot','gunner'].includes(station.kind)?'Agility':'Intellect';
  system.characteristics[specialty].value=level.characteristic;
  const skills={pilot:['Piloting: Space','Piloting: Planetary','Astrogation','Gunnery'],copilot:['Piloting: Space','Piloting: Planetary','Astrogation','Gunnery'],gunner:['Gunnery','Perception'],engineer:['Mechanics','Athletics','Coordination'],operator:['Computers','Astrogation','Leadership'],astromech:['Mechanics','Computers','Astrogation','Piloting: Space','Piloting: Planetary']}[station.kind];
  for(const key of skills??[])if(system.skills[key])system.skills[key].rank=level.rank;
  for(const key of ['Cool','Vigilance','Discipline'])if(system.skills[key])system.skills[key].rank=1;
  system.stats.wounds={...system.stats.wounds,value:0,max:10+level.characteristic};
  system.stats.strain={...system.stats.strain,value:0,max:actorType==='nemesis'?10+level.characteristic:0};
  system.stats.soak={...system.stats.soak,value:station.kind==='astromech'?3:2};
  if(station.kind==='astromech')for(const key of ['Brawn','Agility','Presence'])system.characteristics[key].value=1;
  if(actorType==='minion'){
    system.quantity={...system.quantity,value:1,max:1};
    system.unit_wounds={...system.unit_wounds,value:system.stats.wounds.max};
    // A single pilot is one minion. Only a real group gains group-skill ranks.
    for(const skill of Object.values(system.skills??{})){
      skill.groupskill=Number(skill.rank)>0;skill.rank=0;
    }
  }
  return system;
}
