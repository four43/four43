import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { createPhysics, DT } from '../src/sim/physics.js';
import { createTractor, POWER, quatAxes } from '../src/sim/tractor.js';
await RAPIER.init();

const make = (power = 'medium', surface = 'gravel') => {
  const phys = createPhysics(RAPIER);
  const t = createTractor(phys, { x: 0, z: 0, yaw: 0, power, surfaceAt: () => surface });
  const run = (sec, thr, steer, each) => { for (let i = 0; i < sec * 60; i++) { t.setInput(thr, steer); t.step(DT); phys.world.step(); each?.(); } };
  return { phys, t, run };
};

test('settles on four wheels', () => {
  const { t, run } = make(); run(2, 0, 0);
  for (let i = 0; i < 4; i++) assert.ok(t.vc.wheelIsInContact(i), 'wheel ' + i);
  assert.ok(quatAxes(t.body.rotation()).u.y > 0.99);
});
for (const p of ['low', 'medium', 'high']) test(`top speed matches the ${p} preset`, () => {
  const { t, run } = make(p); run(1, 0, 0); run(10, 1, 0);
  assert.ok(t.speed > POWER[p].vmax * 0.85 && t.speed < POWER[p].vmax * 1.08, `speed ${t.speed}`);
});
test('mud halves the top speed', () => {
  const { t, run } = make('medium', 'mud'); run(1, 0, 0); run(10, 1, 0);
  assert.ok(t.speed < POWER.medium.vmax * 0.55 && t.speed > POWER.medium.vmax * 0.3, `speed ${t.speed}`);
});
test('positive steer turns left (yaw increases)', () => {
  const { t, run } = make(); run(1, 0, 0); run(2, 0.6, 0); const y0 = t.yaw; run(1.5, 0.6, 1);
  let d = t.yaw - y0; d = Math.atan2(Math.sin(d), Math.cos(d)); assert.ok(d > 0.3, `yaw change ${d}`);
});
// full throttle at speed, then full lock for 6 s on gravel
const slideRun = p => {
  const { t, run } = make(p); run(1, 0, 0); run(5, 1, 0);
  let maxSlip = 0, maxRate = 0;
  run(6, 1, 1, () => { if (t.speed > 3) maxSlip = Math.max(maxSlip, Math.abs(t.slip)); maxRate = Math.max(maxRate, Math.abs(t.body.angvel().y)); });
  return { maxSlip, maxRate };
};
test('rear grip is lower than front for every preset (D-6)', () => {
  for (const p of ['low', 'medium', 'high']) { assert.ok(POWER[p].rearSide < 1, p); assert.ok(POWER[p].loose < POWER[p].rearSide, p); }
});
test('slides scale with the power preset and never spin out (P-7, D-7)', () => {
  const r = { low: slideRun('low'), medium: slideRun('medium'), high: slideRun('high') };
  assert.ok(r.low.maxSlip >= 0.15, `low should still slide: ${r.low.maxSlip}`);
  assert.ok(r.low.maxSlip < r.medium.maxSlip - 0.05, `low ${r.low.maxSlip} < medium ${r.medium.maxSlip}`);
  assert.ok(r.medium.maxSlip < r.high.maxSlip - 0.15, `medium ${r.medium.maxSlip} < high ${r.high.maxSlip}`);
  assert.ok(r.high.maxSlip >= 0.6, `high should slide big: ${r.high.maxSlip}`);
  for (const p of ['low', 'medium', 'high']) {
    assert.ok(r[p].maxSlip <= POWER[p].slideMax + 0.1, `${p} slip ${r[p].maxSlip}`);
    assert.ok(r[p].maxRate < 2.8, `${p} yaw rate ${r[p].maxRate}`);
  }
});
test('the slide limiter pulls a big sideways slide back under slideMax', () => {
  const { t, run } = make('high'); run(1, 0, 0); run(4, 1, 0);
  const { r, f } = quatAxes(t.body.rotation());
  const v = 8, sv = 14; // ~60 degree slide, well past slideMax
  t.body.setLinvel({ x: f.x * v + r.x * sv, y: 0, z: f.z * v + r.z * sv }, true);
  t.step(DT); assert.ok(Math.abs(t.slip) > POWER.high.slideMax + 0.1, `setup slip ${t.slip}`);
  run(0.4, 1, 0); // tyres alone take ~0.6 s to recover from this; the limiter must do it faster
  assert.ok(Math.abs(t.slip) < 0.3, `slip after 0.4 s ${t.slip}`);
});
test('brakes then reverses slowly', () => {
  const { t, run } = make(); run(1, 0, 0); run(3, 1, 0); run(5, -1, 0);
  assert.ok(t.fwd < -1 && t.fwd > -3.3, `fwd ${t.fwd}`);
});
test('rights itself when tipped past 35 degrees', () => {
  const { t, run } = make(); run(1, 0, 0);
  const a = 1.2; t.body.setRotation({ x: Math.sin(a / 2), y: 0, z: 0, w: Math.cos(a / 2) }, true); t.body.setTranslation({ x: 0, y: 1.5, z: 0 }, true);
  run(4, 0, 0); assert.ok(quatAxes(t.body.rotation()).u.y > 0.95);
});

test('the wheel layout is data, the same for every tractor (for drawing other players)', async () => {
  const { TRACTOR_WHEELS, createTractor } = await import('../src/sim/tractor.js');
  const { createPhysics } = await import('../src/sim/physics.js');
  const t = createTractor(createPhysics(RAPIER), { x: 0, z: 0, yaw: 0 });
  assert.equal(TRACTOR_WHEELS.length, 4); assert.deepEqual(t.W.map(w => [w.name, w.cx, w.cz, w.radius]), TRACTOR_WHEELS.map(w => [w.name, w.cx, w.cz, w.radius]));
  assert.notEqual(t.W[0], TRACTOR_WHEELS[0], 'each tractor has its own copy');
});
