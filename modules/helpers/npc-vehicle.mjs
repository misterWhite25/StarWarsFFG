import {planAutoCrew,AUTO_CREW_QUALITIES} from './auto-crew-model.mjs';
import {vehicleGroupSkillRank} from './vehicle-minion-group.mjs';
const scope='starwarsffg';
const collections=()=>{const rows=[];rows.contents=rows;rows.get=()=>undefined;return rows;};
const labels={pilot:'Pilote',copilot:'Copilote',gunner:'Artilleur',engineer:'Mécanicien',operator:'Technicien',commander:'Commandant',astromech:'Astromech',support:'Passagers'};
export const NPC_INITIATIVE_SKILLS=['Cool','Vigilance'];
const initiativeDefaults=()=>Object.fromEntries(NPC_INITIATIVE_SKILLS.map(key=>[key,{ability:2,rank:0}]));
export const NPC_VEHICLE_SKILLS=['Piloting: Space','Piloting: Planetary','Gunnery','Computers','Mechanics','Leadership',...NPC_INITIATIVE_SKILLS];
const stats={ 'Piloting: Space':'Agility','Piloting: Planetary':'Agility',Gunnery:'Agility',Computers:'Intellect',Mechanics:'Intellect',Leadership:'Presence',Cool:'Presence',Vigilance:'Willpower'};
const skillLabels={'Piloting: Space':'PilotingSpace','Piloting: Planetary':'PilotingPlanetary',Gunnery:'Gunnery',Computers:'Computers',Mechanics:'Mechanics',Leadership:'Leadership',Cool:'Cool',Vigilance:'Vigilance'};
export const npcVehicle=vehicle=>vehicle?.flags?.[scope]?.npcVehicle?.version===1;
export function npcVehicleData(vehicle,{type='rival',quality='standard',groupSize=1,astromech='auto'}={}){
  if(!['minion','rival','nemesis'].includes(type)||!AUTO_CREW_QUALITIES[quality])throw Error('Profil de véhicule PNJ invalide.');
  const plan=planAutoCrew({name:vehicle.name,system:vehicle.system,items:vehicle.items,flags:{}},{quality,astromech},()=>null,[]);
  const planned=[...plan.stations];if(Number(vehicle.system?.stats?.silhouette?.value)>=4)planned.push({key:'commander',kind:'commander',role:'Commandant',passenger:true});
  const posts=planned.filter(post=>!post.passenger||!supportKinds.has(post.kind));
  if(planned.some(post=>post.passenger&&supportKinds.has(post.kind)))posts.push({key:'passengers',kind:'support',role:'Passager',passenger:true});
  const stations={},crew=[],passengers={},level=AUTO_CREW_QUALITIES[quality];
  for(const post of posts){
    const id=foundry.utils.randomID(),name=(labels[post.kind]??post.role)+(post.weaponName?' - '+post.weaponName:'');
    const specialties={pilot:['Piloting: Space','Piloting: Planetary','Gunnery'],copilot:['Piloting: Space','Piloting: Planetary','Gunnery'],gunner:['Gunnery'],engineer:['Mechanics'],operator:['Computers'],commander:['Leadership'],support:supportSkills,astromech:['Piloting: Space','Piloting: Planetary','Computers','Mechanics']}[post.kind]??[];
    const skills=Object.fromEntries((post.kind==='support'?[...supportSkills,...NPC_INITIATIVE_SKILLS]:NPC_VEHICLE_SKILLS).map(key=>[key,{ability:specialties.includes(key)?level.characteristic:2,rank:specialties.includes(key)?level.rank:0}]));
    stations[id]={id,name,kind:post.kind,station:post.key,role:post.role,skills,strain:0,flags:{}};
    const member={actor_id:id,actor_name:name,role:post.role,integrated:true,npcStation:true,vehicle_id:vehicle.id,link:null,...(post.weaponId?{weapon_id:post.weaponId}:{})};
    if(post.passenger)passengers['a'+id]={key:'a'+id,actorId:id,name,img:'icons/svg/d20.svg',role:post.role,integrated:true,npcStation:true,vehicle_id:vehicle.id,tokenUuid:null};else crew.push(member);
  }
  const items=Array.from(vehicle.items??[]).map(item=>{const raw=item.toObject?item.toObject():structuredClone(item),update=plan.weaponUpdates.find(change=>change.id===(raw._id??raw.id));if(update){raw.flags??={};raw.flags[scope]??={};raw.flags[scope].weaponCrew=update.after;}return raw;});
  return {['flags.'+scope+'.npcVehicle']:{version:1,type,quality,astromech,stations},['flags.'+scope+'.crew']:crew,['flags.'+scope+'.vehicleDeck.passengers']:passengers,['flags.'+scope+'.-=integratedCrew']:null,['flags.'+scope+'.vehicleCreationMode']:'npc',
    ['flags.'+scope+'.vehicleMinionGroup']:{version:1,enabled:type==='minion',count:groupSize},'prototypeToken.actorLink':type!=='minion',items};
}

