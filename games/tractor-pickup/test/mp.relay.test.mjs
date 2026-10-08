// test/mp.relay.test.mjs: what a guest can make the host do (C-3, C-4, M-50)
import test from 'node:test';
import assert from 'node:assert/strict';
import { mpWorld, free, countCalls, trainFrame, parked } from './mp.harness.mjs';
import { encodeFrame } from '../src/net/replica.js';
import { TRAIN } from '../src/net/kinds.js';
import { GUEST_SPEED } from '../src/net/host.js';
import { POWER } from '../src/sim/tractor.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

test('the host passes on each guest train at most once a send tick, on the fast channel, with the newest record (C-3)', async () => {
  const w = await mpWorld({ seed: 81, guests: 3 }); w.seconds(1);
  const [g2, g3, g4] = w.guests, H = w.host.net.id, count = { fast: 0, rel: 0 };
  w.hub.drop = (from, to, d, rel) => { if (from === H && to === g3.net.id) count[rel ? 'rel' : 'fast']++; return false; };
  let t = 100000;
  for (let i = 0; i < 60; i++) { // two guests flood the host with 600 train frames a second each
    for (let k = 0; k < 10; k++) { g2.net.send(H, trainFrame(2, 2, parked(10 + k, 0), t++), false); g4.net.send(H, trainFrame(4, 4, parked(0, 10 + k), t++), false); }
    w.step(1);
  }
  assert.ok(count.fast <= 90, `${count.fast} fast messages to the other guest in 1 s (host world 15 + host train 20 + 2 trains x 20)`);
  assert.ok(count.rel <= 12, `${count.rel} reliable messages to the other guest in 1 s`);
  w.hub.drop = null; w.seconds(0.3);
  const lx = g3.sync.players.map.get(2).latest.bodies[0].p.x, hx = w.host.sync.players.map.get(2).latest.bodies[0].p.x;
  assert.ok(hx >= 10 && Math.abs(lx - hx) < 0.1, `the other guest has the newest record the host took (x ${lx}, the host ${hx})`);
});

test("a guest's reliable frames have their own small limit, so its requests still count (C-3, M-50)", async () => {
  const w = await mpWorld({ seed: 82 }); w.seconds(1);
  const g = w.guests[0], H = w.host.net.id, horns = countCalls(w.host.sync, 'horn');
  for (let i = 0; i < 100; i++) g.net.send(H, encodeFrame({ key: true, sender: 2, time: 100000 + i, groups: [{ kind: TRAIN, records: [[2, parked(0, 0)]] }] }), true);
  g.net.send(H, { t: 'horn' }, true); w.step(1);
  assert.equal(horns(), 1, 'the horn after the flood is handled');
});

test("the guest speed cap is a tractor's top speed with a margin (C-4)", () => {
  const top = Math.max(...Object.values(POWER).map(p => p.vmax));
  assert.ok(GUEST_SPEED > top && GUEST_SPEED <= top * 2, `${GUEST_SPEED} m/s for a ${top} m/s tractor`);
});

test('a guest that reports a jump is held to tractor speed for claims and tree breaks (C-4, M-50)', async () => {
  const w = await mpWorld({ seed: 83 }); w.seconds(1);
  const g = w.guests[0], H = w.host.net.id, at = { ...w.host.sync.players.map.get(2).latest.bodies[0].p };
  const ha = w.host.game.herd.free().find(a => !a.hidden && a.type !== 'chick' && a.home === 'route' && dist(a, at) > 60 && !w.host.game.herd.animals.some(c => c.leader === a.id));
  const tree = w.host.game.trees.list.find(x => x.kind === 'tree' && dist(x, at) > 60);
  assert.ok(ha && tree, 'an animal and a tree far from the guest');
  g.sync.after = () => {}; // only the frames below
  let t = 100000;
  const report = (x, z) => { g.net.send(H, trainFrame(2, 2, parked(x, z), t += 50), false); w.step(3); };
  const hold = a => { a.state = 'idle'; a.timer = 99; };
  hold(ha); for (let i = 0; i < 3; i++) report(ha.x, ha.z);
  g.net.send(H, { t: 'claim', ids: [ha.id] }, true); w.step(6);
  assert.ok(free(w.host.game, ha), 'refused: no tractor gets there that fast');
  for (let i = 0; i < 3; i++) report(tree.x - 2, tree.z);
  g.net.send(H, { t: 'tree', id: tree.id }, true); w.step(6);
  assert.notEqual(w.host.game.trees.list[tree.id].state, 'broken', 'refused too');
  // a guest that stays there is believed once a tractor could have driven there
  const s = dist(ha, at) / GUEST_SPEED + 1;
  for (let i = 0; i < s * 20; i++) { hold(ha); report(ha.x, ha.z); }
  g.net.send(H, { t: 'claim', ids: [ha.id] }, true); w.step(6);
  assert.equal(ha.state, 'carried'); assert.equal(ha.owner, 2);
});
