import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoad, slotLocal, slotPoint, slotIndex, newRider, stepRider, RIDER, CAR_SLOTS } from '../src/sim/slots.js';

test('fills the trailer first, then the wagon, up to the capacity', () => {
  const L = createLoad(12), s = [];
  for (let i = 0; i < 14; i++) s.push(L.reserve({ id: i }));
  assert.deepEqual(s.slice(0, 6).map(x => x.car), [0, 0, 0, 0, 0, 0]);
  assert.deepEqual(s.slice(6, 12).map(x => x.car), [1, 1, 1, 1, 1, 1]);
  assert.equal(s[12], null); assert.equal(s[13], null);
  assert.ok(L.full());
});
test('a capacity of 4 uses only the trailer', () => {
  const L = createLoad(4); for (let i = 0; i < 4; i++) assert.equal(L.reserve({}).car, 0); assert.equal(L.reserve({}), null);
});
test('landed counts only landed slots', () => {
  const L = createLoad(5), a = L.reserve({}), b = L.reserve({}); L.land(a); assert.equal(L.landed(), 1); L.land(b); assert.equal(L.landed(), 2);
});
test('slot positions are inside the bed and distinct', () => {
  const keys = new Set();
  for (let k = 0; k < CAR_SLOTS; k++) { const p = slotLocal(k); assert.ok(Math.abs(p.x) < 1.4 && Math.abs(p.z) < 1.0); keys.add(`${p.x},${p.z}`); }
  assert.equal(keys.size, CAR_SLOTS);
});
test('riders bounce but never leave the slot (R-4)', () => {
  const r = newRider(); let max = 0;
  for (let i = 0; i < 600; i++) { const a = i < 30 ? { x: 0, y: -9.81, z: 0 } : i < 33 ? { x: 0, y: 80, z: 0 } : { x: Math.sin(i * 0.3) * 15, y: 0, z: Math.cos(i * 0.2) * 15 }; stepRider(r, a, 1 / 60); max = Math.max(max, Math.hypot(r.ox, r.oy, r.oz)); assert.ok(r.oy >= 0); }
  assert.ok(max <= RIDER.max + 1e-9); assert.ok(max > 0.1, 'no bounce at all');
});
test('slotPoint: the slot on the bed plus the rider offset, in car axes (renderer and sim share it)', () => {
  const l = slotLocal(3), r = { ...newRider(), ox: 0.1, oy: 0.2, oz: -0.3 };
  assert.deepEqual(slotPoint(3, r, 0.15, {}), { x: l.x + 0.1, y: l.y + 0.15 + 0.2, z: l.z - 0.3 });
  assert.deepEqual(slotPoint(3, null, 0.15, {}), { x: l.x, y: l.y + 0.15, z: l.z });
});
test('slotIndex: trailer slots 0-5, wagon slots 6-11, in reserve order', () => {
  const L = createLoad(12); for (let i = 0; i < 12; i++) assert.equal(slotIndex(L.reserve({})), i);
});

test('release removes a slot and packs the later ones forward (M-14)', () => {
  const L = createLoad(12), s = [0, 1, 2, 3, 4, 5, 6].map(i => L.reserve({ id: i }));
  L.land(s[0]); L.land(s[6]);
  L.release(s[2]);
  assert.equal(L.slots.length, 6); assert.deepEqual(L.slots.map(x => x.animal.id), [0, 1, 3, 4, 5, 6]);
  assert.deepEqual(L.slots.map(x => [x.car, x.k]), [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5]]);
  assert.equal(s[6].car, 0, 'the wagon rider moved up into the trailer'); assert.equal(L.landed(), 2);
  L.release({}); assert.equal(L.slots.length, 6, 'an unknown slot changes nothing');
});
