// The analytic picks (lion-hawk 2e P1, #54, #60): what a camera ray points at, moved verbatim out of farm3d.js and
// main.js so the sim can pick from the rays a `tool` command carries. Pure: no three.js. A ray `r` is
// [ox, oy, oz, dx, dy, dz] with a unit direction. Same tolerances and priorities as the old view code.
import { FST } from '../chickens.js';

// Where the ray crosses the plane at height y; null when (nearly) parallel or behind the origin.
export function planeHit(r, y) {
  const dy = r[4]; if (Math.abs(dy) < 1e-4) return null;
  const t = (y - r[1]) / dy; if (t < 0) return null;
  return { x: r[0] + r[3] * t, y, z: r[2] + r[5] * t };
}

// three's Ray.distanceToPoint, same operations: past the origin the distance to the closest point on the ray,
// behind it the distance to the origin.
export function rayDist(r, x, y, z) {
  const ox = r[0], oy = r[1], oz = r[2], dx = r[3], dy = r[4], dz = r[5];
  const t = (x - ox) * dx + (y - oy) * dy + (z - oz) * dz;
  if (t < 0) { const ax = ox - x, ay = oy - y, az = oz - z; return Math.sqrt(ax * ax + ay * ay + az * az); }
  const ax = ox + dx * t - x, ay = oy + dy * t - y, az = oz + dz * t - z;
  return Math.sqrt(ax * ax + ay * ay + az * az);
}
// three's Vector3.distanceTo (main.js's grab pick used it, the Hand's classify Math.hypot).
const dist3 = (r, x, y, z) => { const ax = r[0] - x, ay = r[1] - y, az = r[2] - z; return Math.sqrt(ax * ax + ay * ay + az * az); };

// Where a ray enters and leaves a world box { x0, x1, y0, y1, z0, z1 } (slab method): { t0, t1 }, or null on a miss or
// when the box is behind the origin.
export function rayBox(r, b) {
  let t0 = 0, t1 = Infinity;
  for (let k = 0; k < 3; k++) {
    const o = r[k], d = r[k + 3], lo = k === 0 ? b.x0 : k === 1 ? b.y0 : b.z0, hi = k === 0 ? b.x1 : k === 1 ? b.y1 : b.z1;
    if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return null; continue; }
    let a = (lo - o) / d, c = (hi - o) / d; if (a > c) [a, c] = [c, a];
    if (a > t0) t0 = a; if (c < t1) t1 = c; if (t0 > t1) return null;
  }
  return { t0, t1 };
}
// The gate whose tap volumes (layout.js g.pick: the shut gateway and the open leaves) the ray meets first: { gate, t0, t1 }.
export function rayGate(lay, r) {
  let best = null;
  for (const g of lay.gates) for (const b of g.pick) { const h = rayBox(r, b); if (h && (!best || h.t0 < best.t0)) best = { gate: g, ...h }; }
  return best;
}
// The ray through the coop's front (layout.js coop.pick): { t0, t1 } or null.
export const rayCoop = (lay, r) => rayBox(r, lay.coop.pick);

// The nearest gate within 1.5 m of a ground point (farm3d.js).
export function pickGate(lay, x, z) {
  let best = null, bd = 1.5;
  for (const g of lay.gates) {
    const along = g.dir === 'x', hw = g.width / 2;
    const ax = along ? Math.max(0, Math.abs(x - g.x) - hw) : Math.abs(x - g.x), az = along ? Math.abs(z - g.z) : Math.max(0, Math.abs(z - g.z) - hw);
    const d = Math.hypot(ax, az); if (d < bd) { bd = d; best = g; }
  }
  return best;
}
// Within 1.3 m of the ground in front of the coop door (farm3d.js).
export const pickDoor = (lay, x, z) => Math.hypot(x - lay.coop.doorX, z - (lay.coop.z + lay.coop.hz + 0.5)) < 1.3;
// The egg nearest the ray within 0.45 m, eggs taken at y 0.12 (farm3d.js).
export function pickEgg(flock, r) {
  let best = null, bd = 0.45;
  for (const e of flock.eggs) { const d = rayDist(r, e.x, 0.12, e.z); if (d < bd) { bd = d; best = e; } }
  return best;
}
export const foxHit = (flock, r) => flock.fox.state !== FST.AWAY && rayDist(r, flock.fox.x, 0.4, flock.fox.z) < 0.9;
export const dogHit = (dog, r) => rayDist(r, dog.x, 0.4, dog.z) < 0.8;

