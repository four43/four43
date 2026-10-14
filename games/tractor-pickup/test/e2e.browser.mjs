// Real-Chromium flows on Tractor Pickup's engine browser half (lion-hawk 2g). Run: npm run test:e2e
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openGame, peers, expectScene, expectState, expectTappable, expectFitsSafeArea, presets } from 'lion-hawk/playwright';
import { serveTractor } from './serve.mjs';
import { PHRASES } from '../src/sim/words.js';

const ENTRY = process.env.TRACTOR_ENTRY ?? 'src/entry.js'; // G7 switches the default to src/main.js
const ARGS = { seed: 14, started: true };
const IPAD = 'iPad Pro 11 landscape', PHONE = 'iPhone 15 Pro portrait'; // X-3 the main device, X-12
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

// G6: iPad and iPhone (X-3, X-12), parity #4, #5, #7, #13, #16, #18, #20; field notes #43, #63, #82
test('iPad: a thumb pushed up drives away from the camera; pulled down reverses; the horn button honks', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, site.url, { preset: IPAD, args: ARGS });
  try {
    await expectState(game, 'mode', 'drive');
    await game.touch.start(1, { x: 600, y: 600 }); await game.touch.move(1, { x: 600, y: 520 }); await frames(game); await game.step(90);
    const s = await game.state(); assert.ok(s.tractor.speed > 1.5, `forward ${s.tractor.speed}`);
    assert.ok(await game.page.evaluate(() => window.engine.debug.game.tractor.fwd > 0), 'the stick pushed up drives forward (C-2)');
    await game.touch.move(1, { x: 600, y: 680 }); await frames(game); await game.step(120);
    assert.ok(await game.page.evaluate(() => window.engine.debug.game.tractor.fwd < 0), 'reversing (C-8)');
    await game.touch.end(1); await game.step(1);
    await game.touch.start(2, '#horn'); await frames(game); await game.untilEvent('horn', { maxSteps: 5 }); await game.touch.end(2);
    assert.deepEqual(await game.errors(), []);
  } finally { await game.close(); }
});

test('iPhone portrait: the horn, drive buttons, gear and slot bar are tappable and inside the safe area (X-12)', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, site.url, { preset: PHONE, args: ARGS });
  try {
    await expectState(game, 'mode', 'drive'); await game.step(1);
    await expectTappable(game, 'farm.paint'); await expectTappable(game, 'farm.book'); await expectTappable(game, 'farm.parent');
    await expectTappable(game, { css: '#horn' });
    await expectFitsSafeArea(game, '#horn'); await expectFitsSafeArea(game, '#slots'); await expectFitsSafeArea(game, '#drivebtns');
    await expectFitsSafeArea(game, '.gear');
    assert.deepEqual(await game.errors(), []);
  } finally { await game.close(); }
});

// The show's pace is its waits and the voice's lines. A stub speech that never ends (initScript, as the brief's judgment asks) holds
// every line to the voice's safety timeout (audio/voice.js: 1.2 s + 0.15 s a letter, from when the line starts), and notes when each
// line starts, so a step that ends before its line could have is one a hold finished (F-8).
const SILENT = () => {
  window.__spoken = []; window.__downs = []; // when each line starts; when each touch goes down (capturing, before the game sees it)
  addEventListener('pointerdown', () => window.__downs.push(performance.now()), true);
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { speak(u) { window.__spoken.push({ text: u.text, at: performance.now() }); }, cancel() {}, pause() {}, resume() {}, getVoices: () => [], paused: false, speaking: false, pending: false, addEventListener() {}, removeEventListener() {} } });
};
const LETS_COUNT = PHRASES['lets-count'], LINE_MS = 1200 + 150 * LETS_COUNT.length; // the show's intro line (sim/showSteps.js)

