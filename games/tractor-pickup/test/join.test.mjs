// test/join.test.mjs
// Tractor on the engine join (lion-hawk N-19..N-25, plan 5): the engine numbers the guests and keeps the roster; the farm is the
// host's lh.game record; no hello or welcome message goes on the wire.
import test from 'node:test';
import assert from 'node:assert/strict';
import { engineWorld } from './mp.engine.harness.mjs';

test('the engine numbers guests 2..4 and refuses a fifth page (full); the syncs keep a row per player; no hello or welcome JSON', async () => {
  const w = await engineWorld({ seed: 21, guests: 4 }), json = [];
  const drop = w.hub.drop; w.hub.drop = (from, to, d) => { if (d && typeof d === 'object' && 't' in d) json.push(d.t); return drop?.(from, to, d) ?? false; };
  w.seconds(2);
  assert.deepEqual(w.guests.map(g => g.sync.you), [2, 3, 4, 0]);
  assert.ok(w.guests[3].events.some(e => e.type === 'player.refused' && e.reason === 'full'), 'the fifth page hears why');
  assert.deepEqual(w.host.engine.players.map(p => p.number), [1, 2, 3, 4]);
  assert.deepEqual([...w.host.sync.players.map.keys()].sort(), [2, 3, 4]);
  for (const g of w.guests.slice(0, 3)) assert.equal(w.host.sync.players.map.get(g.sync.you).peer, g.net.id, 'the row follows its transport peer (bindings)');
  assert.ok(!json.includes('hello') && !json.includes('welcome'), `no game join messages: ${[...new Set(json)]}`);
});

test('a guest builds nothing until a frame from its host carries lh.game (farm 0 is no farm; review focus)', async () => {
  const w = await engineWorld({ seed: 21, guests: 0, join: false });
  w.blackout(1.5, { kinds: ['lh.game'] }); const g = w.addGuest(); w.seconds(0.5);
  assert.equal(g.engine.world.net.self, 2, 'net.welcome numbered it'); assert.equal(g.sync.you, 0, 'but it has no farm yet');
  assert.equal(g.engine.scene.state.gen, 1, 'its solo farm is still the only one built');
  w.seconds(3);
  assert.equal(g.sync.you, 2); assert.equal(g.game.farm.seed, 21); assert.equal(g.engine.gameState.farm, w.host.engine.gameState.farm);
});

test('paint is a guest→host message; the host writes it into the player fields and every peer reads it (N-22)', async () => {
  const w = await engineWorld({ seed: 21, guests: 2 }); w.seconds(1);
  w.guests[0].sync.setPaint({ body: 'rainbow', trim: 'purple' }); w.seconds(1);
  for (const d of w.devs) { const r = d.engine.players.find(p => p.number === 2); assert.deepEqual([r.coat, r.trim], ['rainbow', 'purple'], d.name); }
  assert.deepEqual(w.guests[1].sync.players.map.get(2).paint, { body: 'rainbow', trim: 'purple' }, 'the other guest draws it');
});
