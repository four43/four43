// Rally's four camera modes on 3g's rigs (3j #9), frame by frame against today's updateCamera, title -> chase ->
// bumper -> bonnet -> chase, with a car change (new model sockets, R16-3) in between; portrait adds 4 degrees everywhere.
// The bumper and bonnet views sit at the drawn model's camera sockets (body frame).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createRallyCamera } from '../src/render/camera.js';

function oldCamera(cam, base) { // exp/rally/src/render.js:152-185 at e03ed71; FOV numbers as base + (today − 60)
  const s = { camPos: new THREE.Vector3(0, 4, -8), camLook: new THREE.Vector3(), chaseDir: null, orbitA: undefined };
  return (car, orbit, camMode, dt) => {
    const p = car.p, q = car.q, v = car.v;
    const cp = new THREE.Vector3(p.x, p.y, p.z), bq = new THREE.Quaternion(q.x, q.y, q.z, q.w);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(bq); fwd.y = 0; fwd.normalize();
    const vel = new THREE.Vector3(v.x, 0, v.z);
    if (orbit) {
      s.orbitA = (s.orbitA ?? Math.atan2(-fwd.x, -fwd.z) + 0.6) + dt * 0.12;
      s.camPos.set(p.x + 9 * Math.sin(s.orbitA), p.y + 3.2, p.z + 9 * Math.cos(s.orbitA));
      s.camLook.set(p.x, p.y + 0.4, p.z);
      cam.position.copy(s.camPos); cam.lookAt(s.camLook);
      cam.fov = base - 5; cam.updateProjectionMatrix();
      s.chaseDir = null;
    } else if (camMode === 0) {
      const sp = vel.length(), dir = fwd.clone();
      if (sp > 3) dir.lerp(vel.normalize(), Math.min(0.55, (sp - 3) / 20)).normalize();
      if (!s.chaseDir) s.chaseDir = dir.clone();
      s.chaseDir.lerp(dir, 1 - Math.exp(-dt * 3.5)).normalize();
      const want = cp.clone().addScaledVector(s.chaseDir, -6.8).add(new THREE.Vector3(0, 2.4, 0));
      s.camPos.lerp(want, 1 - Math.exp(-dt * 8));
      const look = cp.clone().addScaledVector(s.chaseDir, 3).add(new THREE.Vector3(0, 0.6, 0));
      s.camLook.lerp(look, 1 - Math.exp(-dt * 12));
      cam.position.copy(s.camPos); cam.lookAt(s.camLook);
      cam.fov = base + 2 + Math.min(10, sp * 0.25); cam.updateProjectionMatrix();
    } else {
      const off = new THREE.Vector3(...(camMode === 1 ? car.sockets.bumper : car.sockets.bonnet));
      cam.position.copy(cp).add(off.applyQuaternion(bq));
      const look = cp.clone().add(new THREE.Vector3(0, 0.3, 20).applyQuaternion(bq));
      cam.up.set(0, 1, 0).applyQuaternion(bq); cam.lookAt(look); cam.up.set(0, 1, 0);
      cam.fov = base + 12; cam.updateProjectionMatrix();
    }
  };
}

for (const [name, base] of [['landscape', 60], ['portrait (4 degrees wider than today)', 64]]) {
  test(`${name}: title, chase, bumper, bonnet, chase and a car change match today's cameras frame by frame`, () => {
    const a = new THREE.PerspectiveCamera(base, 16 / 9, 0.1, 1500), b = a.clone();
    a.position.set(0, 4, -8); a.userData.lhFov = base;
    const rig = createRallyCamera(a), ref = oldCamera(b, base), Y = new THREE.Vector3(0, 1, 0);
    const car = { p: { x: 0, y: 0.5, z: 0 }, q: new THREE.Quaternion(), v: { x: 0, y: 0, z: 0 }, sockets: { bumper: [0, 0.05, 2.1], bonnet: [0, 0.62, 0.35] } };
    let yaw = 0.3;
    for (let i = 0; i < 360; i++) {
      const dt = i % 4 ? 1 / 60 : 1 / 45, orbit = i < 40, mode = i < 120 ? 0 : i < 170 ? 1 : i < 220 ? 2 : i < 260 ? 1 : 0;
      if (i === 240) car.sockets = { bumper: [0, 0.1, 2.25], bonnet: [0, 0.6, 0.4] }; // a car change while on the bumper
      if (!orbit) { const sp = Math.min(30, (i - 40) * 0.3); yaw += 0.01; car.v.x = Math.sin(yaw + 0.3) * sp; car.v.z = Math.cos(yaw + 0.3) * sp; car.p.x += car.v.x * dt; car.p.z += car.v.z * dt; }
      car.q.setFromAxisAngle(Y, yaw);
      ref(car, orbit, mode, dt); rig.update(car, { orbit, mode, dt });
      assert.ok(a.position.distanceTo(b.position) < 1e-9, `position at frame ${i} (mode ${orbit ? 'title' : mode})`);
      assert.ok(1 - Math.abs(a.quaternion.dot(b.quaternion)) < 1e-12, `rotation at frame ${i}`);
      assert.ok(Math.abs(a.fov - b.fov) < 1e-12, `fov at frame ${i}: ${a.fov} vs ${b.fov}`);
    }
  });
}
test('update() allocates nothing (no `new` or clone() inside it)', () => {
  const s = readFileSync(new URL('../src/render/camera.js', import.meta.url), 'utf8');
  assert.equal(/\bnew\s|\.clone\(\)/.test(s.slice(s.indexOf('update('))), false);
});

test('garage turntable: the camera circles the car at its angle (0 behind, pi in front) and looks at it (R16-5)', () => {
  const cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1500); cam.userData.lhFov = 60;
  const rig = createRallyCamera(cam), Y = new THREE.Vector3(0, 1, 0);
  const car = { p: { x: 5, y: 0.5, z: -3 }, q: new THREE.Quaternion().setFromAxisAngle(Y, 0.7), v: { x: 0, y: 0, z: 0 }, sockets: null };
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(car.q), at = new THREE.Vector3(car.p.x, car.p.y, car.p.z);
  for (const [angle, side] of [[0, -1], [Math.PI, 1]]) {
    rig.update(car, { garage: { angle }, orbit: true, mode: 0, dt: 1 / 60 }); // the garage wins over the title orbit
    const off = cam.position.clone().sub(at); off.y = 0;
    assert.ok(Math.abs(off.length() - 6.2) < 1e-9, `radius ${off.length()}`);
    assert.ok(off.normalize().dot(fwd) * side > 0.999, `angle ${angle}: ${side < 0 ? 'behind' : 'in front of'} the car`);
    const look = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion), to = at.clone().add(new THREE.Vector3(0, -0.15, 0)).sub(cam.position).normalize();
    assert.ok(look.dot(to) > 0.9999, 'looks at the car');
  }
});
