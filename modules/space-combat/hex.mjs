import {tokenDiameter} from "./flight.mjs";

const rowHeight = Math.sqrt(3) / 2;

export function hexCenter(q, r) {
  return {q, r, x:q + r / 2, y:r * rowHeight};
}

// Cube rounding selects the nearest centre in the pointy-top unit hex grid.
export function nearestHex(point) {
  const r = point.y / rowHeight;
  const q = point.x - r / 2;
  const s = -q-r;
  let cq = Math.round(q), cr = Math.round(r), cs = Math.round(s);
  const dq = Math.abs(cq-q), dr = Math.abs(cr-r), ds = Math.abs(cs-s);
  if (dq >= dr && dq >= ds) cq = -cr-cs;
  else if (dr >= ds) cr = -cq-cs;
  return hexCenter(cq,cr);
}

export function footprintRadius(silhouette) {
  return Math.ceil((tokenDiameter(silhouette)-1)/2);
}

export function footprintCells(ship) {
  const center = nearestHex(ship);
  const radius = footprintRadius(ship.silhouette);
  const cells = [];
  for (let q = -radius; q <= radius; q++) {
    const low = Math.max(-radius,-q-radius);
    const high = Math.min(radius,-q+radius);
    for (let r = low; r <= high; r++) cells.push(hexCenter(center.q+q,center.r+r));
  }
  return cells;
}

export function footprintSize(silhouette) {
  const radius = footprintRadius(silhouette);
  return 1+3*radius*(radius+1);
}
