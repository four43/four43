// Rally on the engine renderer (lion-hawk §4.6): one canvas (the page's #view), the scene drawn, no errors, #loading gone
// once the models are in, the car and its wheels drawn by view sync, and a bounded program count.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, openGame } from 'lion-hawk/playwright';
import { serveRally } from './serve.mjs';

let chrome, site, skip = false;
before(async () => {
  try { chrome = await launch(); } catch (e) { if (/no chromium found/.test(e.message)) { skip = e.message; return; } throw e; }
  site = await serveRally();
});
after(async () => { await chrome?.close(); await site?.close(); });

const CASES = [['pad', { v: 4, surface: 'gravel' }, { pad: '' }], ['snow pad', { v: 4, surface: 'snow' }, { pad: '' }],
  ['track', { v: 4, mode: 'freeDrive', world: 'loop', seed: 'r1' }, {}], ['winter track', { v: 4, mode: 'freeDrive', world: 'loop', seed: 'r1', theme: 'winter' }, {}]];
for (const [name, settings, query] of CASES) {
  test(`${name}: the engine renderer draws into #view, the car by view sync`, async t => {
    if (skip) return t.skip(skip);
    const game = await openGame(chrome.browser, site.url, { preset: 'desktop', seed: 5, settings: { 'rally-sim-settings': settings }, query });
    try {
      await game.page.waitForFunction(() => window.engine.settled(), null, { timeout: 60000 });
      await game.render();
      const r = await game.page.evaluate(() => ({ canvases: document.querySelectorAll('canvas').length,
        drawn: (() => { const c = document.getElementById('view'); return c.width > 0 && c.height > 0; })(),
        loading: !!document.getElementById('loading'), car: window.__rallyView.car(), info: window.__rallyView.info() }));
      assert.deepEqual({ canvases: r.canvases, drawn: r.drawn, loading: r.loading }, { canvases: 1, drawn: true, loading: false });
      assert.equal(r.car?.wheels, 4, `the car and its four wheels are drawn by view sync (${JSON.stringify(r.car)})`);
      assert.ok(r.info.calls > 0, `draw calls ${r.info.calls}`);
      assert.ok(r.info.programs > 0 && r.info.programs <= Number(process.env.RALLY_PROGRAMS_MAX ?? 16), `programs ${r.info.programs}`);
      assert.deepEqual(await game.errors(), []);
    } finally { await game.close(); }
  });
}
