import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { splitShared } from '../src/render/matSplit.js';

test('each kind of user of a shared material gets its own material (X-4)', () => {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true }), g = new THREE.BoxGeometry(), root = new THREE.Group();
  const a = new THREE.Mesh(g, mat), b = new THREE.Mesh(g, mat), c = new THREE.InstancedMesh(g, mat, 2), d = new THREE.Mesh(g, mat), other = new THREE.Mesh(g, new THREE.MeshBasicMaterial());
  d.receiveShadow = true; root.add(a, b, c, d, other);
  assert.equal(splitShared(root, mat).length, 3);
  assert.equal(a.material, b.material, 'same kind: one material');
  assert.notEqual(a.material, c.material); assert.notEqual(a.material, d.material); assert.notEqual(c.material, d.material);
  assert.ok(c.material.vertexColors && d.material.vertexColors, 'clones keep the settings');
  assert.equal(other.material.type, 'MeshBasicMaterial', 'other materials are left alone');
});