// What the Hand acts on (main.js classify): an egg first; then the nearest of the animals, the gates and the coop front
// (stable sort: ties go to the earlier candidate). A gate or the coop counts at the far side of its tap volume, so an
// animal inside it or in front of it wins; one behind it does not. Last, a gate or the coop door near the ground hit.
export function classify(sim, r) {
  const flock = sim.flock, h = planeHit(r, 0), [ox, oy, oz, dx, dy, dz] = r;
  const egg = pickEgg(flock, r); if (egg) return { kind: 'egg', id: egg.id };
  const pi = sim.pick(ox, oy, oz, dx, dy, dz), bi = flock.pick(ox, oy, oz, dx, dy, dz);
  const dist = (x, y, z) => Math.hypot(x - ox, y - oy, z - oz);
  const cands = [];
  if (pi >= 0) { const p = sim.pigs[pi]; cands.push({ kind: 'pig', i: pi, d: dist(p.px, p.py, p.pz) }); }
  if (bi >= 0) { const b = flock.birds[bi]; cands.push({ kind: 'bird', i: bi, d: dist(b.px, b.py, b.pz) - 0.4 }); }
  const f = flock.fox; if (foxHit(flock, r)) cands.push({ kind: 'fox', d: dist(f.x, 0.35, f.z) - 0.6 });
  if (dogHit(sim.dog, r)) cands.push({ kind: 'dog', d: dist(sim.dog.x, 0.4, sim.dog.z) });
  const gh = rayGate(sim.lay, r); if (gh) cands.push({ kind: 'gate', id: gh.gate.id, d: gh.t1 });
  const ch = rayCoop(sim.lay, r); if (ch) cands.push({ kind: 'door', d: ch.t1 });
  if (cands.length) { const c = cands.sort((a, b) => a.d - b.d)[0]; return c.i !== undefined ? { kind: c.kind, i: c.i } : c.id !== undefined ? { kind: c.kind, id: c.id } : { kind: c.kind }; }
  if (h) { const g = pickGate(sim.lay, h.x, h.z); if (g) return { kind: 'gate', id: g.id }; if (pickDoor(sim.lay, h.x, h.z)) return { kind: 'door' }; }
  return null;
}

// What the Grab tool lifts (main.js toolDown): the nearer of the picked pig and bird (pig on a tie; the bird 0.4 m
// closer than it is); the fox only when neither was picked, the ray hits it and it carries a chicken.
export function grabTarget(sim, r) {
  const flock = sim.flock, [ox, oy, oz, dx, dy, dz] = r;
  const pi = sim.pick(ox, oy, oz, dx, dy, dz), bi = flock.pick(ox, oy, oz, dx, dy, dz);
  const dp = pi >= 0 ? dist3(r, sim.pigs[pi].px, sim.pigs[pi].py, sim.pigs[pi].pz) : Infinity;
  const db = bi >= 0 ? dist3(r, flock.birds[bi].px, flock.birds[bi].py, flock.birds[bi].pz) - 0.4 : Infinity;
  if (pi < 0 && bi < 0) return foxHit(flock, r) && flock.fox.carrying ? { kind: 'fox' } : null;
  return dp <= db ? { kind: 'pig', i: pi } : { kind: 'bird', i: bi };
}
