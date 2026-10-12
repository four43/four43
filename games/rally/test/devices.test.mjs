// Rally's keyboard ramps (lion-hawk 2c-rally R5/R6, field note #44): the old Controls capped the frame time at 0.1 s, so
// a frame hitch can't snap a pedal or the steering to full.
import test from 'node:test';
import assert from 'node:assert/strict';
import { RAMPS } from '../src/devices.js';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);

test('pedal ramps: same rates as the old Controls, dt capped at 0.1 s', () => {
  const { throttle, brake } = RAMPS;
  assert.equal(typeof throttle, 'function'); assert.equal(typeof brake, 'function');
  near(throttle(0, 1, 0.02, {}), 0.1); // rise 5 /s
  near(throttle(0.5, 0, 0.02, {}), 0.34); // fall 8 /s
  near(brake(0, 1, 0.02, {}), 0.12); near(brake(0.5, 0, 0.02, {}), 0.32); // 6 / 9 /s
  near(throttle(0.08, 1, 0.3, {}), 0.58); // a 0.3 s hitch moves the pedal 0.1 s worth, not to 1.0
  near(brake(0.9, 0, 0.3, {}), 0); // clamped at the target
  near(throttle(0.95, 1, 0.1, {}), 1);
});
test('steer ramp caps dt at 0.1 s too', () => {
  const v = RAMPS.steer(0, 1, 0.3, {});
  near(v, 0.1 * (1.2 + 3 * (0.1 / 0.35)));
});
