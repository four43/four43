import test from 'node:test';
import assert from 'node:assert/strict';
import { createPilot, PILOT } from '../src/sim/pilot.js';

const R = Math.PI / 180, wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const at = (deg, m = 1) => ({ x: Math.sin(deg * R) * m, y: Math.cos(deg * R) * m }); // stick angle: 0 up, +90 right

test('stick up drives straight on at the stick speed (C-1)', () => {
  const p = createPilot(), o = p.update(at(0, 0.6), 0, 0, 0);
  assert.ok(Math.abs(o.thr - 0.6) < 1e-9); assert.ok(Math.abs(o.steer) < 1e-9); assert.equal(o.turn, 0); assert.equal(o.onTarget, true);
});
test('stick right steers right and slows to a crawl (C-9)', () => {
  const p = createPilot(), o = p.update(at(90), 0, 0, 0);
  assert.ok(o.steer < -0.9, `steer ${o.steer}`); assert.ok(Math.abs(o.thr - PILOT.crawl) < 1e-9, `thr ${o.thr}`); assert.equal(o.onTarget, false);
});
test('the speed falls from full at 30 degrees to a crawl at 90 degrees', () => {
  const p = createPilot(), thr = deg => { p.reset(); return p.update(at(deg), 0, 0, 0).thr; };
  assert.equal(thr(20), 1); assert.ok(thr(60) < 1 && thr(60) > PILOT.crawl); assert.ok(Math.abs(thr(120) - PILOT.crawl) < 1e-9);
});
test('held right: the direction lock holds while the camera swings behind the tractor (C-2)', () => {
  const p = createPilot(); p.update(at(90), 0, 0, 0);
  const o = p.update(at(90), -90 * R, -90 * R, 3); // the tractor turned right; the camera followed it
  assert.ok(Math.abs(o.steer) < 1e-6, `steer ${o.steer}`); assert.equal(o.thr, 1);
});
test('a small stick change keeps the lock; a big one locks again to the camera (C-2)', () => {
  const p = createPilot(); p.update(at(90), 0, 0, 0);
  let o = p.update(at(100), -90 * R, -90 * R, 3); // 10 degrees more: the same frame, so 10 degrees right of the tractor
  assert.ok(o.steer < 0 && o.onTarget, `steer ${o.steer}`);
  o = p.update(at(0), -90 * R, -90 * R, 3); // up: a new lock from the camera now: straight on
  assert.ok(Math.abs(o.steer) < 1e-6, `steer ${o.steer}`);
});
test('release unlocks', () => {
  const p = createPilot(); p.update(at(90), 0, 0, 0);
  assert.deepEqual({ ...p.update({ x: 0, y: 0 }, 0, 0, 0) }, { thr: 0, steer: 0, turn: 0, onTarget: true });
  const o = p.update(at(90), -90 * R, -90 * R, 0); // a new press: right of the camera now
  assert.ok(o.steer < -0.9);
});
test('stick straight down reverses at the stick speed (C-8)', () => {
  const p = createPilot(), o = p.update(at(180, 0.5), 0, 0, 0);
  assert.ok(Math.abs(o.thr + 0.5) < 1e-9); assert.ok(Math.abs(o.steer) < 1e-6); assert.equal(o.turn, 0);
});
test('down-left in the reverse cone swings the rear to the screen left (C-8)', () => {
  // the rear heading (yaw + 180) must turn toward 160 deg (screen left is +90): down. Backing up, positive steer turns the yaw down.
  const p = createPilot(), o = p.update(at(-160), 0, 0, 0);
  assert.ok(o.thr < 0);
  const rearErr = wrap(160 * R - Math.PI); // the target is 20 degrees clockwise (yaw down) of the rear heading
  assert.ok(rearErr < 0);
  assert.ok(o.steer > 0, `steer ${o.steer}`); // positive steer in reverse turns the yaw (and the rear) down
});
test('behind but out of the cone turns around and drives forward (C-8)', () => {
  const p = createPilot(), o = p.update(at(-130), 0, 0, 0);
  assert.ok(o.thr > 0); assert.ok(o.steer > 0.9, `steer ${o.steer}`); // turns left, toward the back-left
});
test('turn help only when slow and well off target (C-10)', () => {
  const p = createPilot();
  assert.equal(p.update(at(90), 0, 0, 0.5).turn, -1);
  p.reset(); assert.equal(p.update(at(90), 0, 0, PILOT.helpSpeed + 1).turn, 0);
  p.reset(); assert.equal(p.update(at(10), 0, 0, 0).turn, 0);
});
