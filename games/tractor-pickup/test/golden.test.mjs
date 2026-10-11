// Characterisation golden (lion-hawk phase 0): a scripted 15 s drive on seed 14 must keep producing the same
// world. A deliberate behaviour change re-blesses it: LH_BLESS=1 npm test.
import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { golden, assertFinite, checksum } from 'lion-hawk/test';
import { createGame } from '../src/sim/game.js';
await RAPIER.init();

const STEPS = 900;
const inputAt = i => i < 120 ? { thr: 0, steer: 0, horn: false }
  : i < 600 ? { thr: 1, steer: Math.sin(i / 60) * 0.6, horn: i % 240 === 0 }
  : { thr: -0.5, steer: 0.3, horn: false };
const body = b => ({ p: b.translation(), q: b.rotation(), v: b.linvel() });
const snapshot = g => ({
  mode: g.mode, landed: g.load.landed(),
  tractor: body(g.tractor.body), cars: g.train.cars.map(c => body(c.body)),
  animals: g.herd.animals.map(a => ({ id: a.id, type: a.type, state: a.state, x: a.x, z: a.z })),
});
function run() {
  const g = createGame(RAPIER, { seed: 14, power: 'medium' }), events = [];
  for (let i = 0; i < STEPS; i++) {
    for (const e of g.step(inputAt(i))) events.push(`${i}:${e.type}`);
    if (i % 60 === 59) assertFinite(snapshot(g), `step${i}`);
  }
  return { state: snapshot(g), events };
}

test('golden: seed 14 scripted drive, 900 steps', () => {
  golden(new URL('./goldens/drive-seed14.json', import.meta.url), run());
});
test('determinism: two runs in one process give the same checksum (T-10)', () => {
  assert.equal(checksum(run()), checksum(run()));
});
