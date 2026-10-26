import test from 'node:test';
import assert from 'node:assert/strict';
import { singOrder, SING } from '../src/sim/sing.js';
import { slotIndex } from '../src/sim/slots.js';

test('riders sing in slot order after the horn, one every SING.gap; empty or flying slots stay quiet (E-1)', () => {
  const slot = (car, k, landed = true) => ({ car, k, landed, animal: landed ? { id: car * 10 + k } : null });
  const slots = [slot(1, 0), slot(0, 2), slot(0, 0), slot(0, 1, false)];
  const order = singOrder(slots);
  assert.deepEqual(order.map(o => o.animal.id), [0, 2, 10]);
  assert.ok(slotIndex(slots[2]) < slotIndex(slots[1]) && slotIndex(slots[1]) < slotIndex(slots[0]));
  assert.deepEqual(order.map(o => +o.delay.toFixed(3)), [SING.start, SING.start + SING.gap, SING.start + 2 * SING.gap].map(d => +d.toFixed(3)));
  assert.deepEqual(singOrder([]), []);
});
