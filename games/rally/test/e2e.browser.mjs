// Real-Chromium flow on the engine browser half (lion-hawk 2c-rally). Run: npm run test:e2e
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openGame, expectScene, expectState, expectTappable } from 'lion-hawk/playwright';
import { serveRally } from './serve.mjs';

const ENTRY = 'src/main.js';
const frames = game => game.page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); // devices update per frame
const SETTINGS = { 'rally-sim-settings': { v: 4, mode: 'stage', seed: 'e2e1' } };
let chrome, site, skip = false;
before(async () => {
  try { chrome = await launch(); } catch (e) { if (/no chromium found/.test(e.message)) { skip = e.message; return; } throw e; }
  site = await serveRally({ entry: ENTRY });
});
after(async () => { await chrome?.close(); await site?.close(); });

test('desktop: title → Drive → countdown → running, keyboard pause and resume', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, site.url, { preset: 'desktop', seed: 5, settings: SETTINGS });
  try {
    await expectScene(game, 'stage');
    await expectState(game, 'phase', 'title');
    await expectTappable(game, 'title.drive');
    await game.tap('title.drive');
    await game.until(s => s.phase === 'running', { maxSteps: 2000 });
    await game.page.keyboard.press('Escape'); await frames(game); await game.step(1); // a tap shorter than a frame is latched (#13)
    assert.deepEqual((await game.scene()).overlays, ['pause']);
    await game.step(1); // an apply that sees the key up: with no step between them, a second latched tap is no new press (R5 report)
    await game.page.keyboard.press('Escape'); await frames(game); await game.step(1);
    assert.deepEqual((await game.scene()).overlays, []);
    assert.equal(await game.page.evaluate(() => (document.documentElement.dataset.lhOverlays ?? '').split(' ').includes('title')), false);
    assert.deepEqual(await game.errors(), []);
  } finally { await game.close(); }
});

test('desktop: settings sheet, a title choice rebuilds the track, results card, Retry with Enter', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, site.url, { preset: 'desktop', seed: 5, settings: SETTINGS });
  try {
    await game.tap('title.settings');
    assert.equal(await game.page.locator('#sheet').isVisible(), true);
    await game.tap('settings.units.kmh');
    assert.equal(await game.page.locator('#unit').textContent(), 'km/h');
    await game.tap('settings.close');
    assert.equal(await game.page.locator('#sheet').isVisible(), false);
    await game.tap('title.theme.winter');
    await game.until(s => s.phase === 'title', { maxSteps: 120 });
    await game.page.waitForFunction(() => window.engine.settled());
    await game.fill('title.seed', 'e2e2');
    await game.until(s => s.phase === 'title' && s.seed === 'e2e2', { maxSteps: 120 });
    await game.page.focus('[data-testid="title.mode.stage"]');
    await game.page.keyboard.press('Enter'); await frames(game); await game.step(2);
    await expectState(game, 'phase', 'title'); // Enter on a focused button only clicks it, no confirm/Drive (#15)
    await game.jump('stage', 'results', { time: 100, best: 101 }, { settings: { mode: 'stage', seed: 'e2e2' } });
    await game.render();
    assert.equal(await game.page.locator('#resTime').textContent(), '1:40.00');
    await expectTappable(game, 'results.retry');
    await game.page.keyboard.press('Enter'); await game.render(); // the focused Retry clicks
    await expectState(game, 'phase', 'ready');
    assert.deepEqual((await game.scene()).overlays, []);
    assert.deepEqual(await game.errors(), []);
  } finally { await game.close(); }
});

