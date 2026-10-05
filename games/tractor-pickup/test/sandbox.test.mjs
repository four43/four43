import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { createSandbox } from '../src/sim/sandbox.js';
await RAPIER.init();

test('sandbox surfaces: mud patch is mud, elsewhere gravel', () => {
  const sb = createSandbox(RAPIER, { power: 'medium' });
  const m = sb.mud[0]; assert.equal(sb.surfaceAt(m.x, m.z), 'mud'); assert.equal(sb.surfaceAt(0, 0), 'gravel');
});
test('sandbox steps and drives forward', () => {
  const sb = createSandbox(RAPIER, { power: 'medium' });
  for (let i = 0; i < 180; i++) sb.step({ thr: 1, steer: 0, horn: false });
  assert.ok(sb.tractor.speed > 4);
});
