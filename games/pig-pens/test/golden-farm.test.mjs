// The engine path (lion-hawk 2e P2): with no input, headless(pigPensGame) steps the same createSim the phase-0 golden
// drives directly, so it must reproduce goldens/farm-seed3.json bit-for-bit. Never blessed from here.
import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { headless, golden, assertFinite, checksum } from 'lion-hawk/test';
import { pigPensGame } from '../src/game.sim.js';
import { FARM_EVENTS } from '../src/game/farm.js';
import { createSim, DT } from '../src/sim.js';
await R.init();

const STEPS = 1200;
const snapshot = sim => ({
  counts: [...sim.counts],
  troughs: sim.troughs.map(t => t.level),
  pigs: sim.pigs.map(p => ({ x: p.px, z: p.pz, state: p.state, hunger: p.hunger })),
});
function run() {
  const h = headless(pigPensGame(), { seed: 3, args: { pigs: 24 } }), sim = h.engine.scene.state.sim, trail = [];
  for (let i = 0; i < STEPS; i++) {
    h.step(1);
    if (i % 60 === 59) { assertFinite(snapshot(sim), `step${i}`); trail.push(checksum(snapshot(sim))); }
  }
  const events = h.events.filter(e => !FARM_EVENTS.has(e.type)).map(e => `${e.step}:${e.type}`);
  return { state: snapshot(sim), events, trail };
}

test('the sim rate is the herd step', () => { assert.equal(1 / pigPensGame().sim.hz, DT); });
test('the farm scene reproduces the phase-0 sim golden (seed 3, 24 pigs, 1200 steps) bit-for-bit', () => {
  golden(new URL('./goldens/farm-seed3.json', import.meta.url), run(), { bless: false });
});
// The golden rounds to 6 digits; this compares the engine path with a direct createSim run at full precision.
test('the engine path and a direct createSim run agree to the last bit', () => {
  const sim = createSim(R, { pigs: 24, seed: 3 }), events = [];
  for (let i = 0; i < STEPS; i++) { sim.step(); for (const e of sim.events.splice(0)) events.push(`${i}:${e.type}`); }
  const got = run();
  assert.deepEqual(got.events, events);
  assert.deepStrictEqual(got.state, snapshot(sim)); // numbers compared with Object.is: every bit
});
