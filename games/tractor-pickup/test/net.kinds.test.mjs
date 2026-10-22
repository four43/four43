// Tractor's replicated kinds as entity records (3l Task 21, N-8, N-9, D7): the host mirrors its herd, trees and roster as net
// entities (netId in each kind's range, e.id World-unique), keeps them in step with the game, and drops them all when it stops hosting.
import test from 'node:test';
import assert from 'node:assert/strict';
import { testGame } from './helpers/world.mjs';
import { KINDS, ANIMAL, TREE, TRAIN, animalRecord } from '../src/net/kinds.js';
import { mirrorHost, unmirrorHost, netStore } from '../src/net/entities.js';
import { NET_VERSION, MAX_ID } from '../src/net/protocol.js';

const net = (w, kind) => w.with('net').filter(e => e.net === kind);
test('NET_VERSION 5 and three kinds with today\'s codes and id ranges (the player is the engine\'s lh.player)', () => {
  assert.equal(NET_VERSION, 5);
  assert.deepEqual(KINDS.map(k => [k.name, k.code]), [['animal', 1], ['tree', 2], ['train', 4]]);
  assert.equal(TRAIN.authority, 'owner'); assert.equal(TRAIN.remote, 'driven'); assert.equal(ANIMAL.remote, 'view');
});
test('mirrorHost: one entity per live animal; trees gain a net part; ids are World-unique (D7)', () => {
  const g = testGame({ seed: 31 }), w = g.world; mirrorHost(w, g);
  const live = g.herd.animals.filter(a => a.state !== 'gone');
  assert.equal(net(w, 'animal').length, live.length);
  for (const e of net(w, 'animal')) { assert.ok(e.animal === g.herd.animals[e.netId], "the entity carries the herd animal"); assert.ok(e.netId >= 0 && e.netId <= MAX_ID); }
  assert.equal(net(w, 'tree').length, g.trees.list.length); assert.ok(g.trees.list.every(t => t.e.netId === t.id && t.e.net === 'tree'));
  const ids = w.with('net').map(e => e.id); assert.equal(new Set(ids).size, ids.length);
});
test('a gone animal\'s entity goes; a new animal in its slot gets a fresh entity; unmirror removes every host entity', () => {
  const g = testGame({ seed: 31 }), w = g.world; mirrorHost(w, g);
  const a = g.herd.animals[3]; a.state = 'gone'; mirrorHost(w, g);
  assert.equal(net(w, 'animal').some(e => e.netId === 3), false);
  a.state = 'idle'; mirrorHost(w, g); assert.equal(net(w, 'animal').filter(e => e.netId === 3).length, 1);
  unmirrorHost(w, g); assert.equal(w.with('net').filter(e => e.net !== 'train').length, 0); assert.ok(g.trees.list.every(t => !t.e.net));
});
test('animalRecord fills an out object exactly as the old record did (carried: no place; gone: null)', () => {
  const out = {};
  assert.equal(animalRecord({ state: 'gone' }, out), null);
  const r = animalRecord({ type: 'pig', golden: true, hidden: false, home: 'route', state: 'ride', epoch: 3, x: 4, y: 0, z: 5, yaw: 1, anim: 'walk', leader: null, line: 0 }, out);
  assert.equal(r, out); assert.deepEqual({ ...r }, { type: 'pig', golden: true, hidden: false, home: 'route', state: 'carried', owner: 1, epoch: 3, x: 0, y: 0, z: 0, yaw: 0, anim: 'idle', leader: null, line: 0 });
});
test('netStore reads the last record of each replicated entity by kind and id', () => {
  const g = testGame({ seed: 31 }), w = g.world, e = w.spawn({ tags: ['probe'], net: 'animal', netId: 9 }); e.rec = { type: 'cow' }; e.recSeq = 1;
  const view = { with: (...a) => w.with(...a), net: { find: (k, id) => k === 'animal' && id === 9 ? e : undefined } }; // no session here: 3i's world.net.find stubbed
  const s = netStore(view); assert.deepEqual(s.get('animal', 9), { type: 'cow' }); assert.equal(s.get('animal', 8), null); assert.deepEqual([...s.all('animal')].map(([id]) => id), [9]);
});

import { engineWorld } from './mp.engine.harness.mjs';
test('a guest sees the host\'s herd, trees as replicated entities and the roster as lh.player, and the syncs send no frames of their own', async () => {
  const w = await engineWorld({ seed: 33 }); w.seconds(3);
  const hw = w.host.engine.world, gw = w.guests[0].engine.world, live = w.host.game.herd.animals.filter(a => a.state !== 'gone').length;
  assert.equal(gw.with('net').filter(e => e.net === 'animal' && e.rec).length, live);
  assert.deepEqual(w.guests[0].engine.players.map(p => p.number), [1, 2]);
  for (const d of [w.host, w.guests[0]]) assert.equal(typeof d.sync.frameOut, 'undefined', 'no sync-made frames');
  assert.ok(w.guests[0].game.herd.animals.filter(a => a.state !== 'elsewhere' && a.state !== 'gone').length >= live - 2, 'the guest herd shows them');
  void hw;
});
