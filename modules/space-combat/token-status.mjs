import {localizeSystem} from "../helpers/system-localization.mjs";
import {vehicleMinionGroup} from '../helpers/vehicle-minion-group.mjs';
function value(number) {
  if(number==null||number===""||!Number.isFinite(Number(number)))return null;
  return Math.max(0,Number(number));
}
export function tokenStatus(ship,vehicle=globalThis.game?.actors?.get(ship.actorId)) {
  const headingValue=Number(ship.heading);
  const heading=Number.isFinite(headingValue)?(headingValue%360+360)%360:0;
  const compass=((90-heading)%360+360)%360;
  const directions = ["SWFFG.UI.SpaceCombat.East", "SWFFG.UI.SpaceCombat.NorthEast",
    "SWFFG.UI.SpaceCombat.North", "SWFFG.UI.SpaceCombat.NorthWest", "SWFFG.UI.SpaceCombat.West",
    "SWFFG.UI.SpaceCombat.SouthWest", "SWFFG.UI.SpaceCombat.South", "SWFFG.UI.SpaceCombat.SouthEast"];
  const direction = localizeSystem(directions[Math.round(heading / 45) % directions.length]);
  const hull=vehicle?.system?.stats?.hullTrauma;
  const group=vehicleMinionGroup(vehicle),damage=value(hull?.value),maximum=value(group.enabled?group.totalHull:hull?.max),threshold=maximum>0?maximum:null;
  const ratio=damage!==null&&threshold>0?Math.min(1,damage/threshold):null;
  const exceeded=damage!==null&&threshold>0&&damage>threshold;
  const criticals=Array.from(vehicle?.items??[]).filter(item=>item.type==="criticaldamage").length;
  return {heading,compass,direction,speed:value(ship.currentSpeed??ship.speed),damage,threshold,
    ratio,exceeded,criticals,tone:ratio===null?"unknown":ratio>=.75?"danger":ratio>=.5?"warning":"normal"};
}
