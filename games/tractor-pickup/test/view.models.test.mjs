// The baked models as the view reads them (3l Task 15): pets pose from the anim tables with their hats on the head, and merged
// model geometry has float attributes in model space (quantized GLB attributes would overflow if transformed in place).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { petKind, posePart } from '../src/view/pets.js';
import { modelGeometry } from '../src/view/geom.js';
import { fakeAssets } from './helpers/assets.mjs';
test('a pet poses from its table; the hat sits on the head top through the walk (W-4, HEAD_TOP 1.26)', async () => {
  const A = await fakeAssets(['pig']), pig = petKind(A, 'pig'), m = new THREE.Matrix4(), h = new THREE.Matrix4(), p = new THREE.Vector3(), b = new THREE.Vector3();
  assert.ok(pig.parts.length >= 5 && pig.parts.every(x => x.geometry?.isBufferGeometry));
  const body = pig.parts.find(x => x.name === 'body');
  for (let t = 0; t < 1; t += 0.1) { posePart(pig, 'walk', t, body.index, m); pig.hat('walk', t, h);
    p.setFromMatrixPosition(h); b.setFromMatrixPosition(m); assert.ok(p.y > 1.1 && p.y < 1.8, `hat y ${p.y}`); assert.ok(Math.abs(p.y - b.y - 1.26) < 0.05, `hat above body ${p.y - b.y}`); }
});
test('modelGeometry: one float geometry per model, in model space, with colours', async () => {
  const A = await fakeAssets(['oak']), g = modelGeometry(A, 'oak');
  for (const k of ['position', 'normal', 'color']) { assert.ok(g.attributes[k], k); assert.equal(g.attributes[k].array.constructor, Float32Array, k); assert.equal(g.attributes[k].normalized, false, k); }
  g.computeBoundingBox(); assert.ok(g.boundingBox.max.y > 1, 'the oak stands up in model space');
});