const supportKinds=new Set(['engineer','operator','commander']);
const supportSkills=['Computers','Leadership','Mechanics'];
const supportKindForSkill={Computers:'operator',Leadership:'commander',Mechanics:'engineer'};
const supportPending=new Map();

/** Merge anonymous NPC support accounts, retaining specialist pools and named passengers. */
export function npcPassengerConsolidation(vehicle){
  if(!npcVehicle(vehicle))return null;
  const config=vehicle.flags[scope].npcVehicle,passengers=vehicle.flags[scope].vehicleDeck?.passengers??{};
  const rows=Object.entries(passengers).filter(([,member])=>{
    const post=config.stations?.[member.actorId];return post&&(supportKinds.has(post.kind)||post.kind==='support');
  });
  if(!rows.some(([,member])=>supportKinds.has(config.stations[member.actorId].kind)))return null;
  const preferred=rows.find(([,m])=>config.stations[m.actorId].kind==='support')??rows.find(([,m])=>config.stations[m.actorId].kind==='engineer')??rows[0];
  const [key,member]=preferred,primary=config.stations[member.actorId],posts=rows.map(([,m])=>config.stations[m.actorId]);
  const skills=Object.fromEntries(supportSkills.map(skill=>{
    const specialist=posts.find(post=>post.kind===supportKindForSkill[skill]);
    const existing=posts.find(post=>post.kind==='support');
    return [skill,structuredClone(existing?.skills?.[skill]??specialist?.skills?.[skill]??primary.skills?.[skill]??{ability:2,rank:0})];
  }));
  for(const key of NPC_INITIATIVE_SKILLS)skills[key]=structuredClone(posts.find(post=>post.kind==='support')?.skills?.[key]??primary.skills?.[key]??posts.find(post=>post.skills?.[key])?.skills[key]??{ability:2,rank:0});
  const profile={...structuredClone(primary),name:'Passagers',kind:'support',station:'passengers',role:'Passager',skills,flags:Object.assign({},...posts.map(post=>post.flags??{}),primary.flags??{})};
  const aliases={...config.stationAliases},oldIds=new Set(posts.map(post=>post.id));
  for(const [old,target]of Object.entries(aliases))if(oldIds.has(target))aliases[old]=primary.id;
  const patch={['flags.'+scope+'.npcVehicle.stations.'+primary.id]:profile,['flags.'+scope+'.vehicleDeck.passengers.'+key]:{...member,name:'Passagers',role:'Passager'}};
  for(const [oldKey,oldMember]of rows){
    if(oldKey!==key)patch['flags.'+scope+'.vehicleDeck.passengers.-='+oldKey]=null;
    if(oldMember.actorId!==primary.id){patch['flags.'+scope+'.npcVehicle.stations.-='+oldMember.actorId]=null;aliases[oldMember.actorId]=primary.id;}
  }
  patch['flags.'+scope+'.npcVehicle.stationAliases']=aliases;
  return patch;
}
export function consolidateNpcPassengers(vehicle,{render=true}={}){
  if(!game.user.isGM||!vehicle?.isOwner||vehicle.pack)return Promise.resolve(false);
  if(supportPending.has(vehicle.uuid))return supportPending.get(vehicle.uuid);
  const task=Promise.resolve().then(async()=>{const patch=npcPassengerConsolidation(vehicle);if(!patch)return false;await vehicle.update(patch,{render});return true;}).finally(()=>{if(supportPending.get(vehicle.uuid)===task)supportPending.delete(vehicle.uuid);});
  supportPending.set(vehicle.uuid,task);return task;
}

