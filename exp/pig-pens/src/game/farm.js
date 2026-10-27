// The farm scene (lion-hawk 2e, [S-1]…[S-5], field notes #4, #28, #57, #58): one main scene owns the createSim world
// (pigs, dog, chickens, fox, gates, coop, day/night) for the life of the page. The flow state main.js kept
// in its closure lives in ctx.state ([S-4], #4): the tool, the selection and the per-gesture state.
// Step order: lh.ui → lh.input → farm.ease → lh.commands → farm.keys → lh.scene → farm.think → lh.physics.step → read →
// events → farm.settle → farm.events → events.flush. The engine owns the scene's World (S-3) and steps Rapier.
import { createSim } from '../sim.js';
import { planeHit, classify, grabTarget } from './pick.js';

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
export const FARM_EVENTS = new Set(['hint', 'select', 'door', 'bark', 'hose', 'toss', 'scatter']);

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
      if (n) api.hint(e, 'Night time. The chickens are off to bed. Shut the coop door once they’re in.', 4.5);
      else api.hint(e, s.sim.lay.coop.open ? 'Good morning!' : 'Good morning! Open the coop door to let the chickens out.', 3.5);
    },
    // What a Hand tap does with the target picked at pointer down (#55; main.js act).
    act(e, t) {
      const s = S(e), sim = s.sim;
      if (!t) return api.select(e, null);
      if (t.kind === 'egg') { sim.flock.collectEgg(t.id); return; }
      if (t.kind === 'gate') { const g = sim.lay.gates[t.id]; sim.setGate(t.id, !g.open); api.hint(e, g.open ? 'Gate open.' : 'Gate shut.', 1.2); return; }
      if (t.kind === 'fox' && sim.flock.fox.carrying) { sim.flock.tapFox(); return; }
      if (t.kind === 'door') return api.toggleDoor(e);
      api.select(e, t);
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

  function down(e, s, g, d) {
    const sim = s.sim;
    if (g.tool === 'hand') g.target = classify(sim, d.ray);
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
    if (g.tool === 'shoo') shoo(e, s, d.ray, false);
    else if (g.tool === 'hose') aimHose(s, d);
    else if (g.tool === 'grab' && s.grab) { s.grab.ray = [...d.ray]; s.grab.aim = d.aim ? [...d.aim] : null; moveGrab(s); }
  }
  // up or cancel (the gesture stays for its tap)
  function lift(e, s, g) {
    const sim = s.sim;
    if (g.tool === 'shoo') { sim.setDog(null, null, false); s.ring = null; }
    else if (g.tool === 'hose') { sim.setHose(null, null, false); e.emit('hose', { on: false }); }
    else if (g.tool === 'grab' && s.grab) { (s.grab.kind === 'pig' ? sim : sim.flock).release(); s.grab = null; }
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
    if (I.back.pressed) api.select(e, null);
  }

  const scene = {
    // [S-5, #25] known states, never stepping; (engine, opts) as jump calls them
    presets: {
      night: e => api.setNight(e, true),
      tool: (e, o) => api.setTool(e, o.name), selected: (e, o) => api.select(e, { kind: o.kind, i: o.i }),
    },
    enter(e, ctx) {
      const a = ctx.args ?? {};
      const s = Object.assign(ctx.state, {
        sim: createSim(ctx.world, { pigs: a.pigs ?? 48, seed: a.seed ?? e.seed, night: !!a.night }), // #58: boot's seed 1 = today's farm
        tool: 'hand', selected: null, gesture: null, grab: null, ring: null, lastToss: -Infinity,
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
        me.eggs = Math.min(0xffff, s.sim.flock.basket); g.night = s.sim.clock.night; for (let i = 0; i < 8; i++) g.pens[i] = c[i];
      }, { stage: 'post' });
      ctx.command('tool', (e, d) => api.pointer(e, d));
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
    },
  };
  return { scene, api };
}
