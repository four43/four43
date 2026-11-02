// Real-Chromium smoke flows on the built page. Run: npm run test:e2e (one browser suite at a time, under a memory cap).
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openGame, expectScene } from 'lion-hawk/playwright';
import { serveHarvest } from './serve.mjs';
import { ZONES, FIELDS, YARD, BACKYARD } from '../src/sim/layout.js';

// a save driving the combine (the flows that test the grain fields start from it)
const COMBINE = { v: 4, owned: { mower: true, combine: true }, active: 'combine' };
const frames = game => game.page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
let chrome, site, skip = false;
before(async () => {
  try { chrome = await launch(); } catch (e) { if (/no chromium found/.test(e.message)) { skip = e.message; return; } throw e; }
  site = await serveHarvest();
});
after(async () => { await chrome?.close(); await site?.close(); });

test('desktop: a new farm boots into the mower by the compost bins; W drives it away from the camera, onto the lawn', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, site.url, { preset: 'desktop' });
  try {
    await expectScene(game, 'farm');
    assert.ok(await game.page.evaluate(() => !!document.querySelector('[data-testid=coins]')), 'the coin counter is up');
    const s0 = await game.state(); assert.equal(s0.vehicle, 'mower');
    await game.page.keyboard.down('w'); await frames(game); await game.step(240); await game.page.keyboard.up('w');
    const s = await game.state();
    assert.ok(s.combine.x < s0.combine.x - 3, `drove west, onto the lawn (x ${s0.combine.x} → ${s.combine.x})`);
    assert.ok(s.load.n > 0, 'it mowed');
    console.log('shot', await game.shot('drive'));
    assert.deepEqual(await game.errors(), []);
  } finally { await game.close(); }
});

test('desktop: the barn opens the workshop card; Buy spends coins', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, site.url, { preset: 'desktop', args: { coins: 5000 } });
  try {
    await game.page.evaluate(([x, z]) => {
      const r = window.engine.debug.rig, p = r.c.body.translation(), dx = x - p.x, dz = z - p.z;
      for (const b of [r.c.body, ...r.train.carts.map(c => c.body)]) { const t = b.translation(); b.setTranslation({ x: t.x + dx, y: t.y, z: t.z + dz }, true); }
    }, [ZONES.shop.x, ZONES.shop.z]);
    await game.step(20); await frames(game);
    assert.ok(await game.page.evaluate(() => !!document.getElementById('shop')), 'the card is drawn');
    await game.page.click('[data-testid="shop.speed"]'); await game.step(3); await frames(game);
    const s = await game.state();
    assert.equal(s.levels.speed, 1); assert.ok(s.coins < 5000);
    console.log('shot', await game.shot('shop'));
    assert.deepEqual(await game.errors(), []);
  } finally { await game.close(); }
});

test('desktop: cutting wheat blows grain into the wagon; the wagon unloads over the silo pit', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, site.url, { preset: 'desktop', args: { progress: COMBINE } });
  const move = (x, z) => game.page.evaluate(([x, z]) => {
    const r = window.engine.debug.rig, p = r.c.body.translation(), dx = x - p.x, dz = z - p.z;
    for (const b of [r.c.body, ...r.train.carts.map(c => c.body)]) { const t = b.translation(); b.setTranslation({ x: t.x + dx, y: t.y, z: t.z + dz }, true); b.setLinvel({ x: 0, y: 0, z: 0 }, true); }
  }, [x, z]);
  try {
    await game.page.evaluate(() => window.engine.debug.drive({ thr: 1, steer: 0 }));
    await game.step(60 * 9); await frames(game);
    const s = await game.state();
    assert.ok(s.load.n > 60, `cut ${s.load.n}`);
    console.log('shot', await game.shot('cutting'));
    await game.page.evaluate(() => window.engine.debug.drive({ thr: 0, steer: 0 })); await game.step(90);
    const off = await game.page.evaluate(() => { const r = window.engine.debug.rig, p = r.c.body.translation(), q = r.train.carts[0].body.translation(); return [p.x - q.x, p.z - q.z]; });
    await move(ZONES.sell.x + off[0], ZONES.sell.z + off[1]); await game.step(10); for (let k = 0; k < 20; k++) await frames(game);
    assert.ok((await game.state()).selling, 'the wagon is over the pit');
    console.log('shot', await game.shot('selling'));
    await game.step(60 * 5);
    const sold = await game.state();
    assert.equal(sold.load.n, 0); assert.ok(sold.coins > 60);
    assert.deepEqual(await game.errors(), []);
  } finally { await game.close(); }
});

