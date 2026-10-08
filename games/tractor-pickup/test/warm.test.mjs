import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { warmShaders } from '../src/render/warm.js';

test('warmShaders compiles hidden objects too, and leaves them hidden (B-2)', async () => {
  const scene = new THREE.Scene(), shown = new THREE.Mesh(), hid = new THREE.Mesh(), group = new THREE.Group(), inner = new THREE.Mesh();
  hid.visible = false; group.visible = false; group.add(inner); scene.add(shown, hid, group);
  let seen = null;
  const renderer = { compileAsync(s) { seen = []; s.traverseVisible(o => seen.push(o)); return Promise.resolve('ok'); } };
  assert.equal(await warmShaders(renderer, scene, new THREE.PerspectiveCamera()), 'ok');
  for (const o of [shown, hid, group, inner]) assert.ok(seen.includes(o), 'not compiled');
  assert.equal(hid.visible, false); assert.equal(group.visible, false); assert.equal(inner.visible, true); assert.equal(shown.visible, true);
});
test('a compile error still hides them again', () => {
  const scene = new THREE.Scene(), hid = new THREE.Mesh(); hid.visible = false; scene.add(hid);
  assert.throws(() => warmShaders({ compileAsync() { throw new Error('no gl'); } }, scene, null));
  assert.equal(hid.visible, false);
});
