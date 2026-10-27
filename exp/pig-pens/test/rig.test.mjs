// Phase 3k (3g C9): the engine orbit rig with Pig Pens' options puts the camera exactly where 2.1.0's rig.js did: start
// framing (landscape and portrait), pan, 90 frames of drive chase with a held offset, release, clamps and the tool ray.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as OLD from './fixtures/rig-v2.1.0.js';
import { createRig, cameraMode } from '../src/view/rig.js';

const canvas = (w, h) => ({ clientWidth: w, clientHeight: h, getBoundingClientRect: () => ({ left: 0, top: 0, width: w, height: h }) });
const same = (a, b, what) => {
  assert.ok(a.position.distanceTo(b.position) < 1e-9, `${what}: position ${a.position.toArray()} vs ${b.position.toArray()}`);
  assert.ok(1 - Math.abs(a.quaternion.dot(b.quaternion)) < 1e-12, `${what}: rotation`);
};
for (const [w, h] of [[1280, 720], [390, 844]]) {
  test(`orbit rig = 2.1.0 rig.js at ${w}×${h}: fit, pan, chase, release, clamps, ray`, () => {
    const a = new THREE.PerspectiveCamera(48, w / h), b = new THREE.PerspectiveCamera(48, w / h), cv = canvas(w, h);
    Object.assign(OLD.rig.cam, { pitch: 0.92 }); OLD.rig.chaseOff = 0; OLD.rig.gesture = null; // the oracle is module state
    const rig = createRig(a, cv); OLD.attach(b, cv); OLD.fitCam(); OLD.applyCam(); rig.update(); same(a, b, 'start framing');
    rig.panBy(30, -12); OLD.panBy(30, -12); rig.update(); OLD.applyCam(); same(a, b, 'pan');
    rig.state.chaseOff = OLD.rig.chaseOff = 0.3; const t = { x: 3, z: -2, yaw: 1, fwd: 4 };
    for (let i = 0; i < 90; i++) { t.x += 0.1; t.yaw += 0.01; rig.chase(t, 1 / 60); OLD.chase(t, 1 / 60); rig.update(1 / 60); OLD.applyCam(); same(a, b, `chase ${i}`); }
    rig.release(); OLD.afterDrive(); rig.update(); OLD.applyCam(); same(a, b, 'release (afterDrive)');
    rig.state.dist = OLD.rig.cam.dist = 500; rig.state.tx = OLD.rig.cam.tx = 100; rig.update(); OLD.applyCam(); same(a, b, 'clamps');
    const r1 = rig.ray(200, 300), r0 = OLD.ray(200, 300); r1.forEach((v, k) => assert.ok(Math.abs(v - r0[k]) < 1e-9, `ray[${k}]`));
  });
}
test('cameraMode: a Hand drag orbits, other tools leave the camera alone (2.1.0 bindGestures)', () => {
  assert.equal(cameraMode('hand'), 'orbit'); assert.equal(cameraMode('shoo'), 'none'); assert.equal(cameraMode('feed'), 'none');
});
