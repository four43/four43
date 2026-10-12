// Real-Chromium flows on the engine browser half (lion-hawk 2e). Run: npm run test:e2e
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openGame, expectScene, expectState } from 'lion-hawk/playwright';
import { servePigPens } from './serve.mjs';

const ENTRY = process.env.PIGPENS_ENTRY ?? 'src/entry.js'; // P9 switches the default to src/main.js
const ARGS = { pigs: 24 };
const frames = game => game.page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); // devices update per frame
const world = (game, fn) => game.page.evaluate(fn);
// #56: a hold counts device time, which the driver caps at maxFrame (0.1 s) per frame, and SwiftShader draws the farm
// at about 4–5 fps; so wait in real time, stepping, until the press has landed (at most `ms`).
async function holdUntil(game, pred, ms = 10000) {
  const t0 = Date.now();
  for (;;) { await game.page.waitForTimeout(250); await game.step(1); if (pred(await game.state()) || Date.now() - t0 > ms) return; }
}
let chrome, site, skip = false;
before(async () => {
  try { chrome = await launch(); } catch (e) { if (/no chromium found/.test(e.message)) { skip = e.message; return; } throw e; }
  site = await servePigPens({ entry: ENTRY });
});
after(async () => { await chrome?.close(); await site?.close(); });

test('desktop: boots into the farm; a Hand click picks; a Shoo drag sends the dog; a Feed click tosses; right-drag only turns the camera', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, site.url, { preset: 'desktop', seed: 3, args: ARGS });
  try {
    await expectScene(game, 'farm'); await expectState(game, 'tool', 'hand');
    const pig = await world(game, () => { const p = window.engine.debug.sim.pigs[2]; return [p.px, p.py, p.pz]; });
    let at = await game.point({ world: pig });
    await game.page.mouse.click(at.x, at.y); await game.step(2);
    assert.notEqual((await game.state()).selected, null, 'the click selected what was under it');
    await game.tap('farm.close'); await game.step(1); // the card covers pen 4 on this screen
    await expectState(game, 'selected', null);
    await game.tap('farm.tool.shoo');
    const pen = await world(game, () => { const q = window.engine.debug.sim.lay.pens[1]; return [q.cx, 0, q.cz]; });
    at = await game.point({ world: pen });
    await game.page.mouse.move(at.x, at.y); await game.page.mouse.down(); await frames(game); await game.step(1);
    assert.equal((await game.state()).dog.active, true);
    await game.page.mouse.move(at.x + 40, at.y, { steps: 4 }); await frames(game); await game.step(1);
    await game.page.mouse.up(); await game.step(1);
    assert.equal((await game.state()).dog.active, false);
    await game.tap('farm.tool.feed');
    const pen4 = await world(game, () => { const q = window.engine.debug.sim.lay.pens[4]; return [q.cx, 0, q.cz]; });
    at = await game.point({ world: pen4 }); await game.page.mouse.click(at.x, at.y); await game.step(2);
    await expectState(game, 'foods', 1);
    const before = await world(game, () => window.engine.view.project([0, 0, 0]));
    await game.page.mouse.move(640, 360); await game.page.mouse.down({ button: 'right' });
    await game.page.mouse.move(760, 360, { steps: 6 }); await game.page.mouse.up({ button: 'right' }); await game.render();
    assert.notDeepEqual(await world(game, () => window.engine.view.project([0, 0, 0])), before);
    await expectState(game, 'foods', 1); await expectState(game, 'dog.active', false);
    assert.deepEqual(await game.errors(), []);
  } finally { await game.close(); }
});

test('desktop: card and Escape; bell and night hints and label; Feed badge; holding the tractor drives, W moves it, Escape gets out', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, site.url, { preset: 'desktop', seed: 3, args: ARGS });
  try {
    await game.page.evaluate(() => window.engine.debug.select({ kind: 'pig', i: 2 })); await game.step(1);
    assert.equal(await game.page.locator('#card').isVisible(), true);
    assert.equal(await game.page.textContent('#cardName'), await world(game, () => window.engine.debug.sim.pigs[2].name));
    await game.page.keyboard.press('Escape'); await frames(game); await game.step(1);
    await expectState(game, 'selected', null); assert.equal(await game.page.locator('#card').isVisible(), false);
    await game.tap('farm.bell'); await game.step(1); assert.match(await game.page.textContent('#hint'), /Dinner time/);
    await game.tap('farm.night'); await game.step(1);
    await expectState(game, 'night', true); assert.equal(await game.page.getAttribute('#daynight', 'aria-label'), 'Night. Switch to day');
    await game.page.keyboard.press('3'); await frames(game); await game.step(1); await expectState(game, 'tool', 'feed');
    const pen4 = await world(game, () => { const q = window.engine.debug.sim.lay.pens[4]; return [q.cx, 0, q.cz]; });
    let at = await game.point({ world: pen4 }); await game.page.mouse.click(at.x, at.y); await game.step(2);
    assert.equal(await game.page.textContent('#snacks'), '4');
    await game.page.keyboard.press('1'); await frames(game); await game.step(1);
    const tr = await world(game, () => { const x = window.engine.debug.sim.tractor; return [x.x, 1.2, x.z]; });
    at = await game.point({ world: tr });
    await game.page.mouse.move(at.x, at.y); await game.page.mouse.down(); await frames(game); await game.step(1);
    assert.equal(await game.page.locator('#press').isVisible(), true, 'the hold ring shows');
    await holdUntil(game, s => s.driving); // 0.75 s of device time, then the press command lands
    await game.page.mouse.up(); await game.step(1);
    await expectState(game, 'driving', true); assert.equal(await game.page.locator('#tools').isVisible(), false);
    await game.page.keyboard.down('w'); await frames(game); await game.step(120); await game.page.keyboard.up('w');
    assert.ok((await game.state()).tractor.speed > 1, 'W drives the tractor');
    await game.page.keyboard.press('Escape'); await frames(game); await game.step(1);
    await expectState(game, 'driving', false); assert.equal(await game.page.locator('#tools').isVisible(), true);
    assert.deepEqual(await game.errors(), []);
  } finally { await game.close(); }
});
