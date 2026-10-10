// test/mp.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mpWorld, inFront, free, single, countCalls, quietWarn, STILL, PAINTS, moveTrain, sendAnimals, trainFrame, animalRec, parked, settle } from './mp.harness.mjs';
import { CLAIM_RANGE, TREE_RANGE } from '../src/net/host.js';
import { spawnPoint } from '../src/sim/spawn.js';
import { makeRng } from '../src/sim/rng.js';
import { GONE_KEEP, ROUTE_ANIMALS, PER_PLAYER } from '../src/sim/herd.js';

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
  const w = await mpWorld({ seed: 24, link: { delay: 300, jitter: 80, loss: 0.05, rng: makeRng(24).next } }); w.seconds(8, drive); // a seeded link: the same run every time
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
  const g = w.guests[0], n = g.game.herd.animals.length, rec = (leader, o) => animalRec({ home: 'yard', hidden: true, x: 1, z: 2, leader, line: 1, ...o });
  w.host.sync.after = () => {}; w.step(); // the host goes quiet: only the frames below reach the guest
  sendAnimals(w, g, [[0, rec(40000)], [1, rec(0)], [60000, rec(null)]]); w.seconds(0.5);
  assert.equal(g.game.herd.animals.length, n, 'no animals grown up to 60000');
  const [a0, a1] = g.game.herd.animals; assert.equal(a0.leader, null); assert.equal(a1.leader, 0); assert.equal(a0.home, 'yard'); assert.equal(a0.hidden, true);
  sendAnimals(w, g, [[0, rec(50000, { x: 33, z: 44, hidden: false })], [65000, rec(null)]]); w.seconds(1);
  const b0 = g.game.herd.animals[0]; assert.equal(g.game.herd.animals.length, n);
  assert.deepEqual([b0.x, b0.z, b0.hidden, b0.state, b0.leader], [33, 44, false, 'idle', null], 'the record was applied, without its unknown leader');
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


