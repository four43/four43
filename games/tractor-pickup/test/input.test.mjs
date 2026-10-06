import test from 'node:test';
import assert from 'node:assert/strict';
import { circleToSquare } from '../src/ui/input.js';
const near = (a, b) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-3, `${a} vs ${b}`));

test('circle to square: center stays at rest', () => { assert.deepEqual(circleToSquare(0, 0), [0, 0]); });
test('circle to square: points on an axis stay on it', () => {
  near(circleToSquare(1, 0), [1, 0]); near(circleToSquare(0, -1), [0, -1]); near(circleToSquare(0.5, 0), [0.5, 0]); near(circleToSquare(0, 0.3), [0, 0.3]);
});
test('circle to square: a full diagonal gives full throttle and full steer', () => {
  near(circleToSquare(Math.SQRT1_2, Math.SQRT1_2), [1, 1]); near(circleToSquare(-Math.SQRT1_2, Math.SQRT1_2), [-1, 1]); near(circleToSquare(0.3535, -0.3535), [0.5, -0.5]);
});
test('circle to square: never beyond 1 on either axis', () => {
  for (let a = 0; a < Math.PI * 2; a += 0.01) for (const r of [0.2, 0.7, 1, 1.05]) {
    const [x, y] = circleToSquare(Math.cos(a) * r, Math.sin(a) * r); assert.ok(Math.abs(x) <= 1 && Math.abs(y) <= 1);
  }
});
