// R10-1: road edges. Deterministic per seed, bounded, varied, calmer on tarmac, continuous, and the surface lookup (the
// wheels) switches road → verge at the same edge the shader draws.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateTrack } from '../src/gen/track.js';
import { EDGE, edgeAt, onRoad, average } from '../src/gen/edges.js';
import { roadSurfaceAt } from '../src/gen/surfaces.js';

const loop = generateTrack('edges-1', { kind: 'loop', theme: 'summer' });
const stage = generateTrack('edges-2', { kind: 'stage', theme: 'winter' });

test('edges: one half-width per sample and side, within [min, max], same seed same edges', () => {
  for (const t of [loop, stage]) {
    for (const side of ['left', 'right']) {
      const a = t.edges[side];
      assert.equal(a.length, t.layout.n);
      assert.ok(a.every(v => v >= EDGE.min - 1e-6 && v <= EDGE.max + 1e-6), `${side} within bounds`);
    }
  }
  const again = generateTrack('edges-1', { kind: 'loop', theme: 'summer' });
  assert.deepEqual([...again.edges.left], [...loop.edges.left]);
});

test('edges: the width varies, the sides differ, neighbours stay close (no steps)', () => {
  const { left, right } = loop.edges;
  const span = Math.max(...left) - Math.min(...left);
  assert.ok(span > 0.3, `left edge spans ${span.toFixed(2)} m`);
  let differ = 0, step = 0;
  for (let i = 1; i < left.length; i++) {
    if (Math.abs(left[i] - right[i]) > 0.05) differ++;
    step = Math.max(step, Math.abs(left[i] - left[i - 1]), Math.abs(right[i] - right[i - 1]));
  }
  assert.ok(differ > left.length * 0.3, `sides differ at ${differ} of ${left.length} samples`);
  assert.ok(step < 0.25, `largest step between 1 m samples ${step.toFixed(3)} m`);
});

test('edges: tarmac edges wander less locally than loose ones (the base width drifts on both)', () => {
  const spread = { tarmac: [], loose: [] };
  for (const t of ['e1', 'e2', 'e3', 'e4', 'e5', 'e6'].map(s => generateTrack(s, { kind: 'loop', theme: 'summer' }))) {
    const a = t.edges.left, m = average(a, 12, true);
    for (let i = 0; i < t.layout.n; i++) {
      const at = roadSurfaceAt(t.surfaces, i * t.layout.ds);
      if (at.t > 0) continue;
      (at.road === 'tarmac' ? spread.tarmac : spread.loose).push(Math.abs(a[i] - m[i]));
    }
  }
  assert.ok(spread.tarmac.length > 100, 'some tarmac in the sample');
  const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  assert.ok(mean(spread.tarmac) < mean(spread.loose) * 0.5, `tarmac ${mean(spread.tarmac).toFixed(3)} vs loose ${mean(spread.loose).toFixed(3)}`);
});

test('edges: three car widths, single lanes only through narrows, wider on the inside of bends, standard at the start gate (R12, R18-2)', () => {
  const width = [], squeezed = [], inside = [], outside = [], tight = [];
  let narrows = 0;
  for (const t of ['w1', 'w2', 'w3', 'w4', 'w5', 'w6'].flatMap(s => ['loop', 'stage'].map(kind => generateTrack(s, { kind, obstacles: 5 })))) {
    const { left, right } = t.edges, K = t.layout.curvature, Kbar = average(K, 15, true);
    const ns = t.features.filter(f => f.type === 'narrow'), inNarrow = (s) => ns.some(f => s >= f.s0 && s <= f.s1);
    narrows += ns.length;
    for (const f of ns) {
      const mid = Math.round((f.s0 + f.s1) / 2 / t.layout.ds);
      squeezed.push(left[mid] + right[mid]);
      for (let s = f.s0; s <= f.s1; s++) assert.ok(Math.abs(K[Math.round(s) % t.layout.n]) <= 1 / 120 + 1e-6, 'a narrow sits on a straight');
    }
    for (let i = 0; i < t.layout.n; i++) {
      if (!inNarrow(i * t.layout.ds)) width.push(left[i] + right[i]);
      if (Math.abs(Kbar[i]) >= 1 / 40) tight.push(left[i] + right[i]);
      if (Math.abs(K[i]) > 1 / 30) { inside.push(K[i] > 0 ? left[i] : right[i]); outside.push(K[i] > 0 ? right[i] : left[i]); }
    }
    const g = Math.round(40 / t.layout.ds);
    assert.ok(Math.abs(left[g] - EDGE.half) < 0.05 && Math.abs(right[g] - EDGE.half) < 0.05, 'standard width at the start gate');
    if (t.layout.closed) assert.ok(Math.abs(left[0] - left[t.layout.n - 1]) < 0.15, 'no step where the loop closes');
  }
  const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  assert.ok(mean(width) > 5.2 && mean(width) < 7.5, `mean road width ${mean(width).toFixed(2)} m (three to four car widths)`);
  const lanes = width.filter(w => w < 4).length / width.length;
  assert.ok(lanes < 0.01, `outside narrows, ${(100 * lanes).toFixed(1)}% of the road under 4 m`);
  assert.ok(narrows > 0 && squeezed.every(w => w < 3.4), `narrows squeeze to a lane: ${squeezed.map(w => w.toFixed(1)).join(', ')} m`);
  assert.ok(tight.length > 50 && Math.min(...tight) >= 3.5 - 1e-4, `tight bends at least 2 car widths: narrowest ${Math.min(...tight).toFixed(2)} m`);
  assert.ok(inside.length > 50 && mean(inside) > mean(outside) + 0.3, `tight bends: inside ${mean(inside).toFixed(2)} vs outside ${mean(outside).toFixed(2)} m`);
});

