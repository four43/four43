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

test('title choices rebuild the preview after a short loading hold; car and seed choices', () => {
  const h = headless(rallyGame(), { args: { settings: { mode: 'stage', seed: 'c1' } } });
  const S = () => h.engine.scene.state, rev = S().worldRev;
  h.tap('title.theme.winter');
  assert.equal(h.state().phase, 'loading');
  h.until(x => x.state().phase === 'title', { maxSteps: 60 });
  assert.equal(S().worldRev, rev + 1); assert.equal(S().world.track.theme, 'winter'); assert.deepEqual(h.scene.overlays, ['title']);
  const car = S().carRev; h.tap('title.car.rwd');
  assert.equal(S().sim.car.cfg.id, 'rwd'); assert.ok(S().carRev > car); assert.equal(h.state().phase, 'title'); // same track: no rebuild
  h.fill('title.seed', 'abc'); h.until(x => x.state().phase === 'title', { maxSteps: 60 }); assert.equal(h.state().seed, 'abc');
  h.fill('title.seed', '   '); h.until(x => x.state().phase === 'title', { maxSteps: 60 }); assert.match(h.state().seed, /^[0-9a-z]{5}$/);
  assert.equal(h.engine.ui.tree().find(c => c.id === 'title.world.loop').enabled, false); // free drive only
  assert.ok(S().settingsRev >= 4);
});

test('settings overlay: options apply at once; Esc closes the sheet before the pause menu', () => {
  const h = headless(rallyGame(), { args: { settings: { mode: 'freeDrive', world: 'loop', seed: 's1', assist: false } } });
  const S = () => h.engine.scene.state;
  h.tap('title.settings'); assert.deepEqual(h.scene.overlays, ['title', 'settings']);
  h.tap('settings.assist.true'); assert.equal(S().sim.car.assist, true);
  h.tap('settings.gearbox.manual'); assert.equal(S().sim.car.autoShift, false);
  h.tap('settings.units.kmh'); assert.equal(S().settings.units, 'kmh');
  assert.equal(h.engine.ui.tree().find(c => c.id === 'settings.surface.snow').enabled, false); // the pad only
  h.tap('settings.close'); h.tap('title.drive');
  h.step(1, { pause: true }); h.tap('pause.settings'); assert.deepEqual(h.scene.overlays, ['pause', 'settings']);
  h.step(1); h.step(1, { pause: true }); assert.deepEqual(h.scene.overlays, ['pause']);
  h.step(1); h.step(1, { pause: true }); assert.deepEqual(h.scene.overlays, []);
});

test('Reset: a tap puts the car back on the road, a 0.6 s hold restarts; a shift in Auto switches to Manual', () => {
  const h = headless(rallyGame(), { args: { settings: { mode: 'stage', seed: 'r1' } } });
  h.tap('title.drive'); running(h);
  h.seconds(3, { throttle: 1 }); assert.ok(h.state().speed > 5);
  h.step(1, { resetHold: true }); h.step(1);
  assert.equal(h.state().phase, 'running'); assert.ok(Math.abs(h.state().speed) < 0.5);
  h.hold({ resetHold: true }); h.seconds(0.7); h.release('resetHold');
  assert.equal(h.state().phase, 'ready'); // restart: a new countdown
  running(h); h.step(1, { shiftUp: true });
  assert.equal(h.engine.scene.state.settings.gearbox, 'manual'); assert.equal(h.engine.scene.state.sim.car.autoShift, false);
});

test('presets put the stage in a known state without stepping (S-5)', () => {
  const args = { settings: { mode: 'stage', seed: 'p2' } }, h = headless(rallyGame(), { args });
  h.jump('stage', 'countdown', { n: 2 }, args);
  assert.deepEqual([h.state().phase, h.state().countN, h.scene.overlays.length], ['countdown', 2, 0]);
  const m = h.mark(); h.step(1);
  assert.equal(h.events.of('count').at(-1).n, 2); assert.equal(h.events.since(m).count('count'), 0); // light 2 shown once, nothing skipped
  h.jump('stage', 'paused', {}, args); assert.deepEqual(h.scene.overlays, ['pause']);
  h.jump('stage', 'results', { time: 100, best: null }, args);
  assert.deepEqual(h.scene.overlays, ['results']); assert.equal(h.engine.scene.state.result.isBest, true);
  h.jump('stage', 'nearFinish', { d: 40 }, args); assert.equal(h.state().phase, 'running'); assert.ok(h.state().p > 0);
  h.jump('stage', 'settings', {}, args); assert.deepEqual(h.scene.overlays, ['title', 'settings']);
});

test('results: New seed builds another stage and starts a run; Menu and Quit return to the title', () => {
  const args = { settings: { mode: 'stage', seed: 'n1' } }, h = headless(rallyGame(), { seed: 4, args });
  h.jump('stage', 'results', {}, args);
  h.tap('results.newSeed'); assert.equal(h.state().phase, 'loading'); assert.deepEqual(h.scene.overlays, []);
  h.until(x => x.state().phase === 'ready', { maxSteps: 60 }); assert.notEqual(h.state().seed, 'n1');
  h.jump('stage', 'results', {}, args); h.tap('results.menu');
  assert.deepEqual(h.scene.overlays, ['title']); assert.equal(h.state().phase, 'title');
  h.jump('stage', 'paused', {}, args); h.tap('pause.quit');
  assert.deepEqual(h.scene.overlays, ['title']); assert.equal(h.state().phase, 'title');
});

test('a Reset chip held through the countdown does not restart on the first running step', () => {
  const h = headless(rallyGame(), { args: STAGE });
  h.tap('title.drive'); h.hold({ resetHold: true });
  running(h); h.step(5);
  assert.equal(h.state().phase, 'running');
  h.seconds(0.7); assert.equal(h.state().phase, 'ready'); // held 0.6 s while live: restarts, as before
});

test('the pause key and the Pause chip in one frame open pause once', () => {
  const h = headless(rallyGame(), { args: FREE });
  h.tap('title.drive'); h.step(5);
  h.tap('stage.pause'); h.step(1, { pause: true });
  assert.deepEqual(h.scene.overlays, ['pause']);
  h.step(2); assert.deepEqual(h.scene.overlays, ['pause']);
});
