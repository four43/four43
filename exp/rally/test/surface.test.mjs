// Tyre surfaces come from the registry (lion-hawk M-10 phase 3; SURFACES retired): the same numbers, B derived once,
// blends cached so the per-wheel lookup stays allocation-free.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as TIRE from '../src/tire.js';
import { surfaceOfKey, materialOf, surface, blendSurface } from '../src/surface.js';
import { OLD } from './materials.test.mjs';

test('tire.js no longer exports SURFACES', () => { assert.equal('SURFACES' in TIRE, false); });
test('every surface entry equals the old table, B included, bit for bit', () => {
  for (const [k, s] of Object.entries(OLD)) {
    const e = surfaceOfKey(k);
    for (const f of ['name', 'mu', 'C', 'kp', 'ap', 'crr', 'drag']) assert.equal(e[f], s[f], `${k}.${f}`);
    assert.equal(e.B, Math.tan(Math.PI / (2 * s.C)), `${k}.B`);
    assert.equal(e.id, materialOf(k));
    assert.equal(surface(materialOf(k)), e, 'one entry per material');
  }
});
test('a material without a tire block throws, naming it', () => {
  assert.throws(() => surface('marker'), /rally: material 'marker' has no tire block/);
});
test('blends: same arithmetic as the old TrackWorld cache, one object per (a, b, tenth)', () => {
  const cache = new Map(), A = surfaceOfKey('gravel'), B = surfaceOfKey('hardpack');
  const e = blendSurface(cache, A, B, 3);
  for (const k of ['mu', 'C', 'kp', 'ap', 'crr', 'drag']) assert.equal(e[k], A[k] + (B[k] - A[k]) * 0.3, k);
  assert.equal(e.B, Math.tan(Math.PI / (2 * e.C)));
  assert.equal(e.name, 'Loose gravel→Dirt');
  assert.equal(blendSurface(cache, A, B, 3), e);
  assert.equal(blendSurface(cache, A, B, 0), A);
  assert.equal(blendSurface(cache, A, B, 10), B);
  assert.equal(blendSurface(cache, A, A, 4), A);
});
