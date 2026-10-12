// Headless trips on the engine path (lion-hawk 2f T4, spec 3.1, 3.4, 9, [S-4]).
import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { headless } from 'lion-hawk/test';
import { tractorGame } from '../src/game.sim.js';
import { emptyProgress } from '../src/sim/progress.js';
await R.init();
const ARGS = { seed: 14, started: true };
const says = (h, m = 0) => h.since(m).of('say').map(e => e.ids.join(' '));

test('a trip: intro, the barn, the show waits for its ack, the card waits for go, then drive (S-4)', () => {
  const h = headless(tractorGame(), { args: ARGS });
  h.step(1); assert.deepEqual(says(h), ['lets-find animals']);
  h.jump('farm', 'barn', { n: 3 }, ARGS); const s = h.engine.scene.state; // a new scene instance: read its state after the jump
  h.seconds(3.1); // the intro is over: a barn pass during it would not start a show (stepTrip)
  s.raw = { thr: 1, steer: 0, horn: false }; const sh = h.untilEvent('show', { maxSeconds: 15 }); s.raw = null;
  assert.equal(sh.riders.length, 3); assert.ok(sh.steps.some(x => x.kind === 'all'));
  assert.deepEqual(h.scene.overlays, ['show']); h.seconds(5); assert.equal(s.game.mode, 'show', 'held until the view says the show is over');
  const a = s.game.herd.animals[sh.riders[0].id];
  h.command('show.done', { spots: [[a.id, 3, 0, 4, 1]] }); const rw = h.untilEvent('reward', { maxSteps: 5 });
  assert.deepEqual([a.x, a.z], [3, 4], 'it walks into the barn from where the show left it (F-10)');
  assert.equal(s.game.mode, 'reward'); assert.deepEqual(h.scene.overlays, ['reward']); assert.ok(rw.sticker);
  assert.equal(s.progress.shows, 1); assert.equal(h.events.of('progress').length >= 1, true);
  h.seconds(3); assert.equal(s.game.mode, 'reward');
  h.tap('reward.go'); h.step(2); assert.equal(s.game.mode, 'drive'); assert.deepEqual(h.scene.overlays, []);
});
test('the skip hold ends the show from the sim side; an empty barn pass has no show (F-13, N-3)', () => {
  const h = headless(tractorGame(), { args: ARGS });
  h.jump('farm', 'barn', { n: 1 }, ARGS); const s = h.engine.scene.state; h.seconds(3.1);
  s.raw = { thr: 1, steer: 0, horn: false }; h.untilEvent('show', { maxSeconds: 15 }); s.raw = null;
  h.press('show.skip'); h.seconds(0.9); assert.equal(h.events.of('showSkip').length, 0); h.seconds(0.2); assert.equal(h.events.of('showSkip').length, 1);
  assert.equal(s.show.skipped, true);
});
test('the start screen shows only with a paint choice; start.go starts the trip; a stick move starts it otherwise (F-11, A-7)', () => {
  const rich = { ...emptyProgress(), shows: 3 };
  let h = headless(tractorGame(), { args: { seed: 14, progress: rich } });
  assert.equal(h.engine.scene.state.game.mode, 'start'); h.step(1); assert.deepEqual(h.scene.overlays, ['start']);
  h.tap('start.go'); h.step(1); assert.equal(h.engine.scene.state.started, true); assert.deepEqual(h.scene.overlays, []);
  h = headless(tractorGame(), { args: { seed: 14 } }); h.step(1);
  assert.equal(h.engine.scene.state.game.mode, 'drive'); assert.equal(h.engine.scene.state.started, false);
  h.step(1, { goZ: 0.5 }); assert.equal(h.engine.scene.state.started, true); assert.equal(h.events.of('play').length, 1);
});
test('drive buttons hold the tractor; the intro end does not free it; paints, hats and stickers are commands (U-6, W-2..W-4)', () => {
  const h = headless(tractorGame(), { args: { seed: 14, started: true, progress: { ...emptyProgress(), shows: 4 } } }), s = h.engine.scene.state;
  h.tap('farm.paint'); h.step(1); assert.equal(s.game.mode, 'menu'); h.seconds(3.5); assert.equal(s.game.mode, 'menu');
  h.command('paint', { body: 'green', trim: 'red' }).step(1); assert.deepEqual(s.progress.paint, { body: 'green', trim: 'red' });
  h.command('hat', { id: 'straw' }).step(1); assert.deepEqual(s.game.hats, []);
  h.tap('paint.close'); h.step(1); assert.equal(s.game.mode, 'drive');
  h.press('farm.parent'); h.seconds(1.9); assert.deepEqual(h.scene.overlays, []); h.seconds(0.2); assert.deepEqual(h.scene.overlays, ['parent']);
});
