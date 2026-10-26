import test from 'node:test';
import assert from 'node:assert/strict';
import { launchLocal, flourishAngle, FLIGHT } from '../src/sim/launch.js';
const start = { x: 3, y: 0.3, z: 0.5 }, slot = { x: -5, y: 0.9, z: -0.45 }, p = { x: 0, y: 0, z: 0 };

test('starts at the boop point and ends exactly in the slot', () => {
  launchLocal(0, start, slot, p); assert.deepEqual([p.x, p.y, p.z].map(v => +v.toFixed(6)), [3, 0.3, 0.5]);
  launchLocal(1, start, slot, p); assert.deepEqual([p.x, p.y, p.z].map(v => +v.toFixed(6)), [-5, 0.9, -0.45]);
});
test('goes up and over the cab', () => {
  let peak = 0, overCab = Infinity;
  for (let u = 0; u <= 1; u += 0.01) { launchLocal(u, start, slot, p); peak = Math.max(peak, p.y); if (p.x < 0.6 && p.x > -1.6) overCab = Math.min(overCab, p.y); }
  assert.ok(peak > 5, `peak ${peak}`); assert.ok(overCab > 3.2, `over cab ${overCab}`);
});
test('moves backward overall', () => {
  const xs = [0.2, 0.5, 0.8].map(u => launchLocal(u, start, slot, p).x); assert.ok(xs[0] > xs[1] && xs[1] > xs[2]);
});
test('every animal type has a flight and flourishes end at rest', () => {
  for (const t of ['pig', 'cow', 'chicken', 'sheep', 'duck', 'bunny', 'dog', 'chick']) {
    assert.ok(FLIGHT[t].dur >= 1 && FLIGHT[t].dur <= 1.4);
    const a = flourishAngle(FLIGHT[t].flourish, 1); assert.ok(Math.abs(Math.sin(a)) < 1e-9);
  }
});
