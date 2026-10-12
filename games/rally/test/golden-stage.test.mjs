// Characterisation golden through the ENGINE path (lion-hawk phase 2c): headless(rallyGame) on a fixed seed, the autopilot
// policy driving 20 s through the stage scene (Drive tap → ready → countdown → running). Re-bless: LH_BLESS=1 npm test.
import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { headless, golden, assertFinite, canonical, checksum } from 'lion-hawk/test';
import { rallyGame } from '../src/game.sim.js';
import { DT } from '../src/sim.js';
await R.init();

const STEPS = Math.round(20 / DT), EVERY = 240;
const snapshot = (h) => {
  const s = h.engine.scene.state, c = s.sim.car, b = c.body;
  return { p: b.translation(), q: b.rotation(), v: b.linvel(), speed: c.speed, gear: c.gear, rpm: c.rpm,
    progress: { p: s.progress.p, s: s.progress.s, next: s.progress.next, started: s.progress.started },
    stage: { phase: s.phase, time: s.time, clockOn: s.clockOn } };
};
function run() {
  const h = headless(rallyGame(), { seed: 5, args: { settings: { mode: 'stage', seed: 'golden', world: 'stage', theme: 'summer', assist: true } } });
  h.tap('title.drive');
  const trail = [];
  for (let i = 0; i < STEPS; i++) {
    h.step(1, 'autopilot');
    if (i % EVERY === EVERY - 1) { const s = snapshot(h); assertFinite(s, `step${i}`); trail.push(checksum(s)); }
  }
  return { state: snapshot(h), trail };
}

test('golden: stage scene on the engine path, 20 s of autopilot after Drive', () => {
  const r = run();
  assert.equal(r.state.stage.phase, 'running');
  assert.ok(r.state.speed > 5 && r.state.progress.p > 20, 'the car has driven');
  golden(new URL('./goldens/stage-scene.json', import.meta.url), r);
});
test('determinism: two engine-path runs give the same state, bit-exactly', () => {
  assert.equal(canonical(run(), { digits: 15 }), canonical(run(), { digits: 15 }));
});
