// The vet clinic's sim half (v3 §9). The vet's day and night routine (R1); the queue, the waiting room, the exam and
// discharge (R3: createClinic). She walks her clinic's walk graph
// (defs/buildings.js CLINIC.walk) between the reception desk, the waiting room, the exam room and round her flat,
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
  lingerOut: [18, 28],                  // seconds at a stop outside (the animals take a while to come over)
  hurry: 1.8,                           // × speed when a patient is waiting for her
  rounds: 0.35,                         // the chance her next stop starts a round outside (1 to 3 of OUTSIDE_STOPS, shuffled)
  afterTea: 0.35,                       // 2.13.0: the chance she goes to the bathroom after her cup of tea
  shower: 0.5,                          // the chance she has a shower when she gets up
  quick: 2.5,                           // × how fast she gets through the bathroom when a patient is waiting
};
// where she goes in the day and what she does there (her card's line): inside stops at random, and now and then a round
// outside, the pens and the run in a shuffled order (2.11.0: no longer always the run first)
export const VET_STOPS = { deskVet: 'At the front desk', waiting: 'Tidying the waiting room', examVet: 'Getting the exam room ready', kitchenVet: 'Making a cup of tea',
  study: 'Writing up her notes', dining: 'Having lunch', penEast: 'Saying hello at the pens', penWest: 'Saying hello at the pens', run: 'Saying hello to the chickens',
  bathroom: 'In the bathroom', shower: 'Having a shower' };
const STOP_PLACE = { deskVet: 'front desk', waiting: 'waiting room', examVet: 'exam room', kitchenVet: 'kitchenette', study: 'desk in her flat', dining: 'table',
  penEast: 'pens', penWest: 'pens', run: 'chicken run', bathroom: 'bathroom', shower: 'shower' };
export const OUTSIDE_STOPS = ['penEast', 'penWest', 'run'];
// out of the clinic's walls (local), so on the farm: the animals can see her, and she them
const outOfClinic = (x, z) => Math.abs(x - CLINIC.x) > CLINIC.w / 2 || Math.abs(z - CLINIC.z) > CLINIC.d / 2;

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

