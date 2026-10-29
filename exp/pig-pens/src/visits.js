// Dr. Emmy's rounds (2.9.0; 2.11.0: wanting a scratch, and Biscuit): while she stands at one of her stops outside
// (clinic.js OUTSIDE_STOPS), calm pigs and hens near her that want a scratch come over to say hello. Each walks to its own
// place at the fence of its pen or the run, nearest her (or to a ring round her in the open), and waits; she gives them a
// scratch one at a time, and once one has had its fill it wanders off happy. Biscuit the dog comes too when he has no job
// (Shoo is not sending him), from further off, and stays for scratch after scratch until he is satisfied.
// Every animal keeps how satisfied it is (a.fond, 0..1, at a.fondAt): a scratch fills it by GAIN[kind] and it fades back to
// nothing over VISIT.fade seconds, so an animal comes back for more some minutes later. Sim only: its own rng (the herd's
// sequence never shifts), never touches three.js or the DOM.
// createVisits({ vet, pigs, birds, dog, lay, emit, now, seed, can, start, end }) → { step(dt), visitors, fond(a) }
//   can(kind, a): free to come over; start(kind, a, visit): into its VISIT state, a.visit = visit (the animal sets
//   visit.arrived and visit.since once it is at its place); end(kind, a, petted): back to its day.
import { mulberry32 } from './layout.js';
import { VET_STOPS } from './clinic.js';

export const VET_R = 0.4; // m: the vet's footprint, for the animals walking round her
export const VISIT = {
  every: 0.5,         // s between looks for new visitors
  chance: { pig: 0.12, bird: 0.12, dog: 0.5 }, // a calm animal near her that wants a scratch comes over, per look (× how much it wants one)
  want: 0.4,          // it only wants one once its satisfaction has faded below this
  fade: 150,          // s for a full satisfaction to fade to nothing
  reach: { pig: 11, bird: 11, dog: 18 }, // m: how far an animal notices her
  near: 2.6,          // m: its place must be this close to her (the pen it is in runs up to her fence)
  max: 4,             // visitors at once (Biscuit is never turned away)
  patience: 30,       // s an animal waits for its next scratch
  pet: 2.2,           // s of scratching
  spacing: 0.95,      // m between places along a fence
  ring: 1.0,          // m from her, in the open
  inset: { pig: 0.75, bird: 0.4 }, // m in from its fence
};
// how much one scratch satisfies (a pig takes two, a hen one, Biscuit four)
export const GAIN = { pig: 0.5, bird: 1, dog: 0.25 };
const pos = a => (a.px === undefined ? [a.x, a.z] : [a.px, a.pz]); // the dog keeps x, z; pigs and hens px, pz

// The point of rect r (x0..x1, z0..z1) inset by `in` nearest (x, z), slid `along` the fence it is nearest to.
function atFence(r, x, z, inset, along) {
  const x0 = r.x0 + inset, x1 = r.x1 - inset, z0 = r.z0 + inset, z1 = r.z1 - inset;
  let px = Math.min(x1, Math.max(x0, x)), pz = Math.min(z1, Math.max(z0, z));
  const onZ = Math.min(Math.abs(pz - z0), Math.abs(pz - z1)) <= Math.min(Math.abs(px - x0), Math.abs(px - x1)); // a north or south fence
  if (onZ) px = Math.min(x1, Math.max(x0, px + along)); else pz = Math.min(z1, Math.max(z0, pz + along));
  return [px, pz];
}

