// The farm scene (lion-hawk 2e, [S-1]…[S-5], field notes #4, #28, #57, #58): one main scene owns the createSim world
// (pigs, dog, chickens, fox, gates, coop, day/night) for the life of the page. The flow state main.js kept
// in its closure lives in ctx.state ([S-4], #4): the tool, the selection and the per-gesture state.
// Step order: lh.ui → lh.input → farm.ease → lh.commands → farm.keys → lh.scene → farm.think → lh.physics.step → read →
// events → farm.settle → farm.events → events.flush. The engine owns the scene's World (S-3) and steps Rapier.
import { createSim } from '../sim.js';
import { planeHit, classify, grabTarget, rayBox } from './pick.js';
import { BUILDINGS, CLINIC } from '../defs/buildings.js';

export const TOOLS = ['hand', 'shoo', 'feed', 'hose', 'grab'];
export const TOOL_LABEL = { hand: 'Hand', shoo: 'Shoo', feed: 'Feed', hose: 'Hose', grab: 'Grab' };
export const TOOL_HINT = {
  hand: 'Tap an animal to meet it. Tap a gate or the coop door to open or shut it.',
  shoo: 'Drag to send the dog. Pigs and chickens scatter from it.',
  feed: 'Tap to toss a snack. Tap in the chicken run to scatter grain.',
  hose: 'Drag to spray. Muddy pigs come for a bath.',
  grab: 'Drag a pig or a chicken to lift it. Flick to throw.',
};
export const START_HINT = 'Tap an animal to meet it. Two fingers turn, pan and zoom.';
export const TAP = { move: 12, seconds: 0.45 }, ORBIT_PX = 10, LIFT = { hose: 55, grab: 80 };
export const GRAB_EASE = 0.18, GRAB_Y = 1.7, TOSS_GAP = 0.18;
// The farm's own event types (never a createSim type), so the engine-path golden can filter them out (#57).
export const FARM_EVENTS = new Set(['hint', 'select', 'door', 'bark', 'hose', 'toss', 'scatter', 'focus', 'fly']);
// The exam room (v3 §9.4): the tools' tap volumes on the pegboard (world boxes), the height a dragged tool is held at,
// and how near the patient a tool has to be let go to be used on it
const PEG_BOX = CLINIC.pegs.map(({ tool, at: [x, y, z] }) => ({ tool,
  box: { x0: CLINIC.x + x - 0.08, x1: CLINIC.x + x + 0.22, y0: y - 0.44, y1: y + 0.04, z0: CLINIC.z + z - 0.16, z1: CLINIC.z + z + 0.16 } }));
// A tool is carried on an upright plane just east of the exam table (between the close-up's camera and the patient, so
// it stays in front of the patient under the finger); used when let go within `reach` of the patient's middle.
export const EXAM_DRAG = { y: 1.15, front: 0.6, reach: 0.9, lift: 0.25 };
// Going inside (v3 §5): the building in focus, its hint, and the tools that stay outside
export const FOCUS_HINT = {
  coop: 'The coop. Zoom out, or tap Outside or the grass, to go back out.',
  barn: 'The barn. Tap the doors to open or shut them.',
  clinic: 'The vet’s clinic. Tap the exam room to see a patient.',
  'clinic.exam': 'Drag a tool from the pegboard onto the patient.',
};
export const OUTSIDE_TOOLS = new Set(['shoo', 'feed', 'hose']);

