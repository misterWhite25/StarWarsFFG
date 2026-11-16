import {DEFAULT_FLIGHT_OPTIONS,rangeBetween} from "./flight.mjs";

export const SPACE_RANGE_BANDS=Object.freeze([
  {key:"close",label:"Proche",color:"#76b9b1"},
  {key:"short",label:"Courte",color:"#91afc7"},
  {key:"medium",label:"Moyenne",color:"#c4b58b"},
  {key:"long",label:"Longue",color:"#b89cae"},
  {key:"extreme",label:"Extrême",color:"#c4a18b"}
]);
export function weaponRangeIndex(weapon) {
  return SPACE_RANGE_BANDS.findIndex(band=>band.key===String(weapon?.system?.range?.value??"").toLowerCase());
}
export function shipRanges(ship,ships,vehicle=globalThis.game?.actors?.get(ship.actorId)) {
  const weapons=Array.from(vehicle?.items??[]).filter(item=>item.type==="shipweapon"&&weaponRangeIndex(item)>=0);
  const maximum=Math.max(-1,...weapons.map(weaponRangeIndex));
  const limits=DEFAULT_FLIGHT_OPTIONS.rangeLimits;
  const bands=SPACE_RANGE_BANDS.map((band,index)=>({...band,index,limit:limits[index]??null,weaponLimit:maximum===index}));
  const targets=ships.filter(target=>target.id!==ship.id).map(target=>{
    const {distance,band}=rangeBetween(ship,target);
    const index=SPACE_RANGE_BANDS.findIndex(entry=>entry.label===band);
    const reachable=weapons.filter(weapon=>weaponRangeIndex(weapon)>=index);
    return {shipId:target.id,distance,band,index,color:bands[index].color,inRange:reachable.length>0,weapons:reachable.map(weapon=>weapon.name)};
  });
  return {bands,maximum,targets,weaponRange:maximum<0?null:bands[maximum].label,
    usesAltitude:ships.some(target=>(target.z??0)!==(ship.z??0))};
}
