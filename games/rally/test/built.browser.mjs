// #50 restored: a track rebuild's load settles only once the new track view is in the scene (the stage view's
// `built` hook holds it with view.wait), so a test that waits for the load sees the new track at once.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openGame } from 'lion-hawk/playwright';
import { serveRally } from './serve.mjs';

let chrome, site, skip = false;
before(async () => {
  try { chrome = await launch(); } catch (e) { if (/no chromium found/.test(e.message)) { skip = e.message; return; } throw e; }
  site = await serveRally();
});
after(async () => { await chrome?.close(); await site?.close(); });

test('a seed change: the load ends with the new track view in place', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, site.url, { preset: 'desktop', seed: 5, settings: { 'rally-sim-settings': { v: 5, mode: 'stage', seed: 'b1' } } });
  try {
    await game.page.waitForFunction(() => window.engine.settled(), null, { timeout: 60000 });
    assert.equal(await game.page.evaluate(() => document.documentElement.dataset.rallyTrack), 'b1');
    await game.fill('title.seed', 'b2');
    await game.untilLoaded();
    assert.equal(await game.page.evaluate(() => document.documentElement.dataset.rallyTrack), 'b2');
    assert.deepEqual(await game.errors(), []);
  } finally { await game.close(); }
});