for (const preset of ['iPhone 15 Pro portrait', 'iPad Pro 11 landscape']) test(`${preset}: the workshop card fits; a fully upgraded rig harvests`, async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, site.url, { preset, args: { progress: COMBINE, coins: 1e6 } });
  try {
    await game.page.evaluate(([x, z]) => {
      const r = window.engine.debug.rig, p = r.c.body.translation(), dx = x - p.x, dz = z - p.z;
      for (const b of [r.c.body, ...r.train.carts.map(c => c.body)]) { const t = b.translation(); b.setTranslation({ x: t.x + dx, y: t.y, z: t.z + dz }, true); }
    }, [ZONES.shop.x, ZONES.shop.z]);
    await game.step(20); await frames(game);
    const box = await game.page.evaluate(() => { const r = document.getElementById('shop').getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: innerWidth, h: innerHeight }; });
    assert.ok(box.l >= 0 && box.t >= 0 && box.r <= box.w && box.b <= box.h, `the card is on screen ${JSON.stringify(box)}`);
    const out = await game.page.evaluate(() => { const c = document.getElementById('shop').getBoundingClientRect(); return [...document.querySelectorAll('#shop .hv-buy')].filter(b => b.getBoundingClientRect().right > c.right + 1).length; });
    assert.equal(out, 0, 'every buy button is inside the card');
    console.log('shot', await game.shot('shop'));
    for (let k = 0; k < 8; k++) for (const what of ['speed', 'width', 'bins', 'carts', 'blades']) await game.command('buy', { what });
    await game.step(5);
    const s = await game.state(); assert.equal(s.carts, 5); assert.equal(s.levels.width, 5);
    await game.page.evaluate(() => { const r = window.engine.debug.rig, p = r.c.body.translation(), dz = 18 - p.z, dx = -p.x;
      for (const b of [r.c.body, ...r.train.carts.map(c => c.body)]) { const t = b.translation(); b.setTranslation({ x: t.x + dx, y: t.y, z: t.z + dz }, true); }
      window.engine.debug.drive({ thr: 1, steer: 0 }); });
    await game.step(60 * 5); await frames(game);
    console.log('shot', await game.shot('upgraded'));
    assert.ok((await game.state()).load.n > 100);
    assert.deepEqual(await game.errors(), []);
  } finally { await game.close(); }
});

test('desktop: corn is too tough for blunt blades; Blades 1 unlocks it with a banner; a field done says so', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, site.url, { preset: 'desktop', args: { progress: COMBINE, coins: 20000 } });
  const place = (x, z, yaw) => game.page.evaluate(([x, z, yaw]) => {
    const r = window.engine.debug.rig, p = r.c.body.translation(), c = Math.cos(yaw - r.c.yaw), s = Math.sin(yaw - r.c.yaw), h = (yaw - r.c.yaw) / 2;
    for (const b of [r.c.body, ...r.train.carts.map(k => k.body)]) {
      const t = b.translation(), ox = t.x - p.x, oz = t.z - p.z, o = b.rotation(), qy = Math.sin(h), qw = Math.cos(h);
      b.setTranslation({ x: x + ox * c + oz * s, y: t.y, z: z - ox * s + oz * c }, true);
      b.setRotation({ x: qw * o.x + qy * o.z, y: qw * o.y + qy * o.w, z: qw * o.z - qy * o.x, w: qw * o.w - qy * o.y }, true);
      b.setLinvel({ x: 0, y: 0, z: 0 }, true); b.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
  }, [x, z, yaw]);
  try {
    // the barn from the yard, heading south toward its doorway
    await place(ZONES.shop.x, ZONES.shop.z + 22, Math.PI); await game.step(20); for (let k = 0; k < 40; k++) await frames(game);
    console.log('shot', await game.shot('barn'));
    // blunt blades: into the corn, nothing cuts, the hint says what is needed
    await place(FIELDS.corn.x0 - 6, 4, Math.PI / 2); // down the lane, clear of the corn sign
    await game.page.evaluate(() => window.engine.debug.drive({ thr: 1, steer: 0 })); await game.step(60 * 5); await frames(game);
    let c = await game.state(); assert.equal(c.blocked, 'corn'); assert.equal(c.load.n, 0);
    assert.ok(await game.page.evaluate(() => !document.querySelector('.hv-tip').hidden), 'the too-tough hint is up');
    console.log('shot', await game.shot('corn-blunt'));
    await game.command('buy', { what: 'blades' }); await game.step(2); await frames(game);
    assert.ok(await game.page.evaluate(() => !document.querySelector('.hv-done').hidden), 'the unlocked banner is up');
    await game.step(60 * 3); for (let k = 0; k < 10; k++) await frames(game);
    c = await game.state(); assert.equal(c.levels.blades, 1); assert.equal(c.blocked, null); assert.ok(c.load.bins[0][2] === 'corn' && c.load.n > 10, JSON.stringify(c.load));
    console.log('shot', await game.shot('corn'));
    // the wheat cut down to its last cells: done
    await game.page.evaluate(() => { const f = window.engine.debug.farm.fields.byId.wheat; for (let c = 0; c < f.total - 10; c++) f.grow[c] = 0; f.ripe = 10; f.version++; });
    await game.step(5); assert.equal((await game.state()).done.wheat, true);
    assert.deepEqual(await game.errors(), []);
  } finally { await game.close(); }
});

