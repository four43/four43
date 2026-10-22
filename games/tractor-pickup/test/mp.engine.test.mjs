// Tractor's netcode on engine commands (lion-hawk 2f T6): two engines over the hub through ports.
import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { mp } from 'lion-hawk/test';
import { tractorGame } from '../src/game.sim.js';
import { spawnPoint } from '../src/sim/spawn.js';
await R.init();
// shows: 18 unlocks every paint PAINTS uses (clampProgress keeps only unlocked paints)
const PAINTS = [{ body: 'red', trim: 'yellow' }, { body: 'blue', trim: 'white' }];
const world = (o = {}) => mp(tractorGame(), { peers: 2, ...o, argsOf: i => ({ seed: i ? 1000 + i : 21, started: true, trip: false, progress: { shows: 18, stickers: [], paint: PAINTS[i % 2], hatsOff: [], bookSeen: 0 } }),
  beforeStep: p => { p.engine.scene.state.raw ??= { thr: 0, steer: 0, horn: false }; } });
const st = p => p.engine.scene.state;

test('a guest gets the engine\'s welcome and builds the host farm (lh.game) through ctx.load (M-1, M-24, #80)', () => {
  const w = world(); w.seconds(0.5);
  const g = w.guests[0]; assert.equal(st(g).game.farm.seed, 21); assert.equal(st(g).net.sync.you, 2); assert.equal(st(g).gen, 2);
  const p = spawnPoint(st(g).game.farm, 2); assert.ok(Math.hypot(st(g).game.tractor.x - p.x, st(g).game.tractor.z - p.z) < 0.5);
  assert.deepEqual(st(w.host).net.sync.players.list().map(x => [x.n, x.paint]), [[2, PAINTS[1]]]);
});
test('the guest\'s commands are plain JSON: decoded frames and schema-checked messages, with from and at (#78)', () => {
  const w = world({ record: true }); w.seconds(1);
  const tape = w.guests[0].h.tape(); assert.deepEqual(JSON.parse(JSON.stringify(tape)), tape);
  const ops = tape.log.flatMap(x => x.ops ?? []).filter(o => o[0] === 'command').map(o => o[1]);
  for (const t of ['net.open', 'net.peer', 'net.welcome', 'net.frame']) assert.ok(ops.includes(t), t);
});
test('a guest boop is claimed and granted through commands (M-13, M-14)', () => {
  const w = world(); w.seconds(1);
  const H = st(w.host).game, G = st(w.guests[0]).game;
  const a = H.herd.free().find(x => !x.hidden && x.type !== 'chick' && !H.herd.animals.some(c => c.leader === x.id) && x.home === 'route');
  const ga = G.herd.animals[a.id], p = G.tractorWorld({ x: 2.5, y: 0, z: 0 }, {});
  for (const x of [a, ga]) { x.x = p.x; x.z = p.z; x.state = 'idle'; x.timer = 99; x.hidden = false; }
  w.seconds(3); assert.equal(ga.state, 'ride'); assert.equal(a.state, 'carried'); assert.equal(a.owner, 2);
});
test('the host leaving sends the guest on alone on the same farm (M-41)', () => {
  const w = world(); w.seconds(1); w.host.net.leave(); w.seconds(0.5);
  const g = st(w.guests[0]); assert.equal(g.net.role, 'solo'); assert.equal(g.game.herd.remote, false); assert.equal(g.game.farm.seed, 21);
});
test('a guest that goes alone while its farm builds: the host-seed farm is built once, with no farmReady (M-41, #80)', () => {
  const w = world(), g = w.guests[0], y = (w.step(1), st(g).net.sync); let ready = 0; const fr = y.farmReady; y.farmReady = (...a) => { ready++; return fr(...a); };
  let k = 0; while (!g.engine.loading.active && k++ < 60) w.step(1);
  assert.ok(g.engine.loading.active && st(g).gen === 1, 'the welcome asked for the farm; not built yet');
  const builds = () => g.h.events.filter(e => e.type === 'farm').length, b0 = builds();
  w.host.net.leave(); w.seconds(1); // the room closes before the build runs (commands come first in a step)
  assert.equal(st(g).net.role, 'solo'); assert.equal(y.alone, true);
  assert.equal(st(g).game.farm.seed, 21, "the host's farm"); assert.equal(st(g).gen, 2); assert.equal(builds() - b0, 1, 'built once');
  assert.equal(ready, 0, 'no farmReady: the sync is gone'); assert.equal(st(g).game.herd.remote, false);
});