// Field note (G6): SwiftShader draws the iPad's 1.5x canvas at ~2 fps; at 1x (the same CSS layout and touch points) a frame takes
// ~0.4 s. bindGesture counts whole frames (update(rawDt)) and a lift arrives only after the frame it fell in, so at 2 fps a 150 ms
// tap already spans 1.1 s of frames and fires the 1 s hold: the gesture test runs the iPad layout at 1x.
test('iPad: the wake button needs its full 5 s hold by touch; on the show a short tap does not hurry, a 1 s hold finishes the step (N-5, F-8, A-3)', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, site.url, { preset: { ...presets[IPAD], deviceScaleFactor: 1 }, args: ARGS, initScript: SILENT });
  const step = () => game.page.evaluate(() => Number(document.querySelector('#show').dataset.step));
  // the page's clock at each change of #show's step index (the show half writes it each frame), watched from before the show starts
  const watch = () => game.page.evaluate(() => { const log = window.__steps = []; let last = ''; const f = () => { const k = document.querySelector('#show')?.dataset.step; if (k !== undefined && k !== last) { last = k; log.push({ k: Number(k), at: performance.now() }); } requestAnimationFrame(f); }; f(); });
  const after = a => game.page.waitForFunction(a => window.__steps.find(s => s.k > a), a, { timeout: 15000 }).then(h => h.jsonValue());
  try {
    await game.jump('farm', 'asleep', {}, ARGS); await game.step(2);
    assert.equal(await game.page.locator('[data-testid="sleep.wake"]').count(), 1, 'one wake control: the game\'s, not the engine\'s fallback');
    assert.equal(await game.page.locator('#sleep [data-testid="sleep.wake"]').isVisible(), true);
    await game.press('sleep.wake'); await game.step(270); await expectState(game, 'mode', 'sleep');
    await game.step(40); await game.unpress('sleep.wake'); await expectState(game, 'mode', 'drive');
    await game.jump('farm', 'barn', { n: 2 }, ARGS); await game.step(190); await watch();
    await game.page.evaluate(() => window.engine.debug.drive({ thr: 1, steer: 0, horn: false }));
    await game.untilEvent('show', { maxSteps: 900 }); await game.page.evaluate(() => window.engine.debug.drive(null));
    assert.equal((await after(-1)).k, 0, 'the show starts with its intro');
    // both gestures in the intro, which cannot end before its line has been spoken (queued behind the voice's earlier lines) and timed out
    await game.touch.start(1, { x: 600, y: 500 }); await game.touch.end(1); await frames(game); await frames(game); // a hurry fires in a frame's gesture update and shows in the next
    assert.equal(await step(), 0, 'a tap does not change the pace (A-3)');
    await game.touch.start(1, { x: 600, y: 500 });
    const next = await after(0); await game.touch.end(1);
    const { line, down, spoken } = await game.page.evaluate(text => ({ line: window.__spoken.find(s => s.text === text) ?? null, down: window.__downs.at(-1), spoken: window.__spoken.length }), LETS_COUNT);
    assert.ok(spoken > 0, 'the voice speaks through the stub (else the line bound below says nothing)');
    // the hold itself: 1 s of frames (the first frame's dt may begin before the touch, ~0.4 s here) then one frame to show the step
    const held = next.at - down;
    assert.ok(held > 600 && held < 2500, `the hold ended the intro ${Math.round(held)} ms after the touch went down (F-8, #56)`);
    // and not its own pace: the intro cannot end before its line has started and timed out
    assert.ok(!line || next.at - line.at < LINE_MS, `the intro (step ${next.k}) ended before its line could: ${line ? Math.round(next.at - line.at) + ' ms after it started' : 'never spoken'}`);
    assert.deepEqual(await game.errors(), []);
  } finally { await game.close(); }
});

// G6, the parked G4 case: a new farm from the parent menu while asleep. The sleep overlay stays open over the new farm (the sim's
// rebuild closes only the show, the card and the start screen, and builds the farm in 'sleep'), so its view half neither exits
// nor re-enters: the night layer, its shown wake button and the lullaby carry on, as main.js did (its build kept sleepEl)
test('desktop: a new farm while asleep stays asleep; the night layer and its wake button carry over; the wake still needs its hold (E-5, P-8)', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, site.url, { preset: 'desktop', args: ARGS });
  try {
    await game.jump('farm', 'asleep', {}, ARGS); await game.step(2);
    await game.page.evaluate(() => { document.getElementById('sleep').dataset.mark = '1'; });
    await openParent(game);
    assert.deepEqual((await game.scene()).overlays, ['sleep', 'parent'], 'the gear opens the parent menu over the night');
    await game.page.locator('.parent [data-a="new"]').click(); await game.step(1); await game.untilLoaded();
    const s = await game.state(); assert.equal(s.gen, 2); assert.equal(s.mode, 'sleep'); assert.equal(s.bed.phase, 'asleep');
    assert.deepEqual((await game.scene()).overlays, ['sleep']);
    assert.equal(await game.page.locator('#sleep[data-mark="1"]').count(), 1, 'the same night layer: the sleep half did not re-enter');
    assert.equal(await game.page.locator('[data-testid="sleep.wake"]').count(), 1);
    assert.equal(await game.page.locator('#sleep [data-testid="sleep.wake"]').isVisible(), true, 'the wake button is not hidden for another dusk');
    assert.equal(await game.page.evaluate(() => document.getElementById('c').dataset.tpGen), '2', 'the 3D farm was rebuilt under the night');
    await game.press('sleep.wake'); await game.step(250); await expectState(game, 'mode', 'sleep'); await game.step(60); await game.unpress('sleep.wake');
    await expectState(game, 'mode', 'drive'); assert.equal(await game.page.locator('#sleep').count(), 0);
    assert.deepEqual(await game.errors(), []);
  } finally { await game.close(); }
});