test('desktop: the mower\'s day: mow the lawn, tip the clippings at the compost bins, buy the combine in the garage', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, site.url, { preset: 'desktop', args: { coins: 8000 } });
  const move = (x, z) => game.page.evaluate(([x, z]) => {
    const r = window.engine.debug.rig, p = r.c.body.translation(), dx = x - p.x, dz = z - p.z;
    for (const b of [r.c.body, ...r.train.carts.map(c => c.body)]) { const t = b.translation(); b.setTranslation({ x: t.x + dx, y: t.y, z: t.z + dz }, true); b.setLinvel({ x: 0, y: 0, z: 0 }, true); }
  }, [x, z]);
  try {
    await game.page.evaluate(() => window.engine.debug.drive({ thr: 1, steer: 0 }));
    await game.step(60 * 6); for (let k = 0; k < 10; k++) await frames(game);
    let s = await game.state(); assert.equal(s.vehicle, 'mower'); assert.ok(s.load.n > 20, `mowed ${s.load.n}`);
    console.log('shot', await game.shot('mowing'));
    await game.page.evaluate(() => window.engine.debug.drive({ thr: 0, steer: 0 })); await game.step(30);
    await move(ZONES.compost.x, ZONES.compost.z); await game.step(10); for (let k = 0; k < 10; k++) await frames(game);
    assert.ok((await game.state()).selling, 'the catcher is over the compost');
    console.log('shot', await game.shot('compost'));
    await game.step(60 * 3);
    s = await game.state(); assert.equal(s.load.n, 0); assert.ok(s.coins > 8000);
    await move(ZONES.garage.x, ZONES.garage.z); await game.step(20); for (let k = 0; k < 10; k++) await frames(game);
    assert.ok(await game.page.evaluate(() => !!document.querySelector('[data-testid="shop.veh.combine"]')), 'the garage card offers the combine');
    console.log('shot', await game.shot('shop-vehicles'));
    await game.page.click('[data-testid="shop.veh.combine"]'); await game.step(30); for (let k = 0; k < 20; k++) await frames(game);
    s = await game.state(); assert.equal(s.vehicle, 'combine'); assert.equal(s.owned.combine, true);
    assert.ok(Math.hypot(s.combine.x - YARD.start.x, s.combine.z - YARD.start.z) < 1.5, 'the combine starts at its home in the yard');
    assert.ok(await game.page.evaluate(() => !document.getElementById('shop')), 'out of the garage, the card is closed');
    console.log('shot', await game.shot('combine-bought'));
    assert.deepEqual(await game.errors(), []);
  } finally { await game.close(); }
});

test('desktop: the backyard: the start, the garage, and from the gate the farmhouse, the fence and the shut gate', async t => {
  if (skip) return t.skip(skip);
  const game = await openGame(chrome.browser, site.url, { preset: 'desktop' });
  const put = (x, z, yaw) => game.page.evaluate(([x, z, yaw]) => {
    const r = window.engine.debug.rig, p = r.c.body.translation();
    r.c.body.setTranslation({ x, y: p.y, z }, true); r.c.body.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
  }, [x, z, yaw]);
  try {
    await game.step(10); for (let k = 0; k < 20; k++) await frames(game);
    console.log('shot', await game.shot('start'));
    await put(ZONES.garage.x - 8, ZONES.garage.z, Math.PI / 2); await game.step(20); for (let k = 0; k < 30; k++) await frames(game); // west of the garage, facing east
    console.log('shot', await game.shot('garage'));
    await game.page.evaluate(([x, z]) => {
      const r = window.engine.debug.rig, p = r.c.body.translation(), q = { x: 0, y: 1, z: 0, w: 0 }; // turned to face south
      r.c.body.setTranslation({ x, y: p.y, z }, true); r.c.body.setRotation(q, true);
    }, [BACKYARD.gate.x + 3, BACKYARD.fence - 3]);
    await game.step(30); for (let k = 0; k < 30; k++) await frames(game);
    console.log('shot', await game.shot('backyard'));
    assert.deepEqual(await game.errors(), []);
  } finally { await game.close(); }
});
