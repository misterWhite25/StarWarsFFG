import {localizeSystem, localizedSystemError} from "../helpers/system-localization.mjs";
export const BARRAGES=[
  {id:'blanketBarrage',get label(){return localizeSystem("SWFFG.UI.SpaceCombat.BlanketBarrage");},english:'Blanket Barrage',barrage:true,minSize:5,maxSpeed:3,skill:'Gunnery',difficulty:2,get description(){return localizeSystem("SWFFG.UI.SpaceCombat.BlanketBarrageDescription");}},
  {id:'concentratedBarrage',get label(){return localizeSystem("SWFFG.UI.SpaceCombat.ConcentratedBarrage");},english:'Concentrated Barrage',barrage:true,minSize:5,maxSpeed:3,skill:'Gunnery',target:true,get description(){return localizeSystem("SWFFG.UI.SpaceCombat.ConcentratedBarrageDescription");}},
  {id:'overwhelmingBarrage',get label(){return localizeSystem("SWFFG.UI.SpaceCombat.OverwhelmingBarrage");},english:'Overwhelming Barrage',barrage:true,minSize:5,maxSpeed:3,skill:'Gunnery',target:true,get description(){return localizeSystem("SWFFG.UI.SpaceCombat.OverwhelmingBarrageDescription");}}
];
export const isBarrage=id=>BARRAGES.some(action=>action.id===id);
export const CREW_ACTION_ORDER=['damageControl','manualRepair','boostShields','fireDiscipline','jam','scan','slice','spoof','plot','blanketBarrage','concentratedBarrage','overwhelmingBarrage'];
export const REPAIR_ACTIONS=['repairStrain','repairHull','repairCritical'];
export const DAMAGE_CONTROL={id:'damageControl',get label(){return localizeSystem("SWFFG.UI.SpaceCombat.DamageControl");},get description(){return localizeSystem("SWFFG.UI.SpaceCombat.DamageControlDescription");}};
export function barrageConfiguration(ship,vehicle,definition,request){
  if(!definition?.barrage||Number(ship.silhouette)<5||ship.speed<0||ship.speed>3)throw localizedSystemError("SWFFG.UI.SpaceCombat.BarrageRequirements");
  const weapon=vehicle.items.get(request.weaponId);
  if(weapon?.type!=='shipweapon')throw localizedSystemError("SWFFG.UI.SpaceCombat.ChooseShipWeapon");
  const arc=request.barrageArc;
  if(!['fore','aft','port','starboard','dorsal','ventral'].includes(arc)||!weapon.system.firingarc?.[arc])throw localizedSystemError("SWFFG.UI.SpaceCombat.ArcUncovered");
  const arcs=definition.id==='blanketBarrage'?[...new Set(request.barrageArcs??[arc])]:[arc];
  if(!arcs.length||arcs.some(key=>!['fore','aft','port','starboard','dorsal','ventral'].includes(key)||!weapon.system.firingarc?.[key]))throw localizedSystemError("SWFFG.UI.SpaceCombat.BatteryArcs");
  const count=Number(request.barrageCount),minimum=definition.id==='blanketBarrage'?1:2;
  if(!Number.isInteger(count)||count<minimum||count>10000)throw localizedSystemError("SWFFG.UI.SpaceCombat.MinBatteryWeapons", {minimum});
  const raw=Number(weapon.system.damage?.adjusted)||Number(weapon.system.damage?.value);
  if(!Number.isFinite(raw)||raw<0)throw localizedSystemError("SWFFG.UI.SpaceCombat.WeaponDamageRequired");
  return {id:definition.id,label:definition.label,weaponId:weapon.id,weaponName:weapon.name,arc,arcs,count,damage:raw,description:definition.description};
}