test('a guest boop is claimed and granted: the animal lands in the guest wagon, and the host shows it there (M-13, M-14)', async () => {
  const w = await mpWorld({ seed: 31 }); w.seconds(1);
  const g = w.guests[0], ha = single(w.host.game), ga = g.game.herd.animals[ha.id];
  { const p = g.game.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); ha.x = ga.x = p.x; ha.z = ga.z = p.z; ha.state = ga.state = 'idle'; ha.timer = ga.timer = 99; } // in front of the guest on both devices
  w.seconds(3);
  assert.ok(g.events.some(e => e.type === 'land' && e.animal.id === ha.id), 'it landed on the guest');
  assert.equal(ha.state, 'carried'); assert.equal(ha.owner, 2); assert.equal(ha.epoch, 1);
  w.seconds(0.5);
  assert.ok(dist(ha, ga) < 0.6, `host draws it in the guest wagon (${dist(ha, ga).toFixed(2)} m)`);
});
test('when host and guest boop the same animal at once, the host is first; the guest copy poofs (M-14, M-15)', async () => {
  const w = await mpWorld({ seed: 32, link: { delay: 80 } }); w.seconds(1);
  const g = w.guests[0], ha = single(w.host.game), ga = g.game.herd.animals[ha.id];
  // the guest sees an animal only through the host's snapshots, so it boops first; then, while its claim is on the wire (80 ms),
  // the host's train moves so the same animal is 2.5 m ahead of the host's nose: the host boops it before the claim arrives
  { const p = g.game.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); ha.x = ga.x = p.x; ha.z = ga.z = p.z; ha.state = ga.state = 'idle'; ha.timer = ga.timer = 99; }
  let k = 0; while (!g.sync.pending.has(ha.id) && k++ < 120) w.step(1);
  assert.ok(g.sync.pending.has(ha.id), 'the guest launched it');
  const yaw = w.host.game.tractor.yaw; moveTrain(w.host.game, ha.x - Math.sin(yaw) * 2.5, ha.z - Math.cos(yaw) * 2.5, yaw); w.step(1);
  w.seconds(3);
  assert.ok(w.host.events.some(e => e.type === 'land' && e.animal === ha), 'host got it');
  assert.ok(g.events.some(e => e.type === 'unclaim' && e.animal.id === ha.id && e.reason === 'refused'), 'guest poofed');
  assert.ok(!g.events.some(e => e.type === 'land' && e.animal.id === ha.id), 'never landed on the guest (R-4)');
  assert.equal(g.game.load.slots.length, 0);
});
test('a late yes: the animal waits at the top of its arc, then lands (M-14)', async () => {
  const w = await mpWorld({ seed: 33, link: { delay: 400 } }); w.seconds(2);
  const g = w.guests[0], ha = single(w.host.game), ga = g.game.herd.animals[ha.id];
  { const p = g.game.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); ha.x = ga.x = p.x; ha.z = ga.z = p.z; ha.state = ga.state = 'idle'; ha.timer = ga.timer = 99; }
  w.seconds(3);
  const fl = g.events.find(e => e.type === 'launch' && e.animal.id === ha.id), land = g.events.find(e => e.type === 'land' && e.animal.id === ha.id);
  assert.ok(fl && land, 'launched and landed'); assert.ok(!g.events.some(e => e.type === 'unclaim'));
});
test('no answer within 1 s: the guest poofs it; the next keyframe gives it back and the host frees it (M-14, M-56)', async () => {
  const w = await mpWorld({ seed: 34, link: { delay: 100 } }); w.seconds(1);
  const g = w.guests[0], ha = single(w.host.game), ga = g.game.herd.animals[ha.id];
  { const p = g.game.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); ha.x = ga.x = p.x; ha.z = ga.z = p.z; ha.state = ga.state = 'idle'; ha.timer = ga.timer = 99; }
  let k = 0; while (!g.sync.pending.has(ha.id) && k++ < 120) w.step(1);
  w.hub.drop = (from, to, d) => to === g.net.id && d instanceof ArrayBuffer; // the answer (the animal's replicated owner) is lost
  w.seconds(0.15); assert.equal(ha.state, 'carried', 'the host granted it'); const grant = ha.epoch;
  k = 0; while (!g.events.some(e => e.type === 'unclaim') && k++ < 180) w.step(1);
  assert.ok(g.events.some(e => e.type === 'unclaim' && e.animal.id === ha.id && e.reason === 'timeout')); assert.ok(g.sync.pending.has(ha.id), 'the claim stays open');
  g.game.boopsPaused = true; // it is still in front of the guest: no re-boop, to see the host free it
  w.hub.drop = null; w.seconds(2.5);
  assert.ok(!g.sync.pending.has(ha.id), 'a keyframe settled it');
  assert.ok(free(w.host.game, ha) || ha.state === 'dodge', `host freed it (${ha.state})`); assert.ok(ha.epoch > grant, `epoch ${ha.epoch} > ${grant}`);
  assert.ok(!g.events.some(e => e.type === 'land' && e.animal.id === ha.id), 'nothing landed');
});
test('the host refuses a claim from a tractor more than 8 m away (M-50)', async () => {
  const w = await mpWorld({ seed: 35 }); w.seconds(1);
  const g = w.guests[0], ha = single(w.host.game);
  const seen = countCalls(w.host.sync, 'claim');
  const t = w.host.sync.players.map.get(2).latest.bodies[0].p; assert.ok(Math.hypot(ha.x - t.x, ha.z - t.z) > CLAIM_RANGE, 'the guest tractor is more than 8 m away');
  g.net.send(w.host.net.id, { t: 'claim', ids: [ha.id] }, true); w.seconds(0.3);
  assert.equal(seen(), 1, 'the claim was handled'); assert.ok(free(w.host.game, ha), 'still free');
});
test('the host boop raises the ownership number and the animal leaves the guest free list (M-15, M-26)', async () => {
  const w = await mpWorld({ seed: 36 }); w.seconds(1);
  const ha = single(w.host.game), e0 = ha.epoch; inFront(w.host, ha); w.seconds(2);
  assert.equal(ha.epoch, e0 + 1); const ga = w.guests[0].game.herd.animals[ha.id];
  assert.ok(!free(w.guests[0].game, ga)); assert.ok(['carried', 'elsewhere'].includes(ga.state));
});
test('a record with an older ownership number neither lowers it nor lands a newer flight (M-14, M-26)', async () => {
  const w = await mpWorld({ seed: 37 }); w.seconds(1);
  const g = w.guests[0], ha = single(w.host.game), ga = g.game.herd.animals[ha.id];
  w.host.sync.handlers.claim = () => {}; // the host's answer to the newer claim never comes
  { const p = g.game.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); ha.x = ga.x = p.x; ha.z = ga.z = p.z; ha.state = ga.state = 'idle'; ha.timer = ga.timer = 99; ha.epoch = 2; } // freed after an older grant (epoch 1)
  let k = 0; while (!g.sync.pending.has(ha.id) && k++ < 120) w.step(1);
  assert.ok(g.sync.pending.has(ha.id), 'the guest launched it'); assert.equal(g.sync.pending.get(ha.id).e0, 2);
  sendAnimals(w, g, [[ha.id, animalRec({ type: ha.type, golden: ha.golden, state: 'carried', owner: 2, epoch: 1 })]]); w.step(1); // the older grant
  assert.equal(g.sync.store.get('animal', ha.id).epoch, 2, 'the number does not drop'); assert.equal(ga.state, 'fly', 'the flight still waits');
  w.seconds(2.5);
  assert.ok(!g.events.some(e => e.type === 'land' && e.animal.id === ha.id), 'nothing landed');
  assert.ok(g.events.some(e => e.type === 'unclaim' && e.animal.id === ha.id && e.reason === 'timeout'));
});
test('a yes that arrives after the guest gave up: nothing lands, the guest gives it back and the host frees it at a higher number (M-14, M-56)', async () => {
  const w = await mpWorld({ seed: 38, link: { delay: 1200 } }); w.seconds(4);
  const g = w.guests[0], ha = single(w.host.game), ga = g.game.herd.animals[ha.id];
  { const p = g.game.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); ha.x = ga.x = p.x; ha.z = ga.z = p.z; ha.state = ga.state = 'idle'; ha.timer = ga.timer = 99; }
  let k = 0; while (!g.sync.pending.has(ha.id) && k++ < 120) w.step(1);
  assert.ok(g.sync.pending.has(ha.id), 'the guest launched it');
  let grant = null; k = 0; while (grant === null && k++ < 120) { w.step(1); if (ha.state === 'carried') grant = ha.epoch; }
  assert.ok(grant !== null, 'the host granted it');
  k = 0; while (g.sync.store.get('animal', ha.id)?.owner !== 2 && k++ < 180) w.step(1);
  assert.equal(g.sync.store.get('animal', ha.id).owner, 2, 'the yes reached the guest');
  assert.ok(g.events.some(e => e.type === 'unclaim' && e.animal.id === ha.id && e.reason === 'timeout'), 'after the guest timed out');
  k = 0; while (ha.state === 'carried' && k++ < 420) w.step(1); // a keyframe, then the release (1.2 s each way)
  assert.ok(!g.events.some(e => e.type === 'land' && e.animal.id === ha.id), 'nothing landed');
  assert.ok(free(w.host.game, ha) || ha.state === 'dodge', `host freed it (${ha.state})`); assert.ok(ha.epoch > grant, `epoch ${ha.epoch} > ${grant}`);
});
test('news from before the boop (no higher ownership number) does not poof the flight; the real answer lands it (M-14, M-26)', async () => {
  const w = await mpWorld({ seed: 39, link: { delay: 100 } }); w.seconds(1);
  const g = w.guests[0], ha = single(w.host.game), ga = g.game.herd.animals[ha.id];
  { const p = g.game.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); ha.x = ga.x = p.x; ha.z = ga.z = p.z; ha.state = ga.state = 'idle'; ha.timer = ga.timer = 99; }
  let k = 0; while (!g.sync.pending.has(ha.id) && k++ < 120) w.step(1);
  const e0 = g.sync.pending.get(ha.id).e0;
  sendAnimals(w, g, [[ha.id, animalRec({ type: ha.type, golden: ha.golden, state: 'carried', owner: 3, epoch: e0 })]]); w.step(1); // another owner, but not newer than the boop
  assert.equal(ga.state, 'fly', 'no poof');
  w.seconds(3);
  assert.ok(g.events.some(e => e.type === 'land' && e.animal.id === ha.id), 'landed'); assert.ok(!g.events.some(e => e.type === 'unclaim' && e.animal.id === ha.id));
  assert.equal(ha.owner, 2);
});
test('after a guest show, the host removes the delivered animals and makes new ones (M-6, M-16)', async () => {
  const w = await mpWorld({ seed: 41 }); w.seconds(1);
  const g = w.guests[0], h = w.host.game.herd, ha = single(w.host.game), ga = g.game.herd.animals[ha.id];
  { const p = g.game.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); ha.x = ga.x = p.x; ha.z = ga.z = p.z; ha.state = ga.state = 'idle'; ha.timer = ga.timer = 99; }
  w.seconds(3); assert.equal(ha.state, 'carried');
  const before = h.animals.length, riders = g.game.startShow(); g.sync.showStarted(); riders.forEach(r => { r.animal.state = 'show'; }); g.game.finishShow(riders); g.sync.delivered(riders);
  w.seconds(0.5);
  assert.ok(['toBarn', 'gone'].includes(ha.state), ha.state); assert.equal(ha.epoch, 2); assert.ok(h.animals.length > before, 'new animals'); assert.equal(h.free().filter(a => a.home === 'route').length, ROUTE_ANIMALS + PER_PLAYER, 'two players: more animals (M-62)');
  w.seconds(1); assert.ok(g.game.herd.animals.length >= h.animals.length, 'the guest knows the new ones');
  w.seconds(12); assert.equal(ha.state, 'gone'); assert.equal(ga.state, 'elsewhere', 'gone from the guest screen too: nothing stays at the barn (A-16)');
});
test('a guest trailer that is full makes animals hop out of its way on the host (M-12, B-14)', async () => {
  const { newRider } = await import('../src/sim/slots.js');
  const w = await mpWorld({ seed: 42 }); w.seconds(1);
  const g = w.guests[0]; for (let i = 0; i < 12; i++) g.game.load.land(g.game.load.reserve({ id: 500 + i, state: 'ride', type: 'pig', golden: false, x: 0, y: 0, z: 0, ride: { rider: newRider() } })); // a rider needs its spring (game.step D-12)
  w.seconds(0.5);
  const ha = single(w.host.game), p = g.game.tractorWorld({ x: 3, y: 0, z: 0 }, {}); ha.x = p.x; ha.z = p.z; ha.state = 'idle'; ha.timer = 99;
  w.seconds(0.3); assert.ok(w.host.events.some(e => e.type === 'dodge' && e.animal === ha));
});
test('trees: a guest break shows on the host and the other guests; the host break shows on guests; a show regrows them (M-17)', async () => {
  const w = await mpWorld({ seed: 43, guests: 2 }); w.seconds(1);
  const [g1, g2] = w.guests, t = g1.game.trees.list.find(x => x.kind === 'tree');
  // move guest 1's tractor next to the tree on the host's view: use a broken-by-id break on the guest (as trees.step would) and let after() report it
  g1.game.trees.breakById(t.id); g1.sync.after([{ type: 'treeBreak', tree: t, dir: { x: 1, z: 0 }, speed: 5 }], w.now);
  w.seconds(0.3);
  const g1p = w.host.sync.players.map.get(2).latest.bodies[0].p; assert.ok(Math.hypot(t.x - g1p.x, t.z - g1p.z) > TREE_RANGE, 'the tree is out of reach');
  assert.notEqual(w.host.game.trees.list[t.id].state, 'broken', 'too far from guest 1: refused');
  const near = g1.game.trees.list.find(x => x.kind === 'tree' && Math.hypot(x.x - g1.game.tractor.x, x.z - g1.game.tractor.z) < 60);
  assert.ok(near, 'a tree within reach of a moved tractor exists');
  // put guest 1's tractor next to that tree (latest vehicle message is what the host checks)
  moveTrain(g1.game, near.x - 3, near.z, Math.PI / 2); w.seconds(0.3);
  g1.game.trees.breakById(near.id); g1.sync.after([{ type: 'treeBreak', tree: near, dir: { x: 1, z: 0 }, speed: 5 }], w.now); w.seconds(0.3);
  assert.equal(w.host.game.trees.list[near.id].state, 'broken'); assert.equal(g2.game.trees.list[near.id].state, 'broken');
  assert.ok(w.host.events.some(e => e.type === 'treeBreak' && e.tree.id === near.id), 'host bursts it');
  const ht = w.host.game.trees.list.find(x => x.state === 'standing'); w.host.sync.after([{ type: 'treeBreak', tree: w.host.game.trees.breakById(ht.id).tree }], w.now); w.seconds(0.3);
  assert.equal(g1.game.trees.list[ht.id].state, 'broken');
  g2.game.startShow(); g2.sync.showStarted(); w.seconds(0.3);
  for (const d of w.devs) assert.ok(!d.game.trees.list.some(x => x.state === 'broken'), `${d.name} regrew`);
});
test('the guest horn calls host animals to the guest tractor; the other devices hear it (M-8)', async () => {
  const w = await mpWorld({ seed: 44 }); w.seconds(1);
  const g = w.guests[0], gt = g.game.tractor, pig = w.host.game.herd.free().find(a => a.type === 'pig' && !a.hidden);
  pig.x = gt.x + 10; pig.z = gt.z; pig.state = 'idle'; pig.timer = 99;
  w.step(1, [STILL, { thr: 0, steer: 0, horn: true }]); w.seconds(0.3);
  assert.equal(pig.state, 'come'); assert.ok(Math.hypot(pig.tx - gt.x, pig.tz - gt.z) < 8);
  assert.ok(w.host.events.some(e => e.type === 'remoteHorn' && e.n === 2));
});
test('help: the host sends a helper animal to the guest that asked (M-9)', async () => {
  const w = await mpWorld({ seed: 45 }); w.seconds(1);
  const g = w.guests[0]; assert.equal(g.sync.requestHelp(), true); w.seconds(0.3);
  const h = g.events.find(e => e.type === 'help'); assert.ok(h && h.animal); assert.equal(w.host.game.herd.animals[h.animal.id].state, 'help');
});
test('paint changes reach the other devices (M-2)', async () => {
  const w = await mpWorld({ seed: 46 }); w.seconds(1);
  w.guests[0].sync.setPaint({ body: 'pink', trim: 'green' }); w.host.sync.setPaint({ body: 'white', trim: 'blue' }); w.seconds(0.3);
  assert.deepEqual(w.host.sync.players.map.get(2).paint, { body: 'pink', trim: 'green' });
  assert.deepEqual(w.guests[0].sync.players.map.get(1).paint, { body: 'white', trim: 'blue' });
});
test('a new farm on the host: the guest makes it too, after its own show (M-19)', async () => {
  const RAPIER = (await import('@dimforge/rapier3d-compat')).default, { createGame } = await import('../src/sim/game.js');
  const w = await mpWorld({ seed: 47 }); w.seconds(1);
  const g = w.guests[0]; g.game.mode = 'show';
  w.host.game = createGame(RAPIER, { seed: 48, power: 'medium' }); w.host.sync.setGame(w.host.game); w.seconds(0.5);
  assert.equal(g.game.farm.seed, 47, 'not during the show');
  g.game.mode = 'drive'; w.seconds(0.5); assert.equal(g.game.farm.seed, 48);
});

