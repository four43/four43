// games/test/perf.test.mjs: the frame-rate and size probe's parts (overview §8 R1, R3; lion-hawk 3m).
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { installCounters, probeScript } from './perf/counters.mjs';
import { summarise, judge } from './perf/stats.mjs';
import { sizeReport } from './perf/sizes.mjs';
import { serveDir, GAMES } from './perf/probe.mjs';

const fakeGl = () => class { drawArrays(n) { return n * 2; } drawElements() { return this; } drawElementsInstanced() {} createProgram() { return { id: 1 }; } };
const rafQueue = () => { const q = []; return { raf: f => q.push(f), flush: t => { for (const f of q.splice(0)) f(t); } }; };

test('installCounters counts draws and programs and keeps this and return values', () => {
  const Gl = fakeGl(), probe = installCounters([Gl.prototype], rafQueue().raf), gl = new Gl();
  assert.equal(gl.drawArrays(3), 6);
  assert.equal(gl.drawElements(), gl);
  gl.drawElementsInstanced();
  assert.deepEqual(gl.createProgram(), { id: 1 });
  assert.equal(probe.read().draws, 3);
  assert.equal(probe.read().programs, 1);
});
test('each rAF tick records the draws and the time since the last tick; reset starts a new window', () => {
  const Gl = fakeGl(), q = rafQueue(), probe = installCounters([Gl.prototype], q.raf), gl = new Gl();
  q.flush(100);
  gl.drawArrays(1); gl.drawArrays(1); q.flush(116);
  gl.drawArrays(1); q.flush(150);
  assert.deepEqual(probe.read().perFrame, [2, 1]);
  assert.deepEqual(probe.read().frameMs, [16, 34]);
  probe.reset();
  gl.drawArrays(1); q.flush(160); gl.drawArrays(1); q.flush(170);
  assert.deepEqual(probe.read().perFrame, [1]);
  assert.deepEqual(probe.read().frameMs, [10]);
});
test('probeScript puts __lhProbe on the page global and wraps the WebGL2 prototype', () => {
  const Gl2 = fakeGl(), q = rafQueue(), ctx = vm.createContext({ WebGL2RenderingContext: Gl2, requestAnimationFrame: q.raf });
  vm.runInContext(probeScript(), ctx);
  new Gl2().drawArrays(1);
  assert.equal(ctx.__lhProbe.read().draws, 1);
});
test('summarise takes the upper median and the 95th percentile', () => {
  assert.deepEqual(summarise({ programs: 9, perFrame: [4, 1, 3, 2], frameMs: [10, 40, 20, 30] }),
    { programs: 9, drawsMedian: 3, drawsMax: 4, frameMsMedian: 30, frameMsP95: 40, frames: 4 });
  assert.equal(summarise({ programs: 0, perFrame: [], frameMs: [] }).drawsMedian, null);
});
const BASE = { programs: 10, drawsMedian: 50, settledMs: 1000, size: { gzip: 100000 } };
test('judge passes exactly at each budget (overview §8 R1, R3)', () => {
  assert.deepEqual(judge(BASE, { programs: 12, drawsMedian: 50, settledMs: 1200, size: { gzip: 110000 } }), []);
});
test('judge names each overrun, and a missing baseline', () => {
  const msgs = judge(BASE, { programs: 13, drawsMedian: 51, settledMs: 1201, size: { gzip: 110001 } });
  assert.deepEqual(msgs.map(m => m.split(' ').slice(0, 2).join(' ')), ['R1 programs', 'R1 draw', 'R3 gzip', 'R3 settled']);
  assert.deepEqual(judge(undefined, BASE), ['no baseline']);
});
test('sizeReport totals bytes and gzip over nested files, paths relative to the dir', () => {
  const d = mkdtempSync(join(tmpdir(), 'sizes-'));
  mkdirSync(join(d, 'assets/models'), { recursive: true });
  writeFileSync(join(d, 'index.html'), 'x'.repeat(1000));
  writeFileSync(join(d, 'assets/models/a.glb'), Buffer.alloc(300, 7));
  const r = sizeReport(d);
  assert.deepEqual(r.files.map(f => f.path), ['assets/models/a.glb', 'index.html']);
  assert.equal(r.total.bytes, 1300);
  assert.equal(r.total.gzip, gzipSync(Buffer.alloc(300, 7), { level: 9 }).length + gzipSync(Buffer.from('x'.repeat(1000)), { level: 9 }).length);
});
test('serveDir serves the dir and index.html for /, and 404s a directory or a missing file', async () => {
  const d = mkdtempSync(join(tmpdir(), 'serve-'));
  writeFileSync(join(d, 'index.html'), '<p>hi');
  mkdirSync(join(d, 'assets'));
  writeFileSync(join(d, 'assets/m.glb'), 'glb');
  const s = await serveDir(d);
  try {
    assert.equal(await (await fetch(s.url)).text(), '<p>hi');
    assert.equal((await fetch(new URL('assets/m.glb', s.url))).headers.get('content-type'), 'model/gltf-binary');
    assert.equal((await fetch(new URL('assets/', s.url))).status, 404);
    assert.equal((await fetch(new URL('nope.js', s.url))).status, 404);
  } finally { await s.close(); }
});
test('GAMES opens each game the way its desktop e2e test does', () => {
  assert.deepEqual(Object.keys(GAMES).sort(), ['pig-pens', 'rally', 'tractor-pickup']);
  for (const g of Object.values(GAMES)) { assert.equal(g.preset, 'desktop'); assert.equal(typeof g.scene, 'string'); }
});
