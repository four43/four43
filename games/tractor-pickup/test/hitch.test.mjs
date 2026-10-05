import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { createPhysics, DT, G, groups } from '../src/sim/physics.js';
import { createTractor, quatAxes } from '../src/sim/tractor.js';
import { createTrain } from '../src/sim/hitch.js';
await RAPIER.init();

const make = (power = 'medium', extra) => {
  const phys = createPhysics(RAPIER); extra?.(phys);
  const t = createTractor(phys, { x: 0, z: 0, yaw: 0, power });
  const train = createTrain(phys, t);
  const stats = { maxAngle: 0, maxGap: 0, nan: false, minUp: 1, minCarUp: 1, airborne: false };
  const run = (sec, thr, steer) => { for (let i = 0; i < sec * 60; i++) {
    t.setInput(thr, steer); t.step(DT); train.step(DT, { parked: false }); phys.world.step();
    for (let k = 0; k < 2; k++) { stats.maxAngle = Math.max(stats.maxAngle, Math.abs(train.angle(k))); stats.maxGap = Math.max(stats.maxGap, train.hitchGap(k)); }
    for (const b of [t.body, ...train.cars.map(c => c.body)]) { const p = b.translation(); if (!Number.isFinite(p.x + p.y + p.z)) stats.nan = true; stats.minUp = Math.min(stats.minUp, quatAxes(b.rotation()).u.y); }
    for (const c of train.cars) stats.minCarUp = Math.min(stats.minCarUp, quatAxes(c.body.rotation()).u.y);
    if ([0, 1, 2, 3].every(i => !t.vc.wheelIsInContact(i))) stats.airborne = true;
  } };
  return { phys, t, train, run, stats };
};

test('the train settles in line behind the tractor', () => {
  const { train, run, stats } = make(); run(2, 0, 0);
  assert.ok(stats.maxGap < 0.05, `gap ${stats.maxGap}`);
  for (const k of [0, 1]) assert.ok(Math.abs(train.angle(k)) < 0.05);
  for (const c of train.cars) for (const i of [0, 1]) assert.ok(c.vc.wheelIsInContact(i));
});
test('straight-line drive keeps the train in line', () => {
  const { train, run } = make(); run(1, 0, 0); run(6, 1, 0);
  for (const k of [0, 1]) assert.ok(Math.abs(train.angle(k)) < 0.1);
});
test('hard turns at high power: no NaN, joints hold, no jackknife past 80 degrees', () => {
  const { run, stats } = make('high'); run(1, 0, 0); run(4, 1, 0); run(5, 1, 1); run(5, 1, -1);
  assert.equal(stats.nan, false); assert.ok(stats.maxGap < 0.15, `gap ${stats.maxGap}`);
  assert.ok(stats.maxAngle < 80 * Math.PI / 180, `angle ${stats.maxAngle}`);
});
test('reversing at full lock is limited by the jackknife torque', () => {
  const { run, stats } = make(); run(1, 0, 0); run(6, -1, 1);
  assert.ok(stats.maxAngle < 80 * Math.PI / 180, `angle ${stats.maxAngle}`);
});
test('ramp jump: airborne, lands upright, joints hold', () => {
  const ramp = phys => { // 5 m up to 0.6 m, 1 m table, 3 m down; crest at x = 30
    const { RAPIER, world } = phys; const pts = [];
    for (const [x, y] of [[25, 0], [30, 0.6], [31, 0.6], [34, 0]]) for (const z of [-3.5, 3.5]) pts.push(x, y, z, x, -0.2, z);
    world.createCollider(RAPIER.ColliderDesc.convexHull(new Float32Array(pts)).setCollisionGroups(groups(G.STATIC, 0xffff)));
  };
  const { t, run, stats } = make('medium', ramp); run(1, 0, 0); run(7, 1, 0); run(3, 0, 0);
  assert.ok(stats.airborne, 'never left the ground'); assert.equal(stats.nan, false);
  assert.ok(stats.maxGap < 0.15); assert.ok(quatAxes(t.body.rotation()).u.y > 0.95);
  assert.ok(stats.maxAngle < 80 * Math.PI / 180, `angle ${stats.maxAngle}`); assert.ok(stats.minCarUp > 0.5, `car up ${stats.minCarUp}`);
});
test('a rolled car rights itself past 45 degrees', () => {
  const { train, run } = make(); run(1, 0, 0);
  const c = train.cars[1], { f } = quatAxes(c.body.rotation()), h = Math.sin(100 * Math.PI / 360), w = Math.cos(100 * Math.PI / 360);
  const q = c.body.rotation(); // roll 100 degrees about the car's forward axis, on top of its current attitude
  const r = { x: f.x * h, y: f.y * h, z: f.z * h, w };
  const m = { w: r.w * q.w - r.x * q.x - r.y * q.y - r.z * q.z, x: r.w * q.x + r.x * q.w + r.y * q.z - r.z * q.y, y: r.w * q.y - r.x * q.z + r.y * q.w + r.z * q.x, z: r.w * q.z + r.x * q.y - r.y * q.x + r.z * q.w };
  c.body.setRotation(m, true);
  assert.ok(quatAxes(c.body.rotation()).u.y < Math.cos(Math.PI / 4), 'setup should be rolled past 45 degrees');
  run(4, 0, 0);
  assert.ok(quatAxes(c.body.rotation()).u.y > 0.95, `up ${quatAxes(c.body.rotation()).u.y}`);
});