// createVet({ clock, seed, emit }) — emit(type, data): what she says (2.13.0: 'vet' { text })
export function createVet({ clock, seed = 1, emit = () => {} }) {
  const rng = mulberry32((seed ^ 0x7e7) >>> 0), { pts, adj } = graph();
  const bed = CLINIC.spots.bed, bedAt = [CLINIC.x + bed.at[0], CLINIC.z + bed.at[2]];
  const start = clock.night ? 'bedSide' : 'deskVet';
  const vet = {
    name: VET_NAME, x: pts[start][0], z: pts[start][1], yaw: Math.PI, node: start, path: [], goal: start,
    state: clock.night ? 'sleep' : 'idle', timer: 1 + rng() * 3, doing: clock.night ? 'Fast asleep' : VET_STOPS[start], moving: false,
    outside: false, pet: null,          // pet: { kind, i, t } while she gives an animal a scratch (visits.js)
    // 2.13.0: in the bathroom (BATHROOM): chore { list, k, t, on, called }; on the toilet's seat; what the view frosts over (1
    // her bottom half, 2 shoulders down); her hands busy
    chore: null, seat: false, blur: 0, reach: false, props: createProps(),
  };
  if (clock.night) { vet.x = bedAt[0]; vet.z = bedAt[1]; vet.yaw = bed.yaw; }
  // round: the outside stops still to go. The shower is only first thing in the morning
  const inside = Object.keys(VET_STOPS).filter(k => !OUTSIDE_STOPS.includes(k) && k !== 'shower'), round = [];
  const goTo = goal => { vet.goal = goal; vet.path = route(adj, vet.node, goal); vet.state = 'walk'; };
  function nextStop() {
    if (vet.node === 'kitchenVet' && rng() < VET.afterTea) return 'bathroom';
    if (!round.length && !OUTSIDE_STOPS.includes(vet.node) && rng() < VET.rounds) {
      const o = [...OUTSIDE_STOPS]; for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; }
      round.push(...o.slice(0, 1 + Math.floor(rng() * o.length)));
    }
    if (round.length) return round.shift();
    const was = vet.node === 'washVet' || vet.node === 'shower' ? 'bathroom' : vet.node; // just out of the bathroom: somewhere else
    const o = inside.filter(k => k !== was); return o[Math.floor(rng() * o.length)];
  }

  function step(dt) {
    const night = clock.night;
    vet.moving = false; vet.outside = outOfClinic(vet.x, vet.z);
    if (vet.chore) { chore(dt); return; } // she always finishes in the bathroom (quicker if someone's waiting)
    // a patient on the way or on the table: she goes to the exam room and stays there
    if (vet.busy && !night && vet.state !== 'sleep' && vet.state !== 'waking') {
      round.length = 0; // the rest of her round can wait
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
      vet.node = 'bedSide'; vet.x = pts.bedSide[0]; vet.z = pts.bedSide[1];
      if (rng() < VET.shower) { goTo('shower'); vet.doing = 'Off for a shower'; } else { goTo('kitchenVet'); vet.doing = 'Off to make a cup of tea'; }
      return;
    }
    if (night && vet.goal !== 'bedSide') { goTo('bedSide'); vet.doing = 'Off to bed'; round.length = 0; }
    if (vet.state === 'walk') {
      if (!vet.path.length) { arrive(); return; }
      walk(dt);
      return;
    }
    // idle at a stop (outside, not while she has an animal under her hand)
    if (vet.pet) return;
    if ((vet.timer -= dt) <= 0) { goTo(nextStop()); vet.doing = 'Walking to the ' + STOP_PLACE[vet.goal]; }
  }
  // one step along vet.path
  function walk(dt) {
    const [tx, tz] = pts[vet.path[0]], dx = tx - vet.x, dz = tz - vet.z, d = Math.hypot(dx, dz), s = VET.speed * (vet.busy ? VET.hurry : 1) * dt;
    if (d > 1e-6) {
      let dy = Math.atan2(dx, dz) - vet.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      vet.yaw += dy * Math.min(1, dt * VET.turn);
    }
    if (d <= s) { vet.x = tx; vet.z = tz; vet.node = vet.path.shift(); } else { vet.x += dx / d * s; vet.z += dz / d * s; }
    vet.moving = true;
  }
  // 2.13.0: the bathroom, a step at a time (BATHROOM): she walks to a step's place, works its prop, and stays its time
  function chore(dt) {
    const c = vet.chore, list = BATHROOM[c.list], st = list[c.k];
    if (st.at && vet.node !== st.at) { if (!vet.path.length) vet.path = route(adj, vet.node, st.at); walk(dt); return; }
    const P = vet.props.props;
    if (!c.on) {
      c.on = true; c.t = 0; vet.doing = st.doing; vet.reach = !!st.reach; vet.blur = st.blur ?? 0;
      const spot = CLINIC.spots[st.seat ? 'seat' : vet.node]; vet.yaw = spot.yaw;
      if (st.seat) { vet.seat = true; [vet.x, vet.z] = L(spot.at); }
      if (st.use && P[st.use].state === st.from) vet.props.useProp(st.use);
    }
    if (vet.busy && !c.called) { c.called = true; emit('vet', { text: c.list === 'loo' ? 'Coming! I’ll wash my hands first.' : 'Coming!' }); }
    if (vet.busy && c.list === 'shower') c.t = st.t; // out of the shower at once
    if ((c.t += dt * (vet.busy ? VET.quick : 1)) < st.t) return;
    if (st.use === 'shower' && P.shower.state === 'on') vet.props.useProp('shower'); // the water off as she steps out
    if (vet.seat) { vet.seat = false; [vet.x, vet.z] = pts[vet.node]; }
    vet.blur = 0; vet.reach = false; c.k++; c.on = false;
    if (c.k < list.length) return;
    vet.chore = null; goTo(nextStop()); vet.doing = BATHROOM_DONE[c.list]; // and on with her day
  }
  function arrive() {
    if (vet.goal === 'bedSide') { vet.state = 'sleep'; vet.x = bedAt[0]; vet.z = bedAt[1]; vet.yaw = bed.yaw; vet.doing = 'Fast asleep'; return; }
    if (vet.goal === 'bathroom' || vet.goal === 'shower') { vet.state = 'chore'; vet.chore = { list: vet.goal === 'shower' ? 'shower' : 'loo', k: 0, t: 0, on: false, called: false }; return; }
    const L = OUTSIDE_STOPS.includes(vet.goal) ? VET.lingerOut : VET.linger;
    vet.state = 'idle'; vet.timer = L[0] + rng() * (L[1] - L[0]); vet.doing = VET_STOPS[vet.goal];
    vet.yaw = CLINIC.spots[vet.goal].yaw;
  }
  vet.step = step;
  // 2.12.0: called back from the farm while you wait in the exam room: she is put at `node` (the lobby, out of the close-up's
  // view) and walks the last few steps in
  vet.jump = node => {
    vet.node = node; [vet.x, vet.z] = pts[node]; vet.pet = null; round.length = 0; vet.outside = false;
    goTo('examVet'); vet.doing = 'Off to see a patient';
  };
  vet.send = goal => { if (!(goal in VET_STOPS)) throw new Error(`pig-pens: the vet has no stop '${goal}'`); if (vet.chore) throw new Error('pig-pens: the vet is in the bathroom'); goTo(goal); vet.doing = 'Walking to the ' + STOP_PLACE[goal]; };
  return vet;
}

