// Real-Chromium flows on the engine browser half (lion-hawk 2e). Run: npm run test:e2e
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openGame, expectScene, expectState, expectTappable, expectFitsSafeArea } from 'lion-hawk/playwright';
import { servePigPens } from './serve.mjs';
import { BARN, CLINIC, COOP } from '../src/defs/buildings.js';

const ENTRY = process.env.PIGPENS_ENTRY ?? 'src/main.js';
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

test('desktop: card and Escape; bell and night hints and label; Feed badge', async t => {
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
    assert.deepEqual(await game.errors(), []);
  } finally { await game.close(); }
});

const PHONE = 'iPhone 15 Pro portrait', WIDE = 'iPhone 15 Pro landscape';

test('iPhone: Shoo and Hose drags; Grab lifts a pig by touch and throws it (#54)', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, site.url, { preset: PHONE, seed: 3, args: ARGS });
  try {
    const pen = await world(game, () => { const q = window.engine.debug.sim.lay.pens[1]; return [q.cx, 0, q.cz]; });
    await game.tap('farm.tool.shoo');
    await game.touch.start(1, { world: pen }); await game.touch.move(1, { world: [pen[0] + 2, 0, pen[2]] }); await frames(game); await game.step(2);
    let s = await game.state(); assert.equal(s.dog.active, true); assert.ok(s.ring);
    await game.touch.end(1); await game.step(1); assert.equal((await game.state()).dog.active, false);
    await game.tap('farm.tool.hose');
    await game.touch.start(1, { world: pen }); await frames(game); await game.step(2);
    assert.equal((await game.state()).hose.active, true);
    await game.touch.end(1); await game.step(1); assert.equal((await game.state()).hose.active, false);
    await game.tap('farm.tool.grab');
    const pig = await world(game, () => { const p = window.engine.debug.sim.pigs.find(q => !q.piglet); return [p.px, p.py, p.pz]; });
    await game.touch.start(1, { world: pig }); await frames(game); await game.step(2);
    s = await game.state(); assert.ok(s.grabbed.pig >= 0, 'the pig under the finger was lifted (not a bird)');
    await game.step(45);
    assert.ok(await game.page.evaluate(i => window.engine.debug.sim.pigs[i].py, s.grabbed.pig) > 1, 'lifted');
    await game.touch.end(1); await game.step(1);
    s = await game.state(); assert.deepEqual([s.grabbed.pig, s.grabbed.bird], [-1, -1]);
    assert.deepEqual(await game.errors(), []);
  } finally { await game.close(); }
});

test('iPhone landscape: a pinch zooms the camera', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, site.url, { preset: WIDE, seed: 3, args: ARGS });
  try {
    // measure the span of 4 m at the middle of the farm
    const span = () => world(game, () => { const a = window.engine.view.project([0, 0, 0]), b = window.engine.view.project([4, 0, 0]); return Math.hypot(a.x - b.x, a.y - b.y); });
    await game.render(); const before = await span();
    const mid = { x: 400, y: 200 };
    await game.touch.start(1, { x: mid.x - 50, y: mid.y }); await game.touch.start(2, { x: mid.x + 50, y: mid.y });
    await game.touch.move(1, { x: mid.x - 110, y: mid.y }); await game.touch.move(2, { x: mid.x + 110, y: mid.y }); await game.touch.end(1, 2); await game.render();
    assert.ok(await span() > before * 1.2, 'spreading two fingers zooms in');
    await expectState(game, 'tool', 'hand'); await expectState(game, 'selected', null); // the second finger cancelled the Hand
    assert.deepEqual(await game.errors(), []);
  } finally { await game.close(); }
});

test('iPhone: the toolbar and top bar are tappable and inside the safe area (#63)', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, site.url, { preset: PHONE, seed: 3, args: ARGS });
  try {
    for (const id of ['hand', 'shoo', 'feed', 'hose', 'grab']) await expectTappable(game, `farm.tool.${id}`);
    await expectTappable(game, 'farm.bell'); await expectTappable(game, 'farm.night');
    await expectFitsSafeArea(game, '#tools'); await expectFitsSafeArea(game, '#top');
    assert.deepEqual(await game.errors(), []);
  } finally { await game.close(); }
});

test('desktop (v3): a click on a roof goes into that building; the Outside button and Escape come back out', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, site.url, { preset: 'desktop', seed: 3, args: ARGS });
  try {
    await expectScene(game, 'farm');
    for (const [id, roof] of [['barn', [BARN.x + 3, 6.0, BARN.z]], ['clinic', [CLINIC.x, 4.2, CLINIC.z - 0.7]], ['coop', [COOP.x - 0.6, 2.4, COOP.z]]]) {
      const at = await game.point({ world: roof });
      await game.page.mouse.click(at.x, at.y); await game.step(2);
      await expectState(game, 'focus', id);
      await frames(game); await expectTappable(game, 'farm.back');
      if (id === 'clinic') { await game.page.keyboard.press('Escape'); await frames(game); await game.step(2); }
      else { await game.tap('farm.back'); await game.step(2); }
      await expectState(game, 'focus', null);
      for (let k = 0; k < 40; k++) await frames(game); // the camera eases back before the next roof is aimed at
    }
  } finally { await game.close(); }
});

test('desktop (v3 R3): a whole vet visit with the mouse: check in, the exam room, a tool dragged off the pegboard, cured and out', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, site.url, { preset: 'desktop', seed: 3, args: ARGS });
  try {
    await expectScene(game, 'farm');
    await world(game, () => { const d = window.engine.debug; d.sicken('pig', 2, 'cold'); d.sim.clinic.admit('pig', 2); });
    const click = async w => { const at = await game.point({ world: w }); await game.page.mouse.click(at.x, at.y); await game.step(2); for (let k = 0; k < 40; k++) await frames(game); };
    await click([CLINIC.x, 4.2, CLINIC.z - 0.7]); await expectState(game, 'focus', 'clinic');
    await click([CLINIC.x + CLINIC.examRoom.x0 + 0.8, 0, CLINIC.z - 3.2]); await expectState(game, 'focus', 'clinic.exam');
    for (let i = 0; i < 40 && (await game.state()).clinic.exam !== 'patient'; i++) await game.step(30);
    assert.equal((await game.state()).clinic.exam, 'patient', 'on the table');
    for (let k = 0; k < 30; k++) await frames(game); // the close-up settles
    const drag = async tool => {
      const peg = CLINIC.pegs.find(p => p.tool === tool);
      const pat = await world(game, () => { const p = window.engine.debug.sim.clinic.patient(); return [p.px + 0.6, p.py + 0.25, p.pz]; });
      const a = await game.point({ world: [CLINIC.x + peg.at[0] + 0.05, peg.at[1] - 0.2, CLINIC.z + peg.at[2]] }), b = await game.point({ world: pat });
      await game.page.mouse.move(a.x, a.y); await game.page.mouse.down(); await frames(game); await game.step(1);
      assert.equal((await game.state()).clinic.drag, tool, `holding the ${tool}`);
      await game.page.mouse.move(b.x, b.y, { steps: 6 }); await frames(game); await game.step(1);
      await game.page.mouse.up(); await game.step(2);
    };
    await drag('shot');
    assert.equal((await game.state()).clinic.exam, 'cured');
    for (let i = 0; i < 40 && (await game.state()).clinic.exam !== 'empty'; i++) await game.step(30); // the lollipop, then walking out (2.9.0)
    const s = await game.state(); assert.deepEqual(s.clinic.queue, []); assert.deepEqual(s.sick, []);
  } finally { await game.close(); }
});
