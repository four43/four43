import test from 'node:test';
import assert from 'node:assert/strict';
import { generateFarm, findRoute, checkRules, GATES, DIRS, SIZE, TILE, YARD_HALF, segDist, barnLocal, tileCenter, WASH, inWash } from '../src/sim/track.js';
import { makeRng } from '../src/sim/rng.js';
import { LINEUP, TALLY } from '../src/sim/showSteps.js';
const SEEDS = Array.from({ length: 300 }, (_, i) => i * 7919 + 1);
const FEATURES = ['mud', 'ramp', 'sprinkler'];
assert.equal(TILE, 36); assert.equal(YARD_HALF, 54);
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
  assert.equal(f.hideSpots.length, 2);                                                       // A-13: on the shoulder, 7.8 m from a plain tile's line
  const plain = f.routes.flatMap(r => r.tiles.filter(t => t.type === 'straight' || t.type === 'gate'));
  for (const h of f.hideSpots) assert.ok(plain.some(t => { const c = tileCenter(t.i, t.j), [dx, dz] = DIRS[t.outDir], along = (h.x - c.x) * dx + (h.z - c.z) * dz, across = (h.x - c.x) * -dz + (h.z - c.z) * dx;
    return Math.abs(along) < 1e-9 && Math.abs(Math.abs(across) - 7.8) < 1e-9; }), 'hide spot not 7.8 m beside a plain tile');
  // farmyard (4.7)
  const y = f.yard, count = k => y.obstacles.filter(o => o.kind === k).length;
  assert.deepEqual([count('bale'), count('cone'), count('barrel'), count('post'), count('tree'), count('bush')], [8, 16, 8, 0, 18, 16]);  // T-31: no posts
  for (const o of y.obstacles) {
    assert.ok(Math.abs(o.x) < YARD_HALF && Math.abs(o.z) < YARD_HALF);
    for (const l of y.lanes) assert.ok(segDist(o.x, o.z, l) > 5 + o.r - 1e-9, `${o.kind} in a lane`);                 // T-30
    const b = barnLocal(y.barn, o.x, o.z); assert.ok(Math.abs(b.a) > 8 || Math.abs(b.s) > 7, 'obstacle in the barn');
    const B = y.barn, leafGap = Math.min(...[-1, 1].flatMap(sd => [-1, 1].map(end => {   // clear of the open door leaves: segments s = +-width, |a| in [half, half + leaf]
      const a0 = end * B.half, a1 = end * (B.half + B.leaf), ta = Math.max(Math.min(a0, a1), Math.min(Math.max(a0, a1), b.a)); return Math.hypot(b.a - ta, b.s - sd * B.width); })));
    assert.ok(leafGap > o.r + 1.5, `${o.kind} ${leafGap.toFixed(2)} m from a barn door leaf`);
  }
  assert.ok(Math.abs(f.start.x) < YARD_HALF && Math.abs(f.start.z) < YARD_HALF);
  // T-29: the duck pond is in a farmyard corner, clear of the lanes, the barn and the line-up
  const p = y.pond; assert.equal(f.pond, p); assert.equal(p.r, 7);
  assert.ok(Math.abs(p.x) + p.r < YARD_HALF && Math.abs(p.z) + p.r < YARD_HALF && Math.abs(p.x) > YARD_HALF / 2 && Math.abs(p.z) > YARD_HALF / 2, 'pond not in a corner');
  for (const l of y.lanes) assert.ok(segDist(p.x, p.z, l) > 5 + p.r, 'pond in a lane');
  const pb = barnLocal(y.barn, p.x, p.z); assert.ok(Math.abs(pb.a) > 8 + p.r || Math.abs(pb.s) > 7 + p.r, 'pond at the barn');
  const st = y.lineup, gx = Math.max(st.x0 - p.x, 0, p.x - st.x1), gz = Math.max(st.z0 - p.z, 0, p.z - st.z1); assert.ok(Math.hypot(gx, gz) > p.r, 'pond on the line-up');
  assert.equal(y.paddock, undefined);
  for (const o of y.obstacles) assert.ok(Math.hypot(o.x - p.x, o.z - p.z) > p.r + o.r, `${o.kind} in the pond`);
});
test('checkRules flags adjacent features and a ramp next to a curve', () => {
  const f = generateFarm(99), clone = () => f.routes.map(r => ({ ...r, tiles: r.tiles.map(t => ({ ...t })) }));
  const a = clone(), T = a[0].tiles, k = T.findIndex((t, i) => i > 0 && t.type === 'curve');
  T[k + 1 < T.length - 1 ? k + 1 : k - 1].type = 'ramp'; assert.ok(checkRules(a).some(c => c === 'T-19' || c === 'T-18'));
  const b = clone().map(r => ({ ...r, tiles: r.tiles.map(t => FEATURES.includes(t.type) ? { ...t, type: 'straight' } : t) }));
  const U = b[0].tiles, s = U.findIndex((t, i) => t.type === 'straight' && U[i + 1]?.type === 'straight');
  if (s >= 0) { U[s].type = 'mud'; U[s + 1].type = 'mud'; assert.ok(checkRules(b).includes('T-21')); }
});