// ---- the clinic: drop-off, the waiting room, the exam, discharge (v3 §9) --------------------------------------------
export const WAIT_PLACES = CLINIC.spots.benches.length;
// m/s walking, s and m for a hop (onto or off the bench and the table), s with the lollipop, s before "Next please!", how much
// faster and bouncier a patient made better walks out (× walk, m)
export const CLINIC_T = { walk: 1.0, hop: 0.35, hopH: 0.35, cured: 2.6, call: 1.2, happy: 1.25, bounce: 0.07 };
const L = ([lx, , lz]) => [CLINIC.x + lx, CLINIC.z + lz];
// the way in: off the bench, out into the room, through the east half of the exam room's doorway and round to the table's
// east end, a lane clear of where the vet stands (spots.examVet, west of it); the way out, back the same way and on to the
// front door (2.9.0: they walk out, it opens for them)
const [TX, , TZ] = CLINIC.spots.examTable.at, FD = CLINIC.spots.frontDoor;
const EXAM = { lobby: [0, 0, 0.6], door: [TX + 0.4, 0, 0.75], inside: [TX + 0.4, 0, -0.35], mid: [TX + 0.95, 0, -1.25], side: [TX + 0.85, 0, TZ],
  hall: [FD[0] - 0.6, 0, 2.4], frontIn: [FD[0], 0, 3.2] };
const HOP_REACH = 1.2; // a leg that changes height over less than this is a hop

