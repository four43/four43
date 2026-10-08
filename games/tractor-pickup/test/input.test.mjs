import test from 'node:test';
import assert from 'node:assert/strict';
import { radial } from '../src/ui/input.js';
const near = (a, b) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-3, `${a} vs ${b}`));

test('radial: inside the dead zone the stick is at rest', () => { assert.deepEqual(radial(0, 0), [0, 0]); assert.deepEqual(radial(0.05, -0.05), [0, 0]); });
test('radial: the direction stays the same', () => {
  for (const [x, y] of [[1, 0], [0, -0.5], [0.3, 0.4], [-0.6, 0.6]]) { const [rx, ry] = radial(x, y); near([Math.atan2(rx, ry)], [Math.atan2(x, y)]); }
});
test('radial: full travel is length 1, never more, and the length grows from 0 past the dead zone', () => {
  near([Math.hypot(...radial(Math.SQRT1_2, Math.SQRT1_2))], [1]); near([Math.hypot(...radial(0, 1.3))], [1]);
  near([Math.hypot(...radial(0.55, 0))], [0.5]);
});
