// The farm scene (lion-hawk 2e, [S-1]…[S-5], field notes #4, #28, #57, #58): one main scene owns the createSim world
// (pigs, dog, chickens, fox, tractor, gates, coop, day/night) for the life of the page. The flow state main.js kept
// in its closure lives in ctx.state ([S-4], #4): the tool, the selection, drive mode and the per-gesture state.
// Step order: lh.input → farm.ease → lh.commands → farm.keys → lh.scene → farm.sim → farm.events → events.flush.
// With no input nothing here touches the sim, so the scene steps exactly the createSim the phase-0 golden drives.
import { createSim } from '../sim.js';

export const TOOLS = ['hand', 'shoo', 'feed', 'hose', 'grab'];
export const TOOL_LABEL = { hand: 'Hand', shoo: 'Shoo', feed: 'Feed', hose: 'Hose', grab: 'Grab' };
export const TOOL_HINT = {
  hand: 'Tap an animal to meet it. Tap a gate or the coop door to open or shut it. Hold the tractor to drive.',
  shoo: 'Drag to send the dog. Pigs and chickens scatter from it.',
  feed: 'Tap to toss a snack. Tap in the chicken run to scatter grain.',
  hose: 'Drag to spray. Muddy pigs come for a bath.',
  grab: 'Drag a pig or a chicken to lift it. Flick to throw.',
};
export const START_HINT = 'Tap an animal to meet it. Hold the tractor to drive. Two fingers turn, pan and zoom.';
export const PRESS = 0.75, TAP = { move: 12, seconds: 0.45 }, ORBIT_PX = 10, LIFT = { hose: 55, grab: 80 };
export const GRAB_EASE = 0.18, GRAB_Y = 1.7, TOSS_GAP = 0.18, STEER_POW = 1.4;
// The farm's own event types (never a createSim type), so the engine-path golden can filter them out (#57).
export const FARM_EVENTS = new Set(['hint', 'select', 'door', 'bark', 'hose', 'toss', 'scatter', 'drive']);

// The Hand is held down on the tractor (the view shows the filling ring).
export const pressing = s => s.gesture?.tool === 'hand' && s.gesture.down && s.gesture.target?.kind === 'tractor' && !s.driving;

export function makeFarm({ R }) {
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
    // Drive mode is farm sub-state, not a scene: the world and the camera survive it. P4 adds the keys and presets.
    enterDrive(e) {
      const s = S(e); if (s.driving) return;
      s.driving = true; s.sim.tractor.driven = true; api.select(e, null);
      if (s.sim.dog.active) s.sim.setDog(null, null, false);
      e.emit('drive', { on: true }); api.hint(e, 'Push the stick to drive. Honk to clear the way.', 4);
    },
    exitDrive(e) {
      const s = S(e); if (!s.driving) return;
      s.driving = false; s.sim.tractor.driven = false; s.sim.tractor.setInput(0, 0);
      e.emit('drive', { on: false }); // the view lifts the camera
    },
  };

  // Keys (input.apply, after the commands, as the old frame ran the pointer before the keys). Not driving: 1–5, B, Escape.
  function keys(e, s) {
    const I = e.input.snapshot;
    if (s.driving) return; // P4: drive input, horn, Get out, auto-right
    for (let k = 0; k < TOOLS.length; k++) if (I[TOOLS[k]].pressed) api.setTool(e, TOOLS[k]);
    if (I.bell.pressed) api.ringBell(e);
    if (I.back.pressed) api.select(e, null);
  }

  const scene = {
    presets: {},
    enter(e, ctx) {
      const a = ctx.args ?? {};
      const s = Object.assign(ctx.state, {
        sim: createSim(R, { pigs: a.pigs ?? 48, seed: a.seed ?? e.seed, night: !!a.night }), // #58: boot's seed 1 = today's farm
        tool: 'hand', selected: null, driving: false, gesture: null, grab: null, ring: null, lastToss: -Infinity,
        hose: { tx: 0, tz: 0, gx: 0, gz: 0, nx: 0, nz: 0, bx: 0, bz: 1 },
      });
      // grab lift and hose nozzle easing, before the step's commands (#60); P3 fills it in
      ctx.system('farm.ease', () => {}, { stage: 'input.apply', after: ['lh.input'], before: ['lh.commands'] });
      ctx.system('farm.keys', () => keys(e, s), { stage: 'input.apply', after: ['lh.commands'] });
      ctx.system('farm.sim', () => s.sim.step(), { stage: 'physics.world' });
      // #57: the sim's own queue, bridged in order, unfiltered, once per step
      ctx.system('farm.events', () => {
        const q = s.sim.events;
        for (let i = 0; i < q.length; i++) e.emit(q[i].type, q[i]);
        q.length = 0;
      }, { stage: 'post' });
      api.hint(e, START_HINT, 5);
    },
    exit(e, ctx) { ctx.state.sim.world.free(); }, // [S-3]
    ui(u) {
      u.choice({ id: 'tool', options: TOOLS.map(t => ({ value: t, label: TOOL_LABEL[t] })), get: e => e.scene.state.tool,
        set: (v, e) => api.setTool(e, v), when: e => !e.scene.state.driving });
      u.toggle({ id: 'night', label: 'Night', get: e => e.scene.state.sim.clock.night, set: (v, e) => api.setNight(e, v) });
      u.button({ id: 'bell', label: 'Ring the dinner bell', action: e => api.ringBell(e) });
      u.button({ id: 'close', label: 'Close', when: e => !!e.scene.state.selected, action: e => api.select(e, null) });
      u.button({ id: 'exit', label: 'Get out', when: e => e.scene.state.driving, action: e => api.exitDrive(e) });
    },
  };
  return { scene, api };
}
