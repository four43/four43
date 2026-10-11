// Characterisation golden (lion-hawk phase 0): 20 s of a 24-pig farm on seed 3 must keep producing the same
// world. A deliberate behaviour change re-blesses it: LH_BLESS=1 npm test.
import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { golden, assertFinite, checksum } from 'lion-hawk/test';
import { createSim } from '../src/sim.js';
await RAPIER.init();

const STEPS = 1200;
const snapshot = sim => ({
  counts: [...sim.counts],
  troughs: sim.troughs.map(t => t.level),
  pigs: sim.pigs.map(p => ({ x: p.px, z: p.pz, state: p.state, hunger: p.hunger })),
});
function run() {
  const sim = createSim(RAPIER, { pigs: 24, seed: 3 }), events = [];
  for (let i = 0; i < STEPS; i++) {
    sim.step();
    for (const e of sim.events.splice(0)) events.push(`${i}:${e.type}`);
    if (i % 60 === 59) assertFinite(snapshot(sim), `step${i}`);
  }
  return { state: snapshot(sim), events };
}

test('golden: seed 3, 24 pigs, 1200 steps', () => {
  golden(new URL('./goldens/farm-seed3.json', import.meta.url), run());
});
test('determinism: two runs in one process give the same checksum (T-10)', () => {
  assert.equal(checksum(run()), checksum(run()));
});
