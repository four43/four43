// test/mp.repair.test.mjs — repair after lost messages (M-56..M-58, M-53 loss tests)
import test from 'node:test';
import assert from 'node:assert/strict';
import { mpWorld, settle, trainFrame, parked } from './mp.harness.mjs';
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
