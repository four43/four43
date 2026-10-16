// lion-hawk engine checks over Rally (T-10, T-12, T-13, T-14; overview §4.4).
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import R from '@dimforge/rapier3d-compat';
import { checks } from 'lion-hawk/test';
import { game } from './helpers/bench.mjs';
await R.init();

const src = fileURLToPath(new URL('../src/', import.meta.url));
const ROOTS = ['game.sim.js', 'sim.js', 'surface.js', 'vehicle.js', 'drivetrain.js', 'tire.js', 'snow.js', 'cars.js', 'defs', 'gen', 'world', 'game'].map(p => join(src, p));
const DRIVE = () => ({ throttle: 1, steer: 0.3, brake: 0, handbrake: 0 });
const STAGE = { settings: { mode: 'freeDrive', world: 'loop', seed: 'det1', theme: 'summer', assist: true } };

test('determinism: a pad drive and a track drive replay bit-exactly', () => {
  for (const args of [{ pad: true }, STAGE]) {
    const r = checks.determinism(game(), { seed: 5, steps: 2400, input: DRIVE, args });
    assert.equal(r.ok, true, `first difference at step ${r.step}`);
  }
});
test('sim purity over Rally\'s sim roots', () => {
  const r = checks.simPurity(game(), { roots: ROOTS });
  assert.equal(r.ok, true, JSON.stringify(r));
});
test('materials: every collider material exists and phys.json matches the registry', () => {
  // Inline colliders and the heightfield are runtime calls the check cannot see: list their materials (3c).
  const inline = ['rally-ground', 'car-hull', 'car-cabin', 'marker', 'gate-post', 'cone'].map(material => ({ material }));
  const r = checks.materials(game(), { inline });
  assert.equal(r.ok, true, JSON.stringify(r));
});
// zeroAlloc runs alone in test/lh-alloc.test.mjs: garbage from the engines above skews its heap readings.
