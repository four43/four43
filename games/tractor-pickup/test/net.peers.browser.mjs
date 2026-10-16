// R5 (b) (3l Task 26): two real pages over the Node bridge (lion-hawk/playwright peers()). Each page's World holds the other's train as
// a solid dynamic body; driven head-on, the tractors stop each other and each page honks exactly once. npm run test:peers
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, peers } from 'lion-hawk/playwright';
import { serveTractor } from './serve.mjs';

let chrome = null, site = null, skip = null;
before(async () => { try { chrome = await launch(); } catch (e) { if (/no chromium found/.test(e.message)) { skip = e.message; return; } throw e; } site = await serveTractor(); });
after(async () => { await chrome?.close(); await site?.close(); });

test('two pages: solid trains meet head-on; each page honks once and holds the other train as a dynamic body (M-7, R5)', async t => {
  if (skip) return t.skip(skip);
  const room = await peers(chrome.browser, site.url, 2, { render: 'manual', argsOf: i => i ? { seed: 5, started: true } : { seed: 21, started: true } });
  try {
    const [host, guest] = room.games;
    await room.step(120);
    const other = (g, n) => g.page.evaluate(n => { const e = window.engine.debug.game.world.net.find('train', n); return e?.body ? { dynamic: e.body.isDynamic(), cars: !!(e.trailer?.body && e.wagon?.body) } : null; }, n);
    assert.deepEqual(await other(host, 2), { dynamic: true, cars: true }, 'the host holds the guest train');
    assert.deepEqual(await other(guest, 1), { dynamic: true, cars: true }, 'the guest holds the host train');
    const h = await host.page.evaluate(() => { const t = window.engine.debug.game.tractor; return { x: t.x, z: t.z, yaw: t.yaw }; });
    await guest.page.evaluate(h => window.engine.debug.trainAt(h.x + Math.sin(h.yaw) * 14, h.z + Math.cos(h.yaw) * 14, h.yaw + Math.PI), h);
    await room.step(60);
    const bumps = g => g.page.evaluate(() => window.engine.events.since(0).filter(e => e.type === 'bump').length), b0 = [await bumps(host), await bumps(guest)];
    for (const g of [host, guest]) await g.page.evaluate(() => window.engine.debug.drive({ thr: 0.7, steer: 0, horn: false }));
    await room.step(300);
    assert.equal(await bumps(host) - b0[0], 1, 'the host honks once'); assert.equal(await bumps(guest) - b0[1], 1, 'the guest honks once');
    const d = await host.page.evaluate(() => { const a = window.engine.debug.game.tractor, e = window.engine.debug.game.world.net.find('train', 2).body.translation(); return Math.hypot(a.x - e.x, a.z - e.z); });
    assert.ok(d > 2.5, `they did not pass through each other (${d.toFixed(2)} m)`);
    assert.deepEqual(await host.errors(), []); assert.deepEqual(await guest.errors(), []);
  } finally { await room.close(); }
});
