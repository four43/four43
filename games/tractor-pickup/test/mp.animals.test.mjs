// test/mp.animals.test.mjs: hats that match on every device (M-60, M-61) and a herd that grows with the players (M-62, M-63)
import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { mpWorld, inFront, inFrontOf, single, settle } from './mp.harness.mjs';
import { createGame } from '../src/sim/game.js';
import { ROUTE_ANIMALS, PER_PLAYER } from '../src/sim/herd.js';

const routeFree = game => game.herd.free().filter(a => a.home === 'route').length;
const hatsOf = (w, id) => w.devs.map(d => d.game.herd.animals[id]?.hat ?? null);
// a free route animal, not one already used in this test
const another = (game, used) => game.herd.free().find(x => !x.hidden && x.type !== 'chick' && x.home === 'route' && !used.includes(x.id) && !game.herd.animals.some(c => c.leader === x.id));

test('the owner chooses the hat at the boop; every device draws that hat on that animal (M-60, M-61)', async () => {
  const w = await mpWorld({ seed: 31, guests: 2 }); w.seconds(1);
  const [g1, g2] = w.guests, H = w.host.game, used = [];
  H.wearHats(['party']); g1.game.wearHats(['straw']); g2.game.wearHats([]); // the second guest turned every hat off
  const a = single(H); used.push(a.id); inFrontOf(g1, a); w.seconds(3);
  assert.equal(a.state, 'carried'); assert.equal(a.owner, 2);
  assert.deepEqual(hatsOf(w, a.id), ['straw', 'straw', 'straw'], 'a guest rider: its hat on every device');
  const b = another(H, used); used.push(b.id); for (const d of w.devs) d.game.herd.animals[b.id].hat = 'cowboy'; // an old hat from an earlier ride means nothing
  inFront(w.host, b); w.seconds(3);
  assert.equal(b.state, 'ride');
  assert.deepEqual(hatsOf(w, b.id), ['party', 'party', 'party'], "a host rider: the host's hat on every device");
  const c = another(H, used); inFrontOf(g2, c); w.seconds(3);
  assert.equal(c.owner, 3);
  assert.deepEqual(hatsOf(w, c.id), [null, null, null], 'hats off: no hat anywhere');
});
test('a hat turned off or on changes the riders at once, on every device (M-61)', async () => {
  const w = await mpWorld({ seed: 31, guests: 2 }); w.seconds(1);
  const g1 = w.guests[0], a = single(w.host.game); g1.game.wearHats(['straw']);
  inFrontOf(g1, a); w.seconds(3); assert.deepEqual(hatsOf(w, a.id), ['straw', 'straw', 'straw']);
  g1.game.wearHats(['cowboy']); w.seconds(0.5); assert.deepEqual(hatsOf(w, a.id), ['cowboy', 'cowboy', 'cowboy']);
  g1.game.wearHats([]); w.seconds(0.5); assert.deepEqual(hatsOf(w, a.id), [null, null, null]);
});
test('more players, more animals: each joiner adds PER_PLAYER route animals, and every guest sees them (M-62, M-63)', async () => {
  const w = await mpWorld({ seed: 23, join: false }); w.seconds(1);
  assert.equal(routeFree(w.host.game), ROUTE_ANIMALS, 'alone: the solo herd');
  w.addGuest(); w.seconds(1); assert.equal(routeFree(w.host.game), ROUTE_ANIMALS + PER_PLAYER);
  w.addGuest(); w.addGuest(); w.seconds(1); assert.equal(routeFree(w.host.game), ROUTE_ANIMALS + 3 * PER_PLAYER);
  assert.deepEqual(settle(w, 3), [], 'every guest has every new animal');
  for (const g of w.guests) assert.equal(routeFree(g.game), ROUTE_ANIMALS + 3 * PER_PLAYER, g.name);
});
test('a player who leaves takes no free animal away; the surplus is just not replaced (M-62)', async () => {
  const w = await mpWorld({ seed: 23, guests: 2 }); w.seconds(1);
  const H = w.host.game, n = ROUTE_ANIMALS + 2 * PER_PLAYER; assert.equal(routeFree(H), n);
  w.guests[1].net.leave(); w.seconds(0.5);
  assert.equal(routeFree(H), n, 'nothing yanked from under the others');
  const len = H.herd.animals.length; H.herd.respawn(); assert.equal(H.herd.animals.length, len, 'above the new target: no new animals');
  for (const a of H.herd.free().filter(x => x.home === 'route').slice(0, 2 * PER_PLAYER)) { a.state = 'gone'; a.goneT = 0; } // delivered, say
  H.herd.respawn(); assert.equal(routeFree(H), ROUTE_ANIMALS + PER_PLAYER, 'refilled to the two players left');
});
test("a new farm on the host is made for the players it has (M-62)", async () => {
  await RAPIER.init();
  const w = await mpWorld({ seed: 23, guests: 1 }); w.seconds(1);
  const next = createGame(RAPIER, { seed: 77, power: 'medium' }); w.host.game = next; w.host.sync.setGame(next);
  assert.equal(routeFree(next), ROUTE_ANIMALS + PER_PLAYER);
  w.seconds(3); assert.deepEqual(settle(w, 3), [], 'the guest makes the new farm and has its animals');
});
