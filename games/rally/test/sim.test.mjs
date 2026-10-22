// Sim.dispose (lion-hawk [S-3]: the stage's exit frees the Rapier world): it drops the physics and the car, and a second
// call is a no-op.
import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { benchSim } from './helpers/bench.mjs';
import { normalizeSettings } from '../src/game/settings.js';

test('Sim.dispose frees the world and the car; a second dispose is a no-op', async () => {
  await R.init();
  const st = normalizeSettings({}), sim = benchSim({ car: st.car, surface: st.surface, assist: st.assist });
  sim.dispose();
  assert.ok(sim.phys === null, "no physics yet"); assert.ok(sim.car === null, "no car yet");
  sim.dispose();
});
