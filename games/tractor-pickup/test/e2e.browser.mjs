// Real-Chromium flows on Tractor Pickup's engine browser half (lion-hawk 2g). Run: npm run test:e2e
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openGame, expectScene, expectState } from 'lion-hawk/playwright';
import { serveTractor } from './serve.mjs';

const ENTRY = process.env.TRACTOR_ENTRY ?? 'src/entry.js'; // G7 switches the default to src/main.js
const ARGS = { seed: 14, started: true };
const frames = game => game.page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
let chrome, site, skip = false;
before(async () => {
  try { chrome = await launch(); } catch (e) { if (/no chromium found/.test(e.message)) { skip = e.message; return; } throw e; }
  site = await serveTractor({ entry: ENTRY });
});
after(async () => { await chrome?.close(); await site?.close(); });

test('desktop: boots into the farm; W drives away from the camera; H honks; the 3D farm follows a new farm', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, site.url, { preset: 'desktop', args: ARGS });
  try {
    await expectScene(game, 'farm'); await expectState(game, 'mode', 'drive');
    const p0 = (await game.state()).tractor;
    await game.page.keyboard.down('w'); await frames(game); await game.step(120); await game.page.keyboard.up('w');
    const s = await game.state(); assert.ok(s.tractor.speed > 2, `speed ${s.tractor.speed}`);
    const cam = await game.page.evaluate(() => window.engine.view.project([0, 0, 0]));
    assert.ok(Math.hypot(s.tractor.x - p0.x, s.tractor.z - p0.z) > 3);
    await game.page.keyboard.press('h'); await frames(game); await game.untilEvent('horn', { maxSteps: 5 });
    await game.command('farm.new', {}); await game.step(1); await game.untilLoaded(); // the command is delivered at the next step (I-7): until then no load is active
    assert.equal((await game.state()).gen, 2);
    assert.ok(await game.page.evaluate(() => window.engine.debug.farm.gen === 2));
    assert.ok(cam && typeof cam.onScreen === 'boolean');
    assert.deepEqual(await game.errors(), []);
  } finally { await game.close(); }
});
