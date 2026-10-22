// test/state-homes.test.mjs
// [T-25] state homes (lion-hawk local players plan 5, spec §2.2): Tractor's coat, trim and barn are player state (lh.player) and
// survive a respawn (a new farm makes new trains) and a rejoin (a reload within rejoinSeconds); the farm is game state (lh.game)
// and reaches a late joiner.
import test from 'node:test';
import assert from 'node:assert/strict';
import { engineWorld } from './mp.engine.harness.mjs';
import { PAINTS, STILL, single, inFrontOf } from './mp.harness.mjs';
import { spawnPoint } from '../src/sim/spawn.js';

const entry = (d, n) => d.engine.players.find(p => p.number === n);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

test('T-25: player state survives a respawn: after a new farm the paint stays and each seat possesses its new train (review focus)', async () => {
  const w = await engineWorld({ seed: 21, guests: 1 }); w.seconds(1);
  const g = w.guests[0]; g.sync.setPaint(PAINTS[3]); w.seconds(1);
  const before = g.game.tractor.e;
  w.host.engine.command('farm.new', {}); w.seconds(3);
  assert.notEqual(g.game.tractor.e, before, 'the guest built the new farm');
  for (const d of w.devs) assert.deepEqual([entry(d, 2).coat, entry(d, 2).trim], [PAINTS[3].body, PAINTS[3].trim], d.name);
  for (const d of w.devs) assert.equal(d.engine.controllerOf(0).pawn, d.game.tractor.e, `${d.name} drives its new train`);
});

test('T-25: player state survives a rejoin: the reloaded guest gets number 2 and its lh.player record back (N-23, review focus)', async () => {
  // the guest's paint is its page's own (progress, saved on the device): argsOf gives guest 1 PAINTS[1], and a reload sends the same
  // paint again, as a real reloaded tab does. So the record must be the same at the rejoin (kept, not re-sent) and after it (what persists).
  // A second guest (player 3) is the third peer that must see the rejoined train move.
  const w = await engineWorld({ seed: 21, guests: 2 }), paint = PAINTS[1]; w.seconds(2);
  const [g, g3] = w.guests, go = [STILL, { thr: 1, steer: 0, horn: false }, STILL];
  assert.deepEqual([entry(w.host, 2).coat, entry(w.host, 2).trim], [paint.body, paint.trim], 'the host wrote the page\'s paint');
  const join = entry(w.host, 2).join;
  w.seconds(4, go); w.seconds(1); // the old page drives away from its spawn place: the host's trust follows it (C-4)
  const farm = w.host.game.farm, spawn = spawnPoint(farm, 2), old = { ...w.host.sync.players.map.get(2).trust };
  assert.ok(dist(old, spawn) > 5, `the old page's trust left the spawn place (${dist(old, spawn)})`);
  const a = single(w.host.game); inFrontOf(g, a); w.seconds(3);
  assert.deepEqual([a.state, a.owner], ['carried', 2], 'the old page owns an animal');
  w.drop(g); w.seconds(1);
  assert.equal(entry(w.host, 2).active, false, 'inactive, held for rejoinSeconds');
  assert.equal(w.host.sync.players.map.has(2), false, 'its train poofed on the host (M-39)');
  assert.equal(w.host.game.herd.animals.filter(x => x.state === 'carried' && x.owner === 2).length, 0, 'the old page\'s animals are released: none carried by number 2');
  assert.equal(a.state, 'gone', 'its animal went with it (M-39)');
  let back = null, row = null;
  w.host.engine.events.on(e => { if (e.type === 'player.joined' && e.rejoined) back = { number: e.number, coat: entry(w.host, e.number).coat, join: entry(w.host, e.number).join }; });
  w.rejoin(g);
  for (let i = 0; i < 180; i++) { w.step(1); if (!row && w.host.sync.players.map.has(2)) { const p = w.host.sync.players.map.get(2); row = { trust: { ...p.trust }, frozen: p.frozen, bank: p.bank }; } }
  assert.deepEqual(back, { number: 2, coat: paint.body, join }, 'at the rejoin, before the new page says anything: the same number, paint and joining (the engine zero is red)');
  assert.deepEqual(row, { trust: { x: spawn.x, z: spawn.z }, frozen: true, bank: 0 }, 'the new row\'s trust starts again at the spawn place, frozen (C-4), not where the old page was');
  for (const d of w.devs) assert.deepEqual([entry(d, 2).coat, entry(d, 2).trim], [paint.body, paint.trim], `${d.name}: the paint persists 3 s after the rejoin (M-80)`);
  assert.equal(g.sync.you, 2); assert.equal(g.game.farm.seed, 21, 'on the host\'s farm again');
  assert.ok(w.host.sync.players.map.has(2), 'a new row on the host (M-10)');
  const seen = () => ({ ...g3.sync.players.map.get(2).pose.tractor.p }), p0 = seen();
  w.seconds(3, go); w.seconds(0.5);
  const p1 = seen();
  assert.ok(dist(p0, p1) > 3, `the third peer sees the rejoined train move (${dist(p0, p1)} m)`);
  assert.ok(dist(p1, g.game.tractor) < 1, `and where it is (${dist(p1, g.game.tractor)} m)`);
});

test('T-25: game state reaches a late joiner: the farm seed, number and herd size come in lh.game and it builds that farm', async () => {
  const w = await engineWorld({ seed: 21, guests: 1 }); w.seconds(1);
  w.host.engine.command('farm.new', {}); w.seconds(2);
  const H = w.host.engine.gameState, seed = w.host.game.farm.seed;
  assert.deepEqual([H.seed, H.farm], [seed, 2]);
  const late = w.addGuest(); w.seconds(3);
  assert.deepEqual([late.engine.gameState.seed, late.engine.gameState.farm], [seed, 2]);
  assert.equal(late.game.farm.seed, seed); assert.equal(late.sync.you, 3);
});
