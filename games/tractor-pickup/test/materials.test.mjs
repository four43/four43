// Tractor's material registry (3l Task 2, M-2, D6): surfaces carry the old SURFACE grip/vmul and DIRT per-second rates in their
// game block; collider materials reproduce today's frictions and the trailer's per-collider masses; every bake rename target exists.
import test from 'node:test';
import assert from 'node:assert/strict';
import MATERIALS, { SURFACE_IDS } from '../src/defs/materials.js';

test('surfaces keep the old grip and vmul, and carry per-metre dirt rates, and name their legacy surface', () => {
  const g = id => MATERIALS.get(id).game;
  assert.deepEqual(SURFACE_IDS, ['route', 'meadow', 'mudhole']);
  assert.deepEqual(g('route'), { surface: 'gravel', grip: 1, vmul: 1 });
  assert.deepEqual(g('meadow'), { surface: 'grass', grip: 0.8, vmul: 0.7 });
  assert.deepEqual(g('mudhole'), { surface: 'mud', grip: 0.55, vmul: 0.5 });
  for (const [id, r] of [['route', 0.006 / 9], ['meadow', 0.004 / 9], ['mudhole', 0.6 / 4.5]]) assert.equal(MATERIALS.get(id).dirtRate, r, id); // per metre (Task 13b)
  for (const id of SURFACE_IDS) assert.ok(MATERIALS.index(id) < 255);
});
test('collider frictions and restitutions are today\'s literals', () => {
  const f = id => MATERIALS.get(id).phys;
  for (const [id, fr, re] of [['ground', 0.6, 0], ['pad', 0.9, 0], ['ramp', 0.9, 0], ['chassis', 0.2, 0], ['bed', 0.2, 0], ['tongue', 0.5, 0], ['fence', 0.1, 0], ['trunk', 0.1, 0], ['prop', 0.6, 0.1]]) {
    assert.equal(f(id).friction, fr, id); assert.equal(f(id).restitution ?? 0, re, id);
  }
});
test('the trailer bed and tongue densities give today\'s setMass masses (260 kg, 5 kg)', () => {
  assert.ok(Math.abs(MATERIALS.density('bed') * 2.8 * 0.3 * 2 - 260) < 1e-6);
  assert.ok(Math.abs(MATERIALS.density('tongue') * 1.8 * 0.12 * 0.16 - 5) < 1e-6);
});
test('every bake rename target and paint base is in the registry', async () => {
  const cfg = (await import('../game.config.js')).default.bake, ids = new Set();
  const add = r => Object.values(r?.materials ?? {}).forEach(v => ids.add(v));
  add(cfg.rename); for (const m of Object.values(cfg.models)) add(m.rename);
  ids.add(cfg.paint.base); for (const id of ['grass', 'gold']) ids.add(id);
  for (const id of ids) assert.ok(MATERIALS.has(id), id);
});
test('dirt-taking materials accept the dirt coverage layer (the compiler\'s COVERAGE define)', () => {
  for (const id of ['chassis', 'bed', 'pet', 'gold']) assert.equal(MATERIALS.get(id).coverage.dirt, 1, id);
});
