// Real-Chromium flows on Tractor Pickup's engine browser half (lion-hawk 2g). Run: npm run test:e2e
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openGame, peers, expectScene, expectState } from 'lion-hawk/playwright';
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

const NOW = '.parent [data-g="bed"] [data-v="0"]'; // the parent menu's bedtime "Now" (ui/menus.js openParent)
const openParent = async game => { await game.press('farm.parent'); await game.step(130); await game.unpress('farm.parent'); await game.page.locator(NOW).waitFor({ state: 'visible', timeout: 5000 }); };

test('desktop: bedtime from the parent menu, the last drive, sleep and a 5 s wake hold; storage keeps it (N-1..N-7)', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, site.url, { preset: 'desktop', args: ARGS });
  try {
    await openParent(game);
    await game.page.locator(NOW).click(); await game.step(2);
    assert.deepEqual((await game.scene()).overlays, [], 'a bedtime choice closes the parent menu');
    assert.equal(await game.page.locator('.parent').count(), 0);
    await game.page.evaluate(() => window.engine.command('clock', { date: Date.now() + 1000 })); await game.step(1);
    await expectState(game, 'bed.phase', 'last');
    assert.equal(JSON.parse(await game.page.evaluate(() => localStorage.getItem('tp-bedtime'))).phase, 'last');
    await game.jump('farm', 'asleep', {}, ARGS); await game.step(2);
    assert.equal(await game.page.locator('#sleep [data-testid="sleep.wake"]').isVisible(), true);
    await game.press('sleep.wake'); await game.step(290); await expectState(game, 'mode', 'sleep'); await game.step(20); await game.unpress('sleep.wake');
    await expectState(game, 'mode', 'drive');
    assert.equal(await game.page.locator('#sleep').count(), 0, 'the night layer goes with the wake');
    assert.equal(JSON.parse(await game.page.evaluate(() => localStorage.getItem('tp-bedtime'))).phase, 'awake');
    assert.deepEqual(await game.errors(), []);
  } finally { await game.close(); }
});

test('desktop: an empty last drive ends at the barn; the wake button comes after the dusk; settings are saved (E-5, P-3..P-5)', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, site.url, { preset: 'desktop', args: ARGS });
  try {
    await game.jump('farm', 'barn', { n: 0 }, ARGS); await game.step(190);
    await openParent(game);
    await game.page.locator('.parent [data-g="music"] [data-v="0"]').click(); await game.step(1);
    assert.equal(JSON.parse(await game.page.evaluate(() => localStorage.getItem('tp-settings'))).music, false);
    await game.page.locator(NOW).click(); await game.step(2); await expectState(game, 'bed.phase', 'last');
    await game.page.evaluate(() => { window.engine.debug.drive({ thr: 1, steer: 0, horn: false }); });
    await game.untilEvent('sleep', { maxSteps: 900 }); await game.page.evaluate(() => window.engine.debug.drive(null)); await game.step(1);
    await expectState(game, 'mode', 'sleep');
    assert.equal(await game.page.locator('#sleep [data-testid="sleep.wake"]').isVisible(), false, 'the night falls before the wake button shows');
    await game.step(250);
    assert.equal(await game.page.locator('#sleep [data-testid="sleep.wake"]').isVisible(), true);
    assert.deepEqual(await game.errors(), []);
  } finally { await game.close(); }
});

test('desktop: a reload while asleep wakes into the night at once (N-7); ?tune and ?fps', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, site.url, { preset: 'desktop', seed: 14, query: { tune: '', fps: '' }, settings: { 'tp-bedtime': { phase: 'asleep', at: null, choice: null } } });
  try {
    await expectState(game, 'bed.phase', 'asleep');
    await game.page.keyboard.press('h'); await game.step(2); // the first key starts the trip, which goes straight to sleep
    await expectState(game, 'mode', 'sleep');
    assert.equal(await game.page.locator('#sleep [data-testid="sleep.wake"]').isVisible(), true, 'a quiet sleep shows the wake button at once');
    assert.equal(await game.page.locator('#tune').count(), 1);
    await game.page.evaluate(() => new Promise(r => setTimeout(r, 700))); // the meter redraws its text every 0.5 s of frames
    assert.match(await game.page.locator('#fps').textContent(), /fps/);
    assert.deepEqual(await game.errors(), []);
  } finally { await game.close(); }
});

