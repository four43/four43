// Rally's sim half (lion-hawk phase 2c, [S-1]…[S-5]): actions, the `stage` main scene with title/pause/results/settings
// overlays, the autopilot policy, the JSON-safe state and the debug extras. Never touches three.js or the DOM.
// The caller initialises Rapier (`await R.init()`) before createEngine/boot (#6).
import R from '@dimforge/rapier3d-compat';
import { defineGame, actions, axis, button } from 'lion-hawk/sim';
import { DT } from './sim.js';
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

export function rallyGame({ bests = makeBests() } = {}) {
  const { scene: stage, api } = makeStage({ R, bests });
  const { title, pause, results, settings } = makeOverlays(api);
  // → window.engine.debug (R3 adds screen and the HUD fakes)
  const debug = e => ({
    get sim() { return e.scene.state.sim; }, get settings() { return e.scene.state.settings; },
    nearFinish: (d = 40) => api.nearFinish(e, d), teleport: p => api.teleport(e, p),
  });
  return defineGame({
    id: 'rally', sim: { hz: 1 / DT, maxCatchUp: 12, maxFrame: 0.1 }, actions: ACTIONS, start: 'stage',
    scenes: { stage, title, pause, results, settings }, policies: { autopilot: autopilotPolicy }, state, debug,
  });
}

export default rallyGame();
