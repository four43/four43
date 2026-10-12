// Headless flow (lion-hawk phase 2c, [T-1]–[T-5]): Rally's stage scene with its title, pause and results overlays.
import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { headless, canonical } from 'lion-hawk/test';
import { rallyGame } from '../src/game.sim.js';
import { DT } from '../src/sim.js';
await R.init();

const STAGE = { settings: { mode: 'stage', seed: 'flow1' } };
const FREE = { settings: { mode: 'freeDrive', world: 'loop', seed: 'p1' } };
const running = h => h.until(x => x.state().phase === 'running', { maxSeconds: 5, message: 'running' });

test('the sim rate is the vehicle step', () => { assert.equal(1 / rallyGame().sim.hz, DT); });

test('flow: title → drive → countdown → finish → results (car rolling) → retry', () => {
  const h = headless(rallyGame(), { seed: 3, args: STAGE });
  assert.equal(h.scene.name, 'stage'); assert.deepEqual(h.scene.overlays, ['title']); assert.equal(h.state().phase, 'title');
  assert.equal(h.state().hold, true);
  h.tap('title.drive');
  assert.deepEqual(h.scene.overlays, []); assert.equal(h.state().phase, 'ready');
  running(h);
  assert.deepEqual(h.events.of('count').map(e => e.n), [3, 2, 1, 0]);
  assert.deepEqual(h.events.of('state').map(e => e.state), ['title', 'ready', 'countdown', 'running']); // enter's title flushes on step 1
  h.engine.game.debug(h.engine).nearFinish(40);
  const fin = h.untilEvent('finish', { maxSeconds: 20, input: 'autopilot' });
  assert.ok(fin.time > 0); assert.equal(fin.isBest, true);
  assert.equal(h.state().phase, 'finished'); assert.deepEqual(h.scene.overlays, []);
  h.untilScene('results', { maxSeconds: 2 });
  const t0 = h.state().simTime; h.step(24);
  assert.ok(h.state().simTime > t0, 'results do not pause: physics keeps stepping');
  h.tap('results.retry');
  assert.deepEqual(h.scene.overlays, []); assert.equal(h.state().phase, 'ready'); assert.equal(h.state().time, 0);
});

test('pause freezes the stage and physics; the pause key or Resume closes it; covered controls throw', () => {
  const h = headless(rallyGame(), { args: FREE });
  h.tap('title.drive'); assert.equal(h.state().phase, 'running');
  h.step(240, { throttle: 1 });
  h.step(1, { pause: true }); assert.deepEqual(h.scene.overlays, ['pause']);
  const a = h.state(); h.step(120, { throttle: 1 }); const b = h.state();
  assert.equal(b.simTime, a.simTime); assert.deepEqual([b.x, b.z], [a.x, a.z]);
  h.step(1); h.step(1, { pause: true }); assert.deepEqual(h.scene.overlays, []);
  h.step(1); h.step(1, { pause: true }); h.tap('pause.resume'); assert.deepEqual(h.scene.overlays, []);
  h.step(1); h.step(1, { pause: true });
  assert.throws(() => h.tap('stage.pause'), /covered by 'pause'/);
});

test('the engine path is deterministic: same seed and inputs, bit-identical state', () => {
  const run = () => {
    const h = headless(rallyGame(), { seed: 9, args: { settings: { mode: 'stage', seed: 'det1' } } });
    h.tap('title.drive'); running(h); h.seconds(5, 'autopilot');
    return canonical(h.state(), { digits: 15 });
  };
  assert.equal(run(), run());
});
