// M-7 (3l, user decision 2026-10-13): tractors are solid; a tractor-to-tractor contact honks once, and again only after the two have
// been apart for BUMP.cool s (a sustained push honks once).
import test from 'node:test';
import assert from 'node:assert/strict';
import { testWorld } from './helpers/world.mjs';
import { addGround, DT } from '../src/sim/ground.js';
import { createTractor } from '../src/sim/tractor.js';
import { createBumper, BUMP } from '../src/sim/bump.js';

function pair() {
  const { world, step } = testWorld(); addGround(world);
  const a = createTractor(world, { x: 0, z: 0, yaw: 0 }), b = createTractor(world, { x: 0, z: 9, yaw: Math.PI });
  b.e.netId = 2; b.e.remote = { tractor: b }; world.add(b.e, 'net', 'train'); // b plays the other player's train (no session: this test game has no net part, so 'net' is a plain part here)
  const bumper = createBumper(world), events = [], game = { mode: 'drive', tractor: a };
  const run = (sec, thrA, thrB) => step(Math.round(sec / DT), () => { a.setInput(thrA, 0); a.step(DT); b.setInput(thrB, 0); b.step(DT); bumper.drive(game, events); });
  return { a, b, run, events };
}
test('tractors collide (they no longer pass through each other)', () => {
  const { a, b, run } = pair(); run(1, 0, 0); run(4, 1, 1);
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > 2.5, 'the bodies stop each other');
});
test('a sustained push honks once', () => {
  const { run, events } = pair(); run(1, 0, 0); run(5, 1, 1);
  assert.equal(events.filter(e => e.type === 'bump').length, 1); assert.equal(events[0].other, 2);
});
test('apart for BUMP.cool, then touching again, honks again; apart for less does not', () => {
  const { run, events } = pair(); run(1, 0, 0); run(3, 1, 1);
  run(BUMP.cool * 0.5, -1, -1); run(1.5, 1, 1); assert.equal(events.length, 1, 'a short gap is the same bump');
  run(2, -1, -1); run(4, 1, 1); assert.equal(events.length, 2);
});
