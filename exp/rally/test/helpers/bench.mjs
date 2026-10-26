// Test helpers for the World era (lion-hawk phase 3): benchSim(opts) is a Sim on a one-scene engine with Rally's
// physics, stepped one engine step per sim.step() (the same order as the stage: rally.vehicle, Rapier, rally.after);
// game(opts) is rallyGame with the initialised Rapier module. Callers `await R.init()` first.
import R from '@dimforge/rapier3d-compat';
import { createEngine, defineGame } from 'lion-hawk/sim';
import { rallyGame, rallyPhysics } from '../../src/game.sim.js';
import MATERIALS from '../../src/defs/materials.js';
import PHYS from '../../baked/phys.json' with { type: 'json' };
import { Sim, HZ } from '../../src/sim.js';

export const game = (opts = {}) => rallyGame({ rapier: R, ...opts });

export function benchSim(opts = {}) {
  let sim = null, engine = null;
  engine = createEngine(defineGame({
    id: 'rally-bench', sim: { hz: HZ }, start: 'bench', defs: { materials: MATERIALS, models: PHYS }, physics: rallyPhysics(R),
    scenes: { bench: { enter(e, ctx) {
      sim = new Sim(ctx.world, { ...opts, step: () => engine.stepN(1) });
      ctx.system('rally.vehicle', () => sim.preStep(), { stage: 'physics.world', before: ['lh.physics.step'] });
      ctx.system('rally.after', () => sim.postStep(), { stage: 'physics.world', after: ['lh.physics.events'] });
    } } },
  }));
  sim.engine = engine;
  return sim;
}
