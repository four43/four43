// The farm step split around the engine's physics step (3l Task 8; Review Focus 2): pre (scene step hook) → lh.physics.step → post
// (a 'post' stage system), once each per step, and neither while a new farm loads.
import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { headless } from 'lion-hawk/test';
import { tractorGame } from '../src/game.sim.js';
await R.init();
const ARGS = { seed: 14, started: true, trip: false };
const spy = h => { const g = h.engine.scene.state.game, log = [], P = g.pre, Q = g.post;
  g.pre = i => { log.push(['pre', g.tractor.body.translation().z]); return P.call(g, i); };
  g.post = () => { log.push(['post', g.tractor.body.translation().z]); return Q.call(g); };
  return log; };

test('pre, physics, post: once each per step, in that order', () => {
  const h = headless(tractorGame(), { args: ARGS }); h.step(60); const log = spy(h);
  h.step(3, { goZ: 1 });
  assert.deepEqual(log.map(x => x[0]), ['pre', 'post', 'pre', 'post', 'pre', 'post']);
});
test('the Rapier step happens between the halves: the body moves between pre and post', () => {
  const h = headless(tractorGame(), { args: ARGS }); h.step(60); h.step(90, { goZ: 1 }); const log = spy(h);
  h.step(1, { goZ: 1 }); assert.notEqual(log[0][1], log[1][1]);
});
test('a load suspends both halves; the new farm steps both again', () => {
  const h = headless(tractorGame(), { args: { ...ARGS, seed: 15 } }); h.step(1); const log = spy(h);
  h.command('farm.new', {}); h.step(1); assert.equal(h.engine.loading.active, true);
  const t = h.engine.scene.state.game.tractor.e, y = t.xf.p.y; // CI-16 (3c): Rapier does not step while the scene loads
  const before = log.length; h.step(1); assert.equal(log.length, before, 'no half ran during the load');
  assert.equal(t.xf.p.y, y, 'no physics step during the load');
  h.untilLoaded(); const g2 = h.engine.scene.state.game; let n = 0; const P = g2.post; g2.post = () => (n++, P.call(g2));
  h.step(2); assert.equal(n, 2);
});
test('game.post emits the step\'s events exactly once (the bridge sees each boop once)', () => {
  const h = headless(tractorGame(), { args: ARGS }), s = h.engine.scene.state; h.step(60);
  const g = s.game, a = g.herd.free().find(x => !x.hidden && x.type !== 'chick' && !g.herd.animals.some(c => c.leader === x.id));
  const p = g.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); a.x = p.x; a.z = p.z; a.state = 'idle'; a.timer = 99;
  h.step(30); assert.equal(h.events.filter(e => e.type === 'boop' && e.animal === a).length, 1);
});
