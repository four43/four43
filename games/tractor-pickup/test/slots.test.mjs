import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoad, slotLocal, newRider, stepRider, RIDER, CAR_SLOTS } from '../src/sim/slots.js';

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
