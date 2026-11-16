/** Fleet sizes below are editable GM preparation presets, not canonical military tables. */
export const FACTIONS=Object.freeze([
  {id:'empire',label:'Empire'},{id:'alliance',label:'Alliance'},{id:'pirates',label:'Pirates'},
  {id:'hutt',label:'Hutt'},{id:'other',label:'Autres'}
]);
export const FLEET_FACTIONS=FACTIONS;
export const FLEET_PRESETS=Object.freeze({
  squadron:{id:'squadron',label:'Escadrille',fighters:6,escorts:0,capital:0},
  flotilla:{id:'flotilla',label:'Flottille',fighters:6,escorts:2,capital:0},
  small:{id:'small',label:'Petite flotte',fighters:12,escorts:2,capital:1},
  medium:{id:'medium',label:'Flotte moyenne',fighters:24,escorts:4,capital:2},
  large:{id:'large',label:'Grande flotte',fighters:48,escorts:8,capital:3}
});
export const normalizeFleetText=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const factionIds=new Set(FACTIONS.map(faction=>faction.id));
export function normalizeFleetAffiliations(value){
  if(!Array.isArray(value))return [];
  const selected=new Set(value.filter(faction=>factionIds.has(faction)));
  return FACTIONS.map(faction=>faction.id).filter(id=>selected.has(id));
}
const modelText=entry=>[entry?.key,entry?.name,entry?.names?.fr,entry?.names?.en].filter(Boolean).map(normalizeFleetText).join(' ');
/** Suggestions concern available models, not the allegiance of an individual captured ship. */
export function suggestFleetAffiliations(entry){
  const text=modelText(entry);
  if(/nebulonb|ef76/.test(text))return FACTIONS.map(faction=>faction.id);
  const factions=[];
  const names=[entry?.name,entry?.names?.en,entry?.names?.fr].filter(Boolean).join(' ');
  if(/\btie(?:[/\s-]|$)/i.test(names)||/^vehicle\.(?:ogg-)?tie/i.test(entry?.key??'')||/interdictor|stardestroyer|destroyerstellaire|imperial|imperiale|assertor|praetor|raideriicor|vigilcorv/.test(text))factions.push('empire');
  if(/xwing|ywing|awing|bwing|t65b|btls3|btla4|asf01bwing|rz1awing|moncalamari|mc80|mc75|mc30|rebellion|alliance/.test(text))factions.push('alliance');
  if(/pirate/.test(text))factions.push('pirates');
  if(/hutt/.test(text))factions.push('hutt');
  // Civilian transports and common escort hulls are usable by several factions.
  if(/(?:yt1300|yt2400|yv666|firespray|cr90|gr75|g9rigger)/.test(text))return FACTIONS.map(faction=>faction.id);
  return normalizeFleetAffiliations(factions);
}
/** A preparation category, not an assertion of official fleet membership. */
export function vehicleClass(entry){
  if(entry?.spaceShip===false)return 'unknown';
  const text=modelText(entry),names=[entry?.name,entry?.names?.en,entry?.names?.fr].filter(Boolean).join(' ');
  if(/starfighter|chasseur|interceptor|intercepteur|bomber|bombardier|xwing|ywing|awing|bwing/.test(text)||/\btie\//i.test(names))return 'fighter';
  if(/nebulonb|frigate|fregate|corvette|cr90|cr92|gr75/.test(text))return 'escort';
  if(/stardestroyer|destroyerstellaire|mc80|mc75|dreadnought|cuirasse|praetor|assertor/.test(text))return 'capital';
  const size=Number(entry?.silhouette??entry?.system?.stats?.silhouette?.value);
  if(Number.isFinite(size)&&size>=6)return 'capital';
  if(Number.isFinite(size)&&size>=4)return 'escort';
  return 'unknown';
}
export function fleetAffiliationInfo(entry,overrides={}){
  const uuid=typeof entry==='string'?entry:entry?.uuid;
  if(uuid&&Object.hasOwn(overrides??{},uuid)){
    const saved=overrides[uuid],value=Array.isArray(saved)?saved:saved?.factions;
    return {affiliations:normalizeFleetAffiliations(value),source:'override'};
  }
  if(Array.isArray(entry?.affiliations))return {affiliations:normalizeFleetAffiliations(entry.affiliations),source:entry.affiliationSource??'entry'};
  const saved=entry?.flags?.starwarsffg?.fleetAffiliations;
  if(Array.isArray(saved))return {affiliations:normalizeFleetAffiliations(saved),source:'document'};
  const affiliations=suggestFleetAffiliations(entry);
  return {affiliations,source:affiliations.length?'suggestion':'unknown'};
}
export const getFleetAffiliations=(entry,overrides={})=>fleetAffiliationInfo(entry,overrides).affiliations;
export function matchesFleetFaction(entry,faction,overrides={}){
  return factionIds.has(faction)&&getFleetAffiliations(entry,overrides).includes(faction);
}
export function getFleetPreset(id){
  if(!Object.hasOwn(FLEET_PRESETS,id))throw Error('Choisissez une taille de flotte valide.');
  return {...FLEET_PRESETS[id]};
}
export function isFleetVehicleUuid(uuid){
  return typeof uuid==='string'&&/^(?:Actor\.[A-Za-z0-9_-]+|Compendium\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.Actor\.[A-Za-z0-9_-]+)$/.test(uuid);
}
export function validateFleetRows(rows,{maxShips=200}={}){
  if(!Array.isArray(rows)||!rows.length||rows.length>100)throw Error('Sélectionnez de 1 à 100 modèles de vaisseaux.');
  let total=0;
  const result=rows.map(row=>{
    const uuid=row?.uuid,count=Number(row?.count??row?.quantity),crewType=row?.crewType??'rival',quality=row?.quality??'standard',astromech=row?.astromech??'auto';
    const crewMode=row?.crewMode??'integrated',groupSize=Number(row?.groupSize??1);
    if(!['integrated','detailed'].includes(crewMode))throw Error('Choisissez un mode d’équipage valide.');
    if(!Number.isSafeInteger(groupSize)||groupSize<1||groupSize>100)throw Error('Un groupe doit contenir de 1 à 100 appareils identiques.');
    if(!isFleetVehicleUuid(uuid))throw Error('Référence de vaisseau invalide.');
    if(!Number.isSafeInteger(count)||count<1||count>100)throw Error('La quantité de chaque modèle doit être comprise entre 1 et 100.');
    if(!['minion','rival','nemesis'].includes(crewType))throw Error('Choisissez Sbire, Rival ou Némésis pour chaque équipage.');
    if(!['novice','standard','veteran'].includes(quality))throw Error('Choisissez un niveau de compétence valide.');
    if(!['auto','yes','no'].includes(astromech))throw Error('Choisissez une option astromech valide.');
    total+=count*groupSize;return {uuid,count,crewType:groupSize>1?'minion':crewType,quality,astromech,...(row.crewMode!==undefined?{crewMode:groupSize>1?'integrated':crewMode}:{}),...(row.groupSize!==undefined?{groupSize}:{})};
  });
  if(total>maxShips)throw Error('Cette préparation dépasse la limite de '+maxShips+' vaisseaux.');
  return result;
}
