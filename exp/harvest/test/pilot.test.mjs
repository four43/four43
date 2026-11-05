// The pilot's lane hold (H-C5) on its own: the row it takes, the stick share that keeps it, letting go of it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPilot, nearestAxis } from '../src/sim/pilot.js';

const D = Math.PI / 180, at = yaw => [Math.sin(yaw), Math.cos(yaw)];

test('nearestAxis: the field axis nearest a heading', () => {
  assert.equal(nearestAxis(10 * D), 0); assert.equal(nearestAxis(80 * D), 90 * D); assert.equal(nearestAxis(-100 * D), -90 * D);
});
test('the hold takes the axis nearest the heading and keeps it for a stick within the share', () => {
  const p = createPilot();
  let o = p.drive(...at(20 * D), false, 15 * D, 0, 0.75);
  assert.equal(o.line, 0); assert.ok(o.steer < 0, 'steers back toward the row'); // heading 15°, the row 0°
  o = p.drive(...at(-60 * D), false, 0, 0, 0.75); // 60° off the row, under 67.5°
  assert.equal(o.line, 0); assert.equal(o.steer, 0);
});
test('past the share, or backing up, or no stick, or no hold: the stick steers and the line is let go', () => {
  const p = createPilot();
  p.drive(...at(0), false, 0, 0, 0.75);
  let o = p.drive(...at(-70 * D), false, 0, 0, 0.75); assert.equal(o.line, null); assert.ok(o.steer < 0);
  o = p.drive(...at(-30 * D), false, 0, 0, 0); assert.equal(o.line, null); assert.ok(o.steer < 0);
  p.drive(...at(0), false, 0, 0, 0.75); o = p.drive(0, 0, false, 0, 0, 0.75); assert.equal(o.line, null);
  o = p.drive(...at(Math.PI - 10 * D), true, 0, 0, 0.75); assert.equal(o.line, null); assert.ok(o.thr < 0);
});
