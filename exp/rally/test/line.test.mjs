// R18-3 / R18-5: the flat-out speed profile, the loop's line where a flat-out crossing can brake for what follows, and
// jumps on road straight enough that the flight lands on it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateTrack } from '../src/gen/track.js';
import { flatOut, brakeEnvelope, lineSpot, turnLoop, FLAT } from '../src/gen/speed.js';
import { ROADSIDE } from '../src/gen/roadside.js';

const SEEDS = ['t1', 't2', 't3', 't4', 'a', 'b'];

test('flatOut: from rest on a stage, capped by corners and top speed; the brake envelope never above it at a corner', () => {
  const t = generateTrack('t1', { kind: 'stage' }), L = t.layout, f = flatOut(L, 0.8), b = brakeEnvelope(L, 0.8);
  assert.ok(f[0] < 4, `a stage starts from rest (1 m in) (${f[0].toFixed(2)} m/s)`);
  assert.ok(f.every(v => v <= FLAT.top + 1e-6) && b.every(v => v <= FLAT.top + 1e-6), 'top speed');
  for (let i = 0; i < L.n; i++) {
    const corner = Math.sqrt(FLAT.lat * 0.8 * 9.81 / Math.max(Math.abs(L.curvature[i]), 1e-6));
    assert.ok(f[i] <= corner + 1e-3 && b[i] <= corner + 1e-3, `corner limit at ${i}`);
  }
  for (let i = 1; i < L.n; i++) assert.ok(b[i - 1] <= Math.sqrt(b[i] ** 2 + 2 * FLAT.brake * 0.8 * 9.81) + 1e-3, 'braking no harder than FLAT.brake');
});

test('turnLoop: a loop turned keeps its shape, sample i lands at the given s', () => {
  const t = generateTrack('t2', { kind: 'loop' }), L = t.layout, T = turnLoop(L, 100, 40);
  assert.equal(T.x[40], L.x[100]); assert.equal(T.curvature[40], L.curvature[100]);
  assert.equal(T.n, L.n); assert.equal(T.length, L.length);
  const st = generateTrack('t2', { kind: 'stage' }).layout;
  assert.equal(turnLoop(st, 100, 40), st, 'a stage is left as it is');
});

test('the line: every style, a flat-out crossing brakes for what follows (R18-5)', () => {
  for (const style of [1, 2, 3, 4, 5]) for (const seed of SEEDS) {
    const t = generateTrack(seed, { kind: 'loop', style }), L = t.layout, f = flatOut(L, 0.8), b = brakeEnvelope(L, 0.8);
    const i = Math.round(ROADSIDE.gateS / L.ds), j = (i + Math.round(FLAT.react * f[i] / L.ds)) % L.n, room = b[j] - f[i] * (1 + FLAT.spare);
    assert.ok(room >= -1e-3, `style ${style} ${seed}: crossing at ${(f[i] * 3.6).toFixed(0)} km/h, can brake to ${(b[j] * 3.6).toFixed(0)}`);
    assert.equal(lineSpot(L, 0.8).i, i, `style ${style} ${seed}: the turned loop's best spot is its line`);
  }
});

test('jumps: the road under the flat-out flight bends the car at most 1.5 m off its line (R18-3)', () => {
  let n = 0;
  for (const kind of ['loop', 'stage']) for (const seed of SEEDS) {
    const t = generateTrack(seed, { kind, obstacles: 5 }), L = t.layout;
    for (const f of t.features.filter(f => f.flight)) {
      n++;
      let k = 0;
      for (let s = f.s0; s <= f.s0 + f.lipS + f.flight; s++) k = Math.max(k, Math.abs(L.curvature[Math.round(s) % L.n]));
      assert.ok(k * f.flight ** 2 / 2 <= 1.5 + 1e-6, `${seed} ${kind} ${f.type} at ${f.s0.toFixed(0)}: drifts ${(k * f.flight ** 2 / 2).toFixed(2)} m`);
    }
  }
  assert.ok(n > 10, `${n} jumps checked`);
});