test('garbage, wrong kinds, odd JSON and a flood never break the host or the guest (M-44, M-50)', async () => {
  const w = await mpWorld({ seed: 51 }); w.seconds(1);
  const g = w.guests[0], H = w.host.net.id, G = g.net.id;
  const junk = [new ArrayBuffer(0), new Uint8Array([2, 0, 0]).buffer, new Uint8Array(500).fill(255).buffer, { t: 'welcome', v: 1 }, { t: 'claim', ids: [99999] }, { t: 'tree', id: -1 }, null, 'text', 42, { t: 'claim', ids: [1e9] }, new Uint8Array([0x11, 1, 0, 0, 0, 0, 1, 99]).buffer, new Uint8Array([0x10, 9, 0, 0, 0, 0, 0]).buffer];
  for (const j of junk) { g.net.send(H, j, typeof j === 'object' && !(j instanceof ArrayBuffer)); w.host.net.send(G, j, typeof j === 'object' && !(j instanceof ArrayBuffer)); }
  w.seconds(0.5);
  assert.equal(g.game.farm.seed, 51); assert.equal(g.sync.you, 2); assert.equal(w.host.sync.players.list().length, 1);
});
test('a guest cannot speak for another player: the host writes its number over the sender, so a train record for another number is dropped (M-50)', async () => {
  const w = await mpWorld({ seed: 52, guests: 3 }); w.seconds(1);
  const [g2, g3] = w.guests; g2.net.send(w.host.net.id, trainFrame(4, 4, parked(40, 40), 1e9)); w.seconds(0.3); // a forged sender byte: player 4's train
  const p4 = g3.sync.players.map.get(4).pose.tractor.p; assert.ok(Math.hypot(p4.x - 40, p4.z - 40) > 1, 'player 3 does not see player 4 move');
  const p2 = g3.sync.players.map.get(2).pose.tractor.p; assert.ok(dist(p2, g2.game.tractor) < 0.3, 'guest 2 frames of its own still reach the others');
});
test('a flood of claims: at most 60 each second are handled (M-50)', async () => {
  const w = await mpWorld({ seed: 53 }); w.seconds(1);
  const handled = countCalls(w.host.sync, 'claim');
  for (let i = 0; i < 300; i++) w.guests[0].net.send(w.host.net.id, { t: 'claim', ids: [0] }, true);
  w.seconds(0.2); assert.ok(handled() > 50 && handled() <= 60, `${handled()}`); // the window may already hold a few earlier messages
});
test('old messages are ignored: an older train position, and animal data with a lower ownership number (M-26)', async () => {
  const w = await mpWorld({ seed: 55 }); w.seconds(1);
  const g = w.guests[0], G = g.net.id;
  w.host.net.send(G, trainFrame(1, 1, parked(40, 40), 1)); // time 1: older than all
  w.seconds(0.3); const hp = g.sync.players.map.get(1).pose.tractor.p; assert.ok(Math.hypot(hp.x - 40, hp.z - 40) > 5, 'the host tractor did not jump back');
  const ha = w.host.game.herd.free().find(a => !a.hidden), ga = g.game.herd.animals[ha.id]; ha.epoch = 5; w.seconds(0.5); assert.equal(ga.epoch, 5);
  sendAnimals(w, g, [[ha.id, animalRec({ type: ha.type, golden: ha.golden, epoch: 4, x: 40, z: 40 })]]); // newer time, older owner
  for (let i = 0; i < 30; i++) { w.step(1); assert.ok(Math.hypot(ga.x - 40, ga.z - 40) > 5, 'ignored'); }
  assert.equal(ga.epoch, 5);
});
test('a handler that throws is contained (M-44)', async () => {
  const w = await mpWorld({ seed: 54 }); w.seconds(1);
  const orig = w.host.sync.handlers.horn; w.host.sync.handlers.horn = () => { throw new Error('boom'); };
  const warned = quietWarn(() => { w.step(1, [STILL, { thr: 0, steer: 0, horn: true }]); w.seconds(0.3); }); // the throw stays inside the host's message handler (w.step would throw otherwise)
  assert.equal(warned.length, 1);
  w.host.sync.handlers.horn = orig; w.step(1, [STILL, { thr: 0, steer: 0, horn: true }]); w.seconds(0.3);
  assert.ok(w.host.events.some(e => e.type === 'remoteHorn' && e.n === 2), 'the host still handles messages');
});
test('a guest handler that throws is contained too (M-44)', async () => {
  const w = await mpWorld({ seed: 56 }); w.seconds(1);
  const g = w.guests[0], orig = g.sync.handlers.horn; g.sync.handlers.horn = () => { throw new Error('boom'); };
  const warned = quietWarn(() => { w.step(1, [{ thr: 0, steer: 0, horn: true }]); w.seconds(0.3); });
  assert.equal(warned.length, 1);
  g.sync.handlers.horn = orig; w.step(1, [{ thr: 0, steer: 0, horn: true }]); w.seconds(0.3);
  assert.ok(g.events.some(e => e.type === 'remoteHorn' && e.n === 1), 'the guest still handles messages');
});
test('a reliable message that is too big is dropped: over 2048 from a guest or from the host (M-50)', async () => {
  const w = await mpWorld({ seed: 57 }); w.seconds(1);
  const g = w.guests[0], H = w.host.net.id, G = g.net.id, hp = () => w.host.sync.players.map.get(2).paint, horns = () => g.events.filter(e => e.type === 'remoteHorn').length;
  g.net.send(H, { t: 'paint', paint: { ...PAINTS[3], pad: 'x'.repeat(2048) } }, true); w.seconds(0.3); assert.deepEqual(hp(), PAINTS[1], 'dropped by the host');
  g.net.send(H, { t: 'paint', paint: { ...PAINTS[3], pad: 'x'.repeat(1900) } }, true); w.seconds(0.3); assert.equal(hp().body, PAINTS[3].body, 'under the cap: handled');
  w.host.net.send(G, { t: 'horn', n: 1, pad: 'x'.repeat(2048) }, true); w.seconds(0.3); assert.equal(horns(), 0, 'dropped by the guest');
  w.host.net.send(G, { t: 'horn', n: 1, pad: 'x'.repeat(1900) }, true); w.seconds(0.3); assert.equal(horns(), 1, 'under the cap: handled');
});
test('a guest regrow counts at most once in 5 s; the extra ones are not passed on (M-17, M-50)', async () => {
  const w = await mpWorld({ seed: 58, guests: 2 }); w.seconds(1);
  const [g1, g2] = w.guests; let resets = 0; const relayedN = countCalls(g2.sync, 'regrow');
  const reset = w.host.game.trees.reset; w.host.game.trees.reset = (...a) => { resets++; return reset(...a); };
  for (let i = 0; i < 10; i++) g1.net.send(w.host.net.id, { t: 'regrow' }, true);
  w.seconds(4.5); assert.deepEqual([resets, relayedN()], [1, 1]);
  g1.net.send(w.host.net.id, { t: 'regrow' }, true); w.seconds(0.3); assert.deepEqual([resets, relayedN()], [1, 1], 'still within 5 s');
  w.seconds(0.5); g1.net.send(w.host.net.id, { t: 'regrow' }, true); w.seconds(0.3); assert.deepEqual([resets, relayedN()], [2, 2], 'after 5 s');
});
test('a repeated id in claim, release or delivered is handled once (M-50)', async () => {
  const w = await mpWorld({ seed: 59 }); w.seconds(1);
  const g = w.guests[0], H = w.host.net.id; w.hub.drop = (from, to) => to === g.net.id; // the guest hears nothing back (so it gives nothing back either)
  const near = a => { const t = w.host.sync.players.map.get(2).latest.bodies[0].p; Object.assign(a, { x: t.x + 2, z: t.z, state: 'idle', timer: 99, hidden: false }); };
  const [a, b] = w.host.game.herd.free().filter(x => !x.hidden && x.type !== 'chick');
  const ea = a.epoch; near(a); g.net.send(H, { t: 'claim', ids: [a.id, a.id] }, true); w.seconds(0.2);
  assert.deepEqual([a.owner, a.epoch], [2, ea + 1], 'granted once');
  let barn = 0; const toBarn = w.host.game.herd.toBarn; w.host.game.herd.toBarn = list => { barn += list.length; return toBarn(list); };
  const e = a.epoch; g.net.send(H, { t: 'delivered', ids: [a.id, a.id] }, true); w.seconds(0.2);
  assert.deepEqual([barn, a.epoch], [1, e + 1]);
  near(b); g.net.send(H, { t: 'claim', ids: [b.id] }, true); w.seconds(0.2); assert.equal(b.owner, 2);
  const eb = b.epoch; g.net.send(H, { t: 'release', ids: [b.id, b.id] }, true); w.seconds(0.2); assert.equal(b.epoch, eb + 1);
});

