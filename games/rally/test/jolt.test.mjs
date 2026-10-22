// The car's suspension jolt (rally-spec R7-6), read only by the controller rumble: a decaying peak of each wheel's
// compression speed, so a landing between two rendered frames is still there when the view reads it.
import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { benchSim } from './helpers/bench.mjs';
import { DETECT } from '../src/rumble.js';

const jolt = sim => Math.max(...sim.car.wheels.map(w => w.jolt));
function drop(y, steps = 480) {
  const sim = benchSim({ car: 'awd', surface: 'tarmac', pos: { x: 0, y, z: 0 } }), trace = [];
  for (let i = 0; i < steps; i++) { sim.step(); trace.push(jolt(sim)); }
  sim.dispose();
  return trace;
}

test('a drop lands as a jolt that grows with the height and outlives a rendered frame; a settle stays under the threshold', async () => {
  await R.init();
  const settle = drop(0.6), low = drop(1.5), high = drop(3);
  assert.ok(Math.max(...settle) < DETECT.impact.on, `settling after a spawn peaks ${Math.max(...settle).toFixed(2)}`);
  const pl = Math.max(...low), ph = Math.max(...high);
  assert.ok(pl > 3 && ph > pl, `1.5 m: ${pl.toFixed(2)}, 3 m: ${ph.toFixed(2)} m/s`);
  const at = high.indexOf(ph);
  assert.ok(high[at + 12] > 0.4 * ph, 'still there 50 ms later (the compression itself is over in ~33 ms: a 30 fps frame could miss it)');
  assert.ok(high[at + 120] < DETECT.impact.on, 'gone half a second later');
});

test('driving on the flat pad: no impact-sized jolt', async () => {
  await R.init();
  const sim = benchSim({ car: 'awd', surface: 'tarmac' });
  for (let i = 0; i < 240; i++) sim.step(); // settle
  sim.car.input.throttle = 0.6;
  let peak = 0;
  for (let i = 0; i < 720; i++) { sim.step(); peak = Math.max(peak, jolt(sim)); }
  sim.dispose();
  assert.ok(peak < DETECT.impact.on, `peak ${peak.toFixed(2)} m/s`);
});