test('desktop: title help and seed form, pause card, screens from data-lh-overlays, stage exit clears its body classes and toast', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, site.url, { preset: 'desktop', seed: 5, settings: SETTINGS });
  const body = () => game.page.evaluate(() => [...document.body.classList].filter(c => /^(scr-|menuOpen|onTrack|manual)/.test(c)).sort());
  const overlays = () => game.page.evaluate(() => document.documentElement.dataset.lhOverlays);
  try {
    assert.match(await game.page.locator('#modeHelp').textContent(), /Point to point/);
    assert.equal(await game.page.locator('#titleBest').textContent(), 'No time set yet');
    assert.equal(await game.page.evaluate(() => document.getElementById('title').classList.contains('free')), false);
    await game.tap('title.mode.freeDrive');
    await game.until(s => s.phase === 'title' && s.mode === 'freeDrive', { maxSteps: 120 });
    assert.equal(await game.page.evaluate(() => document.getElementById('title').classList.contains('free')), true);
    assert.equal(await game.page.locator('#titleBest').textContent(), '');
    // The seed form's Go button commits the field (through its change) and doesn't navigate.
    await game.page.locator('#seedInput').fill('gogo1');
    await game.page.locator('#seedForm button[type="submit"]').click(); await game.render();
    await game.until(s => s.phase === 'title' && s.seed === 'gogo1', { maxSteps: 120 });
    assert.match(game.page.url(), /lh-test/); assert.doesNotMatch(game.page.url(), /seedInput|\?.*=gogo1/);

    await game.jump('stage', 'paused', {}, { settings: { mode: 'stage', seed: 'e2e2' } });
    await game.render();
    assert.equal(await game.page.locator('#pause').isVisible(), true);
    assert.equal(await game.page.locator('#restartBtn').isVisible(), true);
    assert.equal(await game.page.evaluate(() => document.activeElement?.dataset.testid), 'pause.resume');
    assert.deepEqual(await body(), ['onTrack']); assert.equal(await overlays(), 'pause');
    await game.tap('pause.resume');
    assert.equal(await game.page.locator('#pause').isVisible(), false);

    await game.jump('stage', 'loading', {}, { settings: { mode: 'stage', seed: 'e2e3', gearbox: 'manual' } });
    await game.render();
    assert.equal(await game.page.locator('#toast').isVisible(), true);
    assert.deepEqual(await body(), ['manual', 'onTrack']); assert.equal(await overlays(), 'title');
    // A jump exits and re-enters the stage half; until the next frame nothing it set is left behind (checked in the
    // same task: the driver renders on every rAF).
    const after = await game.page.evaluate(() => {
      window.engine.jump('stage', 'running', {}, { settings: { mode: 'stage', seed: 'e2e3' } });
      return { cls: [...document.body.classList].filter(c => /^(scr-|menuOpen|onTrack|manual)/.test(c)), toast: document.getElementById('toast').hidden };
    });
    assert.deepEqual(after, { cls: [], toast: true });
    await game.render();
    assert.deepEqual(await body(), ['onTrack']); assert.equal(await overlays(), '');
    assert.deepEqual(await game.errors(), []);
  } finally { await game.close(); }
});

test('desktop: a hidden page pauses a timed run but not free drive; a seed edit then Drive begins after the load', async t => {
  if (skip) return t.skip(skip);
  const hide = game => game.page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  const timed = await openGame(chrome.browser, site.url, { preset: 'desktop', seed: 5, settings: SETTINGS });
  try {
    await timed.fill('title.seed', 'e2e3'); await timed.tap('title.drive'); // the change and the click land in one go
    await timed.until(s => s.phase === 'running', { maxSteps: 2000 });
    await hide(timed); await frames(timed); await timed.step(1);
    assert.deepEqual((await timed.scene()).overlays, ['pause']);
  } finally { await timed.close(); }
  const free = await openGame(chrome.browser, site.url, { preset: 'desktop', seed: 5, settings: { 'rally-sim-settings': { v: 4, mode: 'freeDrive', world: 'loop', seed: 'e2e4' } } });
  try {
    await free.tap('title.drive'); await expectState(free, 'phase', 'running');
    await hide(free); await frames(free); await free.step(1);
    assert.deepEqual((await free.scene()).overlays, []);
  } finally { await free.close(); }
});

// Menu navigation with a controller (lion-hawk U-7–U-10, rally-spec R6): the harness's fake pad (never the machine's).
test('desktop: a gamepad walks the title, opens and leaves settings, drives, pauses with Start and resumes with B', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, site.url, { preset: 'desktop', seed: 5, settings: SETTINGS });
  const focused = () => game.page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? null);
  const push = async (state, steps = 0) => { await game.pad(state); await game.frames(); await game.pad({}); await game.frames(); if (steps) await game.step(steps); };
  try {
    await expectState(game, 'phase', 'title');
    await game.pad({}); await game.frames();
    assert.equal(await focused(), 'title.drive', 'the title opens on Drive');
    await push({ left: true }); assert.equal(await focused(), 'title.settings');
    await push({ a: true }); assert.deepEqual((await game.scene()).overlays, ['title', 'settings']);
    assert.match(await focused(), /^settings\./, 'focus moves into the sheet');
    const picked = row => game.page.evaluate(r => document.querySelector(`[data-testid^="settings.${r}."][aria-pressed="true"]`)?.getAttribute('data-testid'), row);
    await game.page.evaluate(() => document.querySelector('[data-testid="settings.units.mph"]').focus()); // onto the Units row
    const before = await picked('units');
    await push(before === 'settings.units.mph' ? { rb: true } : { lb: true });
    assert.notEqual(await picked('units'), before, 'RB/LB step the focused option row');
    assert.equal(await focused(), await picked('units'), 'focus follows the new option');
    await push({ b: true }, 1); assert.deepEqual((await game.scene()).overlays, ['title'], 'B closes the sheet');
    assert.equal(await focused(), 'title.settings', 'focus comes back to Settings');
    assert.equal(await game.page.evaluate(() => document.documentElement.dataset.lhInput), 'pad');
    assert.match(await game.page.locator('#driveBtn img.glyph').getAttribute('src'), /^data:image\/svg\+xml,/, 'the A prompt shows for a pad');
    await push({ right: true }); assert.equal(await focused(), 'title.drive');
    await push({ a: true }); await expectState(game, 'phase', 'ready');
    await game.until(s => s.phase === 'running', { maxSteps: 2000 });
    await push({ start: true }, 1); assert.deepEqual((await game.scene()).overlays, ['pause'], 'Start pauses');
    assert.equal(await focused(), 'pause.resume');
    await push({ b: true }, 1); assert.deepEqual((await game.scene()).overlays, [], 'B resumes');
    await expectState(game, 'phase', 'running');
    assert.deepEqual(await game.errors(), []);
  } finally { await game.close(); }
});

