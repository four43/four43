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
    // R14-1: no Go button; Enter in the seed field commits it (through its change) and doesn't navigate, and so does leaving it.
    assert.equal(await game.page.locator('#seedForm button[type="submit"]').count(), 0);
    await game.page.locator('#seedInput').fill('gogo1');
    await game.page.locator('#seedInput').press('Enter'); await game.render();
    await game.until(s => s.phase === 'title' && s.seed === 'gogo1', { maxSteps: 120 });
    assert.match(game.page.url(), /lh-test/); assert.doesNotMatch(game.page.url(), /seedInput|\?.*=gogo1/);
    await game.page.locator('#seedInput').fill('gogo2');
    await game.page.locator('#seedInput').blur(); await game.render();
    await game.until(s => s.phase === 'title' && s.seed === 'gogo2', { maxSteps: 120 });

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

// R14: the title's controller layout: LB/RB step the mode (the pad never focuses that row), the sliders follow left/right,
// View opens and closes settings from the title and while driving (where settings pauses), Start drives.
test('desktop: shoulders step the mode, sliders follow the D-pad, View is settings everywhere, Start drives (R14)', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, site.url, { preset: 'desktop', seed: 5, settings: { 'rally-sim-settings': { v: 5, mode: 'stage', world: 'loop', seed: 'e2e4', style: 'twisty', obstacles: 'wild' } } });
  const focused = () => game.page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? null);
  const push = async (state, steps = 0) => { await game.pad(state); await game.frames(); await game.pad({}); await game.frames(); if (steps) await game.step(steps); };
  const set = () => game.page.evaluate(() => { const s = window.engine.scene.state.settings; return [s.mode, s.style, s.obstacles]; });
  try {
    await expectState(game, 'phase', 'title');
    await game.pad({}); await game.frames();
    assert.deepEqual(await set(), ['stage', 2, 4], 'the v5 names read as levels (wild: 4)');
    const order = await game.page.evaluate(() => [...document.querySelectorAll('#modeSeg button')].map(b => b.dataset.testid));
    assert.deepEqual(order, ['title.mode.stage', 'title.mode.timeAttack', 'title.mode.freeDrive']);
    assert.equal(await game.page.locator('.modeRow img[data-lh-glyph="prev"]').isVisible(), false, 'no LB prompt before a pad is used');
    await push({ rb: true }, 1); assert.equal((await set())[0], 'timeAttack', 'RB: the next mode');
    assert.equal(await game.page.locator('.modeRow img[data-lh-glyph="prev"]').isVisible(), true, 'LB shows for a pad');
    await push({ rb: true }, 1); await push({ rb: true }, 1); assert.equal((await set())[0], 'freeDrive', 'no wrap');
    await push({ lb: true }, 1); assert.equal((await set())[0], 'timeAttack');
    assert.equal(await focused(), 'title.drive', 'the shoulders leave focus where it is');
    for (let i = 0; i < 8; i++) await push({ up: true });
    assert.doesNotMatch(await focused(), /^title\.mode\./, 'the pad never reaches the mode row');
    // onto the obstacles rail from below: focus lands on the chosen stop and changes nothing; left/right then set it
    await game.page.evaluate(() => document.querySelector('[data-testid="title.car.awd"]').focus());
    await push({ up: true }); assert.equal(await focused(), 'title.obstacles.4');
    assert.deepEqual((await set()).slice(1), [2, 4]);
    await push({ left: true }, 1); await push({ left: true }, 1);
    assert.equal(await focused(), 'title.obstacles.2'); assert.equal((await set())[2], 2, 'the choice follows focus');
    await push({ select: true }, 1); assert.deepEqual((await game.scene()).overlays, ['title', 'settings'], 'View opens settings');
    await push({ select: true }, 1); assert.deepEqual((await game.scene()).overlays, ['title'], 'and closes it');
    assert.equal(await game.page.locator('#driveBtn img.glyph').getAttribute('data-lh-glyph'), 'menu', 'Drive shows Start');
    await push({ start: true }, 1); await game.until(s => s.phase === 'ready' || s.phase === 'countdown' || s.phase === 'running', { maxSteps: 4000 });
    await game.until(s => s.phase === 'running', { maxSteps: 4000 });
    await push({ select: true }, 1); assert.deepEqual((await game.scene()).overlays, ['settings'], 'View opens settings while driving');
    const t0 = await game.page.evaluate(() => window.engine.scene.state.time); await game.step(60);
    assert.equal(await game.page.evaluate(() => window.engine.scene.state.time), t0, 'and the run stands still under it');
    await push({ select: true }, 1); assert.deepEqual((await game.scene()).overlays, [], 'View closes it');
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
    assert.ok((await game.haptics(0)).calls.filter(on).every(c => c.type === 'trigger-rumble'), 'the fake pad lists trigger-rumble: all four motors in one (R9-4)');
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
    // the pause's own rounds have run out; they advance per rendered frame, and SwiftShader draws the R10 surfaces at ~1.4 s a frame
    await game.page.waitForFunction(() => !window.__rallyView.stopping(), null, { timeout: 30000 });
    await game.jump('stage', 'results', { time: 100, best: 101 }, { settings: { mode: 'stage', seed: 'e2e2' } });
    const stopped = await game.page.evaluate(() => new Promise(res => { let n = 0; const tick = () => (window.__rallyView.stopping() ? res(true) : ++n > 3 ? res(false) : requestAnimationFrame(tick)); tick(); }));
    assert.equal(stopped, true, 'a game moment that does not pause (results) calls view.haptics.stop itself');
  } finally { await game.close(); }
});

test('desktop: ?rumble opens the tuning panel beside the game; a slider edits the live params and saves them (R9-5)', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, site.url, { preset: 'desktop', seed: 5, query: { rumble: '' }, settings: { 'rally-sim-settings': { v: 5, mode: 'freeDrive', world: 'loop', seed: 'e2e3', rumble: 'full' } } });
  try {
    await game.page.waitForSelector('#rumbleTune input[type=range]');
    const sections = await game.page.$$eval('#rumbleTune section h2', hs => hs.map(h => h.textContent));
    assert.deepEqual(sections, ['Engine', 'Road', 'Impacts', 'Brake aid (left trigger)']);
    assert.ok(await game.page.$$eval('#rumbleTune details summary', s => s.some(e => e.textContent === 'Advanced: mix and send')), 'the mix and the write budget are under Advanced');
    await game.page.$eval('#rumbleTune input[type=range]', el => { el.value = String(Number(el.min)); el.dispatchEvent(new Event('input', { bubbles: true })); });
    const saved = await game.page.evaluate(() => JSON.parse(localStorage.getItem('rally-rumble-tune')));
    assert.equal(saved.engine.idle, 0, 'the first slider (engine idle) saved at its minimum');
    await game.tap('title.drive'); await game.until(s => s.phase === 'running', { maxSteps: 2000 });
    assert.deepEqual(await game.errors(), []);
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
