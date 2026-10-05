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
  assert.ok(t.speed < POWER.medium.vmax * 0.55, `speed ${t.speed}`);
});
test('positive steer turns left (yaw increases)', () => {
  const { t, run } = make(); run(1, 0, 0); run(2, 0.6, 0); const y0 = t.yaw; run(1.5, 0.6, 1);
  let d = t.yaw - y0; d = Math.atan2(Math.sin(d), Math.cos(d)); assert.ok(d > 0.3, `yaw change ${d}`);
});
test('slides are bounded and it never spins out (high power, full lock)', () => {
  const { t, run } = make('high'); run(1, 0, 0); run(5, 1, 0);
  let maxSlip = 0, maxRate = 0;
  run(6, 1, 1, () => { if (t.speed > 3) maxSlip = Math.max(maxSlip, Math.abs(t.slip)); maxRate = Math.max(maxRate, Math.abs(t.body.angvel().y)); });
  assert.ok(maxSlip > 0.15, `no slide at all: ${maxSlip}`);           // it should feel like rally
  assert.ok(maxSlip < POWER.high.slideMax + 0.12, `slip ${maxSlip}`);   // D-7
  assert.ok(maxRate < 2.8, `yaw rate ${maxRate}`);
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
