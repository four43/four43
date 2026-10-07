// test/mp.repair.test.mjs — repair after lost messages (M-56..M-58, M-53 loss tests)
import test from 'node:test';
import assert from 'node:assert/strict';
import { mpWorld, free, STILL, settle, blackout, trainFrame, parked } from './mp.harness.mjs';
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
  g.game.boopsPaused = true; assert.deepEqual(settle(w, 3), []);
  assert.ok(free(g.game, ga), 'free on the guest again');
});
test('a yes lost in a connection change: the guest poofs and gives it back at the next keyframe; all agree within 3 s (M-14, M-56, M-58)', async () => {
  const w = await mpWorld({ seed: 94 }); w.seconds(1);
  const g = w.guests[0], ha = single(w.host.game), ga = inFrontOf(g, ha);
  let k = 0; while (!g.sync.pending.has(ha.id) && k++ < 60) w.step(1);
  w.hub.drop = (from, to, d) => to === g.net.id && d instanceof ArrayBuffer; w.seconds(0.1); assert.equal(ha.owner, 2, 'granted'); // the claim got through; its answer does not
  blackout(w, 2.5);
  assert.ok(g.events.some(e => e.type === 'unclaim' && e.animal.id === ha.id), 'poofed');
  g.game.boopsPaused = true; assert.deepEqual(settle(w, 3), []);
  assert.ok(free(w.host.game, ha) || ha.state === 'dodge', 'the host has it free');
});
test('a tree break and a regrow lost: the keyframe puts every tree right within 3 s (M-17, M-56, M-58)', async () => {
  const w = await mpWorld({ seed: 95, guests: 2 }); w.seconds(1);
  const [g1, g2] = w.guests, trees = w.host.game.trees.list.filter(t => t.kind === 'tree').slice(0, 2);
  w.hub.drop = (from, to) => to === g2.net.id; // g2 hears nothing for a while
  for (const t of trees) w.host.sync.after([{ type: 'treeBreak', tree: w.host.game.trees.breakById(t.id).tree }], w.now);
  w.seconds(0.5); w.host.game.trees.reset(); w.seconds(1); w.host.game.trees.breakById(trees[1].id); w.seconds(0.5); // one grows back, one stays broken
  g1.game.trees.breakById(trees[0].id); // a guest break the host refused (too far): only on g1's screen
  w.hub.drop = null;
  assert.deepEqual(settle(w, 3), []);
  for (const d of w.devs) assert.deepEqual(d.game.trees.list.filter(t => t.state === 'broken').map(t => t.id), [trees[1].id], d.name);
});
test('everything lost for a second while two guests boop under a far network: all agree within 3 s (M-53, M-58)', async () => {
  const { makeRng } = await import('../src/sim/rng.js');
  const w = await mpWorld({ seed: 96, guests: 2, link: { delay: 150, jitter: 60, loss: 0.05, rng: makeRng(96).next } }); w.seconds(2);
  for (const g of w.guests) for (let i = 0; i < 3; i++) { const ha = w.host.game.herd.free().filter(x => !x.hidden && x.type !== 'chick' && !w.host.game.herd.animals.some(c => c.leader === x.id))[i * 2 + (g === w.guests[0] ? 0 : 1)]; inFrontOf(g, ha); w.step(12); }
  blackout(w, 1);
  w.seconds(1, (d, i) => i > 0 ? { thr: 0.3, steer: 0.4, horn: false } : STILL);
  for (const g of w.guests) g.game.boopsPaused = true; w.host.game.boopsPaused = true;
  const t0 = w.now; assert.deepEqual(settle(w, 3), []); assert.ok(w.now - t0 <= 3000);
});
