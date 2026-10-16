import test from 'node:test';
import assert from 'node:assert/strict';
import { createSandbox } from '../src/sim/sandbox.js';
import { testWorld } from './helpers/world.mjs';

test('sandbox surfaces: mud patch is mud, elsewhere gravel', () => {
  const sb = createSandbox(testWorld().world, { power: 'medium' });
  const m = sb.mud[0]; assert.equal(sb.materialAt(m.x, m.z), 'mudhole'); assert.equal(sb.materialAt(0, 0), 'route');
});
test('sandbox steps and drives forward', () => {
  const { world, step } = testWorld(), sb = createSandbox(world, { power: 'medium' });
  step(180, () => sb.pre({ thr: 1, steer: 0, horn: false }));
  assert.ok(sb.tractor.speed > 4);
});
