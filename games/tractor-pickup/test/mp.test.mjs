// test/mp.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mpWorld, inFront, free, STILL, PAINTS, moveTrain } from './mp.harness.mjs';
import { spawnPoint } from '../src/sim/spawn.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const drive = (d, i) => i === 1 ? { thr: 0.6, steer: 0.2, horn: false } : STILL;

test('a guest gets the welcome, makes the host farm and starts at its spawn place (M-1, M-10, M-24)', async () => {
  const w = await mpWorld({ seed: 21 }); w.seconds(0.5);
  const g = w.guests[0];
  assert.equal(g.game.farm.seed, 21); assert.equal(g.sync.you, 2);
  const p = spawnPoint(g.game.farm, 2); assert.ok(Math.hypot(g.game.tractor.x - p.x, g.game.tractor.z - p.z) < 0.5);
  assert.equal(g.game.herd.remote, true); assert.equal(g.game.claims, true);
  assert.deepEqual(w.host.sync.players.list().map(x => [x.n, x.paint]), [[2, PAINTS[1]]]);
  assert.deepEqual(g.sync.players.list().map(x => [x.n, x.paint]), [[1, PAINTS[0]]]);
  assert.ok(g.events.some(e => e.type === 'playerJoined' && e.n === 1) && w.host.events.some(e => e.type === 'playerJoined' && e.n === 2));
});
test('both devices see the other tractor where it really is, about 100 ms behind (M-11, M-22, M-25)', async () => {
  const w = await mpWorld({ seed: 22 }); w.seconds(4, drive);
  const g = w.guests[0], seen = w.host.sync.players.map.get(2).pose.tractor.p, real = g.game.tractor;
  assert.ok(dist(seen, real) < 0.2 + real.speed * 0.15, `host sees the guest ${dist(seen, real).toFixed(2)} m off`);
  const hs = g.sync.players.map.get(1).pose.tractor.p; assert.ok(dist(hs, w.host.game.tractor) < 0.2);
  assert.ok(w.host.game.others.length === 1 && Math.abs(w.host.game.others[0].speed - real.speed) < 1.5, 'the herd knows the guest tractor and its speed');
});
test('the guest shows the host animals where the host has them (M-3, M-12, M-23)', async () => {
  const w = await mpWorld({ seed: 23 }); w.seconds(6);
  const h = w.host.game.herd, g = w.guests[0].game.herd;
  for (const a of h.free()) { const b = g.animals[a.id]; assert.ok(b, `guest has ${a.id}`); assert.equal(b.type, a.type);
    assert.ok(dist(a, b) < 0.5, `animal ${a.id} ${dist(a, b).toFixed(2)} m off`); assert.ok(free(w.guests[0].game, b) || a.hidden === b.hidden); }
});
test('it still works over a far network: 300 ms, jitter 80 ms, 5% loss (M-25, M-28)', async () => {
  const w = await mpWorld({ seed: 24, link: { delay: 300, jitter: 80, loss: 0.05 } }); w.seconds(8, drive);
  const g = w.guests[0]; assert.equal(g.game.farm.seed, 24);
  const seen = w.host.sync.players.map.get(2).pose.tractor.p; assert.ok(dist(seen, g.game.tractor) < 3, `${dist(seen, g.game.tractor)}`);
  const h = w.host.game.herd; let near = 0, all = 0;
  for (const a of h.free()) { all++; if (dist(a, g.game.herd.animals[a.id]) < 1.5) near++; }
  assert.ok(near >= all * 0.9, `${near}/${all} animals close`);
});
test('three guests: players 2, 3 and 4 each see all the others (M-2, M-22 relay)', async () => {
  const w = await mpWorld({ seed: 25, guests: 3 }); w.seconds(2);
  assert.deepEqual(w.guests.map(g => g.sync.you), [2, 3, 4]);
  for (const g of w.guests) assert.deepEqual(g.sync.players.list().map(p => p.n).sort(), [1, 2, 3, 4].filter(n => n !== g.sync.you));
  const g4 = w.guests[2], seen = g4.sync.players.map.get(2).pose.tractor.p; assert.ok(dist(seen, w.guests[0].game.tractor) < 0.3);
});
test('a guest joins a host whose animals have turned many times: yaws go out in 0..2 pi (M-24)', async () => {
  const w = await mpWorld({ seed: 26, join: false }); w.host.game.herd.animals.forEach((a, i) => { a.yaw = 500 + i; }); // herd yaws drift without bound in play (171 rad after 20 min)
  const g = w.addGuest(); w.seconds(0.5);
  assert.equal(g.sync.you, 2); assert.equal(g.game.farm.seed, 26);
});
test('a host id far past the herd is dropped and a leader the guest lacks is no leader (M-44, M-50)', async () => {
  const w = await mpWorld({ seed: 27 }); w.seconds(0.5);
  const g = w.guests[0], rec = (id, leader) => ({ id, type: 'pig', golden: false, home: 'yard', leader, line: 1, x: 1, z: 2, yaw: 0, epoch: 0, state: 'free', hidden: true });
  g.sync.handlers.welcome({ t: 'welcome', v: 1, seed: 27, you: 2, players: [{ n: 1, paint: PAINTS[0], away: false }], herd: [rec(0, 40000), rec(1, 0), rec(60000, null)], trees: [], next: 2 });
  const n = g.game.herd.animals.length; assert.ok(n < 100, `${n} animals`);
  const [a0, a1] = g.game.herd.animals; assert.equal(a0.leader, null); assert.equal(a1.leader, 0); assert.equal(a0.home, 'yard'); assert.equal(a0.hidden, true);
  const { encodeHerd } = await import('../src/net/codec.js');
  w.host.sync.after = () => {}; w.step(); // the host goes quiet: only the herd message below reaches the guest
  w.host.net.send(g.net.id, encodeHerd({ time: w.now + 1, animals: [{ ...rec(0, 50000), x: 33, z: 44, hidden: false, busy: false, y: 0, anim: 'idle' }, { ...rec(65000, null), hidden: false, busy: false, y: 0, anim: 'idle' }] }), false);
  w.seconds(1);
  const b0 = g.game.herd.animals[0]; assert.equal(g.game.herd.animals.length, n);
  assert.deepEqual([b0.x, b0.z, b0.hidden, b0.state, b0.leader], [33, 44, false, 'idle', null], 'the message was applied, without its unknown leader');
});
test('a guest joins a host that has played long (most of 600+ animals gone): it sees the live ones by their real ids (M-24, M-50)', async () => {
  const w = await mpWorld({ seed: 28, join: false }), h = w.host.game.herd, old = h.animals.slice();
  for (let i = 0; i < 600; i++) h.ensure(h.animals.length, 'pig', false).state = 'gone';
  for (const a of old) { const b = h.animals[a.id + 600]; Object.assign(b, { type: a.type, golden: a.golden, home: a.home, x: a.x, z: a.z, yaw: a.yaw, state: 'idle', timer: 99, leader: null, line: 0, hidden: false }); a.state = 'gone'; a.leader = null; }
  assert.ok(h.animals.length > 512);
  const g = w.addGuest(); w.seconds(1);
  assert.equal(g.sync.you, 2); assert.equal(g.game.farm.seed, 28);
  const live = h.free(); assert.ok(live.length >= old.length && live.every(a => a.id >= 600));
  for (const a of live) { const b = g.game.herd.animals[a.id]; assert.ok(b, `guest has ${a.id}`); assert.equal(b.type, a.type);
    assert.ok(free(g.game, b), `${a.id} is ${b.state}`); assert.ok(dist(a, b) < 0.5, `animal ${a.id} ${dist(a, b).toFixed(2)} m off`); }
  assert.equal(g.game.herd.animals[0].state, 'gone');
});
