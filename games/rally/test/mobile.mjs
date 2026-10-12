// Touch controls on iPhones and iPads (spec R4): layout inside each device's safe area with no
// overlaps, thumb-reachable buttons, a floating steering slider that zeroes where the thumb lands,
// and gas/brake/handbrake buttons that work while steering (multi-touch). Plus the game screens
// (spec tracks T-26/T-27): title menu, the timed HUD, pause menu and results card fit each device.
// On lion-hawk/playwright (2c-rally R7): builds and serves the engine entry itself; Chromium from the Playwright cache.
// Run: node test/mobile.mjs [filter]   (SHOTS=dir to save screenshots; RALLY_ENTRY overrides the entry)
import fs from 'fs';
import { devices } from 'playwright-core';
import { launch, openGame, expectTappable } from 'lion-hawk/playwright';
import { serveRally } from './serve.mjs';

const SHOTS = process.env.SHOTS;
const only = process.argv[2];

// Safe areas Chromium can't emulate (env() is 0 here): the helpers inject them as --lh-sa-* vars (#31), set to each
// device's real insets. Notched iPhones in landscape lose 59 px each side and 21 px at the bottom (home bar); iPads
// 20 px at the bottom. Safari's back-swipe owns the first ~20 px from the left edge, so nothing that takes a drag may start there.
const NOTCH_L = { left: 59, right: 59, top: 0, bottom: 21 }, NOTCH_P = { left: 0, right: 0, top: 59, bottom: 34 };
const NONE = { left: 0, right: 0, top: 0, bottom: 0 }, IPAD = { left: 0, right: 0, top: 24, bottom: 20 };
const DEVICES = [
  ['iPhone SE landscape', 'iPhone SE landscape', NONE],
  ['iPhone 15 Pro landscape', 'iPhone 15 Pro landscape', NOTCH_L],
  ['iPhone 15 Pro Max landscape', 'iPhone 15 Pro Max landscape', NOTCH_L],
  ['iPhone 15 Pro portrait', 'iPhone 15 Pro', NOTCH_P],
  ['iPad Mini landscape', 'iPad Mini landscape', IPAD],
  ['iPad Pro 11 landscape', 'iPad Pro 11 landscape', IPAD],
  ['iPad Pro 11 portrait', 'iPad Pro 11', IPAD],
].map(([name, dev, safeArea]) => [name, { ...devices[dev], userAgent: undefined, safeArea }]);
const SWIPE_EDGE = 20, MIN_BTN = 56, MIN_TAP = 44; // px; Apple's minimum is 44 pt, racing thumbs want more

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`);
}
// An engine expect* helper as a named check (they throw on failure).
async function expectCheck(name, fn) { try { await fn(); check(name, true); } catch (e) { check(name, false, e.message); } }

const t0 = Date.now();
const chrome = await launch();
const site = await serveRally({ entry: process.env.RALLY_ENTRY ?? 'src/entry.js' }); // R8 switches the default to src/main.js
const SETTINGS = { mode: 'stage', seed: 'mobile12' };
// Each device on the test pad (?pad: straight into free drive; layout + touch behaviour), and on a
// stage through the title menu (menus, the timed HUD, pause and results).
try {
  for (const [name, dev] of DEVICES) for (const world of ['pad', 'stage']) {
    if (only && !name.includes(only)) continue;
    const sa = { l: dev.safeArea.left, r: dev.safeArea.right, t: dev.safeArea.top, b: dev.safeArea.bottom };
    console.log(`\n# ${name} (${dev.viewport.width}×${dev.viewport.height}), ${world}`);
    const game = await openGame(chrome.browser, site.url, { preset: dev, settings: { 'rally-sim-settings': { v: 4, ...SETTINGS } }, query: world === 'pad' ? { pad: '' } : {} });
    const page = game.page;
    const W = dev.viewport.width, H = dev.viewport.height;
    const shot = async (suffix, render = true) => {
      if (!SHOTS) return;
      fs.mkdirSync(SHOTS, { recursive: true });
      if (render) await game.render();
      await page.screenshot({ path: `${SHOTS}/${name.replace(/\W+/g, '-')}-${suffix}.png` });
    };

    const box = (sel) => page.evaluate((sel) => {
      const el = document.querySelector(sel); if (!el) return null;
      const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || r.width === 0) return null;
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    }, sel);
    const hits = (sel, b) => page.evaluate(([sel, x, y]) => document.querySelector(sel).contains(document.elementFromPoint(x, y)), [sel, b.x + b.w / 2, b.y + b.h / 2]);
    const inside = (b, pad = 0) => b.x >= sa.l + pad - 0.5 && b.y >= sa.t - 0.5 && b.x + b.w <= W - sa.r + 0.5 && b.y + b.h <= H - sa.b + 0.5;
    const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

    // A menu or card: inside the safe area, each button at least MIN_TAP and taking its own taps.
    const menuFits = async (label, panel, btns) => {
      const p = await box(panel);
      check(`${label} visible`, !!p); if (!p) return;
      check(`${label} inside the safe area`, inside(p), JSON.stringify({ x: p.x | 0, y: p.y | 0, w: p.w | 0, h: p.h | 0 }));
      for (const [sel, id] of btns) {
        const b = await box(sel);
        check(`${label} ${sel} visible`, !!b); if (!b) continue;
        check(`${label} ${sel} ≥ ${MIN_TAP}px tall and inside`, b.h >= MIN_TAP && inside(b) && b.y + b.h <= p.y + p.h + 0.5, `${b.w | 0}×${b.h | 0} at ${b.x | 0},${b.y | 0}`);
        check(`${label} ${sel} takes its own taps`, await hits(sel, b));
        await expectCheck(`${label} ${id} is tappable (engine helper)`, () => expectTappable(game, id, { min: MIN_TAP }));
      }
    };
    if (world === 'stage') {
      await menuFits('title', '#title', [['#driveBtn', 'title.drive'], ['#menuBtn', 'title.settings'], ['[data-title="mode:timeAttack"]', 'title.mode.timeAttack']]);
      await shot('title', false);
      await game.jump('stage', 'running', {}, { settings: SETTINGS });
      await page.evaluate(() => window.engine.debug.split(2, -0.42));
    }
    // Step a frame so the HUD reflects the state; ?lh-test keeps the sim frozen between steps.
    await game.step(1);

    // --- layout ---
    const buttons = { gas: '#gasBtn', brake: '#brakeBtn', handbrake: '#hbBtn' };
    const B = {};
    for (const [k, sel] of Object.entries(buttons)) {
      const b = B[k] = await box(sel);
      check(`${k} button visible`, !!b);
      if (!b) continue;
      check(`${k} button ≥ ${MIN_BTN}px`, Math.min(b.w, b.h) >= MIN_BTN, `${b.w.toFixed(0)}×${b.h.toFixed(0)}`);
      check(`${k} button inside the safe area`, inside(b), JSON.stringify({ x: b.x | 0, y: b.y | 0, r: (W - b.x - b.w) | 0, b: (H - b.y - b.h) | 0 }));
      check(`${k} button takes its own touches`, await hits(sel, b));
      check(`${k} button within right-thumb reach`, b.x + b.w / 2 > W * 0.55 && b.y + b.h / 2 > H * (W > H ? 0.3 : 0.5), `centre ${(b.x + b.w / 2) | 0},${(b.y + b.h / 2) | 0}`);
    }
    const keys = Object.keys(B).filter((k) => B[k]);
    let clash = '';
    for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) if (overlap(B[keys[i]], B[keys[j]])) clash += `${keys[i]}/${keys[j]} `;
    const others = { dash: '#dash', pause: '#pauseBtn', camera: '#camBtn', wheels: '#dbgBtn', reset: '#resetBtn', seed: '#seedChip', timer: '#timer', lapLine: '#lapLine', split: '#split' };
    const O = {};
    for (const [k, sel] of Object.entries(others)) {
      const b = O[k] = await box(sel); if (!b) continue;
      if (k !== 'dash') check(`${k} inside the safe area`, inside(b), JSON.stringify({ x: b.x | 0, y: b.y | 0 }));
      else check('dash inside the screen', b.x >= 0 && b.y >= 0 && b.x + b.w <= W && b.y + b.h <= H);
      for (const kb of keys) if (overlap(b, B[kb])) clash += `${k}/${kb} `;
    }
    const ok = Object.keys(O).filter((k) => O[k]);
    for (let i = 0; i < ok.length; i++) for (let j = i + 1; j < ok.length; j++) if (overlap(O[ok[i]], O[ok[j]])) clash += `${ok[i]}/${ok[j]} `;
    const steer = await box('#steerZone');
    check('steering zone present', !!steer);
    if (steer) {
      check('steering zone clear of the back-swipe edge and notch', steer.x >= Math.max(sa.l, SWIPE_EDGE) - 0.5, `starts at x=${steer.x | 0}`);
      check('steering zone covers the left of the screen', steer.w >= W * 0.3 && steer.h >= H * 0.35, `${steer.w | 0}×${steer.h | 0}`);
      for (const kb of keys) if (overlap(steer, B[kb])) clash += `steer/${kb} `;
    }
    check('no controls overlap', !clash, clash.trim());
    if (world === 'stage') check('timer shown in a timed run', !!O.timer);

    // --- behaviour: real multi-touch through CDP (the helper's touch.*) ---
    const out = async () => { await game.step(1); return page.evaluate(() => ({ ...window.engine.input.read() })); };
    if (world === 'pad' && steer && B.gas && B.brake) {
      // First touch anywhere in the zone: steering stays at zero, and the slider appears under it.
      const sx = steer.x + steer.w * 0.62, sy = steer.y + steer.h * 0.55;
      await game.touch.start(1, { x: sx, y: sy });
      let o = await out();
      check('first touch steers zero', Math.abs(o.steer) < 0.01, `steer ${o.steer.toFixed(3)}`);
      const base = await box('#steerBase');
      check('slider appears centred under the thumb', !!base && Math.abs(base.x + base.w / 2 - sx) < 2 && Math.abs(base.y + base.h / 2 - sy) < 2,
        base ? `centre ${(base.x + base.w / 2) | 0},${(base.y + base.h / 2) | 0} vs ${sx | 0},${sy | 0}` : 'hidden');
      // Relative from there: half the range right steers half right (negative = right in the sim).
      const range = Math.max(60, Math.min(110, W * 0.12));
      await game.touch.move(1, { x: sx + range / 2, y: sy + 30 });
      o = await out();
      check('drag right half the range ≈ half right (vertical ignored)', o.steer < -0.4 && o.steer > -0.6, `steer ${o.steer.toFixed(2)}`);
      await shot('steering');
      // Gas with the right thumb while steering.
      const gas = { x: B.gas.x + B.gas.w / 2, y: B.gas.y + B.gas.h / 2 };
      await game.touch.move(1, { x: sx - range * 2, y: sy });
      await game.touch.start(2, gas);
      o = await out();
      check('full left lock past the range', o.steer > 0.99, `steer ${o.steer.toFixed(2)}`);
      check('gas held while steering = full throttle', o.throttle > 0.99, `throttle ${o.throttle.toFixed(2)}`);
      await game.touch.end(2); // #32/#43: lists the lifting finger only
      o = await out();
      check('gas released → 0, steering still held', o.throttle === 0 && o.steer > 0.99, `throttle ${o.throttle} steer ${o.steer.toFixed(2)}`);
      const brake = { x: B.brake.x + B.brake.w / 2, y: B.brake.y + B.brake.h / 2 };
      await game.touch.start(3, brake);
      o = await out();
      check('brake held = full brake', o.brake > 0.99, `brake ${o.brake.toFixed(2)}`);
      // Sliding the thumb off a button keeps it pressed until it lifts (no accidental release).
      await game.touch.move(3, { x: brake.x, y: brake.y - B.brake.h });
      o = await out();
      check('brake stays on when the thumb slides off it', o.brake > 0.99, `brake ${o.brake.toFixed(2)}`);
      await game.touch.end(1, 3);
      o = await out();
      check('all released → steer 0, gas 0, brake 0', o.steer === 0 && o.throttle === 0 && o.brake === 0, JSON.stringify(o));
      check('slider hidden after lifting', !(await box('#steerBase')));
      // A second steering touch starts from zero again wherever it lands.
      await game.touch.start(4, { x: steer.x + steer.w * 0.3, y: steer.y + steer.h * 0.8 });
      o = await out();
      check('new touch re-zeroes', Math.abs(o.steer) < 0.01, `steer ${o.steer.toFixed(3)}`);
      // iOS can hide the page mid-touch without a cancel: everything lets go.
      await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
      o = await out();
      check('page hidden mid-touch releases everything', o.steer === 0 && o.throttle === 0 && o.brake === 0, JSON.stringify(o));
      await game.touch.end(4);
    }
    if (world === 'stage') {
      await shot('hud');
      await game.jump('stage', 'paused', {}, { settings: SETTINGS });
      await game.step(1);
      await menuFits('pause', '#pause', [['#resumeBtn', 'pause.resume'], ['#restartBtn', 'pause.restart'], ['#setBtn', 'pause.settings'], ['#quitBtn', 'pause.quit']]);
      check('touch controls hidden under the pause menu', !(await box('#gasBtn')));
      await game.jump('stage', 'results', {}, { settings: SETTINGS });
      await game.step(1);
      await menuFits('results', '#results', [['#retryBtn', 'results.retry'], ['#newSeedBtn', 'results.newSeed'], ['#menuBtn2', 'results.menu']]);
      const sp = await box('#resSplits');
      check('results splits visible', !!sp && sp.h >= 40, sp ? `${sp.w | 0}×${sp.h | 0}` : 'hidden');
      await shot('results', false);
    }
    const errors = await game.errors();
    check('no page errors', errors.length === 0, errors.map((e) => e.message ?? JSON.stringify(e)).join(' | '));
    await shot(world);
    await game.close();
  }
} finally { await chrome.close(); await site.close(); }
const fails = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - fails}/${results.length} passed (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
process.exit(fails ? 1 : 0);
