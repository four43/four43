// test/mp.repair.test.mjs — repair after lost messages (M-56..M-58, M-53 loss tests)
import test from 'node:test';
import assert from 'node:assert/strict';
import { mpWorld, free, STILL, PAINTS, settle, disagreements, blackout, trainFrame, parked } from './mp.harness.mjs';
import { createLoad } from '../src/sim/slots.js';
import { CAPACITY } from '../src/sim/game.js';

const single = g => g.herd.free().find(x => !x.hidden && x.type !== 'chick' && !g.herd.animals.some(c => c.leader === x.id) && x.home === 'route');
const inFrontOf = (g, ha) => { const ga = g.game.herd.animals[ha.id], p = g.game.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); ha.x = ga.x = p.x; ha.z = ga.z = p.z; ha.state = ga.state = 'idle'; ha.timer = ga.timer = 99; return ga; };
const isRelease = d => !(d instanceof ArrayBuffer) && d?.t === 'release';

test('the host frees a guest animal that is not in that guest train for 3 s (M-57)', async () => {
  const w = await mpWorld({ seed: 91 }); w.seconds(1);
  const g = w.guests[0], ha = single(w.host.game), ga = inFrontOf(g, ha);
  w.seconds(3); assert.equal(ga.state, 'ride'); assert.equal(ha.owner, 2); const e = ha.epoch;
  w.hub.drop = (from, to, d) => isRelease(d); // the guest's own give-back (M-56) is lost too
  g.game.load = createLoad(CAPACITY); ga.state = 'elsewhere'; g.game.boopsPaused = true; // the guest lost it, as a lost message would leave it
  const t0 = w.now; let k = 0; while (ha.state === 'carried' && k++ < 300) w.step(1);
  const took = w.now - t0; assert.ok(took >= 2900 && took <= 3300, `freed after ${took.toFixed(0)} ms`); assert.equal(ha.epoch, e + 1);
  assert.deepEqual(settle(w, 1), [], 'all agree');
});
test('an away guest keeps its animals: the 3 s count only while its frames come (M-39, M-57)', async () => {
  const w = await mpWorld({ seed: 92 }); w.seconds(1);
  const g = w.guests[0], ha = single(w.host.game), ga = inFrontOf(g, ha);
  w.seconds(3); assert.equal(ga.state, 'ride');
  const hp = w.host.sync.players.map.get(2), t = hp.latest.bodies[0].p, empty = trainFrame(2, 2, { ...parked(t.x, t.z), riders: [] }, w.now + 1);
  w.hub.drop = (from, to, d) => from === g.net.id && d instanceof ArrayBuffer && d !== empty; // the guest's own train frames are lost; the host's last one has no riders
  g.net.send(w.host.net.id, empty, false); w.step(1); w.hub.drop = null;
  assert.ok(hp.latest.riders.length === 0, 'the host last heard a train without the animal');
  w.hub.away(g.net.id); w.seconds(10);
  assert.equal(ha.state, 'carried', 'not freed while away'); assert.equal(ha.owner, 2);
  w.hub.back(g.net.id); w.seconds(1);
  assert.equal(ha.state, 'carried'); assert.equal(ha.owner, 2); assert.equal(ga.state, 'ride');
});
test('a claim lost in a connection change: the guest poofs, nobody keeps the animal, all agree within 3 s (M-14, M-56, M-58)', async () => {
  const w = await mpWorld({ seed: 93 }); w.seconds(1);
  const g = w.guests[0], ha = single(w.host.game), ga = inFrontOf(g, ha);
  w.hub.drop = (from, to, d) => d?.t === 'claim'; let k = 0; while (!g.sync.pending.has(ha.id) && k++ < 60) w.step(1); // the guest boops; its claim is lost
  blackout(w, 2.5); // then every claim, release and frame, both ways, until after the 1 s hold
  assert.ok(g.events.some(e => e.type === 'unclaim' && e.animal.id === ha.id && e.reason === 'timeout'), 'poofed'); assert.ok(free(w.host.game, ha), 'the host never had the claim');
  assert.ok(disagreements(w).length > 0, 'the devices disagree after the loss');
  g.game.boopsPaused = true; assert.deepEqual(settle(w, 3), []);
  assert.ok(free(g.game, ga), 'free on the guest again');
});
test('a yes lost in a connection change: the guest poofs and gives it back at the next keyframe; all agree within 3 s (M-14, M-56, M-58)', async () => {
  const w = await mpWorld({ seed: 94 }); w.seconds(1);
  const g = w.guests[0], ha = single(w.host.game); inFrontOf(g, ha);
  let k = 0; while (!g.sync.pending.has(ha.id) && k++ < 60) w.step(1);
  w.hub.drop = (from, to, d) => to === g.net.id && d instanceof ArrayBuffer; w.seconds(0.1); assert.equal(ha.owner, 2, 'granted'); // the claim got through; its answer does not
  blackout(w, 2.5);
  assert.ok(g.events.some(e => e.type === 'unclaim' && e.animal.id === ha.id), 'poofed');
  assert.ok(disagreements(w).length > 0, 'the devices disagree after the loss');
  g.game.boopsPaused = true; assert.deepEqual(settle(w, 3), []);
  assert.ok(free(w.host.game, ha) || ha.state === 'dodge', 'the host has it free');
});
test('a tree break and a regrow lost: the keyframe puts every tree right within 3 s (M-17, M-56, M-58)', async () => {
  const w = await mpWorld({ seed: 95, guests: 2 }); w.seconds(1);
  const [g1, g2] = w.guests, trees = w.host.game.trees.list.filter(t => t.kind === 'tree').slice(0, 2);
  w.hub.drop = (from, to) => to === g2.net.id; // g2 hears nothing for a while: the break is lost
  for (const t of trees) w.host.sync.after([{ type: 'treeBreak', tree: w.host.game.trees.breakById(t.id).tree }], w.now);
  w.seconds(0.5); w.hub.drop = null; assert.equal(g2.game.trees.list[trees[0].id].state, 'standing', 'the break is lost on g2');
  w.seconds(2); assert.equal(g2.game.trees.list[trees[0].id].state, 'broken', 'g2 has the breaks from the keyframe');
  w.hub.drop = (from, to) => to === g2.net.id; // the regrow is lost on g2
  w.host.game.trees.reset(); w.host.sync.showStarted(); w.seconds(1); w.host.game.trees.breakById(trees[1].id); w.seconds(0.5); // one grows back, one stays broken
  assert.equal(g2.game.trees.list[trees[0].id].state, 'broken', 'the regrow is lost on g2'); assert.equal(g1.game.trees.list[trees[0].id].state, 'standing', 'g1 heard the regrow');
  g1.game.trees.breakById(trees[0].id); // a guest break the host refused (too far): only on g1's screen
  w.hub.drop = null;
  assert.ok(disagreements(w).length > 0, 'the devices disagree after the loss');
  assert.deepEqual(settle(w, 3), []);
  for (const d of w.devs) assert.deepEqual(d.game.trees.list.filter(t => t.state === 'broken').map(t => t.id), [trees[1].id], d.name);
});
test('everything lost for a second while two guests boop under a far network: all agree within 3 s (M-53, M-58)', async () => {
  const { makeRng } = await import('../src/sim/rng.js');
  const w = await mpWorld({ seed: 96, guests: 2, link: { delay: 150, jitter: 60, loss: 0.05, rng: makeRng(96).next } }); w.seconds(2);
  const H = w.host.game, ids = H.herd.free().filter(x => !x.hidden && x.type !== 'chick' && !H.herd.animals.some(c => c.leader === x.id)).slice(0, 6).map(x => x.id); // chosen before any boop
  w.guests.forEach((g, j) => { for (let i = 0; i < 3; i++) { inFrontOf(g, H.herd.animals[ids[i * 2 + j]]); w.step(12); } });
  const from = w.guests.map(g => g.events.length);
  blackout(w, 1);
  assert.ok(w.guests.some((g, j) => g.sync.pending.size > 0 || g.events.slice(from[j]).some(e => e.type === 'unclaim')), 'a claim is open or lost');
  w.seconds(1, (d, i) => i > 0 ? { thr: 0.3, steer: 0.4, horn: false } : STILL);
  for (const g of w.guests) g.game.boopsPaused = true; w.host.game.boopsPaused = true;
  assert.ok(disagreements(w).length > 0, 'the devices disagree after the loss');
  assert.deepEqual(settle(w, 3), []);
});
test('a lost new-farm welcome: the host sends the welcome with each keyframe, so the guest is on the new farm within 3 s; a guest in its show is not rebuilt twice (M-19, M-58)', async () => {
  const RAPIER = (await import('@dimforge/rapier3d-compat')).default, { createGame } = await import('../src/sim/game.js');
  const w = await mpWorld({ seed: 97, guests: 2 }); w.seconds(1);
  const [g, s] = w.guests; s.game.mode = 'show';
  w.hub.drop = (from, to, d) => to === g.net.id && d?.t === 'welcome'; // the new farm's welcome to g is lost
  w.host.game = createGame(RAPIER, { seed: 98, power: 'medium' }); w.host.sync.setGame(w.host.game); w.seconds(0.2); w.hub.drop = null;
  assert.equal(g.game.farm.seed, 97, 'the welcome is lost'); assert.ok(disagreements(w).some(x => x.startsWith('guest1: farm')), 'the devices disagree after the loss');
  const t0 = w.now; let k = 0; while (g.game.farm.seed !== 98 && k++ < 180) w.step(1);
  assert.equal(g.game.farm.seed, 98); assert.ok(w.now - t0 <= 3000, `on the new farm after ${(w.now - t0).toFixed(0)} ms`);
  const built = g.game; w.seconds(2.5); assert.equal(s.game.farm.seed, 97, 'the show guest waits'); assert.equal(g.game, built, 'a repeated welcome does not build the farm again');
  s.game.mode = 'drive'; w.step(1); const sb = s.game; assert.equal(sb.farm.seed, 98, 'after its show');
  w.seconds(4.5); assert.equal(s.game, sb, 'built once: the welcomes that came during the show do not build it again');
  assert.deepEqual(settle(w, 3), []);
});
test('a lost delivered: the guest sends it again at the next keyframe, so the animals walk into the barn on the host and are never free again (M-6, M-16, M-56)', async () => {
  const w = await mpWorld({ seed: 99 }); w.seconds(1);
  const g = w.guests[0], h = w.host.game.herd, ha = single(w.host.game), ga = inFrontOf(g, ha);
  w.seconds(3); assert.equal(ga.state, 'ride'); assert.equal(ha.owner, 2);
  const before = h.animals.length, sent = [];
  w.hub.drop = (from, to, d) => { if (d?.t === 'delivered') sent.push(d); return d?.t === 'delivered' && sent.length === 1; }; // the first one is lost
  const riders = g.game.startShow(); g.sync.showStarted(); riders.forEach(r => { r.animal.state = 'show'; }); g.game.finishShow(riders); g.sync.delivered(riders); g.game.boopsPaused = true;
  let freed = false; for (let i = 0; i < 4 * 60; i++) { w.step(1); if (free(w.host.game, ha) || free(g.game, ga)) freed = true; }
  w.hub.drop = null;
  assert.ok(sent.length >= 2, 'sent again'); assert.ok(!freed, 'never free again on either device');
  assert.ok(['toBarn', 'gone'].includes(ha.state), ha.state); assert.ok(h.animals.length > before, 'new animals');
  assert.deepEqual(settle(w, 3), []);
  const n = sent.length; w.seconds(4.5); assert.equal(sent.length, n, 'not sent again once the host has it');
});
test('a lost paint: the guest sends it again at the next keyframe (M-2, M-56)', async () => {
  const w = await mpWorld({ seed: 100 }); w.seconds(1);
  const g = w.guests[0]; w.hub.drop = (from, to, d) => d?.t === 'paint';
  g.sync.setPaint({ body: 'green', trim: 'pink' }); w.seconds(0.2); w.hub.drop = null;
  assert.deepEqual(w.host.sync.players.map.get(2).paint, PAINTS[2 - 1], 'lost');
  w.seconds(2.5); assert.deepEqual(w.host.sync.players.map.get(2).paint, { body: 'green', trim: 'pink' });
});
test('a lost hello: the guest says it again every 2 s until it has its welcome; the host takes one hello only (M-24, M-50)', async () => {
  const w = await mpWorld({ seed: 101, join: false }), hellos = [];
  w.hub.drop = (from, to, d) => { if (d?.t === 'hello') hellos.push(w.now); return d?.t === 'hello' && hellos.length === 1; }; // the first is lost
  const g = w.addGuest(); w.seconds(1.5); assert.equal(g.sync.you, 0, 'no welcome yet');
  w.seconds(1); assert.equal(g.sync.you, 2); assert.equal(g.game.farm.seed, 101); assert.equal(hellos.length, 2);
  const welcome = w.host.sync.handlers.hello; let handled = 0; w.host.sync.handlers.hello = (...a) => { handled++; return welcome(...a); };
  g.net.send(w.host.net.id, { t: 'hello', v: 2, paint: { body: 'pink', trim: 'pink' } }, true); w.seconds(4);
  assert.equal(handled, 1); assert.deepEqual(w.host.sync.players.map.get(2).paint, PAINTS[1], 'a second hello changes nothing');
  assert.equal(hellos.length, 3, 'only the one sent by hand: no more hellos once welcomed'); assert.deepEqual(settle(w, 3), []);
});
