// Engine checks over Tractor Pickup (3l Task 11; T-10, T-12, T-13, T-14).
import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { fileURLToPath } from 'node:url';
import { checks } from 'lion-hawk/test';
import { tractorGame } from '../src/game.sim.js';
await R.init();
const src = p => fileURLToPath(new URL(`../src/${p}`, import.meta.url));
const ARGS = { seed: 14, started: true, trip: false };
const drive = i => ({ goX: Math.sin(i / 90), goZ: Math.cos(i / 90), goBack: { down: false }, horn: i % 300 === 0 });

test('determinism: two runs of 1800 steps on seed 14 agree at every checksum (T-10)', () => {
  const r = checks.determinism(tractorGame(), { seed: 14, steps: 1800, input: drive, args: ARGS }); assert.ok(r.ok, JSON.stringify(r));
});
test('sim purity over the game\'s sim roots (T-12)', () => {
  const r = checks.simPurity(tractorGame(), { roots: ['game.sim.js', 'game', 'sim', 'defs', 'net/host.js', 'net/guest.js', 'net/players.js', 'net/kinds.js', 'net/entities.js', 'net/protocol.js'].map(src) });
  const found = r.found.filter(f => !(f.file.endsWith('sim/rng.js') && f.rule === 'math-random')); // #86: randomSeed, view-only (purity.test.mjs)
  assert.deepEqual(found, []);
});
test('materials: every sidecar material exists, and phys.json matches the registry (T-14)', () => {
  const r = checks.materials(tractorGame()); assert.ok(r.ok, JSON.stringify(r));
});
// The settled-heap reading has tens of KB of noise in the first runs of a process (late JIT and IC growth; the same before the World
// swap: 100, 88, 26, 14 KB over four 20000-step runs, after it 135, 80, 18, 6 KB), and it is not per step (42 KB over 60000). A
// retained leak shows in every run, so after two warm-up runs the verdict is the better of the next two.
test('zero retained allocation over 20000 farm steps (T-13)', { timeout: 240_000 }, () => {
  const run = () => checks.zeroAlloc(tractorGame(), { steps: 20000, warm: 3000, input: drive, args: ARGS });
  run(); run(); const a = run(), r = a.ok ? a : run(); assert.ok(r.ok, JSON.stringify([a, r]));
});
