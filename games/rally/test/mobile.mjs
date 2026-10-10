// Touch controls on iPhones and iPads (spec R4): layout inside each device's safe area with no
// overlaps, thumb-reachable buttons, a floating steering slider that zeroes where the thumb lands,
// and gas/brake/handbrake buttons that work while steering (multi-touch).
// Needs the dev server (npm run dev) or URL=… ; Chromium from the Playwright cache.
// Run: node test/mobile.mjs [filter]   (SHOTS=dir to save screenshots)
import { chromium, devices } from 'playwright-core';
import fs from 'fs';
import os from 'os';

const URL = process.env.URL || 'http://localhost:8740/';
const SHOTS = process.env.SHOTS;
const only = process.argv[2];
const cache = `${os.homedir()}/.cache/ms-playwright`;
const chromeDir = fs.readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort().at(-1);
const executablePath = `${cache}/${chromeDir}/chrome-linux64/chrome`;

// Safe areas Chromium can't emulate (env() is 0 here): the page reads them through --sa-* vars,
// which the test sets to each device's real insets. Notched iPhones in landscape lose 59 px each
// side and 21 px at the bottom (home bar); iPads 20 px at the bottom. Safari's back-swipe owns
// the first ~20 px from the left edge, so nothing that takes a drag may start there.
const NOTCH_L = { l: 59, r: 59, t: 0, b: 21 }, NOTCH_P = { l: 0, r: 0, t: 59, b: 34 };
const DEVICES = [
  ['iPhone SE landscape', devices['iPhone SE landscape'], { l: 0, r: 0, t: 0, b: 0 }],
  ['iPhone 15 Pro landscape', devices['iPhone 15 Pro landscape'], NOTCH_L],
  ['iPhone 15 Pro Max landscape', devices['iPhone 15 Pro Max landscape'], NOTCH_L],
  ['iPhone 15 Pro portrait', devices['iPhone 15 Pro'], NOTCH_P],
  ['iPad Mini landscape', devices['iPad Mini landscape'], { l: 0, r: 0, t: 24, b: 20 }],
  ['iPad Pro 11 landscape', devices['iPad Pro 11 landscape'], { l: 0, r: 0, t: 24, b: 20 }],
  ['iPad Pro 11 portrait', devices['iPad Pro 11'], { l: 0, r: 0, t: 24, b: 20 }],
];
const SWIPE_EDGE = 20, MIN_BTN = 56; // px; Apple's minimum is 44 pt, racing thumbs want more

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`);
}

const browser = await chromium.launch({ executablePath, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
// Each device on the test pad (layout + behaviour) and on a track (layout: the seed chip joins the top bar).
for (const [name, dev, sa] of DEVICES) for (const world of ['pad', 'loop']) {
  if (only && !name.includes(only)) continue;
  console.log(`\n# ${name} (${dev.viewport.width}×${dev.viewport.height}), ${world}`);
  const ctx = await browser.newContext({ ...dev, userAgent: undefined });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript((world) => { try { localStorage.setItem('rally-sim-settings', JSON.stringify({ v: 3, world, seed: 'mobile12' })); } catch {} }, world);
  await page.goto(URL);
  await page.waitForFunction('window.rally', null, { timeout: 60000 });
  await page.evaluate((sa) => {
    for (const [k, v] of Object.entries(sa)) document.documentElement.style.setProperty(`--sa-${k}`, `${v}px`);
    rally.pause();
  }, sa);
  await page.waitForTimeout(100);
  const W = dev.viewport.width, H = dev.viewport.height;

  const box = (sel) => page.evaluate((sel) => {
    const el = document.querySelector(sel); if (!el) return null;
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || r.width === 0) return null;
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }, sel);
  const hits = (sel, b) => page.evaluate(([sel, x, y]) => document.querySelector(sel).contains(document.elementFromPoint(x, y)), [sel, b.x + b.w / 2, b.y + b.h / 2]);
  const inside = (b, pad = 0) => b.x >= sa.l + pad - 0.5 && b.y >= sa.t - 0.5 && b.x + b.w <= W - sa.r + 0.5 && b.y + b.h <= H - sa.b + 0.5;
  const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

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
  const others = { dash: '#dash', settings: '#menuBtn', camera: '#camBtn', wheels: '#dbgBtn', reset: '#resetBtn', seed: '#seedChip' };
  const O = {};
  for (const [k, sel] of Object.entries(others)) {
    const b = O[k] = await box(sel); if (!b) continue;
    if (k !== 'dash') check(`${k} chip inside the safe area`, inside(b), JSON.stringify({ x: b.x | 0, y: b.y | 0 }));
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

  // --- behaviour: real multi-touch through CDP ---
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y, id]) => ({ x, y, id, radiusX: 8, radiusY: 8, force: 1 })) });
  const frame = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const out = async () => { await frame(); return page.evaluate(() => ({ ...rally.controls.update(1 / 60) })); };
  if (world === 'pad' && steer && B.gas && B.brake) {
    // First touch anywhere in the zone: steering stays at zero, and the slider appears under it.
    const sx = steer.x + steer.w * 0.62, sy = steer.y + steer.h * 0.55;
    await touch('touchStart', [[sx, sy, 1]]);
    let o = await out();
    check('first touch steers zero', Math.abs(o.steer) < 0.01, `steer ${o.steer.toFixed(3)}`);
    const base = await box('#steerBase');
    check('slider appears centred under the thumb', !!base && Math.abs(base.x + base.w / 2 - sx) < 2 && Math.abs(base.y + base.h / 2 - sy) < 2,
      base ? `centre ${(base.x + base.w / 2) | 0},${(base.y + base.h / 2) | 0} vs ${sx | 0},${sy | 0}` : 'hidden');
    // Relative from there: half the range right steers half right (negative = right in the sim).
    const range = await page.evaluate(() => rally.controls.steerRange());
    await touch('touchMove', [[sx + range / 2, sy + 30, 1]]);
    o = await out();
    check('drag right half the range ≈ half right (vertical ignored)', o.steer < -0.4 && o.steer > -0.6, `steer ${o.steer.toFixed(2)}`);
    if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.evaluate(() => rally.render()); await page.screenshot({ path: `${SHOTS}/${name.replace(/\W+/g, '-')}-steering.png` }); }
    // Gas with the right thumb while steering.
    const gx = B.gas.x + B.gas.w / 2, gy = B.gas.y + B.gas.h / 2;
    await touch('touchMove', [[sx - range * 2, sy, 1], [gx, gy, 2]]);
    await touch('touchStart', [[sx - range * 2, sy, 1], [gx, gy, 2]]);
    o = await out();
    check('full left lock past the range', o.steer > 0.99, `steer ${o.steer.toFixed(2)}`);
    check('gas held while steering = full throttle', o.throttle > 0.99, `throttle ${o.throttle.toFixed(2)}`);
    await touch('touchEnd', [[gx, gy, 2]]); // CDP: touchEnd lists the points that lift
    o = await out();
    check('gas released → 0, steering still held', o.throttle === 0 && o.steer > 0.99, `throttle ${o.throttle} steer ${o.steer.toFixed(2)}`);
    const bx = B.brake.x + B.brake.w / 2, by = B.brake.y + B.brake.h / 2;
    await touch('touchStart', [[sx - range * 2, sy, 1], [bx, by, 3]]);
    o = await out();
    check('brake held = full brake', o.brake > 0.99, `brake ${o.brake.toFixed(2)}`);
    // Sliding the thumb off a button keeps it pressed until it lifts (no accidental release).
    await touch('touchMove', [[sx - range * 2, sy, 1], [bx, by - B.brake.h, 3]]);
    o = await out();
    check('brake stays on when the thumb slides off it', o.brake > 0.99, `brake ${o.brake.toFixed(2)}`);
    await touch('touchEnd', []);
    o = await out();
    check('all released → steer 0, gas 0, brake 0', o.steer === 0 && o.throttle === 0 && o.brake === 0, JSON.stringify(o));
    check('slider hidden after lifting', !(await box('#steerBase')));
    // A second steering touch starts from zero again wherever it lands.
    await touch('touchStart', [[steer.x + steer.w * 0.3, steer.y + steer.h * 0.8, 4]]);
    o = await out();
    check('new touch re-zeroes', Math.abs(o.steer) < 0.01, `steer ${o.steer.toFixed(3)}`);
    // iOS can hide the page mid-touch without a cancel: everything lets go.
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    o = await out();
    check('page hidden mid-touch releases everything', o.steer === 0 && o.throttle === 0 && o.brake === 0, JSON.stringify(o));
    await touch('touchEnd', []);
  }
  check('no page errors', errors.length === 0, errors.join(' | '));
  if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.evaluate(() => rally.render()); await page.screenshot({ path: `${SHOTS}/${name.replace(/\W+/g, '-')}-${world}.png` }); }
  await ctx.close();
}
await browser.close();
const fails = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - fails}/${results.length} passed`);
process.exit(fails ? 1 : 0);
