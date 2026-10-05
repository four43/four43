import { chromium } from 'playwright';
import fs from 'fs';
const exe = fs.readdirSync('/opt/pw-browsers').filter(d => d.startsWith('chromium-')).map(d => `/opt/pw-browsers/${d}/chrome-linux/chrome`).find(p => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
page.on('pageerror', e => console.log('pageerror', e.message));
await page.goto('file:///mnt/user-data/outputs/pig-pens.html');
await page.waitForFunction(() => window.piggies, null, { timeout: 60000 });
await page.evaluate(() => piggies.pause(true));
const scr = (x, y, z) => page.evaluate(([x, y, z]) => { const v = new piggies.THREE.Vector3(x, y, z).project(piggies.camera); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; }, [x, y, z]);
const tapAt = async (x, y) => { await page.mouse.move(x, y); await page.mouse.down(); await page.waitForTimeout(60); await page.mouse.up(); await page.waitForTimeout(60); };
const look = (o) => page.evaluate(o => { Object.assign(piggies.cam, o); piggies.render(); }, o);
const bb = await page.$eval('#tools', el => { const r = el.getBoundingClientRect(); return [r.left, r.right]; });
console.log('toolbar within 390px', bb[0] >= 0 && bb[1] <= 390, bb.map(Math.round).join('-'));
// 1. tap a pig -> card
let p = await page.evaluate(() => { const p = piggies.sim.pigs[2]; return [p.px, p.py, p.pz]; });
await look({ tx: p[0], tz: p[2], dist: 9, pitch: 0.7 });
await tapAt(...await scr(p[0], p[1] + 0.2, p[2]));
console.log('pig card:', await page.$eval('#card', e => e.hidden ? 'hidden' : e.querySelector('#cardName').textContent + ' / ' + e.querySelector('#cardDoing').textContent));
// 2. tap a hen -> card with rank
const h = await page.evaluate(() => { const b = piggies.sim.flock.birds.find(b => b.kind === 'hen' && !b.hidden); return [b.px, b.py, b.pz]; });
await look({ tx: h[0], tz: h[2], dist: 6, pitch: 0.8 });
await tapAt(...await scr(h[0], h[1] + 0.1, h[2]));
console.log('hen card:', await page.$eval('#card', e => e.hidden ? 'hidden' : e.querySelector('#cardName').textContent + ' / ' + e.querySelector('#cardSub').textContent));
// 3. tap a gate -> toggles shut
const g = await page.evaluate(() => { const g = piggies.sim.lay.gates[1]; return [g.x, g.z, g.open]; });
await look({ tx: g[0], tz: g[1], dist: 9, pitch: 0.9 });
await tapAt(...await scr(g[0], 0, g[1]));
console.log('gate 1 open before', g[2], 'after', await page.evaluate(() => piggies.sim.lay.gates[1].open));
// 4. coop door
const c = await page.evaluate(() => { const c = piggies.sim.lay.coop; return [c.doorX, c.z + c.hz + 0.5, c.open]; });
await look({ tx: c[0], tz: c[1], dist: 8, pitch: 0.75, yaw: 0 });
await tapAt(...await scr(c[0], 0, c[1]));
console.log('coop door open before', c[2], 'after', await page.evaluate(() => piggies.sim.lay.coop.open));
// 5. eggs: lay one and collect it
await page.evaluate(() => { const F = piggies.sim.flock; F.eggs.push({ id: 999, nest: 1, x: piggies.sim.lay.nests[1].x, y: 0.06, z: piggies.sim.lay.nests[1].z, age: 0, layer: 1, hatch: 0, brooder: -1 }); });
const e = await page.evaluate(() => { const n = piggies.sim.lay.nests[1]; return [n.x, n.z]; });
await look({ tx: e[0], tz: e[1] + 1, dist: 5, pitch: 0.7, yaw: 0 });
await tapAt(...await scr(e[0], 0.12, e[1]));
console.log('egg basket', await page.evaluate(() => piggies.sim.flock.basket), 'eggs left', await page.evaluate(() => piggies.sim.flock.eggs.length));
// 6. long-press the tractor -> drive mode; drive a bit with the stick
const t = await page.evaluate(() => [piggies.sim.tractor.x, piggies.sim.tractor.z]);
await look({ tx: t[0], tz: t[1], dist: 14, pitch: 0.7, yaw: 0.5 });
const [tx, ty] = await scr(t[0], 1.2, t[1]);
await page.evaluate(() => piggies.pause(false));
await page.mouse.move(tx, ty); await page.mouse.down(); await page.waitForTimeout(1300); await page.mouse.up();
console.log('driving after hold', await page.evaluate(() => piggies.driving), 'toolbar hidden', await page.$eval('#tools', e => getComputedStyle(e).display === 'none'));
const sb = await page.$eval('#stick', e => { const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
await page.mouse.move(sb[0], sb[1]); await page.mouse.down(); await page.mouse.move(sb[0], sb[1] - 60, { steps: 4 });
await page.waitForTimeout(2500);
console.log('stick forward: tractor speed', await page.evaluate(() => piggies.sim.tractor.speed.toFixed(2)), 'thr', await page.evaluate(() => piggies.sim.tractor.inThr.toFixed(2)));
await page.mouse.up();
await page.tap('#exit'); await page.waitForTimeout(100);
console.log('after Get out: driving', await page.evaluate(() => piggies.driving), 'toolbar', await page.$eval('#tools', e => getComputedStyle(e).display));
// 7. grain in the run
await page.tap('[data-tool="feed"]');
const r = await page.evaluate(() => { const r = piggies.sim.lay.run; return [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2]; });
await look({ tx: r[0], tz: r[1], dist: 14, pitch: 0.8, yaw: 0 });
await tapAt(...await scr(r[0], 0, r[1]));
console.log('handfuls of grain', await page.evaluate(() => piggies.sim.flock.handfuls.length), 'snacks', await page.evaluate(() => piggies.sim.foods.length));
await page.waitForTimeout(3000);
console.log('birds going for grain', await page.evaluate(() => piggies.sim.flock.birds.filter(b => b.state === 2).length));
// 8. grab a chicken
await page.tap('[data-tool="grab"]');
await page.evaluate(() => piggies.pause(true));
const hb = await page.evaluate(() => { const b = piggies.sim.flock.birds.find(b => !b.hidden && b.enabled); return [b.i, b.px, b.py, b.pz]; });
await look({ tx: hb[1], tz: hb[3], dist: 6, pitch: 0.8 });
const [bx, by] = await scr(hb[1], hb[2] + 0.1, hb[3]);
await page.evaluate(() => piggies.pause(false));
await page.mouse.move(bx, by); await page.mouse.down(); await page.waitForTimeout(400);
console.log('grabbed bird', await page.evaluate(() => piggies.sim.flock.grabbed), 'expected', hb[0]);
await page.mouse.up();
await page.screenshot({ path: '/home/claude/pigs/interact3.png' });
await browser.close();