export function makeFarm() {
  const S = e => { if (e.scene.name !== 'farm') throw new Error('pig-pens: the farm scene is not the main scene'); return e.scene.state; };
  // --- the API (UI controls, keys, presets and debug call these; each takes the engine first) -------------------
  const api = {
    hint(e, text, seconds = 3.2) { e.emit('hint', { text, seconds }); },
    setTool(e, t) {
      if (!TOOLS.includes(t)) throw new Error(`pig-pens: no tool '${t}'`);
      S(e).tool = t; api.hint(e, TOOL_HINT[t]);
    },
    // A copy of { kind, i? } (or null); `select` tells the view to pop.
    select(e, sel) {
      const s = S(e);
      s.selected = sel ? (sel.i === undefined ? { kind: sel.kind } : { kind: sel.kind, i: sel.i }) : null;
      if (s.selected) e.emit('select', { ...s.selected });
    },
    ringBell(e) { S(e).sim.bell(); api.hint(e, 'Dinner time. Every trough is full.', 2.5); },
    setNight(e, n) {
      const s = S(e); n = !!n; if (s.sim.clock.night === n) return;
      s.sim.setNight(n);
      const bed = s.sim.bedtime(); // v3 §7.2: who can't get to the barn, and the barn's doors
      if (n) {
        const stuck = bed.stuck ? ` ${bed.stuck === 1 ? '1 pig is' : `${bed.stuck} pigs are`} shut in their pens.` : '';
        api.hint(e, `Night time. Everyone’s off to bed.${stuck}${bed.doorShut ? ' The barn doors are shut!' : ''} Shut the coop door once the chickens are in.`, 5);
      } else {
        const out = [!s.sim.lay.coop.open && 'the coop door', bed.doorShut && bed.inBarn && 'the barn doors'].filter(Boolean);
        api.hint(e, out.length ? `Good morning! Open ${out.join(' and ')} to let everyone out.` : 'Good morning!', 3.5);
      }
    },
    // What a Hand tap does with the target picked at pointer down (#55; main.js act).
    act(e, t) {
      const s = S(e), sim = s.sim;
      if (!t) return api.select(e, null);
      if (t.kind === 'egg') { sim.flock.collectEgg(t.id); return; }
      if (t.kind === 'gate') { const g = sim.lay.gates[t.id]; sim.setGate(t.id, !g.open); api.hint(e, g.open ? 'Gate open.' : 'Gate shut.', 1.2); return; }
      if (t.kind === 'fox' && sim.flock.fox.carrying) { sim.flock.tapFox(); return; }
      if (t.kind === 'door') return api.toggleDoor(e);
      if (t.kind === 'building') return api.fly(e, t.id);
      if (t.kind === 'exam') return api.enter(e, 'clinic.exam');
      if (t.kind === 'prop') { sim.clinic.useProp(t.id); return; }
      if (t.kind === 'outside') return api.fly(e, null);
      api.select(e, t);
    },
    // A roof tap (or Outside) only starts the camera on its way (the view's rig.fly, which any camera gesture stops); the
    // building comes into focus when the camera gets close (the view's `focus` command, rig.js nearFocus)
    fly(e, id) { e.emit('fly', { to: id }); },
    // Into a building: its roof lifts and its walls cut away (the view); another building's roof switches.
    enter(e, id) {
      if (!FOCUS_HINT[id]) throw new Error(`pig-pens: no building '${id}'`);
      const s = S(e); if (s.focus === id) return;
      if (id === 'clinic.exam' && (s.sim.clock.night || s.sim.vet.state === 'sleep')) return api.hint(e, 'The vet’s asleep. Come back in the morning!', 2.5);
      setFocus(e, s, id); api.hint(e, FOCUS_HINT[id], 3);
      if (id === 'clinic.exam' && !s.sim.clinic.queue.length) api.hint(e, 'Nobody’s waiting. Bring a poorly animal to the clinic with Grab.', 3.5);
    },
    leave(e) { const s = S(e); if (s.focus) setFocus(e, s, null); },
    // Back (Escape, the Outside button): a selection closes first, then the exam room, then the building
    back(e) { const s = S(e); if (s.selected) api.select(e, null); else if (s.focus === 'clinic.exam') setFocus(e, s, 'clinic'); else if (s.focus) api.fly(e, null); },
    // A grabbed animal let go over the clinic is checked in (v3 §9.1)
    admit(e, kind, i) {
      const s = S(e), r = s.sim.clinic.admit(kind, i);
      if (r === 'full') api.hint(e, 'The waiting room’s full.', 2.5);
      return r;
    },
    toggleDoor(e) {
      const c = S(e).sim.lay.coop; c.open = !c.open; // #60: was flipped by the view
      e.emit('door', { open: c.open });
      api.hint(e, c.open ? 'Coop door open.' : 'Coop door shut. Foxes stay out, chickens stay in.', 2);
    },
    // The `tool` command (bindPointer on #c, #54/#55/#61): rays, never hits, so the sim picks and a replay reproduces it.
    // A gesture belongs to its pointer and finishes with the tool it started with; `cancel` never taps.
    pointer(e, d) {
      const s = S(e), ph = d.phase;
      if (ph === 'down') {
        if (s.gesture?.down) endGesture(e, s); // a stray down (bindPointer cancels first): never leave a grab or hose on
        const g = s.gesture = { tool: s.tool, pointer: d.pointer, down: true, target: null };
        if (s.focus && s.focus !== 'clinic.exam' && OUTSIDE_TOOLS.has(g.tool)) { g.down = false; g.tool = 'none'; return api.hint(e, `Step outside to use the ${TOOL_LABEL[s.tool]}.`, 2); }
        return down(e, s, g, d);
      }
      const g = s.gesture; if (!g || g.pointer !== d.pointer) return;
      if (ph === 'move') { if (g.tool === 'hand' && d.orbit) g.target = null; else if (g.down) move(e, s, g, d); } // the view turned the Hand into an orbit: nothing to press
      else if (ph === 'up' || ph === 'cancel') { if (g.down) { g.down = false; lift(e, s, g); } }
      else if (ph === 'tap') {
        if (g.tool === 'hand' && !d.orbit) api.act(e, g.target);
        else if (g.tool === 'feed') toss(e, s, d.ray);
      }
    },
  };

  function setFocus(e, s, id) { s.focus = id; s.exam.drag = null; s.sim.clinic.open = id === 'clinic.exam'; e.emit('focus', { focus: id }); }
  // the exam room's gestures: press a tool on the pegboard, carry it (held at EXAM_DRAG.y), let it go on the patient
  function examDown(s, d) {
    let best = null; for (const p of PEG_BOX) { const h = rayBox(d.ray, p.box); if (h && (!best || h.t0 < best.t0)) best = { tool: p.tool, t0: h.t0 }; }
    if (best) { s.exam.drag = { tool: best.tool, at: null }; examMove(s, d); }
  }
  function examMove(s, d) {
    const D = s.exam.drag; if (!D) return;
    const X = CLINIC.x + CLINIC.spots.examTable.at[0] + EXAM_DRAG.front, r = d.ray; if (Math.abs(r[3]) < 1e-4) return;
    const t = (X - r[0]) / r[3]; if (t < 0) return;
    const R = CLINIC.examRoom, y = r[1] + r[4] * t, z = r[2] + r[5] * t;
    D.at = [X, Math.max(0.4, Math.min(2.4, y)), Math.max(CLINIC.z + R.z0 + 0.2, Math.min(CLINIC.z + R.z1, z))];
  }
  function examUp(e, s) {
    const D = s.exam.drag; s.exam.drag = null; if (!D?.at) return;
    const p = s.sim.clinic.patient();
    if (p && s.sim.clinic.exam.state === 'patient' && Math.hypot(D.at[1] - p.py - EXAM_DRAG.lift, D.at[2] - p.pz) < EXAM_DRAG.reach) s.sim.clinic.applyTool(D.tool);
  }
  function down(e, s, g, d) {
    const sim = s.sim;
    if (s.focus === 'clinic.exam') { g.tool = 'exam'; return examDown(s, d); }
    if (g.tool === 'hand') g.target = classify(sim, d.ray, s.focus);
    else if (g.tool === 'shoo') shoo(e, s, d.ray, true);
    else if (g.tool === 'hose') { if (aimHose(s, d)) e.emit('hose', { on: true }); }
    else if (g.tool === 'grab') {
      const t = grabTarget(sim, d.ray);
      if (!t) return api.hint(e, 'Touch a pig or a chicken to pick it up.', 1.8);
      if (t.kind === 'fox') { sim.flock.tapFox(); return; }
      if (t.kind === 'pig') sim.grab(t.i); else sim.flock.grab(t.i);
      s.grab = { kind: t.kind, u: 0, ray: [...d.ray], aim: d.aim ? [...d.aim] : null }; // copies (#72): the issued arrays belong to the caller
      moveGrab(s);
    }
  }
  function move(e, s, g, d) {
    if (g.tool === 'exam') return examMove(s, d);
    if (g.tool === 'shoo') shoo(e, s, d.ray, false);
    else if (g.tool === 'hose') aimHose(s, d);
    else if (g.tool === 'grab' && s.grab) { s.grab.ray = [...d.ray]; s.grab.aim = d.aim ? [...d.aim] : null; moveGrab(s); }
  }
  // up or cancel (the gesture stays for its tap)
  function lift(e, s, g) {
    const sim = s.sim;
    if (g.tool === 'exam') return examUp(e, s);
    if (g.tool === 'shoo') { sim.setDog(null, null, false); s.ring = null; }
    else if (g.tool === 'hose') { sim.setHose(null, null, false); e.emit('hose', { on: false }); }
    else if (g.tool === 'grab' && s.grab) {
      // let go over the clinic: checked in (it sits down in the waiting room); anywhere else: dropped (or thrown)
      const kind = s.grab.kind, i = kind === 'pig' ? sim.grabbed : sim.flock.grabbed, h = planeHit(s.grab.ray, GRAB_Y), c = sim.lay.clinic;
      (kind === 'pig' ? sim : sim.flock).release(); s.grab = null;
      if (h && i >= 0 && h.x > c.x0 - 0.3 && h.x < c.x1 + 0.3 && h.z > c.z0 - 0.3 && h.z < c.z1 + 0.6) api.admit(e, kind, i);
    }
  }
  // Ends the gesture in progress (a stray down): its lift, then no tap.
  function endGesture(e, s) {
    const g = s.gesture; if (!g) return;
    if (g.down) { g.down = false; lift(e, s, g); }
    s.gesture = null;
  }
  function shoo(e, s, ray, first) {
    const h = planeHit(ray, 0); if (!h) return;
    s.sim.setDog(h.x, h.z, true); s.ring = [h.x, h.z];
    if (first) e.emit('bark', { x: h.x, z: h.z });
  }
  // main.js aimHose: the nozzle stands 5.2 m back toward the camera (the ray origin) and 1.2 m to the side; it snaps when
  // the hose comes on and eases after (farm.ease). The sim's spray source is the nozzle as of this aim (as before).
  function aimHose(s, d) {
    const r = d.aim ?? d.ray, h = planeHit(r, 0); if (!h) return false;
    const H = s.hose, sim = s.sim;
    let bx = d.ray[0] - h.x, bz = d.ray[2] - h.z; const l2 = bx * bx + bz * bz;
    if (l2 < 1e-4) { bx = 0; bz = 1; } else { const l = Math.sqrt(l2); bx /= l; bz /= l; }
    H.tx = h.x; H.tz = h.z; H.bx = bx; H.bz = bz;
    const sx = -bz, sz = bx, nx = h.x + bx * 5.2 + sx * 1.2, nz = h.z + bz * 5.2 + sz * 1.2;
    if (!sim.hose.active) { H.nx = nx; H.nz = nz; }
    H.gx = nx; H.gz = nz;
    sim.setHose(h.x, h.z, true, H.nx, H.nz);
    return true;
  }
  // The held animal on the 1.7 m plane under the finger, blended toward the lifted aim's hit as u eases 0→1 (#54).
  function moveGrab(s) {
    const G = s.grab, a = planeHit(G.ray, GRAB_Y), b = G.aim && G.u > 0 ? planeHit(G.aim, GRAB_Y) : a;
    if (!a || !b) return;
    const x = a.x + (b.x - a.x) * G.u, z = a.z + (b.z - a.z) * G.u;
    if (G.kind === 'pig') s.sim.moveGrab(x, 1.7, z); else s.sim.flock.moveGrab(x, 1.4, z);
  }
  // main.js toss: rate-limited on engine time (#60), clamped to the field, thrown from back toward the camera.
  function toss(e, s, ray) {
    const sim = s.sim, lay = sim.lay, f = lay.field;
    if (e.time.sim - s.lastToss < TOSS_GAP - 1e-9) return; s.lastToss = e.time.sim;
    const h = planeHit(ray, 0); if (!h) return;
    const x = Math.max(f.x0 + 1, Math.min(f.x1 - 1, h.x)), z = Math.max(f.z0 + 1, Math.min(f.z1 - 1, h.z));
    let bx = ray[0] - x, bz = ray[2] - z; const l = Math.sqrt(bx * bx + bz * bz); if (l > 0) { bx /= l; bz /= l; } // zero stays zero
    const r = lay.run;
    if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) {
      if (!sim.flock.scatterGrain(x + bx * 2.5, 1.6, z + bz * 2.5, x, z)) return api.hint(e, 'Plenty of grain down already. Let them peck.', 2.2);
      e.emit('scatter', {}); return;
    }
    const food = sim.tossFood(x + bx * 5, 3.5, z + bz * 5, x, z);
    if (!food) return api.hint(e, 'That\u2019s all the snacks for now. Wait for the pigs to finish.', 2.5);
    e.emit('toss', { kind: food.kind });
  }
  // farm.ease (input.apply, before the commands; per step, not per frame, #60)
  function ease(s, dt) {
    const G = s.grab;
    if (G && G.aim && G.u < 1) { G.u = Math.min(1, G.u + dt / GRAB_EASE); moveGrab(s); }
    if (s.sim.hose.active) { const H = s.hose, k = Math.min(1, dt * 6); H.nx += (H.gx - H.nx) * k; H.nz += (H.gz - H.nz) * k; }
  }

  // Keys (input.apply, after the commands, as the old frame ran the pointer before the keys): 1–5, B, Escape.
  function keys(e, s) {
    const I = e.input.snapshot;
    for (let k = 0; k < TOOLS.length; k++) if (I[TOOLS[k]].pressed) api.setTool(e, TOOLS[k]);
    if (I.bell.pressed) api.ringBell(e);
    if (I.back.pressed) api.back(e);
  }

  const scene = {
    // [S-5, #25] known states, never stepping; (engine, opts) as jump calls them
    presets: {
      night: e => api.setNight(e, true),
      focus: (e, o) => api.enter(e, o.id),
      tool: (e, o) => api.setTool(e, o.name), selected: (e, o) => api.select(e, { kind: o.kind, i: o.i }),
    },
    enter(e, ctx) {
      const a = ctx.args ?? {};
      const s = Object.assign(ctx.state, {
        sim: createSim(ctx.world, { pigs: a.pigs ?? 22, seed: a.seed ?? e.seed, night: !!a.night, rounds: a.rounds ?? 0 }), // #58: boot's seed 1 = today's farm
        tool: 'hand', selected: null, focus: null, exam: { drag: null }, gesture: null, grab: null, ring: null, lastToss: -Infinity,
        hose: { tx: 0, tz: 0, gx: 0, gz: 0, nx: 0, nz: 0, bx: 0, bz: 1 },
      });
      // grab lift and hose nozzle easing, before the step's commands (#60)
      ctx.system('farm.ease', (e, dt) => ease(s, dt), { stage: 'input.apply', after: ['lh.input'], before: ['lh.commands'] });
      ctx.system('farm.keys', () => keys(e, s), { stage: 'input.apply', after: ['lh.commands'] });
      // the farm step around the engine's Rapier step (overview §4.4): think before lh.physics.step, settle after the events
      ctx.system('farm.think', () => s.sim.think(), { stage: 'physics.world', before: ['lh.physics.step'] });
      ctx.system('farm.settle', () => s.sim.settle(), { stage: 'physics.world', after: ['lh.physics.events'] });
      // #57: the sim's own queue, bridged in order, unfiltered, once per step
      ctx.system('farm.events', () => {
        const q = s.sim.events;
        for (let i = 0; i < q.length; i++) e.emit(q[i].type, q[i]);
        q.length = 0;
        const me = e.players[0], g = e.gameState, c = s.sim.counts; // [T-25]: written each step, allocation-free
        me.eggs = Math.min(0xffff, s.sim.flock.basket); g.night = s.sim.clock.night; for (let i = 0; i < c.length; i++) g.pens[i] = c[i];
      }, { stage: 'post' });
      ctx.command('tool', (e, d) => api.pointer(e, d));
      // the camera reached a building or left it (rig.js nearFocus): a building's id, or null for outside
      ctx.command('focus', (e, d) => {
        if (d.id === null) return api.leave(e);
        if (!BUILDINGS[d.id]) throw new Error(`pig-pens: focus: no building '${d.id}'`);
        api.enter(e, d.id);
      });
      ctx.command('tune', (e, d) => s.sim.sickness.tune(d.key, d.value)); // ?tune=key=value,… (main.js): SICK values (sickness.js)
      api.hint(e, START_HINT, 5);
    },
    // #69: the controls close over this scene's ctx.state, not e.scene.state (the main scene's)
    ui(u, e, ctx) {
      const s = ctx.state;
      u.choice({ id: 'tool', options: TOOLS.map(t => ({ value: t, label: TOOL_LABEL[t] })), get: () => s.tool,
        set: (v, e) => api.setTool(e, v) });
      u.toggle({ id: 'night', label: 'Night', get: () => s.sim.clock.night, set: (v, e) => api.setNight(e, v) });
      u.button({ id: 'bell', label: 'Ring the dinner bell', action: e => api.ringBell(e) });
      u.button({ id: 'close', label: 'Close', when: () => !!s.selected, action: e => api.select(e, null) });
      u.button({ id: 'back', label: 'Outside', when: () => !!s.focus, action: e => api.back(e) });
    },
  };
  return { scene, api };
}
