// The vet clinic's sim half (v3 §9). The vet's day and night routine (R1); the queue, the waiting room, the exam and
// discharge (R3: createClinic). She walks her clinic's walk graph
// (defs/buildings.js CLINIC.walk) between the reception desk, the waiting room, the exam room and the studio's kitchenette,
// lingers at each, and goes to bed at night. A kinematic walker: no body, no physics, her own rng (so she never shifts
// the farm's random sequence). Never touches three.js or the DOM.
import { CLINIC } from './defs/buildings.js';
import { mulberry32 } from './layout.js';
import { AILMENTS, CHECKUPS, TREATMENTS } from './sickness.js';

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
    // a patient on the way or on the table: she goes to the exam room and stays there
    if (vet.busy && !night && vet.state !== 'sleep' && vet.state !== 'waking') {
      if (vet.goal !== 'examVet') { goTo('examVet'); vet.doing = 'Off to see a patient'; }
      if (vet.state === 'idle') { vet.timer = 1e9; vet.doing = 'With a patient'; return; }
    } else if (vet.state === 'idle' && vet.timer > 1e8) vet.timer = 1 + rng() * 2; // the patient's gone: back to her day
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

// ---- the clinic: drop-off, the waiting room, the exam, discharge (v3 §9) --------------------------------------------
export const WAIT_PLACES = CLINIC.spots.benches.length;
export const CLINIC_T = { walk: 1.0, hop: 0.35, hopH: 0.35, cured: 2.6, call: 1.2 }; // m/s, s, m, s with the lollipop, s before "Next please!"
const L = ([lx, , lz]) => [CLINIC.x + lx, CLINIC.z + lz];
const EXAM = { door: [-2.2, 0, 0.75], inside: [-2.2, 0, -0.35], side: [-1.35, 0, -2.2] }; // the way in: by the exam room's doorway, round to the table's side

