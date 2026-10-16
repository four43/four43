// The built game plays offline after the first visit (§8 R3): lion-hawk build into build/offline/, served; the service
// worker precaches the page, the PWA files and assets/models/*; offline, a reload boots, loads the models and settles.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'lion-hawk/build';
import { launch } from 'lion-hawk/playwright';
import { serveDir } from './serve.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), out = path.join(root, 'build/offline');
let chrome, site, skip = false;
before(async () => {
  try { chrome = await launch(); } catch (e) { if (/no chromium found/.test(e.message)) { skip = e.message; return; } throw e; }
  await build({ game: root, out, log: () => {} });
  site = await serveDir(out);
});
after(async () => { await chrome?.close(); await site?.close(); });

test('offline after the first visit: the page boots, the models load and the scene settles', async t => {
  if (skip) return t.skip(skip);
  const ctx = await chrome.browser.newContext({ viewport: { width: 1280, height: 720 } });
  try {
    const page = await ctx.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(site.url + '?pad');
    await page.waitForFunction(() => window.engine?.settled?.() === true, null, { timeout: 60000 });
    await page.waitForFunction(() => navigator.serviceWorker?.controller || navigator.serviceWorker.ready.then(() => true), null, { timeout: 30000 });
    await page.evaluate(() => navigator.serviceWorker.ready);
    await ctx.setOffline(true);
    await page.reload();
    await page.waitForFunction(() => window.engine?.settled?.() === true, null, { timeout: 60000 });
    const r = await page.evaluate(() => ({ loading: !!document.getElementById('loading'), car: window.__rallyView?.car()?.wheels }));
    assert.deepEqual(r, { loading: false, car: 4 });
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});
