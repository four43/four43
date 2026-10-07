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

const single = g => g.herd.free().find(x => !x.hidden && x.type !== 'chick' && !g.herd.animals.some(c => c.leader === x.id) && x.home === 'route');

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
test('no answer within 1 s: the guest poofs it and releases it; the host frees it (M-14, Decision 2)', async () => {
  const w = await mpWorld({ seed: 34, link: { delay: 100 } }); w.seconds(1);
  const g = w.guests[0], ha = single(w.host.game), ga = g.game.herd.animals[ha.id];
  { const p = g.game.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); ha.x = ga.x = p.x; ha.z = ga.z = p.z; ha.state = ga.state = 'idle'; ha.timer = ga.timer = 99; }
  let k = 0; while (!g.sync.pending.has(ha.id) && k++ < 120) w.step(1);
  w.seconds(0.15); assert.equal(ha.state, 'carried', 'the host granted it'); // the claim arrived (100 ms); the answer is on the wire
  w.hub.away(g.net.id); w.seconds(0.15); w.hub.back(g.net.id); w.seconds(2.5); // the answer is lost: the guest times out and releases it
  assert.ok(g.events.some(e => e.type === 'unclaim' && e.reason === 'timeout'));
  assert.ok(free(w.host.game, ha) || ha.state === 'dodge', `host freed it (${ha.state})`);
});
test('the host refuses a claim from a tractor more than 8 m away (M-50)', async () => {
  const w = await mpWorld({ seed: 35 }); w.seconds(1);
  const g = w.guests[0], ha = single(w.host.game);
  let seen = 0; const orig = w.host.sync.handlers.claim; w.host.sync.handlers.claim = (...a) => { seen++; return orig(...a); };
  const t = w.host.sync.players.map.get(2).latest.bodies[0].p; assert.ok(Math.hypot(ha.x - t.x, ha.z - t.z) > 8, 'the guest tractor is more than 8 m away');
  g.net.send(w.host.net.id, { t: 'claim', ids: [ha.id] }, true); w.seconds(0.3);
  assert.equal(seen, 1, 'the claim was handled'); assert.ok(free(w.host.game, ha), 'still free');
});
test('the host boop raises the ownership number and the animal leaves the guest free list (M-15, M-26)', async () => {
  const w = await mpWorld({ seed: 36 }); w.seconds(1);
  const ha = single(w.host.game), e0 = ha.epoch; inFront(w.host, ha); w.seconds(2);
  assert.equal(ha.epoch, e0 + 1); const ga = w.guests[0].game.herd.animals[ha.id];
  assert.ok(!free(w.guests[0].game, ga)); assert.ok(['carried', 'elsewhere'].includes(ga.state));
});
test('a stale yes (an older claim) never lowers the ownership number nor lands a newer flight (M-14, M-26)', async () => {
  const w = await mpWorld({ seed: 37 }); w.seconds(1);
  const g = w.guests[0], ha = single(w.host.game), ga = g.game.herd.animals[ha.id];
  w.host.sync.handlers.claim = () => {}; // the host's answer to the newer claim is still on its way
  { const p = g.game.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); ha.x = ga.x = p.x; ha.z = ga.z = p.z; ha.state = ga.state = 'idle'; ha.timer = ga.timer = 99; ha.epoch = ga.epoch = 2; } // freed after an older grant (epoch 1)
  let k = 0; while (!g.sync.pending.has(ha.id) && k++ < 120) w.step(1);
  assert.ok(g.sync.pending.has(ha.id), 'the guest launched it'); assert.equal(ga.epoch, 2);
  g.sync.handlers.claimed({ t: 'claimed', ok: [ha.id], no: [], epochs: [[ha.id, 1]] }); // the answer to the older claim
  assert.equal(ga.epoch, 2, 'the number does not drop'); assert.ok(!g.sync.pending.has(ha.id), 'any answer ends the claim in flight (one claim per id at a time)'); assert.equal(ga.state, 'fly', 'the flight still waits');
  w.seconds(2.5);
  assert.ok(!g.events.some(e => e.type === 'land' && e.animal.id === ha.id), 'nothing landed');
  assert.ok(g.events.some(e => e.type === 'unclaim' && e.animal.id === ha.id && e.reason === 'timeout'));
});
test('a yes that arrives after the guest gave up: nothing lands and the host frees it at a higher number (M-14, Decision 2)', async () => {
  const w = await mpWorld({ seed: 38, link: { delay: 1200 } }); w.seconds(4);
  const g = w.guests[0], ha = single(w.host.game), ga = g.game.herd.animals[ha.id];
  const answers = []; const orig = g.sync.handlers.claimed; g.sync.handlers.claimed = m => { answers.push({ m, unclaimed: g.events.some(e => e.type === 'unclaim' && e.animal.id === ha.id) }); return orig(m); };
  { const p = g.game.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); ha.x = ga.x = p.x; ha.z = ga.z = p.z; ha.state = ga.state = 'idle'; ha.timer = ga.timer = 99; }
  let k = 0; while (!g.sync.pending.has(ha.id) && k++ < 120) w.step(1);
  assert.ok(g.sync.pending.has(ha.id), 'the guest launched it');
  let grant = null; k = 0; while (grant === null && k++ < 120) { w.step(1); if (ha.state === 'carried') grant = ha.epoch; }
  assert.ok(grant !== null, 'the host granted it');
  k = 0; while (!answers.length && k++ < 180) w.step(1);
  assert.equal(answers.length, 1); assert.deepEqual(answers[0].m.ok, [ha.id]); assert.ok(answers[0].unclaimed, 'the yes arrived after the guest timed out');
  assert.ok(g.events.some(e => e.type === 'unclaim' && e.animal.id === ha.id && e.reason === 'timeout'));
  k = 0; while (ha.state === 'carried' && k++ < 120) w.step(1); // the release is on its way to the host
  assert.ok(!g.events.some(e => e.type === 'land' && e.animal.id === ha.id), 'nothing landed');
  assert.ok(free(w.host.game, ha) || ha.state === 'dodge', `host freed it (${ha.state})`); assert.ok(ha.epoch > grant, `epoch ${ha.epoch} > ${grant}`);
});
test('a stale no drops the newer flight; its yes then finds no flight, so the guest releases it and the host frees it (M-14, M-26)', async () => {
  const w = await mpWorld({ seed: 39, link: { delay: 100 } }); w.seconds(1);
  const g = w.guests[0], ha = single(w.host.game), ga = g.game.herd.animals[ha.id];
  const released = []; const orig = w.host.sync.handlers.release; w.host.sync.handlers.release = (p, m) => { released.push(...m.ids); return orig(p, m); };
  { const p = g.game.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); ha.x = ga.x = p.x; ha.z = ga.z = p.z; ha.state = ga.state = 'idle'; ha.timer = ga.timer = 99; }
  let k = 0; while (!g.sync.pending.has(ha.id) && k++ < 120) w.step(1);
  assert.ok(g.sync.pending.has(ha.id), 'the guest launched it (flight B)');
  let grant = null; k = 0; while (grant === null && k++ < 60) { w.step(1); if (ha.state === 'carried') grant = ha.epoch; }
  assert.ok(grant !== null, 'the host granted B'); assert.ok(g.sync.pending.has(ha.id), "B's yes is still on the wire");
  g.game.boopsPaused = true; // the guest's snapshots still show it free for ~150 ms: a re-boop would take B's yes and land (also consistent), so hold boops to see the lone yes
  g.sync.handlers.claimed({ t: 'claimed', ok: [], no: [ha.id], epochs: [] }); w.step(1); // the no to an older claim A arrives first
  assert.ok(g.events.some(e => e.type === 'unclaim' && e.animal.id === ha.id && e.reason === 'refused'), 'B poofed');
  k = 0; while (ha.state === 'carried' && k++ < 60) w.step(1); // B's yes reaches the guest, which has no flight: it releases
  assert.deepEqual(released, [ha.id], 'the guest released it');
  assert.ok(free(w.host.game, ha) || ha.state === 'dodge', `host freed it (${ha.state})`); assert.ok(ha.epoch > grant, `epoch ${ha.epoch} > ${grant}`);
  assert.ok(!g.events.some(e => e.type === 'land' && e.animal.id === ha.id), 'nothing landed');
});
test('after a guest show, the host removes the delivered animals and makes new ones (M-6, M-16)', async () => {
  const w = await mpWorld({ seed: 41 }); w.seconds(1);
  const g = w.guests[0], h = w.host.game.herd, ha = single(w.host.game), ga = g.game.herd.animals[ha.id];
  { const p = g.game.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); ha.x = ga.x = p.x; ha.z = ga.z = p.z; ha.state = ga.state = 'idle'; ha.timer = ga.timer = 99; }
  w.seconds(3); assert.equal(ha.state, 'carried');
  const before = h.animals.length, riders = g.game.startShow(); g.sync.showStarted(); riders.forEach(r => { r.animal.state = 'show'; }); g.game.finishShow(riders); g.sync.delivered(riders);
  w.seconds(0.5);
  assert.ok(['toBarn', 'gone'].includes(ha.state), ha.state); assert.equal(ha.epoch, 2); assert.ok(h.animals.length > before, 'new animals'); assert.equal(h.free().filter(a => a.home === 'route').length, 18);
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
  assert.notEqual(w.host.game.trees.list[t.id].state, 'broken', 'too far from guest 1 (12 m): refused');
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

import { encodeVehicle } from '../src/net/codec.js';
test('garbage, wrong kinds, odd JSON and a flood never break the host or the guest (M-44, M-50)', async () => {
  const w = await mpWorld({ seed: 51 }); w.seconds(1);
  const g = w.guests[0], H = w.host.net.id, G = g.net.id;
  const junk = [new ArrayBuffer(0), new Uint8Array([2, 0, 0]).buffer, new Uint8Array(500).fill(255).buffer, { t: 'welcome', v: 1 }, { t: 'claim', ids: [99999] }, { t: 'tree', id: -1 }, null, 'text', 42, { t: 'claim', ids: [1e9] }];
  for (const j of junk) { g.net.send(H, j, typeof j === 'object' && !(j instanceof ArrayBuffer)); w.host.net.send(G, j, typeof j === 'object' && !(j instanceof ArrayBuffer)); }
  w.seconds(0.5);
  assert.equal(g.game.farm.seed, 51); assert.equal(g.sync.you, 2); assert.equal(w.host.sync.players.list().length, 1);
});
test('a guest cannot speak for another player: the host rewrites the player number (M-50)', async () => {
  const w = await mpWorld({ seed: 52, guests: 2 }); w.seconds(1);
  const [g1] = w.guests, fake = encodeVehicle({ player: 3, time: 1e9, mode: 'drive', full: false, bodies: [0, 1, 2].map(() => ({ p: { x: 40, y: 1, z: 40 }, q: { x: 0, y: 0, z: 0, w: 1 } })), carried: [] });
  g1.net.send(w.host.net.id, fake); w.seconds(0.3);
  const p3 = w.host.sync.players.map.get(3).pose.tractor.p; assert.ok(Math.hypot(p3.x - 40, p3.z - 40) > 1, 'player 3 did not move');
});
test('a flood of claims: at most 60 each second are handled (M-50)', async () => {
  const w = await mpWorld({ seed: 53 }); w.seconds(1);
  let handled = 0; const orig = w.host.sync.handlers.claim; w.host.sync.handlers.claim = (...a) => { handled++; return orig(...a); };
  for (let i = 0; i < 300; i++) w.guests[0].net.send(w.host.net.id, { t: 'claim', ids: [0] }, true);
  w.seconds(0.2); assert.ok(handled > 50 && handled <= 60, `${handled}`); // the window may already hold a few earlier messages
});
test('old messages are ignored: an older train position, and animal data with a lower ownership number (M-26)', async () => {
  const { encodeHerd } = await import('../src/net/codec.js');
  const w = await mpWorld({ seed: 55 }); w.seconds(1);
  const g = w.guests[0], G = g.net.id, far = { x: 40, y: 1, z: 40 };
  w.host.net.send(G, encodeVehicle({ player: 1, time: 1, mode: 'drive', full: false, bodies: [0, 1, 2].map(() => ({ p: far, q: { x: 0, y: 0, z: 0, w: 1 } })), carried: [] })); // time 1: older than all
  w.seconds(0.3); const hp = g.sync.players.map.get(1).pose.tractor.p; assert.ok(Math.hypot(hp.x - 40, hp.z - 40) > 5, 'the host tractor did not jump back');
  const ha = w.host.game.herd.free().find(a => !a.hidden), ga = g.game.herd.animals[ha.id]; ha.epoch = 5; w.seconds(0.5); assert.equal(ga.epoch, 5);
  w.host.net.send(G, encodeHerd({ time: w.now + 1, animals: [{ ...ha, epoch: 4, busy: false, x: 40, y: 0, z: 40, anim: 'idle' }] })); // newer time, older owner
  for (let i = 0; i < 30; i++) { w.step(1); assert.ok(Math.hypot(ga.x - 40, ga.z - 40) > 5, 'ignored'); }
  assert.equal(ga.epoch, 5);
});
test('a handler that throws is contained (M-44)', async () => {
  const w = await mpWorld({ seed: 54 }); w.seconds(1);
  const orig = w.host.sync.handlers.horn; w.host.sync.handlers.horn = () => { throw new Error('boom'); };
  const warn = console.warn, warned = []; console.warn = (...a) => warned.push(a); // the host logs the error: keep the test output clean
  try { w.step(1, [STILL, { thr: 0, steer: 0, horn: true }]); w.seconds(0.3); } finally { console.warn = warn; } // the throw stays inside the host's message handler (w.step would throw otherwise)
  assert.equal(warned.length, 1);
  w.host.sync.handlers.horn = orig; w.step(1, [STILL, { thr: 0, steer: 0, horn: true }]); w.seconds(0.3);
  assert.ok(w.host.events.some(e => e.type === 'remoteHorn' && e.n === 2), 'the host still handles messages');
});
test('a guest handler that throws is contained too (M-44)', async () => {
  const w = await mpWorld({ seed: 56 }); w.seconds(1);
  const g = w.guests[0], orig = g.sync.handlers.horn; g.sync.handlers.horn = () => { throw new Error('boom'); };
  const warn = console.warn, warned = []; console.warn = (...a) => warned.push(a);
  try { w.step(1, [{ thr: 0, steer: 0, horn: true }]); w.seconds(0.3); } finally { console.warn = warn; }
  assert.equal(warned.length, 1);
  g.sync.handlers.horn = orig; w.step(1, [{ thr: 0, steer: 0, horn: true }]); w.seconds(0.3);
  assert.ok(g.events.some(e => e.type === 'remoteHorn' && e.n === 1), 'the guest still handles messages');
});
test('a reliable message that is too big is dropped: over 2048 from a guest, over 131072 from the host (M-50)', async () => {
  const w = await mpWorld({ seed: 57 }); w.seconds(1);
  const g = w.guests[0], H = w.host.net.id, G = g.net.id, hp = () => w.host.sync.players.map.get(2).paint, gp = () => g.sync.players.map.get(1).paint;
  g.net.send(H, { t: 'paint', paint: { ...PAINTS[3], pad: 'x'.repeat(2048) } }, true); w.seconds(0.3); assert.deepEqual(hp(), PAINTS[1], 'dropped by the host');
  g.net.send(H, { t: 'paint', paint: { ...PAINTS[3], pad: 'x'.repeat(1900) } }, true); w.seconds(0.3); assert.equal(hp().body, PAINTS[3].body, 'under the cap: handled');
  w.host.net.send(G, { t: 'players', list: [{ n: 1, paint: PAINTS[2], away: false, pad: 'x'.repeat(131072) }] }, true); w.seconds(0.3); assert.deepEqual(gp(), PAINTS[0], 'dropped by the guest');
  w.host.net.send(G, { t: 'players', list: [{ n: 1, paint: PAINTS[2], away: false, pad: 'x'.repeat(130000) }] }, true); w.seconds(0.3); assert.deepEqual(gp(), PAINTS[2], 'under the cap: handled');
});
test('a guest regrow counts at most once in 5 s; the extra ones are not passed on (M-17, M-50)', async () => {
  const w = await mpWorld({ seed: 58, guests: 2 }); w.seconds(1);
  const [g1, g2] = w.guests; let resets = 0, relayed = 0;
  const reset = w.host.game.trees.reset; w.host.game.trees.reset = (...a) => { resets++; return reset(...a); };
  const orig = g2.sync.handlers.regrow; g2.sync.handlers.regrow = (...a) => { relayed++; return orig(...a); };
  for (let i = 0; i < 10; i++) g1.net.send(w.host.net.id, { t: 'regrow' }, true);
  w.seconds(4.5); assert.deepEqual([resets, relayed], [1, 1]);
  g1.net.send(w.host.net.id, { t: 'regrow' }, true); w.seconds(0.3); assert.deepEqual([resets, relayed], [1, 1], 'still within 5 s');
  w.seconds(0.5); g1.net.send(w.host.net.id, { t: 'regrow' }, true); w.seconds(0.3); assert.deepEqual([resets, relayed], [2, 2], 'after 5 s');
});
test('a repeated id in claim, release or delivered is handled once (M-50)', async () => {
  const w = await mpWorld({ seed: 59 }); w.seconds(1);
  const g = w.guests[0], H = w.host.net.id, answers = []; g.sync.handlers.claimed = m => answers.push(m); // the guest only records the answers
  const near = a => { const t = w.host.sync.players.map.get(2).latest.bodies[0].p; Object.assign(a, { x: t.x + 2, z: t.z, state: 'idle', timer: 99, hidden: false }); };
  const [a, b] = w.host.game.herd.free().filter(x => !x.hidden && x.type !== 'chick');
  near(a); g.net.send(H, { t: 'claim', ids: [a.id, a.id] }, true); w.seconds(0.2);
  assert.deepEqual([answers[0].ok, answers[0].no, answers[0].epochs.length], [[a.id], [], 1]); assert.equal(a.owner, 2);
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
test('a guest that leaves: its tractor poofs and its animals are replaced (M-39)', async () => {
  const w = await mpWorld({ seed: 62 }); w.seconds(1);
  const g = w.guests[0], ha = single(w.host.game), ga = g.game.herd.animals[ha.id];
  { const p = g.game.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); ha.x = ga.x = p.x; ha.z = ga.z = p.z; ha.state = ga.state = 'idle'; ha.timer = ga.timer = 99; }
  w.seconds(3); assert.equal(ha.state, 'carried');
  g.net.leave(); w.seconds(0.3);
  assert.equal(ha.state, 'gone'); assert.equal(w.host.sync.players.list().length, 0);
  assert.ok(w.host.events.some(e => e.type === 'playerGone' && e.n === 2)); assert.equal(w.host.game.herd.free().filter(a => a.home === 'route').length, 18);
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
  assert.equal(game.herd.free().filter(a => a.home === 'route').length, 18);
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
  const g = w.guests[0], warn = console.warn; let warned = 0; console.warn = () => { warned++; };
  try { g.game.herd.respawn = () => { throw new Error('boom'); }; assert.doesNotThrow(() => g.sync.close()); assert.equal(warned, 1); assert.equal(g.sync.alone, true); }
  finally { console.warn = warn; }
});

test('after a timeout the claim is still in flight: no re-boop until its answer comes; the answer clears it (M-14)', async () => {
  const w = await mpWorld({ seed: 71 }); w.seconds(1);
  const g = w.guests[0], ha = single(w.host.game), ga = g.game.herd.animals[ha.id];
  const claims = []; w.host.sync.handlers.claim = (p, m) => { claims.push(m); }; // the host has the claim, its answer is slow
  { const p = g.game.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); ha.x = ga.x = p.x; ha.z = ga.z = p.z; ha.state = ga.state = 'idle'; ha.timer = ga.timer = 99; } // free in front of the guest on both devices
  w.seconds(2.5);
  assert.ok(g.events.some(e => e.type === 'unclaim' && e.animal.id === ha.id && e.reason === 'timeout'), 'timed out');
  assert.equal(claims.length, 1, 'one claim only: the host still shows it free, yet no re-boop'); assert.ok(g.sync.pending.has(ha.id), 'still waiting for its answer');
  assert.ok(!free(g.game, ga), 'a stale herd sample does not free it');
  g.sync.handlers.claimed({ t: 'claimed', ok: [], no: [ha.id], epochs: [] }); assert.ok(!g.sync.pending.has(ha.id), 'the answer clears it');
  w.seconds(1); assert.equal(claims.length, 2, 'boopable again');
});
test('a stale yes still clears the claim in flight (M-14, M-26)', async () => {
  const w = await mpWorld({ seed: 72 }); w.seconds(1);
  const g = w.guests[0], ha = single(w.host.game), ga = g.game.herd.animals[ha.id];
  ga.epoch = 3; g.sync.pending.add(ha.id);
  g.sync.handlers.claimed({ t: 'claimed', ok: [ha.id], no: [], epochs: [[ha.id, 1]] });
  assert.ok(!g.sync.pending.has(ha.id)); assert.equal(ga.epoch, 3);
});
test('a herd message never pulls an animal out of the guest trailer, whatever its ownership number (R-4, M-26)', async () => {
  const { encodeHerd } = await import('../src/net/codec.js');
  const w = await mpWorld({ seed: 73 }); w.seconds(1);
  const g = w.guests[0], ha = single(w.host.game), ga = g.game.herd.animals[ha.id];
  { const p = g.game.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); ha.x = ga.x = p.x; ha.z = ga.z = p.z; ha.state = ga.state = 'idle'; ha.timer = ga.timer = 99; }
  w.seconds(3); assert.equal(ga.state, 'ride');
  w.host.sync.after = () => {}; w.step();
  w.host.net.send(g.net.id, encodeHerd({ time: w.now + 1, animals: [{ id: ha.id, epoch: ga.epoch + 5, type: ha.type, golden: ha.golden, hidden: false, busy: false, x: 40, y: 0, z: 40, yaw: 0, anim: 'idle', leader: null, line: 0 }] }), false);
  w.seconds(0.5); assert.equal(ga.state, 'ride'); assert.equal(g.game.load.landed(), 1);
});

