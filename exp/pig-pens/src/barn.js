// The barn's sim half (v3 §7, R2): who sleeps in which stall, and the way in and out. Pure: no three.js, no DOM, no Rapier.
// sim.js drives the pigs with it (ST.BED walks a path, ST.REST with p.bed holds a pig in its stall or at the shut doors).
import { BARN } from './defs/buildings.js';
import { mulberry32 } from './layout.js';

// Bedtime tuning (one table, like P): seconds unless noted
export const BED = {
  wakeStagger: 9,        // morning: each pig gets up some time in the first wakeStagger s
  napChance: 0.06,       // per daytime wander decision of a calm adult with the doors open
  napMax: 3,             // pigs napping in the barn at once
  nap: [30, 60],         // how long a nap lasts
  walk: 1.0,             // m/s along the path inside the barn
  arrive: 0.35,          // m: the stall is reached (half this); a point on the way: pass (twice this)
  stuck: 40,             // s on the path inside before the pig is set down in its stall (a jam in the aisle)
  retry: 6,              // s before a pig that could not reach the barn tries again
  door: 1.4,             // m from the doors' outside point that counts as at the doors
};

// Stalls for the adults, in a seeded shuffle of their own (so assigning them never moves the farm's random sequence).
// Returns stall ids by adult order (adults beyond the 16 stalls get -1).
export function assignStalls(nAdults, seed) {
  const rng = mulberry32((seed ^ 0xba2a) >>> 0), ids = BARN.stalls.map(s => s.id);
  for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  return Array.from({ length: nAdults }, (_, k) => (k < ids.length ? ids[k] : -1));
}

// world [x, z] of a barn-local point
const W = ([lx, lz]) => [BARN.x + lx, BARN.z + lz];
export const doorOut = W(BARN.doorOut);
export const stallAt = id => { const s = BARN.stalls[id]; return W([s.at[0], s.at[2]]); };
export const stallFace = id => BARN.stalls[id].face;
// Into stall `id` from the doors (or, already inside, from the aisle beside it): doors → the aisle's middle (each side of
// the barn its own spot there, so the herd doesn't queue on one point) → along the aisle → the stall's mouth → the stall.
const hub = s => W([Math.sign(s.at[0]) * 0.7, 0]);
export function pathIn(id, inside) {
  const s = BARN.stalls[id], lane = [W([s.at[0], 0]), W(s.mouth), stallAt(id)];
  return inside ? lane : [W([BARN.doorIn[0], BARN.doorIn[2]]), hub(s), ...lane];
}
// Out of stall `id` to just outside the doors.
export function pathOut(id) {
  const s = BARN.stalls[id];
  return [W(s.mouth), W([s.at[0], 0]), hub(s), W([BARN.doorIn[0], BARN.doorIn[2]]), doorOut];
}
