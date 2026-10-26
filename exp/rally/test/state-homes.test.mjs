// [T-25] state homes (lion-hawk local players plan 5, spec §2.2): Rally's lap times are player state (player 1's record in
// engine.players) and outlive the car; the run's phase is game state (engine.gameState). Rally has no net part, so the rejoin and
// late-joiner halves of [T-25] apply to Tractor only (spec ruling).
import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { headless } from 'lion-hawk/test';
import { game } from './helpers/bench.mjs';
await R.init();

test('T-25: the run\'s phase is game state, written as the stage moves through it', () => {
  const h = headless(game(), { seed: 3, args: { settings: { mode: 'stage', seed: 'flow1' } } });
  h.step(1); assert.equal(h.engine.gameState.phase, 'title');
  h.tap('title.drive'); assert.equal(h.engine.gameState.phase, 'ready');
  h.until(x => x.state().phase === 'running', { maxSeconds: 5 }); assert.equal(h.engine.gameState.phase, 'running');
});

test('T-25: lap times are player 1\'s state and survive the car going back onto the road and a restart', () => {
  const h = headless(game(), { seed: 3, args: { settings: { mode: 'timeAttack', world: 'loop', seed: 'homes1' } } }), dbg = h.engine.game.debug(h.engine);
  h.tap('title.drive'); h.until(x => x.state().phase === 'running', { maxSeconds: 5 });
  dbg.nearFinish(40); h.step(240); dbg.lap(true); h.step(1);
  const p = h.engine.players[0], last = p.lastLap;
  assert.equal(p.number, 1); assert.ok(last >= 900, `lastLap ${last} ms`); assert.equal(p.bestLap, last); assert.equal(p.finish, 0);
  h.step(1, { reset: true }); h.step(30);
  assert.equal(h.engine.players[0].lastLap, last, 'kept through R (the car placed again)');
  h.step(1, { resetAll: true }); h.until(x => x.state().phase === 'running', { maxSeconds: 5 });
  assert.equal(h.engine.players[0].lastLap, last, 'kept through a restart'); assert.equal(h.engine.players[0].bestLap, last);
});

test('T-25: a stage finish time is player 1\'s state', () => {
  const h = headless(game(), { seed: 3, args: { settings: { mode: 'stage', seed: 'flow1' } } }), dbg = h.engine.game.debug(h.engine);
  h.tap('title.drive'); h.until(x => x.state().phase === 'running', { maxSeconds: 5 });
  dbg.finish({ time: 163.42, best: null }); h.step(1);
  assert.equal(h.engine.players[0].finish, 163420); assert.equal(h.engine.gameState.phase, 'finished');
});
