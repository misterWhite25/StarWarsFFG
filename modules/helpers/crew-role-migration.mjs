import {CREW_ROLE_DEFINITIONS_FLAG,CREW_ROLE_DEFINITIONS_VERSION,cleanCrewRoleDefinition} from './crew-role-definitions.mjs';
const scope='starwarsffg',tokenVersion='crewRoleDefinitionsMigrationVersion';

/** Removed settings stay unregistered. Their historical Setting documents are read only once per vehicle. */
function historicalSetting(key){
 const storage=globalThis.game?.settings?.storage?.get?.('world');
 const document=storage?.getSetting?.(scope+'.'+key);
 let value=document?._source?.value??document?.value??storage?.getItem?.(scope+'.'+key);
 try{for(let n=0;n<2&&typeof value==='string';n++)value=JSON.parse(value);}catch{return null;}
 return value;
}

function snapshot(vehicle,legacyRoles,initiative){
 const crew=vehicle.getFlag(scope,'crew')??[],names=new Set((Array.isArray(crew)?crew:[]).map(entry=>String(entry?.role??'')).filter(name=>name.trim()));
 const existing=vehicle.getFlag(scope,CREW_ROLE_DEFINITIONS_FLAG),definitions=Array.isArray(existing)?existing:existing?.roles;
 const roles=new Map((Array.isArray(definitions)?definitions:[]).map(cleanCrewRoleDefinition).filter(Boolean).map(definition=>[definition.role_name,definition]));
 for(const definition of legacyRoles){
  if(names.has(definition.role_name)&&!roles.has(definition.role_name))roles.set(definition.role_name,definition);
 }
 const initiativeName=String(initiative?.role_name??'');
 if(initiativeName&&names.has(initiativeName))roles.set(initiativeName,{role_name:initiativeName,kind:'initiative',role_skill:undefined,use_handling:false,use_weapons:false});
 return {version:CREW_ROLE_DEFINITIONS_VERSION,roles:[...roles.values()].filter(definition=>names.has(definition.role_name))};
}

/** Preserve custom station mechanics on world vehicles and unlinked token actors, without touching crew assignments. */
export async function migrateCrewRoleDefinitions(){
 const game=globalThis.game;if(!game?.user?.isGM)return {migrated:0,skipped:true};
 const primary=game.users?.activeGM??game.users?.find?.(user=>user.active&&user.isGM);
 if(primary?.id&&primary.id!==game.user.id)return {migrated:0,skipped:true};
 const raw=historicalSetting('arrayCrewRoles'),legacyRoles=(Array.isArray(raw)?raw:[]).map(cleanCrewRoleDefinition).filter(Boolean),initiative=historicalSetting('initiativeCrewRole');
 let migrated=0;const failures=[];
 // Synthetic actors run first so a newly migrated base actor cannot hide a token-specific assignment.
 for(const scene of game.scenes??[]){for(const token of scene.tokens??[]){
  if(token.actorLink||token.actor?.type!=='vehicle'||token.getFlag(scope,tokenVersion)>=CREW_ROLE_DEFINITIONS_VERSION)continue;
  try{await token.actor.setFlag(scope,CREW_ROLE_DEFINITIONS_FLAG,snapshot(token.actor,legacyRoles,initiative));await token.setFlag(scope,tokenVersion,CREW_ROLE_DEFINITIONS_VERSION);migrated++;}
  catch(error){failures.push({uuid:token.uuid,message:error.message});}
 }}
 for(const vehicle of game.actors??[]){
  if(vehicle.type!=='vehicle'||vehicle.pack||vehicle.isToken||vehicle.getFlag(scope,CREW_ROLE_DEFINITIONS_FLAG)?.version>=CREW_ROLE_DEFINITIONS_VERSION)continue;
  try{await vehicle.setFlag(scope,CREW_ROLE_DEFINITIONS_FLAG,snapshot(vehicle,legacyRoles,initiative));migrated++;}
  catch(error){failures.push({uuid:vehicle.uuid,message:error.message});}
 }
 if(failures.length)console.error('Star Wars FFG | Crew role compatibility migration',failures);
 return {migrated,failures};
}
