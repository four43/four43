// Rally's sim half (lion-hawk phase 2c, [S-1]…[S-5]): actions, the `stage` main scene with title/pause/results/settings
// overlays, the autopilot policy, the JSON-safe state and the debug extras. Never touches three.js or the DOM.
// The entry and tests pass Rapier in (`rallyGame({ rapier })`, D9), initialised (`await R.init()`) before createEngine/boot (#6).
import { defineGame, actions, axis, button } from 'lion-hawk/sim';
import { HZ } from './sim.js';
import MATERIALS from './defs/materials.js';
import PHYS from '../baked/phys.json' with { type: 'json' };
import { makeStage } from './game/stage.js';
import { makeOverlays } from './game/overlays.js';
import { makeBests } from './game/bests.js';
import { autopilotPolicy } from './game/autopilot.js';

// steer +1 = left; resetHold is the touch Reset chip (tap = reset, held 0.6 s = restart).
export const ACTIONS = actions({
  steer: axis(), throttle: axis(), brake: axis(), handbrake: axis(),
  shiftUp: button(), shiftDown: button(), reset: button(), resetAll: button(), resetHold: button(),
  camera: button(), debug: button(), pause: button(), confirm: button(),
});

// JSON-safe summary for tests and the hook (#28: the Sim stays in ctx.state, never here).
function state(e) {
  const s = e.scene.state;
  if (!s.sim?.car) return { phase: s.phase ?? null };
  const car = s.sim.car, b = car.body.translation(), P = s.progress;
  return {
    phase: s.phase, mode: s.mode.id, seed: s.settings.seed, kind: s.sim.world.kind,
    time: s.time, lapTime: s.lapTime, laps: s.laps.length, countN: s.countN,
    p: P ? P.p : null, next: P ? P.next : null, missed: P ? P.missed : null,
    speed: car.speed, gear: car.gear, rpm: car.rpm, hold: car.hold, x: b.x, y: b.y, z: b.z,
    simTime: s.sim.time, cam: s.cam, wheels: s.wheels,
  };
}

// Collision groups: declaration order gives today's bits (ground 1, prop 2, car 4, ray 8; the wheel rays are members of
// 'ray' and see only 'ground').
export const GROUPS = ['ground', 'prop', 'car', 'ray'];
export const rallyPhysics = rapier => ({ rapier, gravity: [0, -9.81, 0], groups: GROUPS });

export function rallyGame({ rapier, bests = makeBests() } = {}) {
  if (!rapier) throw new Error('rallyGame: pass { rapier } (the initialised @dimforge/rapier3d-compat module, D9)');
  const { scene: stage, api } = makeStage({ bests });
  const { title, pause, results, settings } = makeOverlays(api);
  // → window.engine.debug. The HUD fakes emit events or run the moved handler; they show after the next step's flush.
  const debug = e => ({
    get sim() { return e.scene.state.sim; }, get settings() { return e.scene.state.settings; },
    // name: title | loading | ready | countdown | running | paused | results | settings | nearFinish | teleport (#33: rebuilds the world)
    screen(name, opts = {}) {
      const s = e.scene.state;
      e.jump('stage', name, opts, { settings: { ...s.settings, ...(opts.mode ? { mode: opts.mode } : {}) }, pad: s.pad });
    },
    nearFinish: (d = 40) => api.nearFinish(e, d), teleport: p => api.teleport(e, p),
    finish: o => api.finish(e, o),
    split: (index = 0, delta = -0.42) => e.emit('split', { index, of: e.scene.state.progress?.cps.length ?? 10, time: 30 * (index + 1), delta }),
    lap: (valid = true) => api.handle(e, { type: 'line', valid }),
    missed: (index = 1) => api.handle(e, { type: 'missed', index }),
    blocked: (index = 1) => api.handle(e, { type: 'blocked', index }),
    count: (n = 3) => e.emit('count', { n }),
  });
  return defineGame({
    id: 'rally', sim: { hz: HZ, maxCatchUp: 12, maxFrame: 0.1 }, actions: ACTIONS, start: 'stage',
    defs: { materials: MATERIALS, models: PHYS }, physics: rallyPhysics(rapier),
    scenes: { stage, title, pause, results, settings }, policies: { autopilot: autopilotPolicy }, state, debug,
  });
}