test('a guest that drops is shown away; back in time it carries on (M-39)', async () => {
  const w = await mpWorld({ seed: 61 }); w.seconds(1);
  w.hub.away(w.guests[0].net.id); w.seconds(0.2); assert.equal(w.host.sync.players.map.get(2).away, true);
  w.hub.back(w.guests[0].net.id); w.seconds(0.2); assert.equal(w.host.sync.players.map.get(2).away, false);
});
test('a guest that leaves: its tractor poofs and its animals go with it, and the herd keeps enough for the players left (M-39, M-62)', async () => {
  const w = await mpWorld({ seed: 62 }); w.seconds(1);
  const g = w.guests[0], ha = single(w.host.game), ga = g.game.herd.animals[ha.id];
  { const p = g.game.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); ha.x = ga.x = p.x; ha.z = ga.z = p.z; ha.state = ga.state = 'idle'; ha.timer = ga.timer = 99; }
  w.seconds(3); assert.equal(ha.state, 'carried');
  g.net.leave(); w.seconds(0.3);
  assert.equal(ha.state, 'gone'); assert.equal(w.host.sync.players.list().length, 0);
  assert.ok(w.host.events.some(e => e.type === 'playerGone' && e.n === 2)); assert.equal(w.host.game.herd.free().filter(a => a.home === 'route').length, ROUTE_ANIMALS + PER_PLAYER - 1, 'one player fewer: the carried one goes and is not replaced, the rest stay (M-62)');
});
test('player 3 leaves and a new guest gets number 3: the other guest sees the new train, though its clock starts lower (M-22, M-26, M-39)', async () => {
  const w = await mpWorld({ seed: 63, guests: 2 }); w.seconds(1);
  const [g2, g3] = w.guests, H = w.host.net.id;
  g3.net.send(H, trainFrame(3, 3, parked(g3.game.tractor.x, g3.game.tractor.z), 1e9)); w.seconds(0.3); // the old player 3's clock was far ahead of the new one's
  assert.ok(g2.sync.store.get('train', 3), 'player 2 has the old train 3');
  g3.net.leave(); w.seconds(0.5); assert.ok(!g2.sync.players.map.has(3), 'gone from the roster');
  const g = w.addGuest(); w.seconds(1); assert.equal(g.sync.you, 3);
  const seen = g2.sync.players.map.get(3)?.pose?.tractor.p; assert.ok(seen && dist(seen, g.game.tractor) < 0.3, 'player 2 sees the new train where it is');
});
test('a straggling frame from the old player 3 after it left does not hide the new player 3: seen within 3 s (M-26, M-39, M-58)', async () => {
  const w = await mpWorld({ seed: 64, guests: 2 }); w.seconds(1);
  const [g2, g3] = w.guests;
  g3.net.leave(); w.seconds(0.5); assert.ok(!g2.sync.players.map.has(3), 'gone from the roster');
  w.host.net.send(g2.net.id, trainFrame(3, 3, parked(40, 40), 1e9)); w.seconds(0.2); // late, after the forget, stamped far ahead
  const g = w.addGuest(); w.seconds(3); assert.equal(g.sync.you, 3);
  const seen = g2.sync.players.map.get(3)?.pose?.tractor.p; assert.ok(seen && dist(seen, g.game.tractor) < 0.3, 'player 2 sees the new train where it is');
});
test('the host drops: boops pause; back in time they go on (M-40)', async () => {
  const w = await mpWorld({ seed: 63 }); w.seconds(1);
  const g = w.guests[0]; w.hub.away(w.host.net.id); w.seconds(0.2);
  assert.equal(g.game.boopsPaused, true); assert.equal(g.sync.players.map.get(1).away, true);
  w.hub.back(w.host.net.id); w.seconds(0.2); assert.equal(g.game.boopsPaused, false);
});
test('the room closes: the guest goes on alone on the same farm, keeps its riders, and the animals live again (M-41)', async () => {
  const w = await mpWorld({ seed: 64 }); w.seconds(1);
  const g = w.guests[0], ha = single(w.host.game), ga = g.game.herd.animals[ha.id];
  { const p = g.game.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); ha.x = ga.x = p.x; ha.z = ga.z = p.z; ha.state = ga.state = 'idle'; ha.timer = ga.timer = 99; }
  w.seconds(3); assert.equal(g.game.load.landed(), 1);
  const game = g.game; w.hub.leave(w.host.net.id, 'left'); w.seconds(0.2);
  assert.equal(g.sync.alone, true); assert.equal(g.game, game, 'nothing made again');
  assert.equal(game.herd.remote, false); assert.equal(game.claims, false); assert.equal(game.load.landed(), 1, 'the rider stays (R-4)');
  assert.ok(g.events.some(e => e.type === 'alone')); assert.ok(g.events.some(e => e.type === 'playerGone' && e.n === 1));
  const x0 = game.herd.free().map(a => [a.x, a.z]); w.seconds(5);
  assert.ok(game.herd.free().some((a, i) => x0[i] && Math.hypot(a.x - x0[i][0], a.z - x0[i][1]) > 1), 'the guest runs the animals now');
  assert.equal(game.herd.free().filter(a => a.home === 'route').length, ROUTE_ANIMALS + PER_PLAYER - 1, 'the host herd it had, the extra animals too, but the one in its train (M-62)');
});
test('a kicked guest also goes on alone (M-41)', async () => {
  const w = await mpWorld({ seed: 65 }); w.seconds(1);
  w.hub.leave(w.guests[0].net.id, 'kicked'); w.seconds(0.2);
  assert.ok(w.guests[0].events.some(e => e.type === 'alone' && e.reason === 'kicked'));
});
test('going alone with a claim still waiting keeps the animal (decision 3)', async () => {
  const w = await mpWorld({ seed: 66, link: { delay: 500 } }); w.seconds(2);
  const g = w.guests[0], ha = single(w.host.game), ga = g.game.herd.animals[ha.id];
  { const p = g.game.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); ha.x = ga.x = p.x; ha.z = ga.z = p.z; ha.state = ga.state = 'idle'; ha.timer = ga.timer = 99; }
  let k = 0; while (!g.sync.pending.size && k++ < 120) w.step(1); assert.ok(g.sync.pending.size > 0); // the guest sees it ~600 ms late (500 ms link + 100 ms playback)
  w.hub.leave(w.host.net.id, 'left'); w.seconds(2);
  assert.ok(g.events.some(e => e.type === 'land' && e.animal === ga));
});
test('alone, chick lines follow their hen again (M-41)', async () => {
  const w = await mpWorld({ seed: 67 }); w.seconds(1);
  const g = w.guests[0]; w.hub.leave(w.host.net.id, 'left'); w.seconds(0.2);
  const game = g.game, line = c => c.type === 'chick' && c.leader !== null && free(game, c) && free(game, game.herd.animals[c.leader]);
  const chicks = game.herd.animals.filter(line); assert.ok(chicks.length > 0);
  w.seconds(30);
  for (const c of chicks.filter(line)) { const L = game.herd.animals[c.leader]; assert.ok(Math.hypot(c.x - L.x, c.z - L.z) < 4, 'chick ' + c.id + ' stays by its hen'); }
});
test('alone, an animal walking into the barn goes by the door first and is gone (M-41)', async () => {
  const w = await mpWorld({ seed: 68 }); w.seconds(1);
  const g = w.guests[0], ha = single(w.host.game), ga = g.game.herd.animals[ha.id];
  w.host.game.herd.toBarn([ha]); w.seconds(0.3); assert.equal(ga.state, 'toBarn');
  w.hub.leave(w.host.net.id, 'left'); w.seconds(0.05);
  const B = g.game.farm.yard.barn; assert.equal(ga.inside, false); assert.ok(Math.abs(Math.hypot(ga.tx - B.x, ga.tz - B.z) - (B.half + B.leaf + 1)) < 1e-6, 'the outside waypoint first');
  w.seconds(45); assert.equal(ga.state, 'gone'); // about 70 m to walk at 2.2 m/s
});
test('a host that stops hosting poofs every guest tractor (M-39)', async () => {
  const w = await mpWorld({ seed: 69 }); w.seconds(1);
  assert.equal(w.host.game.others.length, 1); w.host.sync.close();
  assert.deepEqual(w.host.game.others, [], 'the herd forgets the guest tractors at once: the session drops the sync, so no before() clears them later');
  w.step(1);
  assert.ok(w.host.events.some(e => e.type === 'playerGone' && e.n === 2)); assert.equal(w.host.sync.players.list().length, 0);
});
test('a throw while going alone never reaches the link (M-44)', async () => {
  const w = await mpWorld({ seed: 70 }); w.seconds(1);
  const g = w.guests[0]; g.game.herd.respawn = () => { throw new Error('boom'); };
  const warned = quietWarn(() => assert.doesNotThrow(() => g.sync.close())); assert.equal(warned.length, 1); assert.equal(g.sync.alone, true);
});

