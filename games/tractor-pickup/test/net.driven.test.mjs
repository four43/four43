// Driven trains (3l Task 23, N-12…N-15; user decision 2026-10-13): each device steps the other players' trains as solid jointed
// bodies from their replicated input; the owner's pose wins through the net part's corrections of all three bodies.
import test from 'node:test';
import assert from 'node:assert/strict';
import { engineWorld } from './mp.engine.harness.mjs';
import { TRACTOR_WHEELS } from '../src/sim/tractor.js';
import { CAR_WHEELS } from '../src/sim/hitch.js';
const remote = (d, n) => d.engine.world.net.find('train', n);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

test('each device has the other\'s train: a dynamic tractor with linked trailer and wagon, hitched', async () => {
  const w = await engineWorld({ seed: 41 }); w.seconds(3);
  const g = w.guests[0], r = remote(w.host, g.engine.world.net.self);
  assert.ok(r?.body, 'the host has the guest\'s train'); assert.equal(r.body.isDynamic(), true); assert.ok(r.colliders.length > 0, 'solid');
  assert.ok(r.trailer?.body && r.wagon?.body, 'linked cars'); assert.equal(r.remote.train.cars.length, 2);
  assert.ok(r.remote.train.hitchGap(0) < 0.05 && r.remote.train.hitchGap(1) < 0.05, 'hitched');
  assert.ok(remote(g, 1)?.body, 'the guest has the host\'s train');
});
test('a remote train follows its owner\'s drive within 0.5 m (input-driven between snapshots), cars too', async () => {
  const w = await engineWorld({ seed: 41 }); w.seconds(3);
  const g = w.guests[0], n = g.engine.world.net.self;
  w.seconds(4, (d, i) => i === 1 ? { thr: 1, steer: 0.3, horn: false } : null); w.seconds(1);
  const r = remote(w.host, n);
  assert.ok(dist(r.body.translation(), g.game.tractor.body.translation()) < 0.5);
  assert.ok(dist(r.trailer.body.translation(), g.game.train.cars[0].body.translation()) < 0.7, 'trailer');
  assert.ok(dist(r.wagon.body.translation(), g.game.train.cars[1].body.translation()) < 0.7, 'wagon');
});
test('a remote train turns its own wheels: the kit on the driven replica writes its part poses (rolled and steered), cars too', async () => {
  const w = await engineWorld({ seed: 41 }); w.seconds(3);
  const n = w.guests[0].engine.world.net.self, q0 = { ...remote(w.host, n).partXf['wheel-back-left'].q };
  w.seconds(2, (d, i) => i === 1 ? { thr: 1, steer: 0.5, horn: false } : null);
  const r = remote(w.host, n), q1 = r.partXf['wheel-back-left'].q, dot = Math.abs(q0.x * q1.x + q0.y * q1.y + q0.z * q1.z + q0.w * q1.w);
  assert.deepEqual(Object.keys(r.partXf), TRACTOR_WHEELS.map(x => x.name)); assert.ok(1 - dot > 0.01, 'the replica\'s rear wheel rolled');
  assert.ok(Math.abs(r.remote.tractor.car.wheels[0].steering) > 0.01, 'the replica\'s front wheel steers from the replicated input (its part pose is Ry(steer) · Rz(-roll))');
  for (const c of [r.trailer, r.wagon]) assert.deepEqual(Object.keys(c.partXf), CAR_WHEELS);
});
test('the train leaves with its owner: three bodies and two joints are freed', async () => {
  const w = await engineWorld({ seed: 41 }); w.seconds(3);
  const hw = w.host.engine.world, n0 = hw.stats.bodies; w.hub.leave(w.guests[0].net.id, 'left'); w.seconds(2);
  assert.equal(hw.stats.bodies, n0 - 3); assert.ok(remote(w.host, w.guests[0].engine.world.net.self) === undefined, "the guest entity is gone on the host");
});
import { createRiderPoses } from '../src/view/riders.js';
test('the view draws another player\'s riders in that train\'s cars (read-only, from the train entity)', async () => {
  const w = await engineWorld({ seed: 41 }); w.seconds(3);
  const g = w.guests[0], n = g.engine.world.net.self; g.h.debug.riders(2); w.seconds(1);
  const hw = w.host.engine.world, r = hw.net.find('train', n), mine = g.game.load.slots.filter(s => s.landed).map(s => s.animal);
  assert.equal(r.riders.length, 2, 'the record carries both riders');
  const objectOf = e => e.body && { position: e.body.translation(), quaternion: e.body.rotation() };
  const poses = createRiderPoses().update(hw, { objectOf: e => { const o = objectOf(e); return o && { position: { ...o.position, x: o.position.x, y: o.position.y, z: o.position.z }, quaternion: o.quaternion }; } }, w.now, new Map());
  assert.equal(poses.size, 2);
  for (const a of mine) { const p = poses.get(a.id); assert.ok(p && Math.hypot(p.x - a.x, p.z - a.z) < 0.6, `rider ${a.id} at ${p && Math.hypot(p.x - a.x, p.z - a.z).toFixed(2)} m`); }
});
