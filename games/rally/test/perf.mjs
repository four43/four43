// Frame-rate, draw-call, shader-program and load-time record (lion-hawk overview §8 R1, R3). Serves a built Rally
// directory and measures each scene under Chromium (SwiftShader here; real-iPad ?fps runs are the user's). WebGL
// calls are counted by wrapping the context prototypes, so the same script measures today's page and the engine one.
// Run: node test/perf.mjs <dir>   (prints JSON)
import fs from 'node:fs';
import path from 'node:path';
import { launch } from 'lion-hawk/playwright';
import { serveDir } from './serve.mjs';

const dir = process.argv[2];
if (!dir || !fs.existsSync(path.join(dir, 'index.html'))) { console.error('perf: pass a built Rally directory holding index.html'); process.exit(2); }
const KEY = 'rally-sim-settings';
const SCENES = {
  'pad-gravel': { q: '?pad&debug=running', settings: { v: 4, surface: 'gravel' } },
  'pad-snow': { q: '?pad&debug=running', settings: { v: 4, surface: 'snow' } },
  'track-summer': { q: '?debug=running', settings: { v: 4, mode: 'freeDrive', world: 'loop', seed: 'perf1', theme: 'summer' } },
  'track-winter': { q: '?debug=running', settings: { v: 4, mode: 'freeDrive', world: 'loop', seed: 'perf1', theme: 'winter' } },
};
function count() { // init script: linked programs and draw calls, per page
  const w = window; w.__perf = { programs: 0, calls: 0 };
  for (const C of [w.WebGLRenderingContext, w.WebGL2RenderingContext]) {
    if (!C) continue;
    const P = C.prototype, link = P.linkProgram;
    P.linkProgram = function (...a) { w.__perf.programs++; return link.apply(this, a); };
    for (const n of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced']) {
      const f = P[n]; if (f) P[n] = function (...a) { w.__perf.calls++; return f.apply(this, a); };
    }
  }
}
const median = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const chrome = await launch(), site = await serveDir(dir), out = { dir: path.resolve(dir), scenes: {} };
async function open(q, settings) {
  const ctx = await chrome.browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(count);
  await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* blocked */ } }, [KEY, JSON.stringify(settings)]);
  const page = await ctx.newPage();
  await page.goto(site.url + q);
  await page.waitForFunction(() => window.engine?.settled?.() === true, null, { timeout: 60000 });
  return { ctx, page, settleMs: await page.evaluate(() => performance.now()) };
}
try {
  const loads = [];
  for (let i = 0; i < 3; i++) { const o = await open('', { v: 4 }); loads.push(o.settleMs); await o.ctx.close(); }
  out.settleMs = median(loads);
  for (const [name, s] of Object.entries(SCENES)) {
    const o = await open(s.q, s.settings);
    const r = await o.page.evaluate(() => new Promise(done => {
      let n = 0, last = 0, calls0 = 0; const dts = [];
      const tick = t => {
        n++;
        if (n === 60) { calls0 = window.__perf.calls; last = t; }
        else if (n > 60) { dts.push(t - last); last = t; }
        if (n < 180) requestAnimationFrame(tick);
        else done({ programs: window.__perf.programs, calls: (window.__perf.calls - calls0) / 120, dts });
      };
      requestAnimationFrame(tick);
    }));
    out.scenes[name] = { programs: r.programs, calls: +r.calls.toFixed(1), frameMs: +median(r.dts).toFixed(2), settleMs: Math.round(o.settleMs) };
    await o.ctx.close();
  }
} finally { await chrome.close(); await site.close(); }
console.log(JSON.stringify(out, null, 1));
