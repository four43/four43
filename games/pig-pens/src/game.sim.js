// Pig Pens' sim half (lion-hawk 2e, [S-1]…[S-5]): actions, the `farm` main scene, the JSON-safe state and the debug
// extras. Never touches three.js or the DOM. The caller initialises Rapier (`await R.init()`) before createEngine/boot (#6).
import R from '@dimforge/rapier3d-compat';
import { defineGame, actions, axis, button } from 'lion-hawk/sim';
import { DT } from './sim.js';
import { makeFarm, pressing } from './game/farm.js';

// throttle +1 = forward, steer +1 = left; hand…grab are keys 1–5, bell B, back Escape, getOut E (driving), horn H.
export const ACTIONS = actions({
  throttle: axis(), steer: axis(),
  hand: button(), shoo: button(), feed: button(), hose: button(), grab: button(),
  bell: button(), back: button(), getOut: button(), horn: button(),
});

// JSON-safe summary for tests and the hook (#28: the createSim object stays in ctx.state, never here).
function state(e) {
  const s = e.scene.state, sim = s.sim;
  if (!sim) return {};
  const f = sim.flock, t = sim.tractor;
  return {
    tool: s.tool, driving: s.driving, selected: s.selected ? { ...s.selected } : null,
    night: sim.clock.night, door: sim.lay.coop.open, gates: sim.lay.gates.map(g => g.open),
    basket: f.basket, eggs: f.eggs.length, foods: sim.foods.length, foodLeft: sim.foodCap - sim.foods.length,
    dog: { active: sim.dog.active, x: sim.dog.x, z: sim.dog.z }, hose: { active: sim.hose.active, x: sim.hose.x, z: sim.hose.z },
    ring: s.ring ? [s.ring[0], s.ring[1]] : null, grabbed: { pig: sim.grabbed, bird: f.grabbed }, pressing: pressing(s),
    tractor: { x: t.x, z: t.z, speed: t.speed, driven: t.driven, thr: t.inThr, steer: t.inSteer },
    counts: [...sim.counts], time: sim.time,
  };
}

export function pigPensGame() {
  const { scene: farm, api } = makeFarm({ R });
  // → window.engine.debug
  const debug = e => ({
    get sim() { return e.scene.state.sim; }, get farm() { return e.scene.state; },
    tool: name => api.setTool(e, name), select: sel => api.select(e, sel ?? null),
    drive: () => api.enterDrive(e), night: (on = true) => api.setNight(e, on),
  });
  return defineGame({
    id: 'pig-pens', sim: { hz: 1 / DT, maxCatchUp: 4, maxFrame: 0.1 }, actions: ACTIONS, start: 'farm',
    scenes: { farm }, state, debug,
  });
}

export default pigPensGame();
