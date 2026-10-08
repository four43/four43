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
  const p = createPilot(), thr = deg => p.update(at(deg), 0, 0, 0).thr;
  assert.equal(thr(20), 1); assert.ok(thr(60) < 1 && thr(60) > PILOT.crawl); assert.ok(Math.abs(thr(120) - PILOT.crawl) < 1e-9);
});
test('the stick is always read against the camera now: held right with the camera behind the tractor, it still turns right (C-2)', () => {
  const p = createPilot(); p.update(at(90), 0, 0, 0);
  const o = p.update(at(90), -90 * R, -90 * R, 3); // the tractor turned right; the camera followed it
  assert.ok(o.steer < -0.9, `steer ${o.steer}`);
});
test('release gives no drive', () => {
  assert.deepEqual({ ...createPilot().update({ x: 0, y: 0 }, 0, 0, 0) }, { thr: 0, steer: 0, turn: 0, onTarget: true });
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
  assert.equal(p.update(at(90), 0, 0, PILOT.helpSpeed + 1).turn, 0);
  assert.equal(p.update(at(10), 0, 0, 0).turn, 0);
});

// Closed loop: a real tractor, the pilot and a camera that swings behind the tractor as the chase camera does (V-2)
import RAPIER from '@dimforge/rapier3d-compat';
import { createPhysics, DT } from '../src/sim/physics.js';
import { createTractor, TP } from '../src/sim/tractor.js';
await RAPIER.init();
const drive = () => {
  const phys = createPhysics(RAPIER), t = createTractor(phys, { x: 0, z: 0, yaw: 0, surfaceAt: () => 'gravel' }), p = createPilot();
  let cam = null;
  const run = (sec, stick, each) => { for (let i = 0; i < sec * 60; i++) {
    const lv = t.body.linvel(), want = t.fwd > 2 ? Math.atan2(lv.x, lv.z) : t.yaw; if (cam === null) cam = want; cam += wrap(want - cam) * Math.min(1, DT * 3);
    const o = p.update(stick, cam, t.yaw, t.speed); t.setInput(o.thr, o.steer, o.turn); t.step(DT); phys.world.step(); each?.(o); } };
  return { t, run };
};
test('closed loop: held right, the tractor drives round in a circle (C-2, review 3)', () => {
  const { t, run } = drive(); run(1, { x: 0, y: 0 }); let turned = 0, prev = t.yaw;
  run(10, at(90), () => { turned += wrap(t.yaw - prev); prev = t.yaw; });
  assert.ok(turned < -2 * Math.PI, `turned ${(turned / R).toFixed(0)} deg: at least one full circle to the right`);
});
test('closed loop: held up, the tractor drives straight on', () => {
  const { t, run } = drive(); run(1, { x: 0, y: 0 }); run(4, at(0)); assert.ok(Math.abs(wrap(t.yaw)) < 5 * R, `yaw ${t.yaw / R}`); assert.ok(t.speed > 6);
});
test('closed loop: held down, the tractor backs up straight (C-8)', () => {
  const { t, run } = drive(); run(1, { x: 0, y: 0 }); const p0 = t.body.translation(); run(2, at(180));
  const p1 = t.body.translation(); assert.ok(p1.z < p0.z - 1, `moved ${p1.z - p0.z}`); assert.ok(Math.abs(wrap(t.yaw)) < 10 * R, `yaw ${t.yaw / R}`);
});
test('closed loop: down-left backs the rear toward the screen left (C-8)', () => {
  const { t, run } = drive(); run(1, { x: 0, y: 0 }); const p0 = t.body.translation(); run(2.5, at(-155));
  const p1 = t.body.translation(); assert.ok(p1.x > p0.x + 0.3, `rear went ${p1.x - p0.x} (screen left is +x)`);
});
test('closed loop: from a standstill, stick behind-left turns the tractor left in a small space (C-10)', () => {
  const { t, run } = drive(); run(1, { x: 0, y: 0 }); const p0 = t.body.translation(); let turned = 0, prev = t.yaw;
  run(3, at(-120), () => { turned += wrap(t.yaw - prev); prev = t.yaw; });
  const p1 = t.body.translation(); assert.ok(turned > 90 * R, `turned ${(turned / R).toFixed(0)} deg`);
  assert.ok(Math.hypot(p1.x - p0.x, p1.z - p0.z) < 10, `used ${Math.hypot(p1.x - p0.x, p1.z - p0.z)} m`);
});
test('turn help: with no help the tractor turns less in the same time', () => {
  const turn = help => { const k = TP.turnHelp; TP.turnHelp = help; try { const { t, run } = drive(); run(1, { x: 0, y: 0 }); let n = 0, prev = t.yaw; run(2, at(-135), () => { n += wrap(t.yaw - prev); prev = t.yaw; }); return n; } finally { TP.turnHelp = k; } };
  const a = turn(TP.turnHelp), b = turn(0); assert.ok(a > b * 1.3, `with help ${(a / R).toFixed(0)} deg, without ${(b / R).toFixed(0)} deg`);
});
