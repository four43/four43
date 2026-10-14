import test from 'node:test';
import assert from 'node:assert/strict';
import { createSandbox } from '../src/sim/sandbox.js';
import { testWorld } from './helpers/world.mjs';

test('sandbox surfaces: mud patch is mud, elsewhere gravel', () => {
  const sb = createSandbox(testWorld().world, { power: 'medium' });
  const m = sb.mud[0]; assert.equal(sb.surfaceAt(m.x, m.z), 'mud'); assert.equal(sb.surfaceAt(0, 0), 'gravel');
});
test('sandbox steps and drives forward', () => {
  const { world, step } = testWorld(), sb = createSandbox(world, { power: 'medium' });
  step(180, () => sb.pre({ thr: 1, steer: 0, horn: false }));
  assert.ok(sb.tractor.speed > 4);
});
