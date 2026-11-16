/** Built-in crew stations, with read-only compatibility metadata for existing assignments. */
const scope='starwarsffg';
export const CREW_ROLE_DEFINITIONS_FLAG='crewRoleDefinitions';
export const CREW_ROLE_DEFINITIONS_VERSION=1;
const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const kinds={pilot:'pilot',pilote:'pilot',copilot:'copilot',copilote:'copilot',gunner:'gunner',artilleur:'gunner',initiative:'initiative'};
const canonicalNames={pilot:'Pilot',copilot:'Co-Pilot',gunner:'Gunner',initiative:'Initiative'};
const labelKeys={pilot:'SWFFG.Crew.Roles.Pilot',copilot:'SWFFG.WeaponCrew.copilot',gunner:'SWFFG.Crew.WeaponAssignment.Gunner',initiative:'SWFFG.Crew.Roles.Initiative.Name'};
const localize=key=>{try{return globalThis.game?.i18n?.localize?.(key)??key;}catch{return key;}};
const skillAliases={gunnery:'Gunnery',artillerie:'Gunnery',rangedlight:'Ranged: Light',armeslegeres:'Ranged: Light',rangedheavy:'Ranged: Heavy',armeslourdes:'Ranged: Heavy',mechanics:'Mechanics',mecanique:'Mechanics',computers:'Computers',informatique:'Computers',astrogation:'Astrogation',pilotingplanetary:'Piloting: Planetary',pilotageplanetaire:'Piloting: Planetary',pilotingspace:'Piloting: Space',pilotagespatial:'Piloting: Space'};

/** Resolve saved labels/translation keys against the installed skill definitions. */
export function canonicalCrewSkill(value){
 const text=String(value??'').trim();if(!text)return undefined;
 const wanted=normalize(text),skills=globalThis.CONFIG?.FFG?.skills??{};
 for(const [key,skill]of Object.entries(skills)){
  const candidates=[key,skill?.value,skill?.label,localize(skill?.label??key)];
  if(candidates.some(candidate=>normalize(candidate)===wanted))return skill?.value??key;
 }
 return skillAliases[wanted]??text;
}

function standardDefinitions(){
 return Object.entries(canonicalNames).map(([kind,role_name])=>({
  kind,role_name,label:localize(labelKeys[kind]),
  role_skill:kind==='gunner'?'Gunnery':undefined,
  use_handling:false,use_weapons:kind==='gunner'
 }));
}

/** Store only the fields used by crew rolls, never arbitrary document input. */
export function cleanCrewRoleDefinition(definition){
 const role_name=String(definition?.role_name??'');if(!role_name.trim())return null;
 const kind=definition?.kind==='initiative'?'initiative':kinds[normalize(role_name)]??'legacy';
 return {role_name,kind,role_skill:kind==='initiative'?undefined:canonicalCrewSkill(definition?.role_skill),use_handling:kind==='initiative'?false:definition?.use_handling===true,use_weapons:kind==='initiative'?false:definition?.use_weapons===true};
}

function savedDefinitions(vehicle){
 const saved=vehicle?.getFlag?.(scope,CREW_ROLE_DEFINITIONS_FLAG)??vehicle?.flags?.[scope]?.[CREW_ROLE_DEFINITIONS_FLAG];
 const definitions=Array.isArray(saved)?saved:saved?.roles;
 return Array.isArray(definitions)?definitions.map(cleanCrewRoleDefinition).filter(Boolean):[];
}

/** Definitions remain available for old assigned names even if no skill metadata exists. */
export function crewRoleDefinitions(vehicle){
 const result=standardDefinitions(),indices=new Map(result.map((role,index)=>[role.role_name,index]));
 for(const saved of savedDefinitions(vehicle)){
  const definition={...saved,label:saved.role_name,legacy:true};
  if(indices.has(saved.role_name))result[indices.get(saved.role_name)]=definition;
  else{indices.set(saved.role_name,result.length);result.push(definition);}
 }
 const crew=vehicle?.getFlag?.(scope,'crew')??vehicle?.flags?.[scope]?.crew??[];
 for(const member of Array.isArray(crew)?crew:[]){
  const role_name=String(member?.role??'');if(!role_name.trim()||indices.has(role_name))continue;
  const kind=kinds[normalize(role_name)],standard=kind?result.find(role=>role.role_name===canonicalNames[kind]):null;
  const definition=standard?{...standard,role_name,label:role_name}:{role_name,label:role_name,kind:'unknown',role_skill:undefined,use_handling:false,use_weapons:false};
  indices.set(role_name,result.length);result.push(definition);
 }
 return result;
}

export function crewRoleDefinition(vehicle,name){
 const role_name=String(name??'');if(!role_name.trim())return null;
 const definitions=crewRoleDefinitions(vehicle),exact=definitions.find(role=>role.role_name===role_name);if(exact)return exact;
 const kind=kinds[normalize(role_name)];
 const standard=kind?definitions.find(role=>role.role_name===canonicalNames[kind]):null;
 return standard?{...standard,role_name,label:role_name}:{role_name,label:role_name,kind:'unknown',role_skill:undefined,use_handling:false,use_weapons:false};
}

export function crewRolesForSkill(vehicle,skill){
 const key=canonicalCrewSkill(skill);if(!key)return [];
 return crewRoleDefinitions(vehicle).filter(role=>role.role_skill!==undefined&&canonicalCrewSkill(role.role_skill)===key);
}

export const isInitiativeCrewRole=(vehicle,name)=>crewRoleDefinition(vehicle,name)?.kind==='initiative';
