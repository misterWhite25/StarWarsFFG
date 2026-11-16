export const FACTIONS=Object.freeze([
  {id:'empire',label:'Empire'},{id:'alliance',label:'Alliance'},{id:'pirates',label:'Pirates'},
  {id:'hutt',label:'Hutt'},{id:'other',label:'Autres'}
]);
const normalizeVehicleText=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const factionIds=new Set(FACTIONS.map(faction=>faction.id));
export function normalizeVehicleAffiliations(value){
  if(!Array.isArray(value))return [];
  const selected=new Set(value.filter(faction=>factionIds.has(faction)));
  return FACTIONS.map(faction=>faction.id).filter(id=>selected.has(id));
}
const modelText=entry=>[entry?.key,entry?.name,entry?.names?.fr,entry?.names?.en].filter(Boolean).map(normalizeVehicleText).join(' ');
/** Suggestions concern available models, not the allegiance of an individual captured ship. */
export function suggestVehicleAffiliations(entry){
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
  return normalizeVehicleAffiliations(factions);
}
export function vehicleAffiliationInfo(entry,overrides={}){
  const uuid=typeof entry==='string'?entry:entry?.uuid;
  if(uuid&&Object.hasOwn(overrides??{},uuid)){
    const saved=overrides[uuid],value=Array.isArray(saved)?saved:saved?.factions;
    return {affiliations:normalizeVehicleAffiliations(value),source:'override'};
  }
  if(Array.isArray(entry?.affiliations))return {affiliations:normalizeVehicleAffiliations(entry.affiliations),source:entry.affiliationSource??'entry'};
  const saved=entry?.flags?.starwarsffg?.fleetAffiliations;
  if(Array.isArray(saved))return {affiliations:normalizeVehicleAffiliations(saved),source:'document'};
  const affiliations=suggestVehicleAffiliations(entry);
  return {affiliations,source:affiliations.length?'suggestion':'unknown'};
}
export const getVehicleAffiliations=(entry,overrides={})=>vehicleAffiliationInfo(entry,overrides).affiliations;
export function isVehicleUuid(uuid){
  return typeof uuid==='string'&&/^(?:Actor\.[A-Za-z0-9_-]+|Compendium\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.Actor\.[A-Za-z0-9_-]+)$/.test(uuid);
}