test('after a timeout the claim stays open: no re-boop until a keyframe settles it (M-14, M-56)', async () => {
  const w = await mpWorld({ seed: 71 }); w.seconds(1);
  const g = w.guests[0], ha = single(w.host.game), ga = g.game.herd.animals[ha.id];
  const claims = []; w.host.sync.handlers.claim = (p, m) => { claims.push(m); }; // the host has the claim and never answers
  { const p = g.game.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); ha.x = ga.x = p.x; ha.z = ga.z = p.z; ha.state = ga.state = 'idle'; ha.timer = ga.timer = 99; } // free in front of the guest on both devices
  let k = 0; while (!g.events.some(e => e.type === 'unclaim' && e.animal.id === ha.id) && k++ < 180) w.step(1);
  assert.ok(g.events.some(e => e.type === 'unclaim' && e.animal.id === ha.id && e.reason === 'timeout'), 'timed out');
  assert.equal(claims.length, 1, 'one claim only: the host still shows it free, yet no re-boop'); assert.ok(g.sync.pending.has(ha.id), 'still open');
  assert.ok(!free(g.game, ga), 'host data does not free it');
  const t0 = w.now; k = 0; while (claims.length < 2 && k++ < 180) w.step(1); // a keyframe settles it (the animal is still in front: the guest boops it again)
  assert.equal(claims.length, 2, 'boopable again'); assert.ok(w.now - t0 <= 2200, 'within one keyframe period');
});
test('a keyframe ends a claim whose flight is over; a claim whose flight still waits stays open (M-14, M-56)', async () => {
  const w = await mpWorld({ seed: 72 }); w.seconds(1);
  const g = w.guests[0], [a, b] = w.host.game.herd.free().filter(x => !x.hidden);
  g.sync.pending.set(a.id, { e0: a.epoch, done: true }); g.sync.pending.set(b.id, { e0: b.epoch, done: false });
  w.seconds(2.2);
  assert.ok(!g.sync.pending.has(a.id), 'settled'); assert.ok(g.sync.pending.has(b.id), 'still waiting');
});
test('host data never pulls an animal out of the guest trailer, whatever its ownership number (R-4, M-26)', async () => {
  const w = await mpWorld({ seed: 73 }); w.seconds(1);
  const g = w.guests[0], ha = single(w.host.game), ga = g.game.herd.animals[ha.id];
  { const p = g.game.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); ha.x = ga.x = p.x; ha.z = ga.z = p.z; ha.state = ga.state = 'idle'; ha.timer = ga.timer = 99; }
  w.seconds(3); assert.equal(ga.state, 'ride');
  w.host.sync.after = () => {}; w.step();
  sendAnimals(w, g, [[ha.id, animalRec({ type: ha.type, golden: ha.golden, epoch: ga.epoch + 5, x: 40, z: 40 })]]);
  w.seconds(0.5); assert.equal(ga.state, 'ride'); assert.equal(g.game.load.landed(), 1);
});

