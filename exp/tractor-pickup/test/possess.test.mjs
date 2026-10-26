// The train is seat 0's pawn (lion-hawk C-2, C-3, I-4; plan 5): lh.possess copies the controller's world-frame stick into the
// train's e.input each step, the owner send carries it (N-13), and every other peer turns it into throttle and steer with the
// pilot. The hand copy in sim/game.js is gone.
import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { headless } from 'lion-hawk/test';
import { tractorGame } from '../src/game.sim.js';
import { TRAIN } from '../src/net/kinds.js';
import { engineWorld } from './mp.engine.harness.mjs';
await R.init();

test('solo: seat 0 possesses the tractor, and a new farm possesses the new one', () => {
  const h = headless(tractorGame(), { args: { seed: 14, started: true, trip: false } }), s = h.engine.scene.state;
  h.step(1); assert.equal(h.engine.controllerOf(0).pawn?.id, s.game.tractor.e.id); // ids, not objects: an entity holds Rapier handles
  const oldId = s.game.tractor.e.id; h.command('farm.new', {}); h.seconds(1);
  assert.notEqual(s.game.tractor.e.id, oldId); assert.equal(h.engine.controllerOf(0).pawn?.id, s.game.tractor.e.id);
});

test('the train kind replicates the stick: goX, goZ, goBack, horn (NET_VERSION 5)', () => {
  assert.deepEqual([TRAIN.fields.input.axes, TRAIN.fields.input.buttons], [['goX', 'goZ'], ['goBack', 'horn']]);
});

test('the train is seat 0\'s pawn: its replicated input is the controller\'s world-frame stick, and the host\'s replica drives from it (review focus)', async () => {
  const w = await engineWorld({ seed: 21, guests: 1 }); w.seconds(1);
  const g = w.guests[0], yaw = g.game.tractor.yaw, stick = { goX: Math.sin(yaw), goZ: Math.cos(yaw), goBack: false };
  assert.equal(g.engine.controllerOf(0).pawn?.id, g.game.tractor.e.id);
  w.seconds(2, (d, i) => (i === 1 ? stick : null));
  const I = g.game.tractor.e.input;
  assert.ok(Math.abs(Math.hypot(I.goX, I.goZ) - 1) < 1e-3, `the pawn carries the stick (${I.goX}, ${I.goZ})`);
  const rep = w.host.engine.world.net.find('train', 2);
  assert.ok(rep?.remote, 'the host has the guest\'s train'); assert.ok(Math.hypot(rep.input.goX, rep.input.goZ) > 0.99, 'from the wire');
  assert.ok(rep.remote.tractor.inThr > 0.9, `the host's pilot drives the replica forward (${rep.remote.tractor.inThr})`);
});

test('the raw seam (tests, debug.drive) puts the matching stick on the train, so other peers drive its replica alike', async () => {
  const w = await engineWorld({ seed: 21, guests: 1 }); w.seconds(1);
  w.seconds(2, (d, i) => (i === 1 ? { thr: 0.8, steer: 0.3, horn: false } : null));
  const t = w.host.engine.world.net.find('train', 2).remote.tractor;
  assert.ok(Math.abs(t.inThr - 0.8) < 0.05, `the replica's throttle ${t.inThr}`);
  assert.ok(Math.abs(t.inSteer - 0.3) < 0.15, `the replica's steer ${t.inSteer}`);
});