test('the farmyard wash stands in the yard, parallel to the barn, with both ends and its approaches clear (T-36)', () => {
  for (const seed of SEEDS) {
    const y = generateFarm(seed).yard, w = y.wash;
    assert.equal(w.yaw, y.barn.yaw);
    for (const [a, s] of [[WASH.half + 8, WASH.width + 1], [-WASH.half - 8, WASH.width + 1], [WASH.half + 8, -WASH.width - 1], [-WASH.half - 8, -WASH.width - 1]]) {
      const x = w.x + Math.sin(w.yaw) * a + Math.cos(w.yaw) * s, z = w.z + Math.cos(w.yaw) * a - Math.sin(w.yaw) * s; // the corners of the wash and 8 m of approach at each end
      assert.ok(Math.abs(x) < YARD_HALF - 2 && Math.abs(z) < YARD_HALF - 2, `seed ${seed}: wash runs out of the yard`);
    }
    for (const o of y.obstacles) { const l = barnLocal(w, o.x, o.z); assert.ok(Math.abs(l.a) > WASH.half + 4 + o.r - 1e-9 || Math.abs(l.s) > WASH.width + 3 + o.r - 1e-9, `seed ${seed}: ${o.kind} at the wash`); }
    const b = barnLocal(y.barn, w.x, w.z); assert.ok(Math.abs(b.s) > y.barn.width + WASH.width + 4, `seed ${seed}: wash against the barn`);
    for (const l of y.lanes) for (const sd of [-1, 1]) for (const e of [-1, 1]) { const x = w.x + Math.sin(w.yaw) * e * WASH.half + Math.cos(w.yaw) * sd * (WASH.width + 0.3), z = w.z + Math.cos(w.yaw) * e * WASH.half - Math.sin(w.yaw) * sd * (WASH.width + 0.3);
      assert.ok(segDist(x, z, l) > 3, `seed ${seed}: a wash post in a lane`); }
    const L = y.lineup; assert.ok(!(w.x > L.x0 - WASH.width - 2 && w.x < L.x1 + WASH.width + 2 && w.z > L.z0 - WASH.width - 2 && w.z < L.z1 + WASH.width + 2), `seed ${seed}: wash on the line-up`);
    assert.ok(Math.hypot(w.x - y.pond.x, w.z - y.pond.z) > y.pond.r + WASH.half + WASH.width, `seed ${seed}: wash in the pond`);
    assert.ok(inWash(y, w.x, w.z) && !inWash(y, w.x + 30, w.z + 30));
  }
});

test('the ground left of the line-up (screen left in the show) stays clear for the tally circle (F-14)', () => {
  for (const seed of SEEDS) {
    const y = generateFarm(seed).yard, b = y.barn, f = [Math.sin(b.yaw), Math.cos(b.yaw)], rt = [Math.cos(b.yaw), -Math.sin(b.yaw)];
    // the show camera looks back along -side, so layout x (screen right) runs along -side * f: the circle sits at +side * f past the line-up
    const reach = LINEUP.len / 2 + TALLY.gap + 2 * TALLY.rMax, mid = 3.5;
    for (const a of [LINEUP.len / 2, reach]) for (const d of [mid - TALLY.rMax, mid + TALLY.rMax]) {
      const A = y.end * 16 + y.side * a, S = y.side * (8.5 + d), x = f[0] * A + rt[0] * S, z = f[1] * A + rt[1] * S;
      assert.ok(Math.abs(x) < YARD_HALF - 2 && Math.abs(z) < YARD_HALF - 2, `seed ${seed}: circle room out of the yard`);
      assert.ok(Math.hypot(x - y.pond.x, z - y.pond.z) > y.pond.r, `seed ${seed}: circle room in the pond`);
    }
    for (const o of y.obstacles) {
      const l = barnLocal(b, o.x, o.z), a = (l.a - y.end * 16) * y.side, d = l.s * y.side - 8.5;
      assert.ok(!(a > LINEUP.len / 2 - o.r && a < reach + o.r && d > mid - TALLY.rMax - o.r && d < mid + TALLY.rMax + o.r), `seed ${seed}: ${o.kind} in the tally circle room`);
    }
  }
});
