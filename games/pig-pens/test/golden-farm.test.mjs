// The engine path (lion-hawk 2e P2; since 3k the only path): with no input, headless(pigPensGame) must reproduce
// goldens/farm-seed3.json bit-for-bit (golden.test.mjs blesses it). Never blessed from here.
import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { headless, golden, assertFinite, checksum, canonical } from 'lion-hawk/test';
import { tool, tapAt, rayTo } from './rays.mjs';
import { pigPensGame } from '../src/game.sim.js';
import { FARM_EVENTS } from '../src/game/farm.js';
import { DT } from '../src/sim.js';
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
// Every tool through the engine path, seed 5: a Shoo drag, three Feed taps, a Hose drag with a lifted aim, a Grab and
// throw, the bell and nightfall; 1200 steps. New in 2e; re-bless only for a deliberate behaviour change.
function scripted() {
  const h = headless(pigPensGame(), { seed: 5, args: { pigs: 24 } }), sim = h.engine.scene.state.sim, lay = sim.lay;
  const pen = i => [lay.pens[i].cx, 0, lay.pens[i].cz];
  h.step(120);
  h.tap('farm.tool.shoo'); tool(h, 'down', pen(1));
  for (let k = 0; k < 60; k++) { tool(h, 'move', [pen(1)[0] + k * 0.1, 0, pen(1)[2]]); h.step(1); }
  tool(h, 'up', pen(1)); h.step(60);
  h.tap('farm.tool.feed'); for (let k = 0; k < 3; k++) { tapAt(h, [pen(4)[0] + k, 0, pen(4)[2]]); h.step(20); }
  h.tap('farm.tool.hose'); tool(h, 'down', pen(2), { aim: rayTo([pen(2)[0], 0, pen(2)[2] - 1]) });
  for (let k = 0; k < 60; k++) { tool(h, 'move', pen(2), { aim: rayTo([pen(2)[0] + k * 0.05, 0, pen(2)[2] - 1]) }); h.step(1); }
  tool(h, 'up', pen(2)); h.step(60);
  h.tap('farm.tool.grab'); const p = sim.pigs.find(q => !q.piglet), x0 = p.px, z0 = p.pz;
  tool(h, 'down', [p.px, p.py, p.pz]); h.step(30);
  for (let k = 0; k < 20; k++) { tool(h, 'move', [x0 + k * 0.3, 2, z0]); h.step(1); }
  tool(h, 'up', [x0 + 6, 2, z0]); h.tap('farm.bell'); h.tap('farm.night');
  h.step(1200 - h.time.step);
  return {
    state: { ...snapshot(sim), dog: [sim.dog.x, sim.dog.z], foods: sim.foods.length, handfuls: sim.flock.handfuls.length, night: sim.clock.night, grabbed: p.state },
    events: h.events.map(e => `${e.step}:${e.type}`),
  };
}
test('golden: every tool on the engine path (seed 5, 24 pigs, 1200 steps)', () => {
  golden(new URL('./goldens/farm-scene.json', import.meta.url), scripted());
});
test('determinism: two scripted runs give the same state, bit-exactly', () => {
  assert.equal(canonical(scripted(), { digits: 15 }), canonical(scripted(), { digits: 15 }));
});
