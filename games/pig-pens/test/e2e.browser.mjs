// Real-Chromium flows on the engine browser half (lion-hawk 2e). Run: npm run test:e2e
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openGame, expectScene, expectState } from 'lion-hawk/playwright';
import { servePigPens } from './serve.mjs';

const ENTRY = process.env.PIGPENS_ENTRY ?? 'src/entry.js'; // P9 switches the default to src/main.js
const ARGS = { pigs: 24 };
const frames = game => game.page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); // devices update per frame
const world = (game, fn) => game.page.evaluate(fn);
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