test('desktop: the parent menu opens the Multiplayer panel; its X is the multiplayer.close control (M-29, M-30)', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, site.url, { preset: 'desktop', args: ARGS });
  try {
    await game.press('farm.parent'); await game.step(130); await game.unpress('farm.parent');
    await game.tap('parent.mp'); await game.step(1);
    assert.deepEqual((await game.scene()).overlays, ['multiplayer']);
    assert.equal(await game.page.locator('.parent.mp').isVisible(), true);
    assert.equal(await game.page.locator('.parent.mp [data-a=host]').count(), 1, 'Host and Join while idle');
    await game.page.locator('.parent.mp [data-a=join]').click(); await game.step(1);
    assert.equal(await game.page.locator('.parent.mp [name=room]').count(), 1, 'the panel redraws on a session change');
    await game.tap('multiplayer.close'); await game.step(1);
    assert.deepEqual((await game.scene()).overlays, []); assert.equal(await game.page.locator('.parent.mp').count(), 0);
    assert.deepEqual(await game.errors(), []);
  } finally { await game.close(); }
});

// G5 (2f delta): the guest opens with other args than the host, so its seed 21 can only be the host's farm
test('two pages: the guest gets the host farm, both see each other, a horn reaches the other, leaving goes alone (M-1, M-8, M-41)', async t => {
  if (skip) return t.skip(skip);
  const room = await peers(chrome.browser, site.url, 2, { render: 'manual', query: { tune: '' }, argsOf: i => i ? { seed: 5, started: true } : { seed: 21, started: true } });
  try {
    const [host, guest] = room.games;
    await room.step(60);
    assert.equal((await guest.state()).seed, 21); assert.equal((await guest.state()).net.you, 2);
    assert.deepEqual((await host.state()).others.map(o => o[0]), [2], 'the host sees player 2');
    assert.deepEqual((await guest.state()).others.map(o => o[0]), [1], 'the guest sees the host');
    await frames(host); await frames(guest);
    assert.equal(await host.page.locator('#tune').isVisible(), true, 'the host tunes (G4b)');
    assert.equal(await guest.page.locator('#tune').isVisible(), false, 'a guest\'s ?tune panel is hidden in a room');
    await host.page.keyboard.press('h'); await frames(host); await room.step(30);
    assert.ok(await guest.page.evaluate(() => window.engine.events.since(0).some(e => e.type === 'remoteHorn')));
    // #102: a rider in the host's train is drawn on the guest from the view's pose map (the riders preset's landing, between steps)
    const landed = await host.page.evaluate(() => { window.engine.debug.riders(1); return window.engine.debug.game.load.slots.find(s => s.landed)?.animal.id ?? null; });
    assert.notEqual(landed, null, 'the host loaded an animal');
    await room.step(30);
    assert.ok(await guest.page.evaluate(id => { const a = window.engine.debug.game.herd.animals[id]; return a?.state === 'carried' && a.owner === 1; }, landed), 'the guest has it in the host train');
    assert.deepEqual(await guest.errors(), [], 'the guest draws the host rider with no error');
    await host.close(); await room.step(30);
    assert.equal((await guest.state()).net.role, 'solo');
    assert.deepEqual(await guest.errors(), []);
  } finally { await room.close(); }
});

// G4b: ?tune's sim sliders issue a tune command; the sim writes its own constant and the panel shows what the event says
test('desktop: a ?tune slider issues a tune command; the sim\'s preset changes and the panel shows the clamped value', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, site.url, { preset: 'desktop', args: ARGS, query: { tune: '' } });
  try {
    await expectScene(game, 'farm'); await game.step(2);
    const vmax0 = await game.page.evaluate(() => window.engine.debug.game.tractor.P.vmax);
    await game.page.evaluate(() => { document.getElementById('tuneToggle').click(); const i = document.querySelector('#tune input[data-tune="P.vmax"]'); i.value = '5'; i.dispatchEvent(new Event('input', { bubbles: true })); });
    assert.equal(await game.page.evaluate(() => window.engine.debug.game.tractor.P.vmax), vmax0, 'the view wrote nothing: the command waits for the next step');
    await game.step(1);
    const ev = await game.page.evaluate(() => window.engine.events.since(0).filter(e => e.type === 'tune').map(e => ({ key: e.key, value: e.value })));
    assert.deepEqual(ev, [{ key: 'P.vmax', value: 5 }]);
    assert.equal(await game.page.evaluate(() => window.engine.debug.game.tractor.P.vmax), 5);
    assert.equal(await game.page.locator('#tune input[data-tune="P.vmax"] + output').textContent(), '5');
    await game.page.evaluate(() => { const i = document.querySelector('#tune input[data-tune="TP.slip"]'); i.max = '99'; i.value = '50'; i.dispatchEvent(new Event('input', { bubbles: true })); });
    await game.step(1);
    assert.equal(await game.page.locator('#tune input[data-tune="TP.slip"] + output').textContent(), '6', 'the sim clamps; the panel shows what it wrote');
    assert.deepEqual(await game.errors(), []);
  } finally { await game.close(); }
});