// The flat's working things (2.9.0; their places: CLINIC.props): a tap runs the shower, runs a sink, lifts the toilet's lid
// (a second tap flushes it and shuts it), opens or shuts the laptop and the fridge. Times in seconds.
export const PROPS = {
  shower: 6,                                   // how long the shower runs (a tap while it runs turns it off)
  sink: 1.6,                                   // a little splash from the kitchen and exam-room taps
  bathSink: { run: 2.6, full: 1.4, drain: 2.4 }, // the bathroom basin: the tap runs while it fills, it stands full, it drains
  flush: 2.4,                                  // the flush, then the lid comes down
};
// 2.13.0: Dr. Emmy in the bathroom, step by step (createVet's chore): what her card says, how long it takes (s), where she
// does it (`at`: a walk point; else where she is), the prop she works (`use`, if it is still `from`: the lid up, the flush,
// the basin's tap, the shower on), on the toilet's seat (`seat`), what the view frosts over (`blur`: 1 her bottom
// half, 2 shoulders down) and her hands busy (`reach`). The toilet always ends at the basin; the shower needs no basin
export const BATHROOM = {
  loo: [ // and her card when she's done: BATHROOM_DONE
    { doing: 'Lifting the lid', t: 1.0, use: 'toilet', from: 'shut', reach: true },
    { doing: 'Using the toilet', t: 4.0, seat: true, blur: 1 },
    { doing: 'Flushing', t: 1.4, use: 'toilet', from: 'open', reach: true },
    { doing: 'Washing her hands', t: 4.2, at: 'washVet', use: 'bathSink', from: 'off', reach: true },
  ],
  shower: [{ doing: 'Having a shower', t: PROPS.shower, use: 'shower', from: 'off', blur: 2 }],
};
export const BATHROOM_DONE = { loo: 'Nice clean hands!', shower: 'All fresh and clean!' };
// each prop's state: { state, t } (t: seconds in that state). shower off|on; sinks off|on; bathSink off|run|full|drain;
// toilet shut|open|flush; laptop and fridge shut|open
const PROP_START = { shower: 'off', bathSink: 'off', toilet: 'shut', laptop: 'open', fridge: 'shut', kitchenSink: 'off', examSink: 'off' };
function createProps() {
  const props = Object.fromEntries(Object.keys(CLINIC.props).map(id => {
    if (!(id in PROP_START)) throw new Error(`pig-pens: no start state for the clinic's '${id}'`);
    return [id, { state: PROP_START[id], t: 0 }];
  }));
  const set = (p, state) => { p.state = state; p.t = 0; return state; };
  function useProp(id) {
    const p = props[id]; if (!p) throw new Error(`pig-pens: no clinic prop '${id}'`);
    switch (id) {
      case 'shower': return set(p, p.state === 'on' ? 'off' : 'on');
      case 'kitchenSink': case 'examSink': return set(p, 'on');
      case 'bathSink': return p.state === 'off' ? set(p, 'run') : p.state; // once it's going, it goes round to empty
      case 'toilet': return p.state === 'shut' ? set(p, 'open') : p.state === 'open' ? set(p, 'flush') : p.state;
      default: return set(p, p.state === 'open' ? 'shut' : 'open');     // the laptop, the fridge
    }
  }
  function step(dt) {
    for (const [id, p] of Object.entries(props)) {
      p.t += dt;
      if (id === 'shower' && p.state === 'on' && p.t > PROPS.shower) set(p, 'off');
      else if ((id === 'kitchenSink' || id === 'examSink') && p.state === 'on' && p.t > PROPS.sink) set(p, 'off');
      else if (id === 'toilet' && p.state === 'flush' && p.t > PROPS.flush) set(p, 'shut');
      else if (id === 'bathSink' && p.state !== 'off' && p.t > PROPS.bathSink[p.state]) set(p, { run: 'full', full: 'drain', drain: 'off' }[p.state]);
    }
  }
  return { props, useProp, step };
}

