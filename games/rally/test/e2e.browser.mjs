// Real-Chromium flow on the engine browser half (lion-hawk 2c-rally). Run: npm run test:e2e
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openGame, expectScene, expectState, expectTappable } from 'lion-hawk/playwright';
import { serveRally } from './serve.mjs';

const ENTRY = process.env.RALLY_ENTRY ?? 'src/entry.js'; // R8 switches the default to src/main.js
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
    assert.equal(await game.page.evaluate(() => document.body.classList.contains('scr-play')), true);
    assert.deepEqual(await game.errors(), []);
  } finally { await game.close(); }
});
