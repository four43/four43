// test/helpers/world.mjs — a headless World with Tractor Pickup's materials, sidecars and collision groups (3l). No tests here.
// testWorld() → { h, world, step(n = 1, pre = null) }: each step runs pre(world) in the scene step, before the engine's lh.physics.step,
// where the farm runs its tractor and train.
import R from '@dimforge/rapier3d-compat';
import { defineGame, actions, button } from 'lion-hawk/sim';
import { headless } from 'lion-hawk/test';
import MATERIALS from '../../src/defs/materials.js';
import PHYS from '../../baked/phys.json' with { type: 'json' };
import { PHYSICS } from '../../src/sim/ground.js';
await R.init();

export function testWorld() {
  let pre = null;
  const game = defineGame({ id: 'tp-test-world', sim: { hz: 60, maxCatchUp: 3 }, actions: actions({ go: button() }), start: 'pad',
    defs: { materials: MATERIALS, models: PHYS }, physics: { rapier: R, ...PHYSICS },
    scenes: { pad: { enter() {}, step(e, dt, ctx) { pre?.(ctx.world); } } } });
  const h = headless(game);
  return { h, world: h.world, step(n = 1, fn = null) { pre = fn; try { for (let i = 0; i < n; i++) h.step(1); } finally { pre = null; } } };
}