// createClinic({ vet, clock, emit, now, animal, hold, letGo, cure }) — animal(kind, i) → the pig or bird; hold(kind, a,
// x, y, z, yaw) sets it down kinematic (bench, table); letGo(kind, a, x, z) puts it back on its feet outside; cure(kind, a).
export function createClinic({ vet, clock, emit, now, animal, hold, letGo, cure }) {
  const queue = [];                                   // { kind, i } in drop-off order; the first is next (or on the table)
  const places = new Array(WAIT_PLACES).fill(null);   // who sits where
  const exam = { state: 'empty', who: null, t: 0, step: 0, path: null, k: 0 }; // empty | walk | patient | cured
  const C = { queue, places, exam, open: false };
  const door = L(CLINIC.spots.frontDoor);

  function admit(kind, i) {
    const a = animal(kind, i);
    if (a.clinic) return 'already';
    if (!a.sick) { letGo(kind, a, door[0], door[1]); emit('clinic', { what: 'healthy', kind, i, name: a.name }); return 'healthy'; }
    const k = places.indexOf(null);
    if (k < 0) { letGo(kind, a, door[0], door[1]); emit('clinic', { what: 'full', kind, i, name: a.name }); return 'full'; }
    places[k] = { kind, i }; a.clinic = { place: k };
    const [x, y, z, yaw] = CLINIC.spots.benches[k];
    hold(kind, a, CLINIC.x + x, y + a.r, CLINIC.z + z, yaw);
    queue.push({ kind, i });
    emit('clinic', { what: 'in', kind, i, name: a.name, n: queue.length });
    return 'in';
  }
  // The exam (only while the player looks into the exam room, `C.open`, and the vet is up)
  function patient() { return exam.who ? animal(exam.who.kind, exam.who.i) : null; }
  function applyTool(tool) {
    if (exam.state !== 'patient') return null;
    if (!CHECKUPS.includes(tool) && !TREATMENTS.includes(tool)) throw new Error(`pig-pens: no tool '${tool}'`);
    const a = patient(), ail = AILMENTS[a.sick.ailment], who = { kind: exam.who.kind, i: exam.who.i, name: a.name };
    if (CHECKUPS.includes(tool)) {
      const text = ail.clue[tool]; emit('exam', { what: 'clue', tool, text: text ?? 'Hmm, that all seems fine.', found: !!text, ...who }); return 'clue';
    }
    if (tool === ail.cure[exam.step]) {
      exam.step++;
      if (exam.step < ail.cure.length) { emit('exam', { what: 'step', tool, text: 'That’s out! Now a bandage.', ...who }); return 'step'; }
      cure(exam.who.kind, a); exam.state = 'cured'; exam.t = 0;
      emit('exam', { what: 'cured', tool, text: `All better! Here’s a lollipop, ${a.name}.`, ...who }); return 'cured';
    }
    const early = ail.cure.includes(tool);
    emit('exam', { what: 'oops', tool, reaction: early ? 'wiggle' : ['giggle', 'sneeze', 'wiggle'][TREATMENTS.indexOf(tool) % 3],
      text: early ? 'Let’s get that splinter out first.' : 'Hmm, I don’t think that’s it…', ...who });
    return 'oops';
  }
  function step(dt) {
    exam.t += dt;
    const awake = !clock.night && vet.state !== 'sleep' && vet.state !== 'waking';
    vet.busy = awake && (exam.state !== 'empty' || (C.open && queue.length > 0));
    if (exam.state === 'empty') {
      if (C.open && awake && queue.length && vet.node === 'examVet' && exam.t > CLINIC_T.call) callNext();
      return;
    }
    const a = patient();
    if (exam.state === 'walk') { // from the bench, through the exam room's doorway, and up onto the table
      const P = exam.path, from = P[exam.k], to = P[exam.k + 1], hop = exam.k + 1 === P.length - 1;
      const d = Math.hypot(to[0] - from[0], to[2] - from[2]), dur = hop ? CLINIC_T.hop : Math.max(0.15, d / CLINIC_T.walk), u = Math.min(1, exam.t / dur);
      const y = from[1] + (to[1] - from[1]) * u + (hop ? Math.sin(Math.PI * u) * CLINIC_T.hopH : 0);
      hold(exam.who.kind, a, from[0] + (to[0] - from[0]) * u, y, from[2] + (to[2] - from[2]) * u, d > 0.02 ? Math.atan2(to[0] - from[0], to[2] - from[2]) : Math.PI / 2);
      if (u >= 1) { exam.k++; exam.t = 0; if (exam.k >= P.length - 1) { exam.state = 'patient'; hold(exam.who.kind, a, to[0], to[1], to[2], Math.PI / 2); } }
    } else if (exam.state === 'cured' && exam.t > CLINIC_T.cured) discharge();
  }
  function callNext() {
    const w = queue[0], a = animal(w.kind, w.i), k = a.clinic.place, [bx, by, bz] = CLINIC.spots.benches[k];
    places[k] = null; a.clinic.place = -1;
    const T = CLINIC.spots.examTable.at, top = CLINIC.spots.tableTop, W = ([x, , z]) => [CLINIC.x + x, a.r, CLINIC.z + z];
    exam.who = w; exam.state = 'walk'; exam.t = 0; exam.k = 0; exam.step = 0;
    exam.path = [[CLINIC.x + bx, by + a.r, CLINIC.z + bz], W(EXAM.door), W(EXAM.inside), W(EXAM.side), [CLINIC.x + T[0], top + a.r, CLINIC.z + T[2]]];
    emit('exam', { what: 'next', text: 'Next please!', kind: w.kind, i: w.i, name: a.name });
  }
  function discharge() {
    const a = patient(), w = exam.who;
    queue.shift(); a.clinic = null; exam.who = null; exam.state = 'empty'; exam.t = 0; exam.path = null;
    letGo(w.kind, a, door[0], door[1]);
    emit('clinic', { what: 'out', kind: w.kind, i: w.i, name: a.name });
  }
  return Object.assign(C, { admit, applyTool, step, patient, place: k => places[k] });
}
