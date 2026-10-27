// Phase 3k (T-10, T-12, T-13, T-14 via lion-hawk/test checks): determinism, purity, retained allocation and material
// references for the farm on the World.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import R from '@dimforge/rapier3d-compat';
import { checks } from 'lion-hawk/test';
import { pigPensGame } from '../src/game.sim.js';
await R.init();

const src = p => fileURLToPath(new URL(`../src/${p}`, import.meta.url));
test('checks.determinism: two 600-step farms agree at every checksum', () => {
  const r = checks.determinism(pigPensGame(), { seed: 3, steps: 600, args: { pigs: 24 } }); assert.ok(r.ok, `first difference at step ${r.step}`);
});
test('checks.simPurity over the sim roots', () => {
  const r = checks.simPurity(pigPensGame(), { roots: ['game.sim.js', 'game', 'defs', 'sim.js', 'chickens.js', 'flow.js', 'layout.js'].map(src) });
  assert.notEqual(r?.ok, false, JSON.stringify(r));
});
test('checks.materials: every collider material exists and phys.json matches the registry', () => {
  const r = checks.materials(pigPensGame()); assert.notEqual(r?.ok, false, JSON.stringify(r));
});