test('edgeAt: exact at samples, linear between, wraps on loops, clamps on stages', () => {
  const L = loop.layout, e = loop.edges;
  assert.equal(edgeAt(e, L, 10 * L.ds, 1), e.left[10]);
  assert.equal(edgeAt(e, L, 10 * L.ds, -1), e.right[10]);
  assert.ok(Math.abs(edgeAt(e, L, 10.5 * L.ds, 1) - (e.left[10] + e.left[11]) / 2) < 1e-6);
  assert.ok(Math.abs(edgeAt(e, L, L.n * L.ds + 3 * L.ds, 1) - e.left[3]) < 1e-6, 'a loop wraps');
  const S = stage.layout;
  assert.equal(edgeAt(stage.edges, S, -5, 1), stage.edges.left[0]);
  assert.equal(edgeAt(stage.edges, S, S.n * S.ds + 50, 1), stage.edges.left[S.n - 1]);
  assert.equal(onRoad(e, L, 0, e.left[0] - 0.01), true);
  assert.equal(onRoad(e, L, 0, e.left[0] + 0.01), false);
});

test('surface lookup: road just inside the edge, verge just outside, on both sides', async () => {
  const { TrackWorld } = await import('../src/world/trackWorld.js');
  const w = new TrackWorld(loop), L = loop.layout;
  let checked = 0;
  for (let i = 50; i < L.n - 50; i += 97) {
    const h = L.heading[i], s = i * L.ds, at = roadSurfaceAt(loop.surfaces, s);
    if (at.t > 0) continue;
    for (const side of [1, -1]) {
      const hw = side > 0 ? loop.edges.left[i] : loop.edges.right[i];
      const pt = d => [L.x[i] + side * d * Math.cos(h), L.z[i] - side * d * Math.sin(h)];
      assert.equal(w.materialAt(...pt(hw - 0.1)), `rally-${at.road}`, `inside the edge at s ${s}, side ${side}`);
      assert.equal(w.materialAt(...pt(hw + 0.1)), `rally-${at.verge}`, `outside the edge at s ${s}, side ${side}`);
      checked++;
    }
  }
  assert.ok(checked > 10, `${checked} probes`);
});

test('wear: the line cuts to the inside of bends, stays clear of the edges, fades but never vanishes on loose roads', async () => {
  const { WEAR, groove } = await import('../src/gen/wear.js');
  const L = loop.layout, { c1, a1, c2, a2 } = loop.wear;
  assert.equal(c1.length, L.n);
  let inside = 0, bends = 0;
  for (let i = 0; i < L.n; i++) {
    const outer = WEAR.track / 2 + WEAR.width;
    const room = Math.min(loop.edges.left[i], loop.edges.right[i]) >= WEAR.margin + WEAR.track / 2 + WEAR.width;
    for (const c of room ? [c1[i], c2[i]] : []) { // a single-car lane has no room for the pair: it sits centred
      assert.ok(c + outer <= loop.edges.left[i] - WEAR.margin + 1e-4 && -(c - outer) <= loop.edges.right[i] - WEAR.margin + 1e-4, `wheel lines inside the edges at ${i}`);
    }
    if (Math.abs(L.curvature[i]) > 0.02) { bends++; if (Math.sign(c1[i]) === Math.sign(L.curvature[i])) inside++; }
    assert.ok(a1[i] >= 0 && a1[i] <= 1 && a2[i] >= 0 && a2[i] <= 1);
  }
  assert.ok(bends > 20 && inside > bends * 0.75, `inside of ${inside}/${bends} tight bend samples`);
  const loose = [...a1].filter((v, i) => { const at = roadSurfaceAt(loop.surfaces, i * L.ds); return at.t === 0 && at.road !== 'tarmac'; });
  assert.ok(loose.length > 100 && Math.min(...loose) > 0.3, 'the main pair never disappears on loose roads');
  assert.ok(a2.some(v => v > 0.3) && a2.some(v => v === 0), 'a second pair in places, not everywhere');
  const [g, b] = groove(c1[5] + WEAR.track / 2, c1[5], 1), [g0, b0] = groove(c1[5] + WEAR.track / 2 + WEAR.width * 1.4, c1[5], 1);
  assert.ok(g > 0.99 && b === 0 && g0 === 0 && b0 > 0.5, 'groove in the wheel line, berm beside it');
});