export function copyNpcVehicle(vehicle){
  const config=structuredClone(vehicle.flags[scope].npcVehicle),ids=new Map(),stations={};
  for(const post of Object.values(config.stations)){const id=foundry.utils.randomID();ids.set(post.id,id);post.id=id;stations[id]=post;}
  const crew=(vehicle.flags[scope].crew??[]).map(member=>ids.has(member.actor_id)?{...member,actor_id:ids.get(member.actor_id),vehicle_id:vehicle.id}:member),passengers={},positions=structuredClone(vehicle.flags[scope].vehicleDeck?.positions??{});
  const movePosition=(before,after)=>{if(before!==after&&Object.hasOwn(positions,before)){positions[after]=positions[before];delete positions[before];positions['-='+before]=null;}};
  for(const [key,member]of Object.entries(vehicle.flags[scope].vehicleDeck?.passengers??{})){const id=ids.get(member.actorId);passengers[id?'a'+id:key]=id?{...member,key:'a'+id,actorId:id,vehicle_id:vehicle.id}:member;if(id){passengers['-='+key]=null;movePosition(key,'a'+id);}}
  for(const [before,after]of ids)movePosition('a'+before,'a'+after);
  for(const id of Object.keys(config.stations))stations['-='+id]=null;
  return {['flags.'+scope+'.npcVehicle.stations']:stations,['flags.'+scope+'.npcVehicle.stationAliases']:Object.fromEntries(Object.entries(config.stationAliases??{}).map(([old,target])=>[old,ids.get(target)??target])),['flags.'+scope+'.crew']:crew,['flags.'+scope+'.vehicleDeck.passengers']:passengers,['flags.'+scope+'.vehicleDeck.positions']:positions};
}
function locate(value,vehicle){
  let id=typeof value==='string'?value:value?.actor_id??value?.actorId??value?.id;
  const match=String(id??'').match(/^(.*)\.NpcStation\.([^.]+)$/);
  if(match){vehicle=globalThis.fromUuidSync?.(match[1]);id=match[2];}
  if(!vehicle&&value?.vehicle_uuid)vehicle=globalThis.fromUuidSync?.(value.vehicle_uuid);
  if(!vehicle&&value?.vehicle_id)vehicle=game.actors.get(value.vehicle_id);
  if(vehicle&&npcVehicle(vehicle)){const config=vehicle.flags[scope].npcVehicle;id=config.stationAliases?.[id]??id;if(config.stations[id])return {vehicle,id};}
  if(vehicle)return null;
  for(const candidate of game.actors??[])if(npcVehicle(candidate)){const config=candidate.flags[scope].npcVehicle,found=config.stationAliases?.[id]??id;if(config.stations[found])return {vehicle:candidate,id:found};}
  return null;
}
/** A small skill account, never a native Actor document or a hidden character sheet. */
export function npcStationActor(value,vehicle=null){
  const found=locate(value,vehicle);if(!found)return null;
  vehicle=found.vehicle;const id=found.id,post=vehicle.flags[scope].npcVehicle.stations[id],config=vehicle.flags[scope].npcVehicle;
  const skills={},characteristics={Agility:{value:2},Intellect:{value:2},Presence:{value:2},Willpower:{value:2}};
  for(const [key,pool]of Object.entries({...initiativeDefaults(),...post.skills})){
    const group=vehicleGroupSkillRank(vehicle,key,{groupskill:config.type==='minion'&&pool.rank>0}),rank=config.type==='minion'?group??0:pool.rank;
    // Each skill stores its own aptitude; these keys avoid sharing a characteristic between unrelated checks.
    const characteristic=stats[key]+'_'+key.replace(/[^a-z]/gi,'');characteristics[characteristic]={value:pool.ability};
    skills[key]={rank,characteristic,label:game.i18n.localize('SWFFG.SkillsName'+skillLabels[key]),groupskill:config.type==='minion',boost:0,setback:0};
  }
  const system={skills,characteristics,stats:{strain:{value:post.strain??0,max:0},wounds:{value:0,max:0},soak:{value:0},defence:{melee:0,ranged:0}}};
  const empty=collections(),actor={id,_id:id,uuid:vehicle.uuid+'.NpcStation.'+id,name:post.name,type:config.type,documentName:'Actor',system,flags:{starwarsffg:{...post.flags,autoCrew:{kind:post.kind}}},items:empty,effects:empty,talentList:[],overrides:{},img:'icons/svg/d20.svg',hasPlayerOwner:false,isOwner:game.user.isGM,visible:vehicle.visible,_npcStation:{vehicle,id},_integratedCrew:{vehicle,id,kind:post.kind,station:post.station},
    testUserPermission:user=>!!user?.isGM,getEmbeddedCollection:()=>empty,
    getFlag:(s,key)=>key.split('.').reduce((data,k)=>data?.[k],actor.flags[s]),
    toObject:()=>({_id:id,name:post.name,type:config.type,system,flags:actor.flags,items:[],effects:[]}),
    toJSON:()=>({uuid:actor.uuid,_id:id,name:actor.name}),
    update:async changes=>{
      if(!game.user.isGM)throw Error('Seul le MJ peut modifier les postes PNJ.');
      const updates={};for(const [key,next]of Object.entries(changes)){
        if(key==='system.stats.strain.value')updates['flags.'+scope+'.npcVehicle.stations.'+id+'.strain']=next;
        else if(key.startsWith('flags.starwarsffg.'))updates['flags.'+scope+'.npcVehicle.stations.'+id+'.flags.'+key.slice(18)]=next;
        else throw Error('Ce poste PNJ contient uniquement des compétences.');
      }
      await vehicle.update(updates);return npcStationActor({actor_id:id},vehicle);
    }
  };
  actor.setFlag=(s,key,next)=>actor.update({['flags.'+s+'.'+key]:next});
  actor.sheet={getData:async()=>({actor:actor.toObject(),data:system,document:actor,documentUuid:actor.uuid}),render:async()=>{const {editNpcSkills}=await import('./npc-vehicle-ui.mjs');return editNpcSkills(vehicle,id);}};
  return actor;
}
export async function removeNpcStation(vehicle,id){
  if(!game.user.isGM)throw Error('Seul le MJ peut modifier les postes PNJ.');
  await vehicle.update({['flags.'+scope+'.npcVehicle.stations.-='+id]:null,['flags.'+scope+'.crew']:(vehicle.flags[scope].crew??[]).filter(member=>member.actor_id!==id),['flags.'+scope+'.vehicleDeck.passengers.-=a'+id]:null});
}
const pending=new Map();
export function synchronizeNpcVehicle(vehicle){
  if(!npcVehicle(vehicle))return Promise.resolve();
  const task=(pending.get(vehicle.uuid)??Promise.resolve()).catch(()=>{}).then(async()=>{
    await consolidateNpcPassengers(vehicle);
    const current=vehicle.flags[scope].npcVehicle,patch=npcVehicleData(vehicle,current),fresh=patch['flags.'+scope+'.npcVehicle'],byKey=new Map(Object.values(current.stations).map(post=>[post.station,post])),ids=new Map(),stations={};
    for(const post of Object.values(fresh.stations)){const old=byKey.get(post.station);if(old){ids.set(post.id,old.id);post.id=old.id;post.skills={...post.skills,...old.skills};post.strain=old.strain;post.flags=old.flags;}stations[post.id]=post;}
    const crew=patch['flags.'+scope+'.crew'].map(member=>({...member,actor_id:ids.get(member.actor_id)??member.actor_id})),passengers={};
    for(const member of Object.values(patch['flags.'+scope+'.vehicleDeck.passengers'])){const id=ids.get(member.actorId)??member.actorId;passengers['a'+id]={...member,key:'a'+id,actorId:id};}
    for(const [old,member]of Object.entries(vehicle.flags[scope].vehicleDeck?.passengers??{}))if(!passengers[old]){if(!current.stations[member.actorId]&&!member.npcStation)passengers[old]=member;else passengers['-='+old]=null;}
    const weaponUpdates=patch.items.filter(item=>item.type==='shipweapon'&&JSON.stringify(item.flags?.starwarsffg?.weaponCrew)!==JSON.stringify(vehicle.items.get(item._id)?.flags?.starwarsffg?.weaponCrew)).map(item=>({_id:item._id,'flags.starwarsffg.weaponCrew':item.flags.starwarsffg.weaponCrew}));
    if(weaponUpdates.length)await vehicle.updateEmbeddedDocuments('Item',weaponUpdates);
    const removed=Object.keys(current.stations).filter(id=>!stations[id]);for(const id of removed)stations['-='+id]=null;
    if(!removed.length&&JSON.stringify(current.stations)===JSON.stringify(stations)&&JSON.stringify(vehicle.flags[scope].crew)===JSON.stringify(crew)&&JSON.stringify(vehicle.flags[scope].vehicleDeck?.passengers??{})===JSON.stringify(passengers))return;
    await vehicle.update({['flags.'+scope+'.npcVehicle.stations']:stations,['flags.'+scope+'.crew']:crew,['flags.'+scope+'.vehicleDeck.passengers']:passengers});
  });pending.set(vehicle.uuid,task);return task.finally(()=>{if(pending.get(vehicle.uuid)===task)pending.delete(vehicle.uuid);});
}

const initiativeUpdates=new Map();
/** Backfill only missing initiative settings, leaving every existing station value intact. */
export function ensureNpcInitiativeSkills(vehicle){
  if(!npcVehicle(vehicle)||!game.user.isGM||!vehicle.isOwner||vehicle.pack)return Promise.resolve(false);
  if(initiativeUpdates.has(vehicle.uuid))return initiativeUpdates.get(vehicle.uuid);
  const task=Promise.resolve().then(async()=>{
    const patch={};
    for(const post of Object.values(vehicle.flags[scope].npcVehicle.stations??{}))for(const [key,pool]of Object.entries(initiativeDefaults()))
      if(!post.skills?.[key])patch['flags.'+scope+'.npcVehicle.stations.'+post.id+'.skills.'+key]=pool;
    if(!Object.keys(patch).length)return false;
    await vehicle.update(patch,{render:false});return true;
  }).finally(()=>initiativeUpdates.delete(vehicle.uuid));
  initiativeUpdates.set(vehicle.uuid,task);return task;
}
