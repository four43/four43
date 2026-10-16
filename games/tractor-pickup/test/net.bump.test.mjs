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

// a seeded loss draw, so the run is the same every time
const lossRng = () => { let s = 7; return () => ((s = Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x6d2b79f5 | 0) >>> 0) / 4294967296; };
test('R5: under 80 ms latency and 2 % loss, 1 s after contact both peers hold each train within 0.5 m of its owner, and no correction exceeds snapAt during the bump', async () => {
  const w = await engineWorld({ seed: 47, link: { delay: 80, loss: 0.02, rng: lossRng() } }); w.seconds(4);
  const H = w.host, G = w.guests[0], h = H.game.tractor, gn = G.engine.world.net.self;
  moveTrain(G.game, h.x + Math.sin(h.yaw) * 14, h.z + Math.cos(h.yaw) * 14, h.yaw + Math.PI, { ground: true }); w.seconds(1.5);
  const rem = (d, n) => d.engine.world.net.find('train', n), snaps = () => H.engine.world.net.stats.kinds.train.snaps + G.engine.world.net.stats.kinds.train.snaps;
  const snaps0 = snaps(), watch = () => {}; // 3i sets netFix only on snaps (its Contract issue 5): no snap = no correction over snapAt
  let contact = -1; const bumps0 = H.events.filter(e => e.type === 'bump').length;
  for (let i = 0; i < 6 * 60; i++) { w.step(1, [{ thr: 0.7, steer: 0, horn: false }, { thr: 0.7, steer: 0, horn: false }]); watch();
    if (contact < 0 && H.events.filter(e => e.type === 'bump').length > bumps0) contact = i; if (contact >= 0 && i >= contact + 60) break; }
  assert.ok(contact >= 0, 'they met');
  const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  assert.ok(d(rem(H, gn).body.translation(), G.game.tractor.body.translation()) < 0.5, 'the host holds the guest\'s train');
  assert.ok(d(rem(G, 1).body.translation(), H.game.tractor.body.translation()) < 0.5, 'the guest holds the host\'s train');
  assert.equal(snaps(), snaps0, 'no correction over snapAt (a snap) during the bump');
});