test('the rate limits count in wall time: with the game frozen (rAF paused), a new window still opens (M-50)', async () => {
  let wall = 0; const w = await mpWorld({ seed: 74, clock: () => wall }); w.seconds(1); wall = 5000;
  const g = w.guests[0], H = w.host.net.id, G = g.net.id, handled = countCalls(w.host.sync, 'claim');
  const deliver = () => w.hub.tick(w.now); // messages arrive, but no frame runs: sim time stands still
  for (let i = 0; i < 70; i++) g.net.send(H, { t: 'claim', ids: [0] }, true); deliver(); assert.equal(handled(), 60);
  wall += 1100; g.net.send(H, { t: 'claim', ids: [0] }, true); deliver(); assert.equal(handled(), 61, 'the host: a new second, a new window');
  const horns = () => g.sync.out.filter(e => e.type === 'remoteHorn').length; // no frame runs, so the guest's events wait in out
  for (let i = 0; i < 70; i++) w.host.net.send(G, { t: 'horn', n: 1 }, true); deliver(); assert.equal(horns(), 60);
  wall += 1100; w.host.net.send(G, { t: 'horn', n: 1 }, true); deliver(); assert.equal(horns(), 61, 'the guest: a new window too');
});

test('a silent host (no fast message for 3 s) is shown away and boops pause; its messages back clear both (M-40)', async () => {
  const w = await mpWorld({ seed: 75 }); w.seconds(1);
  const g = w.guests[0], after = w.host.sync.after, p1 = () => g.sync.players.map.get(1);
  w.host.sync.after = () => {}; // the host's page sleeps: nothing comes, and no hostAway either
  w.seconds(2.5); assert.equal(g.game.boopsPaused, false, 'not yet'); assert.equal(p1().away, false);
  w.seconds(1); assert.equal(g.game.boopsPaused, true); assert.equal(p1().away, true, 'a ghost');
  w.host.sync.after = after; w.seconds(0.3); assert.equal(g.game.boopsPaused, false); assert.equal(p1().away, false);
});
test('hostBack does not end the pause while the host is still silent; hostAway pauses at once, before any silence (M-40)', async () => {
  const w = await mpWorld({ seed: 76 }); w.seconds(1);
  const g = w.guests[0], after = w.host.sync.after;
  w.host.sync.after = () => {}; w.hub.away(w.host.net.id); w.seconds(3.5); assert.equal(g.game.boopsPaused, true);
  w.hub.back(w.host.net.id); w.seconds(0.2); assert.equal(g.game.boopsPaused, true, 'still silent'); assert.equal(g.sync.players.map.get(1).away, true);
  w.hub.away(w.host.net.id); w.hub.back(w.host.net.id); w.host.sync.after = after; w.seconds(0.3); assert.equal(g.game.boopsPaused, false, 'back and talking');
  w.hub.away(w.host.net.id); w.seconds(0.1); // the server says away; fast messages that were on their way may still come in
  assert.equal(g.game.boopsPaused, true); assert.equal(g.sync.players.map.get(1).away, true);
});

