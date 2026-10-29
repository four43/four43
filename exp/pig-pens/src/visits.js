// Dr. Emmy's rounds (2.9.0): while she stands at one of her stops outside (clinic.js OUTSIDE_STOPS), calm pigs and hens
// near her come over to say hello. Each walks to its own place at the fence of its pen or the run, nearest her (or to a
// ring round her in the open), and waits; she gives them a scratch one at a time, and off they go happy. Sim only: its
// own rng (the herd's sequence never shifts), never touches three.js or the DOM.
// createVisits({ vet, pigs, birds, lay, emit, now, seed, can, start, end }) → { step(dt), visitors }
//   can(kind, a): free to come over; start(kind, a, visit): into its VISIT state, a.visit = visit (the animal sets
//   visit.arrived and visit.since once it is at its place); end(kind, a, petted): back to its day.
import { mulberry32 } from './layout.js';
import { VET_STOPS } from './clinic.js';

export const VET_R = 0.4; // m: the vet's footprint, for the animals walking round her
export const VISIT = {
  every: 0.5,         // s between looks for new visitors
  chance: 0.12,       // a calm animal near her comes over, per look
  reach: 11,          // m: how far an animal notices her
  near: 2.6,          // m: its place must be this close to her (the pen it is in runs up to her fence)
  max: 4,             // visitors at once
  patience: 30,       // s an animal waits for its scratch
  again: 80,          // s before it comes over again
  pet: 2.2,           // s of scratching
  spacing: 0.95,      // m between places along a fence
  ring: 1.0,          // m from her, in the open
  inset: { pig: 0.75, bird: 0.4 }, // m in from its fence
};

// The point of rect r (x0..x1, z0..z1) inset by `in` nearest (x, z), slid `along` the fence it is nearest to.
function atFence(r, x, z, inset, along) {
  const x0 = r.x0 + inset, x1 = r.x1 - inset, z0 = r.z0 + inset, z1 = r.z1 - inset;
  let px = Math.min(x1, Math.max(x0, x)), pz = Math.min(z1, Math.max(z0, z));
  const onZ = Math.min(Math.abs(pz - z0), Math.abs(pz - z1)) <= Math.min(Math.abs(px - x0), Math.abs(px - x1)); // a north or south fence
  if (onZ) px = Math.min(x1, Math.max(x0, px + along)); else pz = Math.min(z1, Math.max(z0, pz + along));
  return [px, pz];
}

export function createVisits({ vet, pigs, birds, lay, emit, now, seed = 1, can, start, end }) {
  const rng = mulberry32((seed ^ 0x5ca7) >>> 0), visitors = []; // { kind, a, slot }
  let look = 0;
  const SLOTS = [0, 1, -1, 2, -2, 3];
  const here = () => vet.outside && vet.state === 'idle';
  // where an animal can stand to see her: its pen's (or the run's) fence, or a ring round her when it is out in the open
  // a place is no good on a trough, a hay bale or a barrel (the fences are what it stands at)
  const things = lay.obstacles.filter(o => !o.fence && !o.building);
  const clear = (x, z, r) => things.every(o => o.type === 'circle' ? Math.hypot(x - o.x, z - o.z) > o.r + r
    : Math.abs(x - o.x) > o.hx + r || Math.abs(z - o.z) > o.hz + r);
  const inArea = (kind, a) => { if (kind === 'bird') return lay.run; const r = lay.region(a.px, a.pz); return r < lay.pens.length ? lay.pens[r] : null; };
  function placeFor(kind, a, slot) {
    const along = SLOTS[slot] * VISIT.spacing, area = inArea(kind, a);
    if (area) { // along its fence from its slot, the first spot clear of things, out to either side
      const r = VISIT.inset[kind];
      for (let k = 0; k < 8; k++) for (const s of k ? [1, -1] : [1]) {
        const [x, z] = atFence(area, vet.x, vet.z, r, along + s * k * VISIT.spacing * 0.5);
        if (clear(x, z, r)) return [x, z];
      }
      return atFence(area, vet.x, vet.z, r, along);
    }
    const dx = a.px - vet.x, dz = a.pz - vet.z, ang = Math.atan2(dx, dz) + along / VISIT.ring;
    return [vet.x + Math.sin(ang) * VISIT.ring, vet.z + Math.cos(ang) * VISIT.ring];
  }
  function finish(v, petted) {
    const k = visitors.indexOf(v); if (k >= 0) visitors.splice(k, 1);
    if (vet.pet && vet.pet.a === v.a) vet.pet = null;
    v.a.visit = null; v.a.petT = now();
    end(v.kind, v.a, petted);
  }
  function step(dt) {
    // visitors who were picked up, frightened off, called away … are done; so is everyone when she moves on
    for (const v of [...visitors]) if (!here() || v.a.visit !== v.visit || now() > v.visit.until) finish(v, false);
    if (!here()) { vet.pet = null; return; }
    // a scratch for whoever has been waiting at their place longest
    if (vet.pet) {
      const v = visitors.find(o => o.a === vet.pet.a);
      if (!v) vet.pet = null;
      else {
        vet.pet.t += dt; vet.yaw = Math.atan2(v.a.px - vet.x, v.a.pz - vet.z);
        if (vet.pet.t >= VISIT.pet) {
          emit('pet', { kind: v.kind, i: v.a.i, name: v.a.name });
          vet.doing = VET_STOPS[vet.goal]; finish(v, true);
        }
      }
    }
    if (!vet.pet) {
      const v = visitors.filter(o => o.visit.arrived).sort((p, q) => p.visit.since - q.visit.since)[0];
      if (v) { vet.pet = { kind: v.kind, i: v.a.i, a: v.a, t: 0 }; vet.doing = `Giving ${v.a.name} a scratch`; }
    }
    // new visitors, a few at a time
    if ((look -= dt) > 0 || visitors.length >= VISIT.max) return;
    look = VISIT.every;
    const t = now(), free = () => SLOTS.findIndex((_, s) => !visitors.some(o => o.slot === s));
    const consider = (kind, a) => {
      if (visitors.length >= VISIT.max || a.visit || (a.petT ?? -1e9) > t - VISIT.again) return;
      if (Math.hypot(a.px - vet.x, a.pz - vet.z) > VISIT.reach || rng() > VISIT.chance) return;
      const slot = free(); if (slot < 0) return;
      const [x, z] = placeFor(kind, a, slot);
      if (Math.hypot(x - vet.x, z - vet.z) > VISIT.near) return; // its pen does not come up to her
      const visit = { x, z, vx: vet.x, vz: vet.z, open: !inArea(kind, a), until: t + VISIT.patience, arrived: false, since: 0 }, v = { kind, a, slot, visit };
      visitors.push(v); start(kind, a, visit);
    };
    for (const p of pigs) if (can('pig', p)) consider('pig', p);
    for (const b of birds()) if (can('bird', b)) consider('bird', b);
  }
  return { step, visitors };
}
