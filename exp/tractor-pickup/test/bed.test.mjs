// Bedtime on the engine path (lion-hawk 2f T5, spec 3.5): the view sends the wall date; the wake button is a 5 s wall hold.
import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { headless } from 'lion-hawk/test';
import { tractorGame } from '../src/game.sim.js';
await R.init();
const T0 = 1_000_000_000_000;

test('the clock brings the last drive; an empty pass through the barn sleeps; a 5 s hold wakes (N-1..N-6)', () => {
  const h = headless(tractorGame(), { args: { seed: 14, started: true } }), s = h.engine.scene.state, d = h.debug;
  h.command('bed.set', { minutes: 3, date: T0 }).step(1); assert.equal(s.bed.choice, 3);
  h.command('clock', { date: T0 + 179_000 }).step(1); assert.equal(s.bed.phase, 'awake');
  h.command('clock', { date: T0 + 180_000 }).step(1); assert.equal(s.bed.phase, 'last'); assert.equal(s.guide, true);
  assert.deepEqual(h.events.of('say').at(-1).ids, ['go-to-barn']);
  const b = s.game.farm.yard.barn; d.trainAt(b.x - Math.sin(b.yaw) * 20, b.z - Math.cos(b.yaw) * 20, b.yaw); h.seconds(3.1); // past the intro
  s.raw = { thr: 1, steer: 0, horn: false }; h.untilEvent('sleep', { maxSeconds: 15 }); s.raw = null;
  assert.equal(s.game.mode, 'sleep'); assert.deepEqual(h.scene.overlays, ['sleep']); assert.equal(s.bed.phase, 'asleep');
  h.press('sleep.wake'); h.seconds(4.9); assert.equal(s.game.mode, 'sleep'); h.seconds(0.2);
  assert.equal(h.events.of('wake').length, 1); assert.equal(s.game.mode, 'drive'); assert.equal(s.bed.phase, 'awake'); assert.equal(s.bed.choice, null);
});
test('bedtime during a show makes it the last show; a reload while asleep starts asleep and quiet (N-2, N-7)', () => {
  const h = headless(tractorGame(), { args: { seed: 14, started: true } });
  h.jump('farm', 'barn', { n: 2 }, { seed: 14, started: true }); const s = h.engine.scene.state; h.seconds(3.1);
  s.raw = { thr: 1, steer: 0, horn: false }; h.untilEvent('show', { maxSeconds: 15 }); s.raw = null;
  h.command('bed.set', { minutes: 0, date: T0 }).command('clock', { date: T0 }).step(1); assert.equal(s.bed.phase, 'last'); assert.equal(s.sleepAfter, true);
  h.command('show.done', { spots: [] }); h.untilEvent('reward', { maxSteps: 5 }); h.tap('reward.go'); h.untilEvent('sleep', { maxSteps: 5 });
  const r = headless(tractorGame(), { args: { seed: 14, started: true, bed: { phase: 'asleep', at: null, choice: null } } });
  assert.equal(r.engine.scene.state.game.mode, 'sleep'); assert.deepEqual(r.scene.overlays, ['sleep']);
});
