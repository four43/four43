// Rally's keyboard ramps (lion-hawk 2c-rally R5/R6, field note #44): the removed Controls capped the frame time at 0.1 s, so
// a frame hitch can't snap a pedal or the steering to full. Since lion-hawk 0.5 the engine's driver caps device dt at the
// game's maxFrame (0.1 s), so the ramps take dt as given.
import test from 'node:test';
import assert from 'node:assert/strict';
import { RAMPS } from '../src/devices.js';
import { game } from './helpers/bench.mjs';

const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);

test('pedal ramps: same rates as the removed Controls; ramps take dt as given, the engine caps it', () => {
  const { throttle, brake } = RAMPS;
  assert.equal(typeof throttle, 'function'); assert.equal(typeof brake, 'function');
  near(throttle(0, 1, 0.02, {}), 0.1); // rise 5 /s
  near(throttle(0.5, 0, 0.02, {}), 0.34); // fall 8 /s
  near(brake(0, 1, 0.02, {}), 0.12); near(brake(0.5, 0, 0.02, {}), 0.32); // 6 / 9 /s
  near(throttle(0.08, 1, 0.1, {}), 0.58); // a hitch arrives as 0.1 s (maxFrame): the pedal moves 0.1 s worth, not to 1.0
  near(brake(0.9, 0, 0.1, {}), 0); // clamped at the target
  near(throttle(0.95, 1, 0.1, {}), 1);
});
test('steer ramp takes dt as given; the engine caps it at maxFrame 0.1 s', () => {
  assert.equal(game().sim.maxFrame, 0.1);
  const v = RAMPS.steer(0, 1, 0.1, {});
  near(v, 0.1 * (1.2 + 3 * (0.1 / 0.35)));
});
