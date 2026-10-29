// Pig Pens' sim half (lion-hawk 2e, [S-1]…[S-5]): actions, the `farm` main scene, the JSON-safe state and the debug
// extras. Never touches three.js or the DOM. The caller initialises Rapier (`await R.init()`) before createEngine/boot (#6);
// the engine creates the World per scene (S-3) on Pig Pens' materials, baked sidecars and collision groups.
import R from '@dimforge/rapier3d-compat';
import { defineGame, actions, button, F } from 'lion-hawk/sim';
import MATERIALS from './defs/materials.js';
import PHYS from '../baked/phys.json' with { type: 'json' };
import { DT, GROUPS } from './sim.js';
import { REGION } from './layout.js';
import { makeFarm } from './game/farm.js';

// hand…grab are keys 1–5, bell B, back Escape.
export const ACTIONS = actions({
  hand: button(), shoo: button(), feed: button(), hose: button(), grab: button(),
  bell: button(), back: button(),
});

// JSON-safe summary for tests and the hook (#28: the createSim object stays in ctx.state, never here).
function state(e) {
  const s = e.scene.state, sim = s.sim;
  if (!sim) return {};
  const f = sim.flock;
  return {
    tool: s.tool, selected: s.selected ? { ...s.selected } : null,
    night: sim.clock.night, door: sim.lay.coop.open, gates: sim.lay.gates.map(g => g.open), focus: s.focus,
    vet: { x: sim.vet.x, z: sim.vet.z, state: sim.vet.state, node: sim.vet.node },
    basket: f.basket, eggs: f.eggs.length, foods: sim.foods.length, foodLeft: sim.foodCap - sim.foods.length,
    dog: { active: sim.dog.active, x: sim.dog.x, z: sim.dog.z }, hose: { active: sim.hose.active, x: sim.hose.x, z: sim.hose.z },
    ring: s.ring ? [s.ring[0], s.ring[1]] : null, grabbed: { pig: sim.grabbed, bird: f.grabbed },
    counts: [...sim.counts], time: sim.time,
    sick: [...sim.pigs.filter(p => p.sick).map(p => ({ kind: 'pig', i: p.i, ailment: p.sick.ailment })), ...f.birds.filter(b => b.sick).map(b => ({ kind: 'bird', i: b.i, ailment: b.sick.ailment }))],
    clinic: { queue: sim.clinic.queue.map(q => ({ ...q })), exam: sim.clinic.exam.state, drag: s.exam?.drag?.tool ?? null,
      props: Object.fromEntries(Object.entries(sim.clinic.props).map(([id, p]) => [id, p.state])) },
  };
}

// The page's Rapier start (#6): main.js awaits this before boot, so only this defineGame file imports Rapier.
export const initPhysics = () => R.init();

export function pigPensGame() {
  const { scene: farm, api } = makeFarm();
  // → window.engine.debug
  const debug = e => ({
    get sim() { return e.scene.state.sim; }, get farm() { return e.scene.state; },
    tool: name => api.setTool(e, name), select: sel => api.select(e, sel ?? null),
    night: (on = true) => api.setNight(e, on),
    // v3 §8.5: make an animal poorly / better through the sim (kind 'pig' | 'bird')
    sicken: (kind, i, ailment) => { const sim = e.scene.state.sim; return sim.sickness.sicken(kind, kind === 'pig' ? sim.pigs[i] : sim.flock.birds[i], ailment, 'debug'); },
    cure: (kind, i) => { const sim = e.scene.state.sim; return sim.sickness.cure(kind, kind === 'pig' ? sim.pigs[i] : sim.flock.birds[i]); },
    // 2.9.0: send Dr. Emmy to one of her stops (clinic.js VET_STOPS: 'penEast', 'run', …) now
    vetTo: stop => e.scene.state.sim.vet.send(stop),
  });
  return defineGame({
    id: 'pig-pens', sim: { hz: 1 / DT, maxCatchUp: 4, maxFrame: 0.1 }, actions: ACTIONS, start: 'farm',
    // [T-25] state homes (lion-hawk §2.2): the basket is player 1's; day or night and the pigs in each region (lay.region: the pens, the aisle, the field, the barn) are the farm's
    player: { eggs: F.uint(2) }, gameState: { night: F.bool(), pens: F.list(F.uint(1), REGION.count, REGION.count) },
    defs: { materials: MATERIALS, models: PHYS },
    physics: { rapier: R, gravity: [0, -9.81, 0], groups: GROUPS }, // GROUPS' order is 2.1.0's collision bits (D9: the game passes Rapier)
    scenes: { farm }, state, debug,
  });
}

export default pigPensGame();
