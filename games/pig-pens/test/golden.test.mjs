// Characterisation golden (lion-hawk phase 0, on the engine path since phase 3k): 20 s of a 24-pig farm on seed 3
// must keep producing the same world. A deliberate behaviour change re-blesses it: LH_BLESS=1 npm test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { golden, assertFinite, canonical, checksum } from 'lion-hawk/test';
import { FARM_EVENTS } from '../src/game/farm.js';
import { farmSim } from './farmSim.mjs';

const STEPS = 1200;
const snapshot = sim => ({
  counts: [...sim.counts],
  troughs: sim.troughs.map(t => t.level),
  pigs: sim.pigs.map(p => ({ x: p.px, z: p.pz, state: p.state, hunger: p.hunger })),
});
function run() {
  const sim = farmSim({ pigs: 24, seed: 3 }), trail = [];
  for (let i = 0; i < STEPS; i++) { sim.step(); if (i % 60 === 59) { assertFinite(snapshot(sim), `step${i}`); trail.push(checksum(snapshot(sim))); } }
  const events = sim.h.events.filter(e => !FARM_EVENTS.has(e.type)).map(e => `${e.step}:${e.type}`);
  return { state: snapshot(sim), events, trail };
}
test('golden: seed 3, 24 pigs, 1200 steps', () => { golden(new URL('./goldens/farm-seed3.json', import.meta.url), run()); });
test('determinism: two runs in one process give the same state, bit-exactly (T-10)', () => {
  assert.equal(canonical(run(), { digits: 15 }), canonical(run(), { digits: 15 }));
});
