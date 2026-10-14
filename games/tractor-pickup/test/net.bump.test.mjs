// Two sims, two solid trains (3l Task 24): when the tractors meet, each device's own sim sees the contact and honks once.
import test from 'node:test';
import assert from 'node:assert/strict';
import { engineWorld } from './mp.engine.harness.mjs';
import { moveTrain } from '../src/game/farm.js';
test('host and guest tractors collide head-on: both get exactly one bump event', async () => {
  const w = await engineWorld({ seed: 43 }); w.seconds(3);
  const h = w.host.game.tractor, g = w.guests[0];
  moveTrain(g.game, h.x + Math.sin(h.yaw) * 14, h.z + Math.cos(h.yaw) * 14, h.yaw + Math.PI, { ground: true }); w.seconds(1);
  const bumps = d => d.events.filter(e => e.type === 'bump').length, b0 = [bumps(w.host), bumps(g)];
  w.seconds(5, () => ({ thr: 0.7, steer: 0, horn: false }));
  assert.equal(bumps(w.host) - b0[0], 1, 'host'); assert.equal(bumps(g) - b0[1], 1, 'guest');
  assert.ok(Math.hypot(h.x - g.game.tractor.x, h.z - g.game.tractor.z) > 2.5, 'they did not pass through');
});
