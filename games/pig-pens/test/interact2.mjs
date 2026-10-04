import { chromium } from 'playwright';
import fs from 'fs';
const exe = fs.readdirSync('/opt/pw-browsers').filter(d => d.startsWith('chromium-')).map(d => `/opt/pw-browsers/${d}/chrome-linux/chrome`).find(p => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
page.on('pageerror', e => console.log('pageerror', e.message));
await page.goto('file:///mnt/user-data/outputs/pig-pens.html');
await page.waitForFunction(() => window.piggies, null, { timeout: 60000 });
const box = await page.$eval('#tools', el => { const r = el.getBoundingClientRect(); return [r.left, r.right, r.width]; });
console.log('toolbar fits 390px:', box[0] >= 0 && box[1] <= 390, box.map(v => v.toFixed(0)).join(' '));
await page.tap('[data-tool="hose"]');
console.log('pressed', await page.$eval('[aria-pressed="true"][data-tool]', b => b.dataset.tool));
const [x, y] = await page.evaluate(() => { const p = piggies.sim.lay.pens[2]; const v = new piggies.THREE.Vector3(p.cx, 0, p.cz).project(piggies.camera); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; });
await page.mouse.move(x, y); await page.mouse.down();
for (let k = 0; k < 15; k++) { await page.mouse.move(x + k * 2, y); await page.waitForTimeout(60); }
console.log('hose active while held', await page.evaluate(() => piggies.sim.hose.active), 'bathers', await page.evaluate(() => piggies.sim.pigs.filter(p => p.state === 9).length));
await page.mouse.up(); await page.waitForTimeout(200);
console.log('hose active after release', await page.evaluate(() => piggies.sim.hose.active));
await browser.close();