test('while a new farm waits for the guest show, the new herd is not put on the old farm (M-19)', async () => {
  const RAPIER = (await import('@dimforge/rapier3d-compat')).default, { createGame } = await import('../src/sim/game.js');
  const w = await mpWorld({ seed: 77 }); w.seconds(1);
  const g = w.guests[0]; g.game.mode = 'show'; w.seconds(0.3);
  const kinds = () => g.game.herd.animals.map(a => a.type + a.golden).join(), before = kinds(), n = g.game.herd.animals.length;
  w.host.game = createGame(RAPIER, { seed: 78, power: 'medium' }); w.host.sync.setGame(w.host.game); w.seconds(0.5);
  assert.equal(g.game.farm.seed, 77); assert.equal(g.game.herd.animals.length, n); assert.equal(kinds(), before, 'the old farm keeps its animals');
  g.game.mode = 'drive'; w.seconds(0.5); assert.equal(g.game.farm.seed, 78);
});
test('ignored animal data (an older ownership number) never changes an animal type (M-26)', async () => {
  const w = await mpWorld({ seed: 79 }); w.seconds(1);
  const g = w.guests[0], ha = w.host.game.herd.free().find(a => !a.hidden && a.type !== 'cow'), ga = g.game.herd.animals[ha.id]; ha.epoch = 5; w.seconds(0.5); assert.equal(ga.epoch, 5);
  w.host.sync.after = () => {}; w.step();
  sendAnimals(w, g, [[ha.id, animalRec({ type: 'cow', golden: !ha.golden, epoch: 4, x: 40, z: 40 })]]);
  w.seconds(0.5); assert.equal(ga.type, ha.type); assert.equal(ga.golden, ha.golden);
});
test('a new farm while the host is silent keeps boops paused (M-19, M-40)', async () => {
  const RAPIER = (await import('@dimforge/rapier3d-compat')).default, { createGame } = await import('../src/sim/game.js');
  const w = await mpWorld({ seed: 80 }); w.seconds(1);
  const g = w.guests[0], after = w.host.sync.after; w.host.sync.after = () => {}; w.seconds(3.5); assert.equal(g.game.boopsPaused, true);
  w.host.game = createGame(RAPIER, { seed: 81, power: 'medium' }); w.host.sync.setGame(w.host.game); w.seconds(0.3);
  assert.equal(g.game.farm.seed, 81); assert.equal(g.game.boopsPaused, true, 'the new game is paused too'); assert.equal(g.sync.players.map.get(1).away, true);
  w.host.sync.after = after; w.seconds(0.3); assert.equal(g.game.boopsPaused, false);
});

