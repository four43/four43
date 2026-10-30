// Phase 3k (3g C9): the engine orbit rig with Pig Pens' options puts the camera exactly where 2.1.0's rig.js did: start
// framing (landscape and portrait), pan, 90 frames of drive chase with a held offset, release, clamps and the tool ray.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as OLD from './fixtures/rig-v2.1.0.js';
import { createRig, cameraMode, rig as R, ORBIT, FACE } from '../src/view/rig.js';
import { buildLayout } from '../src/layout.js';
import { CLINIC } from '../src/defs/buildings.js';

const canvas = (w, h) => ({ clientWidth: w, clientHeight: h, getBoundingClientRect: () => ({ left: 0, top: 0, width: w, height: h }) });
const same = (a, b, what) => {
  assert.ok(a.position.distanceTo(b.position) < 1e-9, `${what}: position ${a.position.toArray()} vs ${b.position.toArray()}`);
  assert.ok(1 - Math.abs(a.quaternion.dot(b.quaternion)) < 1e-12, `${what}: rotation`);
};
// the engine's own pose maths, with 2.12.0's facing lock off (rig.locked, as in the exam close-up); since 2.12.0 a phone's
// framing looks north as well, so portrait starts from 2.1.0's pose
for (const [w, h] of [[1280, 720], [390, 844]]) {
  test(`orbit rig = 2.1.0 rig.js at ${w}×${h}: fit, pan, chase, release, clamps, ray`, tc => {
    const a = new THREE.PerspectiveCamera(48, w / h), b = new THREE.PerspectiveCamera(48, w / h), cv = canvas(w, h);
    Object.assign(OLD.rig.cam, { pitch: 0.92 }); OLD.rig.chaseOff = 0; OLD.rig.gesture = null; // the oracle is module state
    R.locked = true; tc.after(() => { R.locked = false; });
    const rig = createRig(a, cv); OLD.attach(b, cv); OLD.fitCam(); OLD.applyCam();
    if (h > w) Object.assign(rig.state, { yaw: Math.PI / 2, dist: 60, tx: -3, tz: -9 });
    rig.update(); same(a, b, 'start framing');
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

test('going in and out (2.10.0): a flight frames a building and comes back; a pinch stops it; the roof follows the camera', async () => {
  const { attach, followFocus, fly, flying, nearFocus, focusFrame, ROOF, rig: R } = await import('../src/view/rig.js');
  const cam = new THREE.PerspectiveCamera(48, 1280 / 720), o = attach(cam, canvas(1280, 720)), st = o.state;
  const farm = { tx: st.tx, tz: st.tz, dist: st.dist, yaw: st.yaw };
  let focus = null;
  const run = seconds => { for (let i = 0; i < seconds * 60; i++) { followFocus(focus, 1 / 60); R.orbit.update(1 / 60); focus = nearFocus(focus); } };
  assert.equal(nearFocus(null), null, 'the farm view is outside');
  fly('barn', focus); run(0.3); assert.equal(focus, null, 'still on the way'); run(2.5);
  assert.equal(focus, 'barn', 'in once the camera gets there'); assert.ok(st.dist < farm.dist * 0.6, 'framed on the barn'); assert.equal(flying(), false);
  fly('clinic', focus); run(3); assert.equal(focus, 'clinic', 'another roof switches buildings'); assert.ok(Math.abs(st.tx - CLINIC.x) < 0.05);
  fly(null, focus); run(0.05); assert.equal(focus, 'clinic', 'the roof stays off for the first moment out'); run(3);
  assert.equal(focus, null, 'and back on once the camera pulls away');
  assert.ok(Math.hypot(st.tx - farm.tx, st.tz - farm.tz) < 0.05 && Math.abs(st.dist - farm.dist) < 0.05, `back at the farm view (${st.tx.toFixed(2)}, ${st.tz.toFixed(2)}, ${st.dist.toFixed(1)})`);
  assert.deepEqual(o.limits.bounds, { x: [-34, 34], z: [-30, 30] }, 'the farm’s limits throughout');
  // a pinch (any camera gesture) stops a flight where it is
  fly('barn', focus); run(0.3); o.gesture = 'pinch'; run(0.1); o.gesture = null; assert.equal(flying(), false); const was = st.dist; run(1);
  assert.equal(st.dist, was, 'the camera stays where the pinch left it');
  // zoomed by hand: over the clinic, in under ROOF.in × its framing distance, out past ROOF.out ×
  const f = focusFrame('clinic', cam); Object.assign(st, { tx: CLINIC.x, tz: CLINIC.z, dist: f.dist * (ROOF.in + 0.1) }); focus = null;
  assert.equal(nearFocus(null), null); st.dist = f.dist * (ROOF.in - 0.1); assert.equal(nearFocus(null), 'clinic');
  st.dist = f.dist * (ROOF.out - 0.1); assert.equal(nearFocus('clinic'), 'clinic', 'between the two it stays as it was');
  st.dist = f.dist * (ROOF.out + 0.1); assert.equal(nearFocus('clinic'), null);
  st.dist = f.dist; st.tx = CLINIC.x + CLINIC.w / 2 + ROOF.off + 0.5; assert.equal(nearFocus('clinic'), null, 'panned off its walls');
  assert.equal(nearFocus('clinic.exam'), 'clinic.exam', 'the exam room is the sim’s');
});

test('outside (2.12.0): the camera always looks north at the buildings at the farm’s pitch; an orbit drag pans instead; a pinch can’t turn it', () => {
  for (const [w, h] of [[1280, 720], [390, 844]]) {
    const cam = new THREE.PerspectiveCamera(48, w / h), o = createRig(cam, canvas(w, h)), st = o.state;
    o.update(); assert.equal(st.yaw, FACE.yaw); assert.equal(st.pitch, ORBIT.pitch);
    // the start framing has the buildings and the pens on screen (all of every pen in landscape, the middle of each on a
    // phone held upright), the right way up: the buildings above the pens
    const lay = buildLayout(), on = ([x, z]) => { const v = new THREE.Vector3(x, 0, z).project(cam); assert.ok(Math.abs(v.x) < 1 && Math.abs(v.y) < 1, `${w}×${h}: (${x}, ${z}) on screen`); return v.y; };
    const up = lay.buildings.map(b => on([b.x, b.z])), down = lay.pens.map(r => on([(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2]));
    if (w > h) for (const r of lay.pens) { on([r.x0, r.z0]); on([r.x1, r.z1]); }
    assert.ok(Math.min(...up) > Math.max(...down), `${w}×${h}: the buildings at the top`);
    // a one-finger drag (the engine turns and tilts by it) pans by the same screen move instead
    const ref = createRig(new THREE.PerspectiveCamera(48, w / h), canvas(w, h)); ref.update(); ref.panBy(80, -30); ref.update();
    o.gesture = 'orbit'; st.yaw -= 80 * 0.006; st.pitch += -30 * 0.005; o.update(); o.gesture = null;
    assert.ok(Math.abs(st.yaw - FACE.yaw) < 1e-12 && Math.abs(st.pitch - ORBIT.pitch) < 1e-12, 'still facing north');
    assert.ok(Math.hypot(st.tx - ref.state.tx, st.tz - ref.state.tz) < 1e-9, 'panned as far as a pan would');
    const was = [st.tx, st.tz]; o.gesture = 'pinch'; st.yaw += 0.4; o.update(); o.gesture = null;
    assert.equal(st.yaw, FACE.yaw); assert.deepEqual([st.tx, st.tz], was, 'a pinch’s turn is dropped');
  }
  R.locked = true; const o = createRig(new THREE.PerspectiveCamera(48, 1), canvas(500, 500)); o.state.yaw = 1.2; o.update(); R.locked = false;
  assert.equal(o.state.yaw, 1.2, 'the exam close-up keeps its own view');
});
