// lion-hawk checks.zeroAlloc over Rally (T-13), alone in its own process so no other test's garbage moves the heap.
import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { checks } from 'lion-hawk/test';
import { game } from './helpers/bench.mjs';
await R.init();

const DRIVE = () => ({ throttle: 1, steer: 0.3, brake: 0, handbrake: 0 });
test('zero retained allocation over 10000 steps of driving', () => {
  const r = checks.zeroAlloc(game(), { steps: 10000, warm: 600, input: DRIVE, args: { pad: true } });
  assert.ok(r.ok, `retained ${r.growth} B over ${r.steps} steps`);
});
