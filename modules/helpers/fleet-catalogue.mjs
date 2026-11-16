import {fleetAffiliationInfo,normalizeFleetAffiliations,isFleetVehicleUuid} from './fleet-model.mjs';
export const AFFILIATION_OVERRIDES_SETTING='fleetAffiliationOverrides';
const scope='starwarsffg',moduleId='swffg-compendium-bilingual-steelers-starship_and_speeders';
let cataloguePromise,writeQueue=Promise.resolve();
const fields=['img','type','system.spaceShip','system.stats.silhouette.value','flags.starwarsffg.fleetAffiliations'];
function overrides(){
  try{const saved=game.settings.get(scope,AFFILIATION_OVERRIDES_SETTING);return saved&&typeof saved==='object'&&!Array.isArray(saved)?saved:{};}catch{return {};}
}
function worldEntry(actor){
  return {uuid:actor.uuid,key:actor.flags?.starwarsffg?.fleetModelKey??'',name:actor.name,names:{[game.i18n.lang]:actor.name},img:actor.img,type:'vehicle',origin:'world',packLabel:null,spaceShip:typeof actor.system?.spaceShip==='boolean'?actor.system.spaceShip:null,silhouette:Number(actor.system?.stats?.silhouette?.value)||null,flags:actor.flags};
}
async function loadCompendiums(){
  const rows=new Map();
  if(game.modules?.get(moduleId)?.active){
    try{
      const response=await fetch('modules/'+moduleId+'/catalogue-index.json');
      if(response.ok){const entries=await response.json();if(Array.isArray(entries))for(const row of entries){
        if(row.type!=='vehicle'||!isFleetVehicleUuid(row.uuid))continue;
        rows.set(row.uuid,{uuid:row.uuid,key:row.key??'',name:row.names?.[game.i18n.lang]??row.name,names:row.names??{},img:row.img,type:'vehicle',origin:'compendium',packLabel:'Vaisseaux et speeders',spaceShip:null,silhouette:null});
      }}
    }catch(error){console.warn('Star Wars FFG | Fleet catalogue index',error);}
  }
  for(const pack of game.packs??[]){
    if(pack.metadata?.type!=='Actor'||pack.visible===false)continue;
    try{
      const index=await pack.getIndex({fields});
      for(const entry of index){
        if(entry.type!=='vehicle')continue;
        // V14 indices normally include the document class; old indices can omit it.
        const uuid=isFleetVehicleUuid(entry.uuid)?entry.uuid:'Compendium.'+pack.collection+'.Actor.'+(entry._id??entry.id);
        if(!isFleetVehicleUuid(uuid))continue;
        const old=rows.get(uuid)??{};
        rows.set(uuid,{...old,uuid,key:old.key??'',name:old.name??entry.name,names:old.names??{},img:entry.img??old.img,type:'vehicle',origin:'compendium',packLabel:pack.metadata.label,spaceShip:typeof entry.system?.spaceShip==='boolean'?entry.system.spaceShip:null,silhouette:Number(entry.system?.stats?.silhouette?.value)||null,flags:entry.flags});
      }
    }catch(error){console.warn('Star Wars FFG | Fleet pack index '+pack.collection,error);}
  }
  return [...rows.values()];
}
/** Cached compendium indices, with fresh world actors and saved affiliations on every call. */
export async function getFleetCatalogue({refresh=false,includeWorld=true,includeCompendiums=true,includeFleetCopies=false}={}){
  if(refresh)cataloguePromise=null;
  const rows=includeCompendiums?await(cataloguePromise??=loadCompendiums()):[];
  const result=new Map(rows.map(row=>[row.uuid,row]));
  if(includeWorld)for(const actor of game.actors??[])if(actor.type==='vehicle'&&!actor.pack&&!actor.isToken&&(includeFleetCopies||!actor.flags?.starwarsffg?.fleet?.version))result.set(actor.uuid,worldEntry(actor));
  const saved=overrides();
  return [...result.values()].filter(row=>row.spaceShip!==false).map(row=>{
    const info=fleetAffiliationInfo(row,saved);return {...row,affiliations:info.affiliations,affiliationSource:info.source};
  }).sort((a,b)=>a.name.localeCompare(b.name,game.i18n.lang,{numeric:true,sensitivity:'base'}));
}
/** World overrides keep locked compendiums untouched; UUID keys are stable across imports. */
export async function setFleetAffiliations(entryOrUuid,factions){
  if(!game.user.isGM)throw Error('Seul le MJ peut modifier les affiliations des modèles.');
  const uuid=typeof entryOrUuid==='string'?entryOrUuid:entryOrUuid?.uuid;
  if(!isFleetVehicleUuid(uuid))throw Error('Référence de modèle invalide.');
  if(!Array.isArray(factions)||factions.some(value=>!['empire','alliance','pirates','hutt','other'].includes(value)))throw Error('Choisissez des factions valides.');
  const cleaned=normalizeFleetAffiliations(factions);
  const task=writeQueue.catch(()=>{}).then(async()=>{
    const saved=structuredClone(overrides());saved[uuid]=cleaned;
    await game.settings.set(scope,AFFILIATION_OVERRIDES_SETTING,saved);return cleaned;
  });writeQueue=task;return task;
}
export async function getFleetVehicleDocument(entryOrUuid){
  const uuid=typeof entryOrUuid==='string'?entryOrUuid:entryOrUuid?.uuid;
  if(!isFleetVehicleUuid(uuid))throw Error('Référence de vaisseau invalide.');
  const actor=await fromUuid(uuid);
  if(actor?.documentName!=='Actor'||actor.type!=='vehicle')throw Error('Le modèle sélectionné n’est plus un véhicule disponible.');
  if(actor.system?.spaceShip===false)throw Error('Le modèle sélectionné est un véhicule terrestre, pas un vaisseau spatial.');
  return actor;
}
