import { chromium } from 'playwright';
import fs from 'fs';
const exe = fs.readdirSync('/opt/pw-browsers').filter(d => d.startsWith('chromium-')).map(d => `/opt/pw-browsers/${d}/chrome-linux/chrome`).find(p => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
page.on('pageerror', e => console.log('pageerror', e.message));
await page.goto('file:///mnt/user-data/outputs/pig-pens.html');
await page.waitForFunction(() => window.piggies, null, { timeout: 60000 });
const proj = (x, y, z) => page.evaluate(([x, y, z]) => { const v = new piggies.THREE.Vector3(x, y, z).project(piggies.camera); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; }, [x, y, z]);
// Tool buttons hit-test (no overlay swallowing taps)
for (const t of ['feed', 'grab', 'look', 'shoo']) { await page.tap(`[data-tool="${t}"]`); }
console.log('pressed tool', await page.$eval('[aria-pressed="true"][data-tool]', b => b.dataset.tool));
// Shoo: drag across a pen
const pen = await page.evaluate(() => piggies.sim.lay.pens[1]);
let [x, y] = await proj(pen.cx, 0, pen.cz);
await page.mouse.move(x, y); await page.mouse.down();
for (let k = 0; k < 20; k++) { await page.mouse.move(x + k * 4, y + k * 2); await page.waitForTimeout(30); }
console.log('dog active while dragging', await page.evaluate(() => piggies.sim.dog.active), 'ring', await page.evaluate(() => true));
await page.mouse.up();
await page.waitForTimeout(1500);
console.log('dog active after release', await page.evaluate(() => piggies.sim.dog.active), 'dog pos', await page.evaluate(() => [piggies.sim.dog.x.toFixed(1), piggies.sim.dog.z.toFixed(1)]), 'target', pen.cx.toFixed(1), pen.cz.toFixed(1));
// Feed: tap ground
await page.tap('[data-tool="feed"]');
const p4 = await page.evaluate(() => piggies.sim.lay.pens[4]);
[x, y] = await proj(p4.cx, 0, p4.cz);
await page.touchscreen.tap(x, y);
await page.waitForTimeout(400);
console.log('foods after tap', await page.evaluate(() => piggies.sim.foods.map(f => f.kind + '@' + f.x.toFixed(1) + ',' + f.z.toFixed(1))));
await page.waitForTimeout(2500);
console.log('snackers', await page.evaluate(() => piggies.sim.pigs.filter(p => p.state === 6).length));
// Grab: press on a pig
await page.tap('[data-tool="grab"]');
await page.evaluate(() => piggies.pause(true));
const target = await page.evaluate(() => { const p = piggies.sim.pigs.find(p => !p.piglet && p.state !== 4); return { i: p.i, x: p.px, y: p.py, z: p.pz }; });
[x, y] = await proj(target.x, target.y, target.z);
await page.evaluate(() => piggies.pause(false));
await page.mouse.move(x, y); await page.mouse.down();
await page.waitForTimeout(500);
console.log('grabbed', await page.evaluate(() => piggies.sim.grabbed), 'expected', target.i, 'y', await page.evaluate(i => piggies.sim.pigs[i].py.toFixed(2), target.i));
for (let k = 0; k < 6; k++) { await page.mouse.move(x + k * 25, y - k * 10); await page.waitForTimeout(16); }
await page.mouse.up();
await page.waitForTimeout(100);
console.log('after release state', await page.evaluate(i => piggies.sim.pigs[i].state, target.i), '(8=AIR)');
await page.waitForTimeout(3500);
console.log('settled state', await page.evaluate(i => piggies.sim.pigs[i].state, target.i));
// fps estimate
const fps = await page.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(n / 2); }; requestAnimationFrame(f); }));
console.log('fps (swiftshader)', fps);
await page.screenshot({ path: '/home/claude/pigs/interact.png' });
await browser.close();
