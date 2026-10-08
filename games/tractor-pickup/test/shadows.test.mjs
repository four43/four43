import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { instancedShadows } from '../src/render/shadows.js';

test('instanced shadow casters share their own depth material; plain casters keep three.js default (X-4)', () => {
  const g = new THREE.BoxGeometry(), m = new THREE.MeshLambertMaterial(), root = new THREE.Group();
  const a = new THREE.InstancedMesh(g, m, 3), b = new THREE.InstancedMesh(g, m, 2), plain = new THREE.Mesh(g, m), quiet = new THREE.InstancedMesh(g, m, 1);
  a.castShadow = b.castShadow = plain.castShadow = true; root.add(a, b, plain, quiet);
  instancedShadows(root);
  assert.ok(a.customDepthMaterial?.isMeshDepthMaterial); assert.equal(a.customDepthMaterial, b.customDepthMaterial);
  assert.equal(plain.customDepthMaterial, undefined); assert.equal(quiet.customDepthMaterial, undefined);
});
