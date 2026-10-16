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
