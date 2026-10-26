// The point-to-go pilot in the world frame (lion-hawk 2f T3, #81): the same driving as the camera-frame pilot.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPilot, stickToWorld, PILOT } from '../src/sim/pilot.js';
import { makeRng } from '../src/sim/rng.js';

test('drive(stickToWorld(stick, camYaw)) gives what update(stick, camYaw) gives', () => {
  const r = makeRng(5), a = createPilot(), b = createPilot(), w = {};
  for (let i = 0; i < 4000; i++) {
    const ang = r.range(-Math.PI, Math.PI), m = r.next() < 0.1 ? 0 : r.range(0, 1.3), stick = { x: Math.sin(ang) * m, y: Math.cos(ang) * m };
    const cam = r.range(-20, 20), yaw = r.range(-20, 20), speed = r.range(0, 9);
    const u = { ...a.update(stick, cam, yaw, speed) }; stickToWorld(stick.x, stick.y, cam, w);
    const d = b.drive(w.goX, w.goZ, w.goBack, yaw, speed);
    for (const k of ['thr', 'steer', 'turn']) assert.ok(Math.abs(u[k] - d[k]) < 1e-9, `${k} ${u[k]} vs ${d[k]} (case ${i})`);
    const e = Math.abs(Math.atan2(Math.sin(cam - Math.atan2(stick.x, stick.y) - yaw), Math.cos(cam - Math.atan2(stick.x, stick.y) - yaw)));
    if (Math.abs(e - PILOT.fullErr) > 1e-6) assert.equal(u.onTarget, d.onTarget, `case ${i}`);
  }
});
test('the reverse cone is the stick\'s, on the screen: straight down reverses whatever the world direction', () => {
  const w = {}; stickToWorld(0, -1, 2.0, w); assert.equal(w.goBack, true);
  stickToWorld(Math.sin(Math.PI - PILOT.revCone + 0.05), Math.cos(Math.PI - PILOT.revCone + 0.05), 0, w); assert.equal(w.goBack, true);
  stickToWorld(1, 0, 0, w); assert.equal(w.goBack, false); stickToWorld(0, 0, 1, w); assert.deepEqual([w.goX, w.goZ, w.goBack], [0, 0, false]);
});
