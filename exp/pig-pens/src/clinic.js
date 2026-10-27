// The vet clinic's sim half (v3 §9). R1: the vet's day and night routine. She walks her clinic's walk graph
// (defs/buildings.js CLINIC.walk) between the reception desk, the waiting room, the exam room and the studio's kitchenette,
// lingers at each, and goes to bed at night. A kinematic walker: no body, no physics, her own rng (so she never shifts
// the farm's random sequence). Never touches three.js or the DOM.
import { CLINIC } from './defs/buildings.js';
import { mulberry32 } from './layout.js';

export const VET_NAME = 'Dr. Emmy';
export const VET = {
  speed: 1.05,                          // m/s along the walk graph
  turn: 7,                              // yaw ease toward the walking direction (1/s)
  linger: [4, 11],                      // seconds at a stop
  wakeDelay: 2.5,                       // seconds after morning before she gets up
};
// where she goes in the day (picked in turn with a little shuffle) and what she does there (her card's line)
export const VET_STOPS = { deskVet: 'At the front desk', waiting: 'Tidying the waiting room', examVet: 'Getting the exam room ready', kitchenVet: 'Making a cup of tea' };

// the walk graph in world coordinates
function graph() {
  const pts = {}, adj = {};
  for (const [k, [lx, lz]] of Object.entries(CLINIC.walk.points)) { pts[k] = [CLINIC.x + lx, CLINIC.z + lz]; adj[k] = []; }
  for (const [a, b] of CLINIC.walk.links) { adj[a].push(b); adj[b].push(a); }
  return { pts, adj };
}
// the fewest-links route from a to b (breadth-first; the graph is small), as the point names after a
function route(adj, a, b) {
  if (a === b) return [];
  const prev = { [a]: null }, q = [a];
  while (q.length) {
    const n = q.shift(); if (n === b) break;
    for (const m of adj[n]) if (!(m in prev)) { prev[m] = n; q.push(m); }
  }
  if (!(b in prev)) throw new Error(`pig-pens: the vet has no way from ${a} to ${b}`);
  const out = []; for (let n = b; n !== a; n = prev[n]) out.unshift(n);
  return out;
}

export function createVet({ clock, seed = 1 }) {
  const rng = mulberry32((seed ^ 0x7e7) >>> 0), { pts, adj } = graph();
  const bed = CLINIC.spots.bed, bedAt = [CLINIC.x + bed.at[0], CLINIC.z + bed.at[2]];
  const start = clock.night ? 'bedSide' : 'deskVet';
  const vet = {
    name: VET_NAME, x: pts[start][0], z: pts[start][1], yaw: Math.PI, node: start, path: [], goal: start,
    state: clock.night ? 'sleep' : 'idle', timer: 1 + rng() * 3, doing: clock.night ? 'Fast asleep' : VET_STOPS[start], moving: false,
  };
  if (clock.night) { vet.x = bedAt[0]; vet.z = bedAt[1]; vet.yaw = bed.yaw; }
  const stops = Object.keys(VET_STOPS);
  const goTo = goal => { vet.goal = goal; vet.path = route(adj, vet.node, goal); vet.state = 'walk'; };
  const nextStop = () => { const o = stops.filter(k => k !== vet.node); return o[Math.floor(rng() * o.length)]; };

  function step(dt) {
    const night = clock.night;
    vet.moving = false;
    if (vet.state === 'sleep') {
      if (night) return;
      vet.state = 'waking'; vet.timer = VET.wakeDelay; vet.doing = 'Waking up'; return;
    }
    if (vet.state === 'waking') {
      if (night) { vet.state = 'sleep'; vet.doing = 'Fast asleep'; return; }
      if ((vet.timer -= dt) > 0) return;
      vet.node = 'bedSide'; vet.x = pts.bedSide[0]; vet.z = pts.bedSide[1]; goTo('kitchenVet'); vet.doing = 'Off to make a cup of tea'; return;
    }
    if (night && vet.goal !== 'bedSide') { goTo('bedSide'); vet.doing = 'Off to bed'; }
    if (vet.state === 'walk') {
      if (!vet.path.length) { arrive(); return; }
      const [tx, tz] = pts[vet.path[0]], dx = tx - vet.x, dz = tz - vet.z, d = Math.hypot(dx, dz), s = VET.speed * dt;
      if (d > 1e-6) {
        let dy = Math.atan2(dx, dz) - vet.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        vet.yaw += dy * Math.min(1, dt * VET.turn);
      }
      if (d <= s) { vet.x = tx; vet.z = tz; vet.node = vet.path.shift(); } else { vet.x += dx / d * s; vet.z += dz / d * s; }
      vet.moving = true;
      return;
    }
    // idle at a stop
    if ((vet.timer -= dt) <= 0) { goTo(nextStop()); vet.doing = 'Walking to the ' + { deskVet: 'front desk', waiting: 'waiting room', examVet: 'exam room', kitchenVet: 'kitchenette' }[vet.goal]; }
  }
  function arrive() {
    if (vet.goal === 'bedSide') { vet.state = 'sleep'; vet.x = bedAt[0]; vet.z = bedAt[1]; vet.yaw = bed.yaw; vet.doing = 'Fast asleep'; return; }
    vet.state = 'idle'; vet.timer = VET.linger[0] + rng() * (VET.linger[1] - VET.linger[0]); vet.doing = VET_STOPS[vet.goal];
    const face = { deskVet: CLINIC.spots.deskVet.yaw, examVet: CLINIC.spots.examVet.yaw, kitchenVet: CLINIC.spots.kitchenVet.yaw, waiting: 0 }[vet.goal];
    if (face !== undefined) vet.yaw = face;
  }
  vet.step = step;
  return vet;
}
