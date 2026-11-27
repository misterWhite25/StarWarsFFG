import {localizedSystemError} from "../helpers/system-localization.mjs";
import {movementRadius,previewFlight,headingTowards} from "./flight.mjs";
import {nearestHex} from "./hex.mjs";

// Validate the snapped centre, not the pointer, so rounding never grants extra range.
export function movementDestination(ship,point) {
  if(!Number.isFinite(point?.x)||!Number.isFinite(point?.y))throw localizedSystemError("SWFFG.UI.SpaceCombat.PickDestination");
  const destination=nearestHex(point),maximum=movementRadius(ship);
  const origin=nearestHex(ship);
  if(destination.q===origin.q&&destination.r===origin.r)return {x:ship.x,y:ship.y};
  const distance=Math.hypot(destination.x-ship.x,destination.y-ship.y);
  if(distance>maximum+1e-8)throw localizedSystemError("SWFFG.UI.SpaceCombat.DestinationTooFar");
  return {x:destination.x,y:destination.y};
}

export function resolveMovement(ship,point) {
  const destination=movementDestination(ship,point);
  const desiredHeading=headingTowards(ship,destination)??ship.heading;
  const {end,distance}=previewFlight({...ship,destination,desiredHeading});
  const turned=Math.abs(((end.heading-ship.heading+540)%360)-180);
  return {...end,destination:{x:end.x,y:end.y},desiredHeading:end.heading,turn:0,
    movementSpent:(ship.movementSpent??0)+distance,
    movementTurnSpent:(ship.movementTurnSpent??0)+(ship.silhouette>=5?turned:0)};
}
