// The chase camera on the engine rig (3l Task 14, CI-10): Tractor's feel frame by frame against 1.8's render/camera.js + view/rig.js
// (copied below at e03ed71; the shake is left out: 1.8's used Math.random, the engine's is a counter hash). V-1..V-3, X-12, F-10, C-2, M-77.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { rig, CAM } from '../src/view/rig.js';

function oldRig(camera) { // render/camera.js createChaseCam + view/rig.js follow/blendFrom at e03ed71, CAM and LAG inlined
  const C = { D: 12, H: 10.2, AHEAD: 11, portrait: 1.25 }, tgt = new THREE.Vector3(), pos = new THREE.Vector3(), showQ = new THREE.Quaternion(), chaseQ = new THREE.Quaternion();
  let yaw = null, blend = 1;
  return {
    get yaw() { return yaw; },
    follow(dt, s) {
      const want = s.fwd > 2 ? s.velYaw : s.yaw; if (yaw === null) yaw = want;
      let d = want - yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); yaw += d * Math.min(1, dt * 3);
      const fx = Math.sin(yaw), fz = Math.cos(yaw); tgt.set(s.x + fx * C.AHEAD, s.y + 0.8, s.z + fz * C.AHEAD);
      const k = camera.aspect < 0.9 ? C.portrait : 1; pos.set(s.x - fx * C.D * k, s.y + C.H * k, s.z - fz * C.D * k);
      camera.position.lerp(pos, Math.min(1, dt * 6)); camera.lookAt(tgt);
      if (blend < 1) { blend = Math.min(1, blend + dt); const b = blend * blend * (3 - 2 * blend); chaseQ.copy(camera.quaternion); camera.quaternion.slerpQuaternions(showQ, chaseQ, b); }
    },
    blendFrom(q) { showQ.copy(q); blend = 0; },
  };
}
const canvas = { getBoundingClientRect: () => ({ left: 10, top: 20, width: 800, height: 600 }) };
const same = (a, b, at) => { assert.ok(a.position.distanceTo(b.position) < 1e-9, `position at ${at}`); assert.ok(1 - Math.abs(a.quaternion.dot(b.quaternion)) < 1e-12, `rotation at ${at}`); };

test('the engine rig is 1.8\'s chase: a new farm, a slide, the show hand-back, landscape and portrait', () => {
  for (const aspect of [1.6, 0.6]) {
    const a = new THREE.PerspectiveCamera(60, aspect), b = new THREE.PerspectiveCamera(60, aspect), old = oldRig(b);
    const s = { x: 3, y: 0, z: -2, yaw: 0.4, fwd: 0, velYaw: 0.4 };
    rig.attach(a, { canvas, tractor: { yaw: 0.4 } }); rig.snap(s); old.follow(1, s); same(a, b, 'the new farm'); // 1.8: follow(1, pose) on a fresh cam
    for (let i = 0; i < 300; i++) {
      s.x += Math.sin(s.yaw) * 0.2; s.z += Math.cos(s.yaw) * 0.2; s.yaw += 0.015; s.fwd = i < 100 ? 1 : 6; s.velYaw = s.yaw + 0.35; s.y = Math.sin(i / 40);
      if (i === 150) { const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, 2, 0)); rig.blendFrom(q); old.blendFrom(q); } // F-10
      const dt = i % 4 ? 1 / 60 : 1 / 30; rig.follow(s, dt); old.follow(dt, s); same(a, b, `frame ${i}`);
    }
    assert.ok(Math.abs(rig.yaw - old.yaw) < 1e-12, 'the stick heading');
  }
});
test('the ?tune camera rows write the shared CAM live, and a new farm keeps them', () => {
  const c = new THREE.PerspectiveCamera(60, 1.6); rig.attach(c, { canvas, tractor: { yaw: 0 } });
  assert.deepEqual([CAM.distance, CAM.height, CAM.lookAhead, CAM.portrait, CAM.portraitAspect], [12, 10.2, 11, 1.25, 0.9]); // 1.8's CAM.D, H, AHEAD, portrait
  const was = CAM.distance; CAM.distance = 16;
  try { rig.attach(c, { canvas, tractor: { yaw: 0 } }); rig.snap({ x: 0, y: 0, z: 0, yaw: 0 }); assert.ok(Math.abs(c.position.z + 16) < 1e-9); }
  finally { CAM.distance = was; }
});
test('the stick heading is the tractor\'s before the first follow, then the rig\'s (C-2, #81); shake settles', () => {
  const c = new THREE.PerspectiveCamera(60, 1.6); rig.attach(c, { canvas, tractor: { yaw: 1.2 } });
  assert.equal(rig.yaw, 1.2); const pose = { x: 0, y: 0, z: 0, yaw: 0.3 }; rig.snap(pose); assert.equal(rig.yaw, 0.3);
  const at = c.position.clone(); rig.shake(0.35); rig.follow(pose, 1 / 60); assert.ok(c.position.distanceTo(at) > 1e-6, 'boop shake');
  for (let i = 0; i < 60; i++) rig.follow(pose, 1 / 60); assert.ok(c.position.distanceTo(at) < 0.01, 'settled');
});
test('rig.project and rig.toNdc give 1.8\'s numbers (S-1, #73, M-77)', () => {
  const c = new THREE.PerspectiveCamera(60, 800 / 600); rig.attach(c, { canvas, tractor: { yaw: 0 } }); rig.snap({ x: 0, y: 0, z: 0, yaw: 0 });
  c.updateMatrixWorld(); const v = new THREE.Vector3(2, 1, 6).project(c), p = rig.project([2, 1, 6]), n = rig.toNdc(2, 1, 6);
  assert.ok(Math.abs(p.x - (10 + (v.x + 1) / 2 * 800)) < 1e-6 && Math.abs(p.y - (20 + (1 - v.y) / 2 * 600)) < 1e-6 && Math.abs(p.z - v.z) < 1e-9); assert.equal(p.onScreen, true);
  assert.ok(Math.abs(n.nx - v.x) < 1e-9 && Math.abs(n.ny - v.y) < 1e-9 && Math.abs(n.nz - v.z) < 1e-9); assert.equal(n.behind, false);
  assert.equal(rig.toNdc(0, 0, -40).behind, true); assert.equal(rig.project([0, 0, -40]).onScreen, false);
});
