// Real-Chromium flows on Tractor Pickup's engine browser half (lion-hawk 2g). Run: npm run test:e2e
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openGame, expectScene, expectState } from 'lion-hawk/playwright';
import { serveTractor } from './serve.mjs';

const ENTRY = process.env.TRACTOR_ENTRY ?? 'src/entry.js'; // G7 switches the default to src/main.js
const ARGS = { seed: 14, started: true };
const frames = game => game.page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
const untilRewarded = async game => { for (let i = 0; i < 100; i++) { if (await game.page.evaluate(() => window.engine.events.since(0).some(e => e.type === 'reward'))) return; await game.page.waitForTimeout(50); await game.step(1); } throw new Error('no reward after the show'); };
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
    assert.equal(await game.page.evaluate(() => document.getElementById('c').dataset.tpGen), '2', 'the view rebuilt the 3D farm for the new generation');
    assert.ok(cam && typeof cam.onScreen === 'boolean');
    assert.deepEqual(await game.errors(), []);
  } finally { await game.close(); }
});

test('desktop: a boop fills a slot with its word; the drive buttons open and close the paint screen; the gear needs a 2 s hold', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, site.url, { preset: 'desktop', args: ARGS });
  try {
    await game.jump('farm', 'riders', { n: 2 }, ARGS); await game.step(2);
    assert.equal(await game.page.locator('#slots .slot.full').count(), 2);
    await game.tap('farm.paint'); await game.step(1); await expectState(game, 'mode', 'menu');
    await game.tap('paint.close'); await game.step(1); await expectState(game, 'mode', 'drive');
    await game.press('farm.parent'); await game.step(60); assert.deepEqual((await game.scene()).overlays, []);
    await game.step(70); assert.deepEqual((await game.scene()).overlays, ['parent']); await game.unpress('farm.parent');
    assert.deepEqual(await game.errors(), []);
  } finally { await game.close(); }
});

test('desktop: a real landing fills its slot and shows its word (W-5)', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, site.url, { preset: 'desktop', args: ARGS });
  try {
    await game.step(60);
    await game.page.evaluate(() => { // as golden-farm's pickup(): a free single stands just in front of the tractor
      const g = window.engine.debug.game, a = g.herd.free().find(x => !x.hidden && x.type !== 'chick' && !g.herd.animals.some(c => c.leader === x.id));
      const p = g.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); a.x = p.x; a.z = p.z; a.state = 'idle'; a.timer = 99;
    });
    await game.untilEvent('land', { maxSteps: 400 });
    assert.equal(await game.page.locator('#slots .slot.full').count(), 1);
    assert.equal(await game.page.locator('#word.on').count(), 1, 'the landing word is up');
    assert.deepEqual(await game.errors(), []);
  } finally { await game.close(); }
});

test('desktop: the show plays and acks; the riders walk in from their show spots; the card waits for go; skip ends the show', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, site.url, { preset: 'desktop', args: ARGS });
  try {
    await game.jump('farm', 'barn', { n: 2 }, ARGS); await game.step(190);
    await game.page.evaluate(() => { window.engine.debug.drive({ thr: 1, steer: 0, horn: false }); });
    await game.untilEvent('show', { maxSteps: 900 }); await game.page.evaluate(() => window.engine.debug.drive(null));
    assert.equal(await game.page.locator('#show').isVisible(), true);
    await game.press('show.skip'); await game.seconds(1.2); await game.unpress('show.skip');
    await untilRewarded(game); // the cutscene ends in the page's own event loop; its show.done lands with the next step
    await expectState(game, 'mode', 'reward');
    const left = await game.page.evaluate(() => window.engine.debug.game.herd.animals.filter(a => a.state === 'toBarn').length);
    assert.equal(left, 2, 'both riders walk into the barn (F-10)');
    await game.tap('reward.go'); await game.step(2); await expectState(game, 'mode', 'drive');
    assert.deepEqual(await game.errors(), []);
  } finally { await game.close(); }
});
