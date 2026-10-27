// [T-25] state homes (lion-hawk local players plan 5, spec §2.2): the basket is player 1's player state and outlives the pawn
// changing; day or night and the pigs in each pen are game state. Pig Pens has no net part,
// so the rejoin and late-joiner halves of [T-25] apply to Tractor Pickup only (spec ruling).
import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { headless } from 'lion-hawk/test';
import { pigPensGame } from '../src/game.sim.js';
await R.init();

test('T-25: the basket is player 1\'s state and survives a few seconds of play; night and the pen counts are game state', () => {
  const h = headless(pigPensGame(), { seed: 3, args: { pigs: 24 } }), sim = h.engine.scene.state.sim, dbg = h.engine.game.debug(h.engine);
  h.step(1);
  assert.deepEqual(h.engine.gameState.pens, [...sim.counts]); assert.equal(h.engine.gameState.night, false);
  const n = sim.lay.nests[1]; sim.flock.eggs.push({ id: 999, nest: 1, x: n.x, y: 0.06, z: n.z, age: 0, layer: 1, hatch: 0, brooder: -1 });
  assert.equal(sim.flock.collectEgg(999), true); h.step(1);
  assert.equal(h.engine.players[0].number, 1); assert.equal(h.engine.players[0].eggs, 1);
  h.step(180); assert.equal(h.engine.players[0].eggs, 1, 'kept as the farm runs');
  dbg.night(true); h.step(1); assert.equal(h.engine.gameState.night, true);
  h.step(60); assert.deepEqual(h.engine.gameState.pens, [...sim.counts], 'the pen counts follow the herd');
});
