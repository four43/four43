// The farm on the engine kits (3l Tasks 12, 13): the terrain kit ground and the vehicle kit train.
import test from 'node:test';
import assert from 'node:assert/strict';
import { testGame } from './helpers/world.mjs';

test('the kit ground: heightAt equals terrain.height on grid points, materialAt equals road.materialAt everywhere', () => {
  const g = testGame({ seed: 5 }), T = g.terrain, { n, step, heights } = T.grid, F = T.grid.size / 2;
  assert.ok(g.ground && typeof g.ground.materialAt === 'function', 'game.ground is the terrain kit');
  let k = 0;
  for (let i = 0; i < n; i += 9) for (let j = 0; j < n; j += 13) if (Math.abs(heights[i * n + j] - heights[j * n + i]) > 1) {
    const x = -F + i * step, z = -F + j * step; k++;
    assert.ok(Math.abs(g.ground.heightAt(x, z) - T.height(x, z)) < 1e-4, `(${x}, ${z})`);
  }
  assert.ok(k >= 6);
  for (let i = 0; i < 400; i++) { const x = (i * 37 % 760) - 380, z = (i * 53 % 760) - 380; assert.equal(g.ground.materialAt(x, z), g.road.materialAt(x, z)); }
});

import { testWorld } from './helpers/world.mjs';
import { addGround, DT } from '../src/sim/ground.js';
import { createTractor, TP, TRACTOR_WHEELS } from '../src/sim/tractor.js';
import { createTrain, TR, CAR_WHEELS } from '../src/sim/hitch.js';
test('the train runs on the vehicle kit: wheels touch the ground, the controller is the kit\'s, tuning is read live', () => {
  const { world, step } = testWorld(); addGround(world);
  const t = createTractor(world, { x: 0, z: 0, yaw: 0 }), tr = createTrain(world, t);
  step(90, () => { t.setInput(0, 0); t.step(DT); tr.step(DT, { parked: true }); });
  assert.ok(t.vc === t.car.controller, 'vc is the car controller'); assert.ok(t.car.wheels.every(w => w.inContact));
  for (const c of tr.cars) assert.ok(c.car.wheels.every(w => w.inContact), `car ${c.index}`);
  const slip = TP.slip; TP.slip = slip * 2;
  try { step(1, () => { t.setInput(1, 0); t.step(DT); tr.step(DT, { parked: false }); }); assert.ok(Math.abs(t.vc.wheelFrictionSlip(0) - TP.slip) < 1e-5); }
  finally { TP.slip = slip; }
});
test('each kit wheel names its GLB node: the kit writes e.partXf at the hub, rolled about the axle', () => {
  const { world, step } = testWorld(); addGround(world);
  const t = createTractor(world, { x: 0, z: 0, yaw: 0 }), tr = createTrain(world, t), near = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-6, `${m}: ${a} vs ${b}`);
  step(120, () => { t.setInput(1, 0); t.step(DT); tr.step(DT, { parked: false }); });
  assert.deepEqual(Object.keys(t.e.partXf), TRACTOR_WHEELS.map(w => w.name), 'the tractor wheels name their GLB nodes');
  TRACTOR_WHEELS.forEach((w, i) => { const P = t.e.partXf[w.name];
    near(P.p.x, w.cx, w.name); near(P.p.y, w.cy + 0.12 - t.car.wheels[i].suspension, w.name); near(P.p.z, w.cz, w.name); });
  const q = t.e.partXf['wheel-back-left'].q, a = -t.vc.wheelRotation(2); // a rear wheel: no steer, Rz(-rot)
  assert.ok(Math.abs(a) > 0.5, 'the rear wheels rolled'); near(q.x, 0, 'rear q.x'); near(q.y, 0, 'rear q.y'); near(q.z, Math.sin(a / 2), 'rear q.z'); near(q.w, Math.cos(a / 2), 'rear q.w');
  for (const c of tr.cars) { assert.deepEqual(Object.keys(c.e.partXf), CAR_WHEELS, `car ${c.index}`);
    CAR_WHEELS.forEach((n, i) => { const P = c.e.partXf[n];
      near(P.p.x, TR.axleX, n); near(P.p.y, -c.car.wheels[i].suspension, n); near(P.p.z, (i ? 1 : -1) * TR.track, n); }); }
});
