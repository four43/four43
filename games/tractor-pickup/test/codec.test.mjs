// test/codec.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeVehicle, decodeVehicle, encodeHerd, decodeHerd, kindOf, KIND, LIMIT, TYPE_LIST } from '../src/net/codec.js';

const q = (a = 0.3) => ({ x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) });
const veh = (n = 2) => ({ player: 2, time: 123456, mode: 'drive', full: true,
  bodies: [{ p: { x: 10.5, y: 0.8, z: -3 }, q: q() }, { p: { x: 7, y: 0.5, z: -3 }, q: q(0.2) }, { p: { x: 4, y: 0.5, z: -3 }, q: q(0.1) }],
  carried: Array.from({ length: n }, (_, i) => ({ id: 30 + i, type: TYPE_LIST[i % TYPE_LIST.length], golden: i === 0, flying: i === 1, riding: i !== 1, x: 5 + i, y: 1.2, z: -2, yaw: 1.5 })) });
const herd = n => ({ time: 99, animals: Array.from({ length: n }, (_, i) => ({ id: i, epoch: 3 + i, type: 'pig', golden: false, hidden: i === 2, busy: i === 3, x: i * 2, y: 0, z: -i, yaw: 6, anim: 'walk', leader: i === 4 ? 1 : null, line: i === 4 ? 1 : 0 })) });
const near = (a, b, e, msg) => assert.ok(Math.abs(a - b) <= e, `${msg}: ${a} vs ${b}`);

test('a vehicle message round-trips with quantized rotations (M-22, M-53)', () => {
  const m = veh(3), d = decodeVehicle(encodeVehicle(m));
  assert.equal(kindOf(encodeVehicle(m)), KIND.VEHICLE);
  assert.equal(d.player, 2); assert.equal(d.time, 123456); assert.equal(d.mode, 'drive'); assert.equal(d.full, true);
  m.bodies.forEach((b, i) => { for (const k of 'xyz') near(d.bodies[i].p[k], b.p[k], 1e-4, 'p' + k); for (const k of 'xyzw') near(d.bodies[i].q[k], b.q[k], 1e-3, 'q' + k); });
  assert.equal(d.carried.length, 3);
  assert.deepEqual(d.carried.map(c => [c.id, c.type, c.golden, c.flying, c.riding]), m.carried.map(c => [c.id, c.type, c.golden, c.flying, c.riding]));
  near(d.carried[2].yaw, 1.5, 1e-3, 'yaw');
});
test('a herd message round-trips with ownership numbers and leaders (M-23, M-26)', () => {
  const m = herd(5), d = decodeHerd(encodeHerd(m));
  assert.equal(kindOf(encodeHerd(m)), KIND.HERD); assert.equal(d.time, 99); assert.equal(d.animals.length, 5);
  assert.deepEqual(d.animals.map(a => [a.id, a.epoch, a.hidden, a.busy, a.leader, a.line, a.anim]), m.animals.map(a => [a.id, a.epoch, a.hidden, a.busy, a.leader, a.line, a.anim]));
  near(d.animals[4].x, 8, 1e-5, 'x'); near(d.animals[1].yaw, 6, 1e-3, 'yaw');
});
test('messages stay small: a full train and a large herd', () => {
  assert.ok(encodeVehicle(veh(12)).byteLength <= 300);
  assert.ok(encodeHerd(herd(40)).byteLength <= 1100);
});
test('bad messages decode to null (M-50)', () => {
  const good = encodeVehicle(veh(2));
  assert.equal(decodeVehicle(good.slice(0, good.byteLength - 1)), null, 'truncated');
  const longer = new Uint8Array(good.byteLength + 1); longer.set(new Uint8Array(good)); assert.equal(decodeVehicle(longer.buffer), null, 'extra bytes');
  assert.equal(decodeVehicle(encodeHerd(herd(1))), null, 'wrong kind');
  assert.equal(decodeHerd(new ArrayBuffer(0)), null, 'empty');
  assert.equal(decodeVehicle('hello'), null, 'not binary');
  const nan = veh(1); nan.bodies[0].p.x = NaN; assert.equal(decodeVehicle(encodeVehicle(nan)), null, 'NaN');
  const far = veh(1); far.carried[0].x = LIMIT.coord + 1; assert.equal(decodeVehicle(encodeVehicle(far)), null, 'out of the farm');
  const p5 = veh(1); p5.player = 5; assert.equal(decodeVehicle(encodeVehicle(p5)), null, 'player 5');
  const badType = new Uint8Array(encodeVehicle(veh(1))); badType[8 + 60 + 1 + 2] = 200; assert.equal(decodeVehicle(badType.buffer), null, 'type index');
  assert.throws(() => encodeHerd(herd(LIMIT.herd + 1)), /too many/);
});