// createClinic({ vet, clock, emit, now, animal, hold, letGo, cure }) — animal(kind, i) → the pig or bird; hold(kind, a, speed,
// x, y, z, yaw) sets it down kinematic (bench, table); letGo(kind, a, x, z) puts it back on its feet outside; cure(kind, a).
export function createClinic({ vet, clock, emit, now, animal, hold, letGo, cure }) {
  const queue = [];                                   // { kind, i } in drop-off order; the first is next (or on the table)
  const places = new Array(WAIT_PLACES).fill(null);   // who sits where
  const exam = { state: 'empty', who: null, t: 0, step: 0, path: null, k: 0 }; // empty | walk | patient | cured
  const flat = vet.props; // she works the bathroom's things too
  const C = { queue, places, exam, open: false, props: flat.props };
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
    flat.step(dt);
    exam.t += dt;
    const awake = !clock.night && vet.state !== 'sleep' && vet.state !== 'waking';
    vet.busy = awake && (exam.state !== 'empty' || (C.open && queue.length > 0));
    if (vet.busy && C.open && vet.outside) vet.jump('lobby'); // out on the farm while you wait in the exam room: no long walk back
    if (exam.state === 'empty') {
      if (C.open && awake && queue.length && vet.node === 'examVet' && exam.t > CLINIC_T.call) callNext();
      return;
    }
    const a = patient();
    if (exam.state === 'walk' || exam.state === 'leave') { // along exam.path: walking legs, and hops where the height changes
      const P = exam.path, from = P[exam.k], to = P[exam.k + 1], d = Math.hypot(to[0] - from[0], to[2] - from[2]);
      const hop = Math.abs(to[1] - from[1]) > 0.1 && d < HOP_REACH, happy = exam.state === 'leave';
      const pace = CLINIC_T.walk * (happy ? CLINIC_T.happy : 1), dur = hop ? CLINIC_T.hop : Math.max(0.15, d / pace), u = Math.min(1, exam.t / dur);
      const y = from[1] + (to[1] - from[1]) * u + (hop ? Math.sin(Math.PI * u) * CLINIC_T.hopH : happy ? Math.abs(Math.sin(exam.t * 9)) * CLINIC_T.bounce : 0);
      hold(exam.who.kind, a, from[0] + (to[0] - from[0]) * u, y, from[2] + (to[2] - from[2]) * u, d > 0.02 ? Math.atan2(to[0] - from[0], to[2] - from[2]) : Math.PI / 2, hop ? 0 : pace);
      if (u >= 1) {
        exam.k++; exam.t = 0;
        if (exam.k >= P.length - 1) { if (happy) discharge(); else { exam.state = 'patient'; hold(exam.who.kind, a, to[0], to[1], to[2], Math.PI / 2, 0); } }
      }
    } else if (exam.state === 'cured' && exam.t > CLINIC_T.cured) leave();
  }
  function callNext() {
    const w = queue[0], a = animal(w.kind, w.i), k = a.clinic.place, [bx, by, bz] = CLINIC.spots.benches[k];
    places[k] = null; a.clinic.place = -1;
    const T = CLINIC.spots.examTable.at, top = CLINIC.spots.tableTop, W = ([x, , z]) => [CLINIC.x + x, a.r, CLINIC.z + z];
    exam.who = w; exam.state = 'walk'; exam.t = 0; exam.k = 0; exam.step = 0;
    const yaw = CLINIC.spots.benches[k][3], off = [bx + Math.sin(yaw) * 0.6, 0, bz + Math.cos(yaw) * 0.6]; // the floor in front of its seat
    exam.path = [[CLINIC.x + bx, by + a.r, CLINIC.z + bz], W(off), W(EXAM.lobby), W(EXAM.door), W(EXAM.inside), W(EXAM.mid), W(EXAM.side), [CLINIC.x + T[0], top + a.r, CLINIC.z + T[2]]];
    emit('exam', { what: 'next', text: 'Next please!', kind: w.kind, i: w.i, name: a.name });
  }
  // made better: down off the table and out through the front door, walking happy
  function leave() {
    const a = patient(), T = CLINIC.spots.examTable.at, W = ([x, , z]) => [CLINIC.x + x, a.r, CLINIC.z + z];
    exam.state = 'leave'; exam.t = 0; exam.k = 0;
    exam.path = [[CLINIC.x + T[0], CLINIC.spots.tableTop + a.r, CLINIC.z + T[2]], W(EXAM.side), W(EXAM.mid), W(EXAM.inside), W(EXAM.door), W(EXAM.hall), W(EXAM.frontIn), W(FD)];
  }
  function discharge() {
    const a = patient(), w = exam.who;
    queue.shift(); a.clinic = null; exam.who = null; exam.state = 'empty'; exam.t = 0; exam.path = null;
    letGo(w.kind, a, door[0], door[1]);
    emit('clinic', { what: 'out', kind: w.kind, i: w.i, name: a.name });
  }
  return Object.assign(C, { admit, applyTool, step, patient, place: k => places[k], useProp: flat.useProp });
}
