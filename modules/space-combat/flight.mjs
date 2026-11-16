// Tactical space uses +x east, +y north and degrees counterclockwise from east.
// These calibration values belong to the vector movement house rules.
export const DEFAULT_FLIGHT_OPTIONS = Object.freeze({
  speedDistances: Object.freeze([0, 1, 3, 3, 4, 5, 6]),
  extraSpeedDistance: 1,
  rangeLimits: Object.freeze([2, 5, 10, 20]),
  turnLimits: Object.freeze([45, 30, 15]), // Silhouettes 5, 6, 7+
  turnFactors: Object.freeze([1, 0.75, 0.5]), // Speeds 0-2, 3-4, 5+
});

const BANDS = ["Proche", "Courte", "Moyenne", "Longue", "Extrême"];
const RAD = Math.PI / 180;

function number(value, fallback = 0) {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function normalizedHeading(degrees) {
  return ((degrees % 360) + 360) % 360;
}
export function headingTowards(ship,point) {
  const dx=Number(point?.x)-number(ship.x),dy=Number(point?.y)-number(ship.y);
  if(!Number.isFinite(dx)||!Number.isFinite(dy)||Math.hypot(dx,dy)<1e-9)return null;
  return normalizedHeading(Math.atan2(dy,dx)/RAD);
}
export function steeringFor(ship,options={}) {
  const heading=number(ship.heading);
  const desired=Number.isFinite(ship.desiredHeading)?normalizedHeading(ship.desiredHeading):null;
  let requested=desired===null?number(ship.turn):((desired-heading+540)%360)-180;
  if(requested===-180&&desired!==null)requested=180;
  const heavy=number(ship.silhouette,1)>=5;
  const accelerating=heavy&&(ship.combat?.accelerated||ship.startSpeed!=null&&ship.speed!==ship.startSpeed);
  const limit=accelerating?0:Math.max(0,maximumTurn(ship,options)-(heavy?Math.max(0,number(ship.movementTurnSpent)):0));
  const turn=Math.max(-limit,Math.min(limit,requested));
  return {desiredHeading:desired??normalizedHeading(heading+requested),requested,turn,limited:Math.abs(requested-turn)>1e-8,accelerating};
}

export function speedDistance(speed, options = {}) {
  const rating = Math.max(0, Math.trunc(number(speed)));
  if (!rating) return 0;
  const distances = options.speedDistances ?? DEFAULT_FLIGHT_OPTIONS.speedDistances;
  const last = distances.length - 1;
  if (rating <= last) return distances[rating];
  const step = options.extraSpeedDistance ?? DEFAULT_FLIGHT_OPTIONS.extraSpeedDistance;
  return distances[last] + (rating - last) * step;
}

export function maximumTurn(ship, options = {}) {
  const silhouette = Math.trunc(number(ship.silhouette, 1));
  if (silhouette < 5) return 180;
  const limits = options.turnLimits ?? DEFAULT_FLIGHT_OPTIONS.turnLimits;
  const factors = options.turnFactors ?? DEFAULT_FLIGHT_OPTIONS.turnFactors;
  const speed = number(ship.speed);
  return limits[Math.min(silhouette - 5, 2)] * factors[speed < 3 ? 0 : speed < 5 ? 1 : 2];
}
export function movementRadius(ship,options={}) {
  return speedDistance(ship.speed,options);
}

// A visual diameter, independent of weapon range and collision geometry.
export function tokenDiameter(silhouette) {
  const size = Math.trunc(number(silhouette, 1));
  return size < 5 ? 1 : 2 + (size - 5) * 0.5;
}

export function rangeBetween(a, b, options = {}) {
  const distance = Math.hypot(number(a.x) - number(b.x), number(a.y) - number(b.y),
    number(a.z) - number(b.z));
  return {distance, band: bandFor(distance, options)};
}

function bandFor(distance, options) {
  const limits = options.rangeLimits ?? DEFAULT_FLIGHT_OPTIONS.rangeLimits;
  const index = limits.findIndex(limit => distance < limit);
  return BANDS[index < 0 ? BANDS.length - 1 : index];
}

function flight(ship, options) {
  if(ship.destination&&Number.isFinite(ship.destination.x)&&Number.isFinite(ship.destination.y)) {
    const dx=ship.destination.x-number(ship.x),dy=ship.destination.y-number(ship.y);
    const requested=Math.hypot(dx,dy),distance=Math.min(requested,movementRadius(ship,options));
    const ratio=requested?distance/requested:1;
    const desiredHeading=headingTowards(ship,ship.destination)??number(ship.heading);
    const steering=steeringFor({...ship,desiredHeading},options),heavy=number(ship.silhouette,1)>=5;
    return {x:number(ship.x),y:number(ship.y),z:number(ship.z),heading:desiredHeading,sweep:0,distance,
      linearEnd:ratio===1?ship.destination:{x:number(ship.x)+dx*ratio,y:number(ship.y)+dy*ratio},
      turn:distance?steering.turn:0,facingHeading:heavy?number(ship.heading):distance?desiredHeading:number(ship.heading),
      facingTurn:heavy&&distance?steering.turn:0};
  }
  const {turn} = steeringFor(ship,options);
  const heavy = number(ship.silhouette, 1) >= 5;
  return {
    x: number(ship.x),
    y: number(ship.y),
    z: number(ship.z),
    heading: normalizedHeading(number(ship.heading) + (heavy ? 0 : turn)),
    sweep: heavy ? turn : 0,
    turn,
    distance: speedDistance(ship.speed, options),
  };
}

function sample(flight, t) {
  // Exact circular arc, expressed using its chord. This also works for tiny turns.
  const swept = flight.sweep * t;
  const halfAngle = swept * RAD / 2;
  const chord = flight.distance * t * (halfAngle === 0 ? 1 : Math.sin(halfAngle) / halfAngle);
  const direction = flight.heading * RAD + halfAngle;
  return {
    x: flight.linearEnd?flight.x+(flight.linearEnd.x-flight.x)*t:flight.x+chord*Math.cos(direction),
    y: flight.linearEnd?flight.y+(flight.linearEnd.y-flight.y)*t:flight.y+chord*Math.sin(direction),
    z: flight.z,
    heading: normalizedHeading(flight.facingHeading!==undefined?flight.facingHeading+flight.facingTurn*t:flight.heading+swept),
  };
}

export function positionAt(ship, t, options = {}) {
  return sample(flight(ship, options), Math.max(0, Math.min(1, number(t))));
}

export function previewFlight(ship, options = {}) {
  const plan = flight(ship, options);
  // Extra samples describe the curve for drawing only. Final positions are analytic.
  const segments = Math.max(1, Math.ceil(Math.abs(plan.sweep) / 5));
  const path = Array.from({length: segments + 1}, (_, i) => sample(plan, i / segments));
  return {start: path[0], end: path[path.length - 1], path, turn: plan.turn, distance: plan.distance,...steeringFor(ship,options)};
}

export function advanceFleet(ships, options = {}) {
  return ships.map(ship => {
    const end=positionAt(ship,1,options);
    const moved={...ship,...end,turn:0,...(ship.destination?{destination:{x:end.x,y:end.y}}:{})};
    delete moved.movementSteps;return moved;
  });
}

// Project the origin onto the segment between two relative horizontal positions.
function chordMinimum(left, right) {
  const dx = right.x - left.x, dy = right.y - left.y;
  const norm = dx * dx + dy * dy;
  const u = norm ? Math.max(0, Math.min(1, -(left.x * dx + left.y * dy) / norm)) : 0;
  return {t: left.t + u * (right.t - left.t), distance: Math.hypot(left.x + u * dx, left.y + u * dy)};
}

/** Closest simultaneous approach during the round. Altitudes stay constant, so
 * the horizontal minimum occurs at the same time as the spatial minimum. */
export function closestPass(a, b, options = {}) {
  const p = flight(a, options), q = flight(b, options);
  const altitude = p.z - q.z;
  // Work near the origin even when the GM has placed the encounter far away.
  p.x -= q.x; p.y -= q.y;
  q.x = q.y = 0;
  const wp = p.sweep * RAD, wq = q.sweep * RAD;
  function relative(t) {
    const pa = sample(p, t), pb = sample(q, t);
    const x = pa.x - pb.x, y = pa.y - pb.y;
    const hp = (p.heading+p.sweep*t) * RAD, hq = (q.heading+q.sweep*t) * RAD;
    const vx = p.distance * Math.cos(hp) - q.distance * Math.cos(hq);
    const vy = p.distance * Math.sin(hp) - q.distance * Math.sin(hq);
    return {t, x, y, distance: Math.hypot(x, y), vx, vy, slope: x * vx + y * vy};
  }
  const first = relative(0), last = relative(1);
  let best = first.distance <= last.distance ? first : last;
  function consider(point) {
    if (point.distance < best.distance || (point.distance === best.distance && point.t < best.t)) best = point;
  }

  // Equal angular rates (or one stationary ship) give a straight line or a
  // single circular arc in relative space. On the arc r·v is a sinusoid.
  const commonRate = !p.distance ? wq : !q.distance || wp === wq ? wp : null;
  if (commonRate === 0) {
    consider(relative(chordMinimum(first, last).t));
  } else if (commonRate !== null) {
    const {x, y, vx, vy, slope} = first;
    const sine = vx * vx + vy * vy + commonRate * (y * vx - x * vy);
    const phase = Math.atan2(-commonRate * slope, sine);
    const from = Math.ceil((Math.min(0, commonRate) - phase) / Math.PI);
    const to = Math.floor((Math.max(0, commonRate) - phase) / Math.PI);
    for (let k = from; k <= to; k++) consider(relative((phase + k * Math.PI) / commonRate));
  } else {
    // For a twice differentiable relative path, its maximum departure from
    // the chord is bounded by max|r''| * dt² / 8. Discard an interval only
    // when it cannot improve the measured distance by 1e-8 tactical units.
    const acceleration = p.distance * Math.abs(wp) + q.distance * Math.abs(wq);
    const tolerance = 1e-8;
    let bracket = [first, last];
    function search(left, right) {
      const width = right.t - left.t;
      const chord = chordMinimum(left, right);
      const lower = chord.distance - acceleration * width * width / 8;
      if (lower >= best.distance - tolerance) return;
      const previous = best;
      consider(relative(chord.t));
      const mid = relative((left.t + right.t) / 2);
      consider(mid);
      if (previous !== best) bracket = [left, right];
      search(left, mid);
      search(mid, right);
    }
    search(first, last);
    // Refine the reported time on flat or grazing minima. A negative-to-
    // positive zero of r·v is a local minimum of squared distance.
    let [left, right] = bracket;
    if (left.slope < 0 && right.slope > 0) {
      for (let i = 0; i < 48; i++) {
        const mid = relative((left.t + right.t) / 2);
        if (mid.slope < 0) left = mid;
        else right = mid;
      }
      consider(relative((left.t + right.t) / 2));
    }
  }
  const measured = Math.hypot(best.distance, altitude);
  // Trigonometric roundoff at a tangent must not turn an exact band boundary
  // into a brief incursion into the nearer band.
  const roundoff = 16 * Number.EPSILON * Math.max(1, measured, p.distance, q.distance);
  const limits = options.rangeLimits ?? DEFAULT_FLIGHT_OPTIONS.rangeLimits;
  const distance = limits.find(limit => Math.abs(measured - limit) <= roundoff) ?? measured;
  return {distance, band: bandFor(distance, options), t: best.t};
}
