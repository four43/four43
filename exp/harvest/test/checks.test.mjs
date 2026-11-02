// The engine's checks over Harvest: determinism, sim purity and the material registry.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { checks } from 'lion-hawk/test';
import { harvestGame, initPhysics } from '../src/game.sim.js';
await initPhysics();
const src = p => fileURLToPath(new URL(`../src/${p}`, import.meta.url));
// a slow weave north through the wheat: the combine cuts, fills up and turns
const drive = i => ({ goX: Math.sin(i / 120) * 0.6, goZ: 0.8, goBack: { down: false }, horn: false });

test('determinism: two runs of 1800 steps agree at every checksum', () => {
  const r = checks.determinism(harvestGame(), { seed: 1, steps: 1800, input: drive }); assert.ok(r.ok, JSON.stringify(r));
});
test('sim purity over the sim half', () => {
  const r = checks.simPurity(harvestGame(), { roots: ['game.sim.js', 'game', 'sim', 'defs'].map(src) });
  assert.deepEqual(r.found, []);
});
test('materials: every sidecar material exists, and phys.json matches the registry', () => {
  const r = checks.materials(harvestGame()); assert.ok(r.ok, JSON.stringify(r));
});
