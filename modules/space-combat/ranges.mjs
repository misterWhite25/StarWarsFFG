import {DEFAULT_FLIGHT_OPTIONS,rangeBetween,spaceRangeLabel} from "./flight.mjs";

export const SPACE_RANGE_BANDS=Object.freeze([
  {key:"close",get label(){return spaceRangeLabel(0);},color:"#76b9b1"},
  {key:"short",get label(){return spaceRangeLabel(1);},color:"#91afc7"},
  {key:"medium",get label(){return spaceRangeLabel(2);},color:"#c4b58b"},
  {key:"long",get label(){return spaceRangeLabel(3);},color:"#b89cae"},
  {key:"extreme",get label(){return spaceRangeLabel(4);},color:"#c4a18b"}
]);
export function weaponRangeIndex(weapon) {
  const key = String(weapon?.system?.range?.value ?? "").toLowerCase();
  return SPACE_RANGE_BANDS.findIndex(band => band.key === key);
}
export function shipRanges(ship,ships,vehicle=globalThis.game?.actors?.get(ship.actorId)) {
  const weaponsByBand = SPACE_RANGE_BANDS.map(() => []);
  let maximum = -1;
  for (const item of vehicle?.items ?? []) {
    if (item.type !== "shipweapon") continue;
    const index = weaponRangeIndex(item);
    for (let band = 0; band <= index; band++) weaponsByBand[band].push(item.name);
    maximum = Math.max(maximum, index);
  }
  const limits=DEFAULT_FLIGHT_OPTIONS.rangeLimits;
  const bands=SPACE_RANGE_BANDS.map((band,index)=>({...band,index,limit:limits[index]??null,weaponLimit:maximum===index}));
  const targets=ships.filter(target=>target.id!==ship.id).map(target=>{
    const {distance,index}=rangeBetween(ship,target);
    const band=bands[index].label;
    const reachable = weaponsByBand[index];
    return {shipId:target.id,distance,band,index,bandKey:bands[index].key,color:bands[index].color,inRange:reachable.length>0,weapons:[...reachable]};
  });
  return {bands,maximum,targets,weaponRange:maximum<0?null:bands[maximum].label,
    usesAltitude:ships.some(target=>(target.z??0)!==(ship.z??0))};
}
