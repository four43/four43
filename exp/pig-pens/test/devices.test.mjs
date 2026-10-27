// lion-hawk 0.13 (C-5, C-10): the keys are the 'farm' mapping context on one seat; the tools stay a boot device.
import test from 'node:test';
import assert from 'node:assert/strict';
import { KEYS, devices, farmContext, useSeats } from '../src/devices.js';

test('device setup is the farm context (lion-hawk C-5, C-10): the keys on one seat; the tools stay a boot device (review focus)', () => {
  const doc = { defaultView: {}, getElementById: () => null };
  const ctx = farmContext();
  assert.equal(ctx.keys.all.bindings, KEYS); assert.equal(ctx.pads, undefined, 'no gamepad, as before'); assert.equal(ctx.touch, undefined, 'no touch controls');
  const calls = [], view = { context: (n, d) => calls.push(['context', n, d]), seats: o => { calls.push(['seats', o]); return []; } };
  useSeats(view, doc);
  assert.deepEqual(calls.map(c => c[0]), ['context', 'seats']); assert.equal(calls[0][1], 'farm');
  assert.equal(calls[1][1].max, 1); assert.deepEqual(calls[1][1].contexts, ['farm']); assert.equal(calls[1][1].join({ kind: 'pad', index: 1 }), 0);
  assert.equal(devices(doc).length, 1, 'only the pointer tools: a keyboard device beside the context would bind twice');
});
