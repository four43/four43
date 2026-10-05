import test from 'node:test';
import assert from 'node:assert/strict';
import { generateFarm, findRoute, checkRules, GATES, DIRS, SIZE, YARD_HALF, segDist, barnLocal } from '../src/sim/track.js';
import { makeRng } from '../src/sim/rng.js';
const SEEDS = Array.from({ length: 300 }, (_, i) => i * 7919 + 1);
const FEATURES = ['mud', 'ramp', 'sprinkler'];
const inYard = (i, j) => i >= 4 && i <= 6 && j >= 4 && j <= 6;

test('findRoute links two gates with straight gate tiles at both ends', () => {
  const p = findRoute(makeRng(5), 'N', 'E');
  assert.ok(p); assert.deepEqual(p[0], [GATES.N.i, GATES.N.j]); assert.deepEqual(p.at(-1), [GATES.E.i, GATES.E.j]);
  assert.deepEqual(p[1], [GATES.N.i + DIRS[GATES.N.out][0], GATES.N.j + DIRS[GATES.N.out][1]]);
});
test('same seed, same farm', () => {
  assert.deepEqual(generateFarm(1234), generateFarm(1234));
});
for (const seed of SEEDS) test(`farm ${seed} obeys the spec`, () => {
  const f = generateFarm(seed), seen = new Set();
  assert.equal(f.routes.length, 2);                                                        // T-24
  const gates = f.routes.flatMap(r => [r.from, r.to]).sort().join(); assert.equal(gates, 'E,N,S,W');
  for (const r of f.routes) {
    const T = r.tiles, n = T.length;
    assert.ok(n >= 8 && n <= 14, `length ${n}`);                                            // T-24
    assert.deepEqual([T[0].i, T[0].j], [GATES[r.from].i, GATES[r.from].j]);
    assert.deepEqual([T[n - 1].i, T[n - 1].j], [GATES[r.to].i, GATES[r.to].j]);
    assert.equal(T[0].inDir, GATES[r.from].out); assert.equal(T[n - 1].outDir, (GATES[r.to].out + 2) % 4);
    assert.equal(T[0].type, 'gate'); assert.equal(T[n - 1].type, 'gate');
    let curves = 0, run = 0;
    T.forEach((t, k) => {
      const key = `${t.i},${t.j}`; assert.ok(!seen.has(key), 'routes overlap or cross'); seen.add(key);
      assert.ok(!inYard(t.i, t.j) && t.i >= 1 && t.j >= 1 && t.i <= SIZE - 2 && t.j <= SIZE - 2, 'outside the allowed area');
      if (k + 1 < n) { const [di, dj] = DIRS[t.outDir]; assert.deepEqual([t.i + di, t.j + dj], [T[k + 1].i, T[k + 1].j]); assert.equal(t.outDir, T[k + 1].inDir); }
      const curve = t.inDir !== t.outDir; assert.equal(t.type === 'curve', curve);
      if (curve) { curves++; run++; assert.ok(run <= 2, 'three curves in a row'); } else run = 0;   // T-25
      assert.equal(f.grid[t.j][t.i], 'road');
    });
    assert.ok(curves >= 4, `curves ${curves}`);                                              // T-25
  }
  assert.deepEqual(checkRules(f.routes), []);
  assert.ok(f.pond && f.hideSpots.length === 2);
  // farmyard (4.7)
  const y = f.yard, count = k => y.obstacles.filter(o => o.kind === k).length;
  assert.deepEqual([count('bale'), count('cone'), count('barrel'), count('post'), count('tree')], [4, 8, 4, 4, 2]);   // T-31
  for (const o of y.obstacles) {
    assert.ok(Math.abs(o.x) < YARD_HALF && Math.abs(o.z) < YARD_HALF);
    for (const l of y.lanes) assert.ok(segDist(o.x, o.z, l) > 3 + o.r - 1e-9, `${o.kind} in a lane`);                 // T-30
    const b = barnLocal(y.barn, o.x, o.z); assert.ok(Math.abs(b.a) > 8 || Math.abs(b.s) > 7, 'obstacle in the barn');
  }
  assert.ok(Math.abs(f.start.x) < YARD_HALF && Math.abs(f.start.z) < YARD_HALF);
});
test('checkRules flags adjacent features and a ramp next to a curve', () => {
  const f = generateFarm(99), clone = () => f.routes.map(r => ({ ...r, tiles: r.tiles.map(t => ({ ...t })) }));
  const a = clone(), T = a[0].tiles, k = T.findIndex((t, i) => i > 0 && t.type === 'curve');
  T[k + 1 < T.length - 1 ? k + 1 : k - 1].type = 'ramp'; assert.ok(checkRules(a).some(c => c === 'T-19' || c === 'T-18'));
  const b = clone().map(r => ({ ...r, tiles: r.tiles.map(t => FEATURES.includes(t.type) ? { ...t, type: 'straight' } : t) }));
  const U = b[0].tiles, s = U.findIndex((t, i) => t.type === 'straight' && U[i + 1]?.type === 'straight');
  if (s >= 0) { U[s].type = 'mud'; U[s + 1].type = 'mud'; assert.ok(checkRules(b).includes('T-21')); }
});