export function createVisits({ vet, pigs, birds, dog, lay, emit, now, seed = 1, can, start, end }) {
  const rng = mulberry32((seed ^ 0x5ca7) >>> 0), visitors = []; // { kind, a, slot }
  let look = 0;
  const SLOTS = [0, 1, -1, 2, -2, 3, -3];
  const here = () => vet.outside && vet.state === 'idle';
  // how satisfied an animal is now (it fades from the last scratch)
  const fond = a => Math.max(0, (a.fond ?? 0) - (now() - (a.fondAt ?? 0)) / VISIT.fade);
  // where an animal can stand to see her: its pen's (or the run's) fence, or a ring round her when it is out in the open
  // a place is no good on a trough, a hay bale or a barrel (the fences are what it stands at)
  const things = lay.obstacles.filter(o => !o.fence && !o.building);
  const clear = (x, z, r) => things.every(o => o.type === 'circle' ? Math.hypot(x - o.x, z - o.z) > o.r + r
    : Math.abs(x - o.x) > o.hx + r || Math.abs(z - o.z) > o.hz + r);
  const inArea = (kind, a) => {
    if (kind === 'bird') return lay.run;
    if (kind === 'dog') return null; // he hops fences: always in the open, beside her
    const r = lay.region(a.px, a.pz); return r < lay.pens.length ? lay.pens[r] : null;
  };
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
    const [ax, az] = pos(a), ang = Math.atan2(ax - vet.x, az - vet.z) + along / VISIT.ring;
    return [vet.x + Math.sin(ang) * VISIT.ring, vet.z + Math.cos(ang) * VISIT.ring];
  }
  function finish(v, petted) {
    const k = visitors.indexOf(v); if (k >= 0) visitors.splice(k, 1);
    if (vet.pet && vet.pet.a === v.a) vet.pet = null;
    v.a.visit = null;
    end(v.kind, v.a, petted);
  }
  function step(dt) {
    // visitors who were picked up, frightened off, called away … are done; so is everyone when she moves on
    for (const v of [...visitors]) if (!here() || v.a.visit !== v.visit || now() > v.visit.until) finish(v, false);
    if (!here()) { vet.pet = null; return; }
    // a scratch for whoever has been waiting at their place longest; one that has had its fill goes off happy, one that
    // wants more goes to the back of the line
    if (vet.pet) {
      const v = visitors.find(o => o.a === vet.pet.a);
      if (!v) vet.pet = null;
      else {
        const [ax, az] = pos(v.a);
        vet.pet.t += dt; vet.yaw = Math.atan2(ax - vet.x, az - vet.z);
        if (vet.pet.t >= VISIT.pet) {
          const t = now(), f = Math.min(1, (v.petted ? v.a.fond : fond(v.a)) + GAIN[v.kind]); v.a.fond = f; v.a.fondAt = t; v.petted = true; // no fading between scratches of one visit
          emit('pet', { kind: v.kind, i: v.a.i, name: v.a.name });
          vet.doing = VET_STOPS[vet.goal]; vet.pet = null;
          if (f >= 1) finish(v, true); else { v.visit.since = t; v.visit.until = t + VISIT.patience; }
        }
      }
    }
    if (!vet.pet) {
      const v = visitors.filter(o => o.visit.arrived).sort((p, q) => p.visit.since - q.visit.since)[0];
      if (v) { vet.pet = { kind: v.kind, i: v.a.i, a: v.a, t: 0 }; vet.doing = `Giving ${v.a.name} a scratch`; }
    }
    // new visitors, a few at a time
    if ((look -= dt) > 0) return;
    look = VISIT.every;
    const t = now(), free = () => SLOTS.findIndex((_, s) => !visitors.some(o => o.slot === s));
    const consider = (kind, a) => {
      if ((kind !== 'dog' && visitors.length >= VISIT.max) || a.visit) return;
      const f = fond(a); if (f >= VISIT.want) return; // still happy from the last scratch
      const [ax, az] = pos(a);
      if (Math.hypot(ax - vet.x, az - vet.z) > VISIT.reach[kind] || rng() > VISIT.chance[kind] * (1 - f)) return;
      const slot = free(); if (slot < 0) return;
      const [x, z] = placeFor(kind, a, slot);
      if (Math.hypot(x - vet.x, z - vet.z) > VISIT.near) return; // its pen does not come up to her
      const visit = { x, z, vx: vet.x, vz: vet.z, open: !inArea(kind, a), until: t + VISIT.patience, arrived: false, since: 0 }, v = { kind, a, slot, visit };
      visitors.push(v); start(kind, a, visit);
    };
    if (dog && can('dog', dog)) consider('dog', dog); // Biscuit first: she always has a scratch for him
    for (const p of pigs) if (can('pig', p)) consider('pig', p);
    for (const b of birds()) if (can('bird', b)) consider('bird', b);
  }
  return { step, visitors, fond };
}