test('desktop: rumble reaches seat 0\'s pads while driving; a pause stops them (R7, R8-2, lion-hawk C-14)', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, site.url, { preset: 'desktop', seed: 5, settings: { 'rally-sim-settings': { v: 5, mode: 'freeDrive', world: 'loop', seed: 'e2e3', rumble: 'full' } } });
  try {
    await game.tap('title.drive'); await game.until(s => s.phase === 'running', { maxSteps: 2000 });
    await game.pad(0, { x: true }); await game.frames(); await game.pad(0, {}); await game.frames(); // a press pairs the pad to seat 0
    await game.seconds(2, { throttle: 1 }); await game.frames();
    const on = c => c.op === 'playEffect' && c.params.strongMagnitude + c.params.weakMagnitude > 0;
    assert.ok((await game.haptics(0)).calls.some(on), 'the stage rumbles the pad');
    // render is 'auto': frames between a count and the key press may still rumble, so the counts are taken around the pause, not before it
    const m = (await game.haptics(0)).calls.length; // up to here: driving
    await game.page.keyboard.press('Escape'); await game.frames(); await game.step(1); await game.frames(); await game.frames();
    assert.deepEqual((await game.scene()).overlays, ['pause']);
    await game.frames(3); // the pause is on: the engine's stop has started, and Rally sends nothing more
    const n = (await game.haptics(0)).calls.length;
    assert.ok((await game.haptics(0)).calls.slice(m).some(c => c.op === 'reset'), 'the pause stops it (a reset since Escape)');
    await game.frames(5);
    assert.ok(!(await game.haptics(0)).calls.slice(n).some(on), 'nothing is sent while paused');
    // Rally's own stop: results is no pausing overlay, so only Rally's pads.stop (view.haptics.stop) can start the engine's stop rounds
    await game.page.waitForFunction(() => !window.__rallyView.stopping(), null, { timeout: 5000 }); // the pause's own rounds have run out
    await game.jump('stage', 'results', { time: 100, best: 101 }, { settings: { mode: 'stage', seed: 'e2e2' } });
    const stopped = await game.page.evaluate(() => new Promise(res => { let n = 0; const tick = () => (window.__rallyView.stopping() ? res(true) : ++n > 3 ? res(false) : requestAnimationFrame(tick)); tick(); }));
    assert.equal(stopped, true, 'a game moment that does not pause (results) calls view.haptics.stop itself');
  } finally { await game.close(); }
});

test('desktop: the drive context: W drives, and two pads are one player (lion-hawk C-5, C-10, review focus)', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, site.url, { preset: 'desktop', seed: 5, settings: { 'rally-sim-settings': { v: 5, mode: 'freeDrive', world: 'loop', seed: 'e2e2' } } });
  try {
    await game.tap('title.drive'); await game.until(s => s.phase === 'running', { maxSteps: 2000 });
    await game.page.keyboard.down('w'); await frames(game); await game.seconds(1.5); await game.page.keyboard.up('w');
    assert.ok((await game.state()).speed > 1, 'W drives through the context');
    await game.pad(0, { x: true }); await game.pad(1, { x: true }); await game.frames(); await game.pad(0, {}); await game.pad(1, {}); await game.frames();
    assert.deepEqual(await game.page.evaluate(() => window.__rallyView.seats()), [2], 'one seat holds both pads');
  } finally { await game.close(); }
});
