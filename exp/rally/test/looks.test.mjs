// Rally's looks as light-rig presets (3e): the numbers the old Renderer.setLook wrote, and the sun at car + offset.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createLightRig } from 'lion-hawk/view';
import { RENDER } from '../src/render.js';

const SKY = { 'pad-tarmac': 0x9fb8c8, 'pad-hardpack': 0xb4c4c9, 'pad-gravel': 0xb7c6cc, 'pad-snow': 0xc9d6e0, 'pad-ice': 0xc4d4de, summer: 0xa9c3d4, winter: 0xc9d6e0 };
const LOW = new Set(['pad-snow', 'winter']);
test('each look sets the old sky, fog, hemisphere, sun intensity and sun offset', () => {
  const scene = new THREE.Scene(), L = createLightRig(scene, RENDER.lights), p = { x: 12, y: 37.5, z: -40 };
  for (const [name, sky] of Object.entries(SKY)) {
    L.set(name); L.follow(p.x, p.z, p.y);
    const low = LOW.has(name), off = low ? [34, 15, 22] : [25, 45, 18];
    assert.equal(scene.background.getHex(), new THREE.Color(sky).getHex(), name); assert.equal(scene.fog.color.getHex(), scene.background.getHex(), name);
    assert.deepEqual([scene.fog.near, scene.fog.far], name.startsWith('pad-') ? [60, 330] : [150, 700], name);
    assert.equal(L.hemi.intensity, low ? 0.85 : 1.1, name); assert.equal(L.sun.intensity, low ? 3.6 : 2.4, name);
    // lion-hawk 0.12: follow() snaps the shadow box to whole texels (no shimmer), so the target sits within a texel of
    // the car while the sun's offset from it stays exact
    const t = L.sun.target.position, sp = L.sun.position;
    for (const [i, k] of [[0, 'x'], [1, 'y'], [2, 'z']]) assert.ok(Math.abs(sp[k] - t[k] - off[i]) < 1e-9, `${name} offset ${k}`);
    assert.ok(Math.hypot(t.x - p.x, t.y - p.y, t.z - p.z) < 0.5, `${name} target near the car`);
  }
  assert.equal(L.hemi.color.getHex(), new THREE.Color(0xdfeaf2).getHex());
});