test('a waiting flight is in the guest train record (the host sees it there), but nobody draws it in that train before the host gives it (M-22, M-57)', async () => {
  const { trainRecord } = await import('../src/net/players.js');
  const w = await mpWorld({ seed: 82, guests: 2, link: { delay: 400 } }); w.seconds(2);
  const [g, o] = w.guests, ha = single(w.host.game), ga = g.game.herd.animals[ha.id], oa = () => o.game.herd.animals[ha.id], ids = () => trainRecord(g.game).riders.map(c => c.id);
  { const p = g.game.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); ha.x = ga.x = p.x; ha.z = ga.z = p.z; ha.state = ga.state = 'idle'; ha.timer = ga.timer = 99; }
  let k = 0; while (!g.game.flights.some(f => f.animal === ga && f.u >= 0) && k++ < 200) w.step(1);
  const f = g.game.flights.find(x => x.animal === ga); assert.ok(f && f.claim === 'pending' && f.u >= 0, 'in the air, unanswered');
  assert.ok(ids().includes(ha.id), 'in its train record');
  const x0 = ha.x; w.seconds(0.3); assert.ok(free(w.host.game, ha) && Math.abs(ha.x - x0) < 0.5, 'the host still has it free where it was');
  k = 0; while (f.claim === 'pending' && k++ < 120) { w.step(1); if (f.claim === 'pending') assert.notEqual(oa()?.state, 'carried', 'the other guest does not draw it in a train before the grant'); }
  assert.equal(f.claim, null, 'granted');
  w.seconds(1); assert.equal(ha.owner, 2); assert.ok(dist(ha, ga) < 0.6, `the host draws it in the guest train (${dist(ha, ga).toFixed(2)} m)`);
  assert.equal(oa().state, 'carried'); assert.ok(dist(oa(), ga) < 0.6, `the other guest draws it in the guest train (${dist(oa(), ga).toFixed(2)} m)`);
});
test('a silent guest (its page stopped, its socket still open) is shown away on the host and the other guests; its frames back clear it (M-39)', async () => {
  const w = await mpWorld({ seed: 84, guests: 2 }); w.seconds(1);
  const [g, o] = w.guests, after = g.sync.after, hp = () => w.host.sync.players.map.get(2), op = () => o.sync.players.map.get(2);
  g.sync.after = () => {}; // the guest's page stops: no frames, and no peerAway either
  w.seconds(2.5); assert.equal(hp().away, false, 'not yet');
  w.seconds(1); assert.equal(hp().away, true, 'away on the host'); w.seconds(0.2); assert.equal(op().away, true, 'and on the other guest');
  g.sync.after = after; w.seconds(0.3); assert.equal(hp().away, false); assert.equal(op().away, false);
  w.hub.away(g.net.id); w.seconds(0.2); assert.equal(hp().away, true, 'the server still says away at once');
});
test('player 3 leaves and a new guest gets number 3 within one host diff: the other guests see the new train, though its clock starts lower (M-22, M-26, M-39)', async () => {
  const w = await mpWorld({ seed: 85, guests: 3 }); w.seconds(1);
  const [g2, g3, g4] = w.guests;
  g3.net.send(w.host.net.id, trainFrame(3, 3, parked(40, 40), 1e9)); w.seconds(0.3); // the old player 3's clock was far ahead of the new one's
  assert.ok(g4.sync.store.get('train', 3)?.bodies[0].p.x === 40, 'player 4 has the old train 3');
  g3.net.leave(); const g = w.addGuest(); // the host frees number 3 and gives it again at once: the roster never goes without a player 3
  w.seconds(1.5); assert.equal(g.sync.you, 3);
  for (const o of [g2, g4]) { const seen = o.sync.players.map.get(3)?.pose?.tractor.p; assert.ok(seen && dist(seen, g.game.tractor) < 0.3, `${o.name} sees the new train where it is`); }
  assert.ok(g4.events.some(e => e.type === 'playerGone' && e.n === 3), 'the old train poofs');
});
test('a newer free record does not poof a waiting flight: the 1 s hold decides (M-14, M-26)', async () => {
  const w = await mpWorld({ seed: 86 }); w.seconds(1);
  const g = w.guests[0], ha = single(w.host.game), ga = g.game.herd.animals[ha.id];
  w.host.sync.handlers.claim = () => {}; // the host never answers
  { const p = g.game.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); ha.x = ga.x = p.x; ha.z = ga.z = p.z; ha.state = ga.state = 'idle'; ha.timer = ga.timer = 99; }
  let k = 0; while (!g.sync.pending.has(ha.id) && k++ < 60) w.step(1);
  ha.epoch = g.sync.pending.get(ha.id).e0 + 1; // the host raises the ownership number, and the animal stays free
  w.seconds(0.4); assert.ok(g.sync.store.get('animal', ha.id).epoch > g.sync.pending.get(ha.id).e0, 'the newer record is here');
  assert.ok(!g.events.some(e => e.type === 'unclaim'), 'no poof for a free record');
  k = 0; while (!g.events.some(e => e.type === 'unclaim') && k++ < 120) w.step(1);
  assert.equal(g.events.find(e => e.type === 'unclaim')?.reason, 'timeout', 'the hold ends it');
  g.game.boopsPaused = true; assert.deepEqual(settle(w, 3), []);
});
test('a boop of an animal the store already shows in another train is refused at once, with no claim (M-14, M-22)', async () => {
  const { decodeFrame, encodeFrame } = await import('../src/net/replica.js'), { ANIMAL } = await import('../src/net/kinds.js'), { BINDINGS, registryOf } = await import('../src/net/bindings.js'), REGISTRY = registryOf(BINDINGS);
  const w = await mpWorld({ seed: 87 }); w.seconds(1);
  const g = w.guests[0], ha = single(w.host.game), ga = g.game.herd.animals[ha.id], claims = [];
  w.hub.drop = (from, to, d) => { if (d?.t === 'claim') claims.push(d); return false; };
  g.game.boopsPaused = true; { const p = g.game.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); ha.x = ga.x = p.x; ha.z = ga.z = p.z; ha.state = ga.state = 'idle'; ha.timer = ga.timer = 99; }
  w.seconds(0.5); g.game.boopsPaused = false; // the guest draws it free in front of its tractor
  g.sync.store.apply(decodeFrame(encodeFrame({ key: false, sender: 1, time: w.now + 1, groups: [{ kind: ANIMAL, records: [[ha.id, animalRec({ type: ha.type, state: 'carried', owner: 3, epoch: ha.epoch + 1 })]] }] }), REGISTRY)); // its record is newer than the drawing
  let k = 0; while (!g.events.some(e => e.type === 'launch' && e.animal === ga) && k++ < 60) w.step(1);
  assert.ok(g.events.some(e => e.type === 'launch' && e.animal === ga), 'booped'); w.step(2);
  assert.equal(g.events.find(e => e.type === 'unclaim' && e.animal === ga)?.reason, 'refused', 'poofed at once');
  assert.deepEqual(claims, [], 'no claim'); assert.ok(!g.sync.pending.has(ha.id));
});
test('a guest horn counts at most once in 300 ms; the extra ones are not passed on (M-8, M-50, R-8)', async () => {
  const w = await mpWorld({ seed: 88, guests: 2 }); w.seconds(1);
  const [g1, g2] = w.guests, H = w.host.net.id, heard = () => [w.host.events.filter(e => e.type === 'remoteHorn').length, g2.events.filter(e => e.type === 'remoteHorn' && e.n === 2).length];
  for (let i = 0; i < 10; i++) g1.net.send(H, { t: 'horn' }, true);
  w.seconds(0.2); assert.deepEqual(heard(), [1, 1]);
  g1.net.send(H, { t: 'horn' }, true); w.seconds(0.05); assert.deepEqual(heard(), [1, 1], 'still within 300 ms');
  w.seconds(0.1); g1.net.send(H, { t: 'horn' }, true); w.seconds(0.1); assert.deepEqual(heard(), [2, 2], 'after 300 ms');
});
test('a new kind of shared object is a kind and a row in the binding table: it replicates with no new message, from the host and from a guest (M-22)', async () => {
  const { F, kind } = await import('../src/net/replica.js'), { BINDINGS } = await import('../src/net/bindings.js');
  const GATE = kind({ name: 'gate', code: 9, authority: 'host', max: 4, idMax: 3, fields: { open: F.bool() } }); // the host's
  const FLAG = kind({ name: 'flag', code: 10, authority: 'owner', max: 1, idMin: 1, idMax: 4, fields: { up: F.bool() } }); // each player's own
  const bindings = [...BINDINGS, { kind: GATE, read: at => [[2, { open: !!at.game.gateOpen }]] }, { kind: FLAG, read: at => [[at.you, { up: !!at.game.flagUp }]] }];
  const w = await mpWorld({ seed: 89, guests: 2, bindings }); w.seconds(1);
  const [g2, g3] = w.guests, json = []; w.hub.drop = (from, to, d) => { if (!(d instanceof ArrayBuffer)) json.push(d.t); return false; };
  assert.deepEqual(g2.sync.store.get('gate', 2), { open: false }); assert.deepEqual(g3.sync.store.get('flag', 2), { up: false });
  w.host.game.gateOpen = true; g2.game.flagUp = true; w.host.game.flagUp = true; w.seconds(0.3);
  assert.deepEqual(g2.sync.store.get('gate', 2), { open: true }, 'host -> guest'); assert.deepEqual(g3.sync.store.get('flag', 2), { up: true }, 'guest -> host -> other guest');
  assert.deepEqual(g3.sync.store.get('flag', 1), { up: true }, 'the host has its own too');
  assert.ok(json.every(t => t === 'welcome'), `no new message: ${json}`);
});

test('a slot the host reuses reaches the guest as the new animal (G-3, M-26)', async () => {
  const w = await mpWorld({ seed: 81 }); w.seconds(1);
  const g = w.guests[0], H = w.host.game.herd, old = H.free().find(a => a.home === 'route' && !a.hidden && a.type !== 'chick' && !H.animals.some(c => c.leader === a.id));
  old.state = 'gone'; old.epoch = 3; w.seconds(GONE_KEEP + 1); // gone long enough on the host; the guest dropped its record
  assert.equal(g.game.herd.animals[old.id].state, 'elsewhere');
  const n = H.animals.length; H.respawn(); const b = H.animals[old.id];
  assert.notEqual(b, old); assert.equal(H.animals.length, n, 'the slot was reused');
  w.seconds(2.5); // a keyframe
  const gb = g.game.herd.animals[old.id];
  assert.equal(gb.type, b.type); assert.ok(free(g.game, gb), `free on the guest, here ${gb.state}`); assert.equal(gb.epoch, b.epoch);
  assert.ok(Math.hypot(gb.x - b.x, gb.z - b.z) < 0.5, 'where the host has it');
  assert.deepEqual(settle(w, 1), []);
});
test('the host counts a guest horn in wall time: a stopped frame clock never shuts it out (M-8, M-50)', async () => {
  let wall = 0; const w = await mpWorld({ seed: 82, clock: () => wall }); w.seconds(1);
  const h = w.host.sync, p = h.players.map.get(2), horns = () => w.host.events.filter(e => e.type === 'remoteHorn').length;
  wall = 1000; h.handlers.horn(p); wall = 1100; h.handlers.horn(p); assert.equal(horns(), 0, 'events wait for before()');
  wall = 1400; h.handlers.horn(p); w.host.events.push(...h.before(w.now)); // no frame between them: only the wall clock moved
  assert.equal(horns(), 2, 'the first, and the one 400 ms later; the one after 100 ms is dropped');
});