test('the rate limits count in wall time: with the game frozen (rAF paused), a new window still opens (M-50)', async () => {
  let wall = 0; const w = await mpWorld({ seed: 74, clock: () => wall }); w.seconds(1); wall = 5000;
  const g = w.guests[0], H = w.host.net.id, G = g.net.id; let handled = 0;
  const orig = w.host.sync.handlers.claim; w.host.sync.handlers.claim = (...a) => { handled++; return orig(...a); };
  const deliver = () => w.hub.tick(w.now); // messages arrive, but no frame runs: sim time stands still
  for (let i = 0; i < 70; i++) g.net.send(H, { t: 'claim', ids: [0] }, true); deliver(); assert.equal(handled, 60);
  wall += 1100; g.net.send(H, { t: 'claim', ids: [0] }, true); deliver(); assert.equal(handled, 61, 'the host: a new second, a new window');
  for (let i = 0; i < 70; i++) w.host.net.send(G, { t: 'players', list: [{ n: 1, paint: PAINTS[0], away: false }] }, true); deliver();
  wall += 1100; w.host.net.send(G, { t: 'players', list: [{ n: 1, paint: PAINTS[3], away: false }] }, true); deliver();
  assert.deepEqual(g.sync.players.map.get(1).paint, PAINTS[3], 'the guest: a new window too');
});
