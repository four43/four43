// Obstacles and terrain generators (spec tracks T-3, T-4). Run: node test/gen-terrain.mjs [filter]
import { rng } from '../src/gen/rng.js';
import { placeFeatures, profileOffset, bermBank, FEATURE_RANGES } from '../src/gen/features.js';
import { generateTerrain, heightAt, BUMPS } from '../src/gen/terrain.js';

const only = process.argv[2];
const results = [];
function check(name, val, lo, hi, unit = '') {
  const ok = val >= lo && val <= hi;
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${(+val).toFixed(3)}${unit}  [${lo}..${hi}]`);
  return ok;
}
const test = (name, f) => { if (!only || name.includes(only)) { console.log(`\n# ${name}`); f(); } };
const DEG = Math.PI / 180;

// ---- synthetic layouts (Layout shape from the spec) ----
function finish(kind, closed, x, z, heading, curvature) {
  const n = x.length;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < n; i++) {
    minX = Math.min(minX, x[i]); maxX = Math.max(maxX, x[i]); minZ = Math.min(minZ, z[i]); maxZ = Math.max(maxZ, z[i]);
  }
  return { kind, closed, ds: 1, n, x, z, heading, curvature, length: closed ? n : n - 1, bounds: { minX, maxX, minZ, maxZ } };
}
// Integrate a curvature program [[len, kappa], ...] with 15 m linear ramps between pieces.
function fromProgram(pieces, ramp = 15) {
  const k = [];
  let prev = 0;
  for (const [len, kap] of pieces) {
    const r = Math.min(ramp, len);
    for (let j = 0; j < len; j++) k.push(j < r ? prev + (kap - prev) * (j + 0.5) / r : kap);
    prev = kap;
  }
  const n = k.length + 1;
  const x = new Float32Array(n), z = new Float32Array(n), heading = new Float32Array(n), curvature = new Float32Array(n);
  let h = 0, px = 0, pz = 0;
  for (let i = 0; i < n; i++) {
    x[i] = px; z[i] = pz; heading[i] = h; curvature[i] = k[Math.min(i, k.length - 1)];
    if (i < k.length) { const hm = h + k[i] / 2; px += Math.sin(hm); pz += Math.cos(hm); h += k[i]; }
  }
  return finish('stage', false, x, z, heading, curvature);
}
const straight = (len = 2000) => fromProgram([[len, 0]]);
function circle(R0 = 400) {
  const n = Math.round(2 * Math.PI * R0), R = 1 / (2 * Math.sin(Math.PI / n)); // chord exactly 1 m
  const x = new Float32Array(n), z = new Float32Array(n), heading = new Float32Array(n), curvature = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = 2 * Math.PI * i / n; // turning left from +z towards +x
    x[i] = R - R * Math.cos(t); z[i] = R * Math.sin(t); heading[i] = t; curvature[i] = 1 / R;
  }
  return finish('loop', true, x, z, heading, curvature);
}
// S-bend with a right-hand hairpin of radius 25 m.
const sbend = () => fromProgram([[250, 0], [157, 1 / 150], [120, 0], [Math.round(170 * DEG * 25), -1 / 25], [300, 0],
  [157, -1 / 100], [250, 0]]);

const LAYOUTS = { straight: straight(), circle: circle(), sbend: sbend() };
const SEEDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
const feats = (L, seed, obstacles) => placeFeatures(L, rng(seed).fork('features'), { obstacles });
const wrapS = (L, s) => L.closed ? ((s % L.length) + L.length) % L.length : s;
const idx = (L, s) => L.closed ? ((Math.round(s) % L.n) + L.n) % L.n : Math.max(0, Math.min(L.n - 1, Math.round(s)));
const nonBerm = (fs) => fs.filter((f) => f.type !== 'berm');

test('synthetic layouts', () => {
  for (const [name, L] of Object.entries(LAYOUTS)) {
    // left normal (cos h, -sin h) must point to the inside of a left (+kappa) turn
    let worst = 0;
    for (let i = 1; i < L.n - 1; i++) {
      const dx = L.x[i + 1] - L.x[i - 1], dz = L.z[i + 1] - L.z[i - 1];
      worst = Math.max(worst, Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dz) - L.heading[i]), Math.cos(Math.atan2(dx, dz) - L.heading[i]))));
    }
    check(`${name} heading = atan2(dx, dz) (rad err)`, worst, 0, 0.02);
  }
  const C = LAYOUTS.circle, i = 100, h = C.heading[i];
  const lx = C.x[i] + 10 * Math.cos(h), lz = C.z[i] - 10 * Math.sin(h); // 10 m to the left
  const R = 1 / C.curvature[0];
  check('left normal points to the centre of a left turn (dist to centre)', Math.hypot(lx - R, lz), R - 10.01, R - 9.99);
  // sbend: parts more than 120 m apart along the road stay > 45 m apart
  const S = LAYOUTS.sbend;
  let minD = Infinity;
  for (let a = 0; a < S.n; a += 2) for (let b = a + 120; b < S.n; b += 2) minD = Math.min(minD, Math.hypot(S.x[a] - S.x[b], S.z[a] - S.z[b]));
  check('sbend clearance (m)', minD, 45, 1e9);
  check('sbend min radius (m)', 1 / Math.max(...S.curvature.map(Math.abs)), 24.9, 25.1);
});

test('features: determinism', () => {
  for (const [name, L] of Object.entries(LAYOUTS)) for (const obstacles of ['mild', 'wild']) {
    const a = JSON.stringify(feats(L, 'det', obstacles)), b = JSON.stringify(feats(L, 'det', obstacles));
    check(`${name} ${obstacles} identical`, +(a === b), 1, 1);
  }
});

test('features: placement rules', () => {
  let badClear = 0, badBerm = 0, berms = 0, total = 0, minGap = Infinity, outside = 0;
  for (const [name, L] of Object.entries(LAYOUTS)) for (const seed of SEEDS) for (const obstacles of ['mild', 'wild']) {
    const fs = feats(L, seed, obstacles);
    for (const f of fs) {
      total++;
      if (f.s0 < 0 || f.s1 > L.length) outside++;
      if (f.type === 'berm') {
        berms++;
        let k = 0; for (let s = f.s0; s <= f.s1; s++) k = Math.max(k, Math.abs(L.curvature[idx(L, s)]));
        if (k < 1 / 40) badBerm++;
        continue;
      }
      for (let s = f.s0 - 60; s <= f.s1 + 40; s++) {
        if (!L.closed && (s < 0 || s > L.length)) { badClear++; break; }
        if (Math.abs(L.curvature[idx(L, s)]) > 1 / 120 + 1e-6) { badClear++; break; }
      }
    }
    if (obstacles === 'mild') {
      const nb = nonBerm(fs).sort((p, q) => p.s0 - q.s0);
      for (let k = 1; k < nb.length; k++) minGap = Math.min(minGap, nb[k].s0 - nb[k - 1].s0);
      if (L.closed && nb.length > 1) minGap = Math.min(minGap, nb[0].s0 + L.length - nb[nb.length - 1].s0);
    }
  }
  check('features total (all layouts, seeds, densities)', total, 50, 1e9);
  check('features inside [0, length]', outside, 0, 0);
  check('non-berm features with a curvy run-up/out (1/120 over [s0-60, s1+40])', badClear, 0, 0);
  check('berms not on a hairpin (r < 40)', badBerm, 0, 0);
  check('berms found on the sbend hairpin (some seeds)', berms, 1, 1e9);
  check('mild min spacing between feature starts (m)', minGap, 300, 1e9);
  // straight: wild packs >= 1.4x as many
  let mild = 0, wild = 0;
  for (const seed of SEEDS) { mild += feats(LAYOUTS.straight, seed, 'mild').length; wild += feats(LAYOUTS.straight, seed, 'wild').length; }
  console.log(`  straight 2 km over ${SEEDS.length} seeds: mild ${mild}, wild ${wild}`);
  check('straight mild per seed', mild / SEEDS.length, 3, 6.5);
  check('straight wild / mild count', wild / mild, 1.4, 3);
  // sbend: nothing but berms on the hairpin; nothing in the curvy middle
  const types = {};
  for (const seed of SEEDS) for (const f of feats(LAYOUTS.circle, seed, 'mild')) types[f.type] = (types[f.type] || 0) + 1;
  console.log('  circle mild types over seeds:', JSON.stringify(types));
  check('all four obstacle types appear', ['kicker', 'whoops', 'crest', 'tabletop'].filter((t) => types[t]).length, 4, 4);
});

test('features: dimensions', () => {
  let bad = 0, n = 0;
  const within = (v, [lo, hi], k = 1) => v >= lo * k - 1e-9 && v <= hi * k + 1e-9;
  for (const L of Object.values(LAYOUTS)) for (const seed of SEEDS) for (const obstacles of ['mild', 'wild']) {
    const hk = 1; // R14-4: every obstacles level keeps the mild heights ('wild' is level 4: only more of them)
    for (const f of feats(L, seed, obstacles)) {
      n++;
      const R = FEATURE_RANGES[f.type];
      let ok = true;
      for (const [key, range] of Object.entries(R)) {
        const k = key === 'height' ? hk : 1;
        if (key === 'angle' || !(key in f)) { if (!(key in f)) ok = false; continue; }
        if (!within(f[key], range, k)) ok = false;
      }
      if (f.type === 'whoops' && (!Number.isInteger(f.count) || Math.abs(f.s1 - f.s0 - f.count * f.pitch) > 1e-6)) ok = false;
      if (f.type === 'berm' && !(f.angle > 0 && f.angle <= 18 * DEG + 1e-9)) ok = false;
      if (!ok) { bad++; if (bad < 4) console.log('  bad', JSON.stringify(f)); }
    }
  }
  check(`features outside spec ranges (of ${n})`, bad, 0, 0);
  // the spec's T-4 ranges
  const S = FEATURE_RANGES;
  // R17: jumps shaped for ~70-100 km/h: gentle take-offs from a straight, landings downhill
  const inside = (r, lo, hi) => r[0] >= lo && r[1] <= hi;
  check('kicker take-off 5-8 deg, landing 8-12 deg, ends <= 0.4 m below the road', +(inside(S.kicker.takeoff, 5, 8) && inside(S.kicker.landing, 8, 12) &&
    inside(S.kicker.depth, 0, 0.4)), 1, 1);
  check('crest take-off 4-7 deg, landing 6-9 deg', +(inside(S.crest.takeoff, 4, 7) && inside(S.crest.landing, 6, 9)), 1, 1);
  check('whoops stretch 4-10 x 5-6 m (R11: the ridges are road bumps)', +(S.whoops.count[0] === 4 && S.whoops.count[1] === 10 &&
    S.whoops.pitch[0] === 5 && S.whoops.pitch[1] === 6 && !('height' in S.whoops)), 1, 1);
  check('tabletop take-off 6-8 deg, top 10-18 m, down 8-12 deg', +(inside(S.tabletop.takeoff, 6, 8) && inside(S.tabletop.topS, 10, 18) &&
    inside(S.tabletop.landing, 8, 12)), 1, 1);
});

test('features: profile shapes', () => {
  const L = LAYOUTS.straight;
  const find = (type, obstacles = 'mild') => {
    for (let k = 0; k < 200; k++) { const f = feats(L, 'shape' + k, obstacles).find((q) => q.type === type); if (f) return f; }
    throw new Error('no ' + type);
  };
  // R17 launch shape, sampled every 5 cm: continuous height and slope, a straight take-off of >= 3 m up to the lip
  // (f.lipS from s0), a gentle concave entry, a downhill landing, no deeper than the feature's depth.
  const D = 0.05, at = (f, s) => profileOffset([f], s);
  const shape = (f) => {
    let maxStep = 0, maxKink = 0, up = 0, down = 0, low = 0, high = 0, entryK = 0, footK = 0;
    for (let s = f.s0; s + 2 * D <= f.s1; s += D) {
      const a = at(f, s), b = at(f, s + D), c = at(f, s + 2 * D), m0 = (b - a) / D, m1 = (c - b) / D;
      maxStep = Math.max(maxStep, Math.abs(b - a)); maxKink = Math.max(maxKink, Math.abs(m1 - m0));
      up = Math.max(up, m0); down = Math.min(down, m0); low = Math.min(low, a); high = Math.max(high, a);
      if (s < f.s0 + f.lipS - 3 && m1 > m0) entryK = Math.max(entryK, (m1 - m0) / D);
      if (s > f.s0 + f.lipS && m1 > m0 + 1e-12) footK = Math.max(footK, (m1 - m0) / D);
    }
    let straight = 0; const mLip = (at(f, f.s0 + f.lipS - D) - at(f, f.s0 + f.lipS - 2 * D)) / D;
    for (let s = f.s0 + f.lipS - D; s > f.s0; s -= D) { if (Math.abs((at(f, s) - at(f, s - D)) / D - mLip) > 1e-6) break; straight += D; }
    return { maxStep, maxKink, up: Math.atan(up) / DEG, down: Math.atan(-down) / DEG, low, high, entryR: entryK ? 1 / entryK : Infinity, footR: footK ? 1 / footK : Infinity, straight, lipDeg: Math.atan(mLip) / DEG };
  };
  for (const [type, maxUp, maxDown] of [['kicker', 8, 12], ['crest', 7, 9], ['tabletop', 8, 12]]) {
    const f = find(type), g = shape(f), R = FEATURE_RANGES[type];
    check(`${type} offset 0 at s0 and s1`, Math.abs(at(f, f.s0)) + Math.abs(at(f, f.s1)), 0, 1e-6);
    check(`${type} height continuous (m per 5 cm)`, g.maxStep, 0, D * Math.tan(13 * DEG));
    check(`${type} slope continuous (change per 5 cm)`, g.maxKink, 0, 0.02);
    check(`${type} steepest climb (deg)`, g.up, 0, maxUp + 1e-6);
    check(`${type} steepest descent (deg)`, g.down, 0, maxDown + 1e-6);
    check(`${type} straight take-off before the lip (m)`, g.straight, 3 - 2 * D, 1e9);
    check(`${type} lip angle = its take-off (deg)`, g.lipDeg - f.takeoff, -0.01, 0.01);
    check(`${type} entry curve radius (m)`, g.entryR, R.entryR[0] - 1, 1e9);
    check(`${type} tightest concave bend after the lip (m)`, g.footR, type === 'crest' ? 99 : 59, 1e9);
    check(`${type} height = its peak (m)`, g.high - f.height, -1e-3, 1e-6);
    check(`${type} reaches its depth, no deeper (m)`, g.low + f.depth, -1e-6, 1e-3);
  }
  const tt = find('tabletop');
  check('tabletop top flat', Math.abs(at(tt, tt.s0 + tt.lipS + 3) - at(tt, tt.s0 + tt.lipS + tt.topS - 3)), 0, 1e-6);
  const kk = find('kicker'), cr = find('crest');
  check('kicker height (m)', kk.height, 0.45, 1.3);
  check('crest height (m)', cr.height, 0.6, 2.0);
  check('tabletop height (m)', tt.height, 0.6, 1.35);
  const wh = find('whoops');
  let whMax = 0; for (let s = wh.s0; s <= wh.s1; s += 0.1) whMax = Math.max(whMax, Math.abs(profileOffset([wh], s)));
  check('whoops add no profile (R11: ridges are road bumps)', whMax, 0, 0);
  for (const f of [kk, cr, tt, wh]) {
    check(`${f.type} offset 0 outside [s0, s1]`, Math.abs(profileOffset([f], f.s0 - 5)) + Math.abs(profileOffset([f], f.s1 + 5)), 0, 1e-9);
    check(`${f.type} bermBank 0`, Math.abs(bermBank([f], (f.s0 + f.s1) / 2)), 0, 0);
  }
  // berm on the sbend hairpin: bank to the outside, i.e. for a right turn (kappa < 0) the left side is up (+)
  const S = LAYOUTS.sbend;
  let bm = null; for (let k = 0; k < 100 && !bm; k++) bm = feats(S, 'berm' + k, 'mild').find((q) => q.type === 'berm');
  const mid = (bm.s0 + bm.s1) / 2;
  check('berm extra bank mid hairpin (deg)', bermBank([bm], mid) / DEG, 5, 18);
  check('berm bank sign: right hairpin => left side up', Math.sign(bermBank([bm], mid)), 1, 1);
  check('berm offset 0', Math.abs(profileOffset([bm], mid)), 0, 0);
  check('berm bank 0 outside', Math.abs(bermBank([bm], bm.s0 - 1)) + Math.abs(bermBank([bm], bm.s1 + 1)), 0, 0);
});

// ---- terrain ----
// Project a grid point onto the centreline near sample i: returns { s, d, dist, i, t }.
function project(L, px, pz, i0, win = 4) {
  let best = null;
  for (let i = i0 - win; i <= i0 + win; i++) {
    let a = i, b = i + 1;
    if (L.closed) { a = ((a % L.n) + L.n) % L.n; b = ((b % L.n) + L.n) % L.n; } else if (a < 0 || b > L.n - 1) continue;
    const ax = L.x[a], az = L.z[a], ex = L.x[b] - ax, ez = L.z[b] - az, ll = ex * ex + ez * ez;
    const t = Math.max(0, Math.min(1, ((px - ax) * ex + (pz - az) * ez) / ll));
    const qx = ax + ex * t, qz = az + ez * t, dist = Math.hypot(px - qx, pz - qz);
    if (!best || dist < best.dist) {
      const cr = ex * (pz - az) - ez * (px - ax); // > 0 => point is to the right of travel? decide by left normal below
      const h = Math.atan2(ex, ez), d = (px - qx) * Math.cos(h) - (pz - qz) * Math.sin(h);
      best = { a, b, t, dist, d: Math.sign(d) * dist, cr };
    }
  }
  return best;
}
const lerp = (a, b, t) => a + (b - a) * t;
const T = {}, NAT = {}, HILLS = {}; // NAT: hills + bumps (no flattening); HILLS: hills only
const terr = (name, obstacles = 'mild', seed = 'ter') => {
  const key = `${name}|${obstacles}|${seed}`;
  if (!T[key]) {
    const L = LAYOUTS[name], fs = feats(L, seed, obstacles);
    const t0 = performance.now();
    T[key] = { L, fs, t: generateTerrain(L, fs, rng(seed).fork('terrain'), {}) };
    T[key].ms = performance.now() - t0;
    NAT[key] = generateTerrain(L, fs, rng(seed).fork('terrain'), { flatten: false });
    HILLS[key] = generateTerrain(L, fs, rng(seed).fork('terrain'), { flatten: false, bumps: false });
  }
  return T[key];
};

test('terrain: determinism and coverage', () => {
  const L = LAYOUTS.sbend, fs = feats(L, 'x', 'wild');
  const a = generateTerrain(L, fs, rng('x').fork('terrain'), {}), b = generateTerrain(L, fs, rng('x').fork('terrain'), {});
  let same = a.heights.length === b.heights.length && a.nx === b.nx && a.x0 === b.x0;
  for (let i = 0; same && i < a.heights.length; i++) if (a.heights[i] !== b.heights[i]) same = false;
  for (let i = 0; same && i < L.n; i++) if (a.road[i] !== b.road[i] || a.bank[i] !== b.bank[i]) same = false;
  check('identical heights/road/bank', +same, 1, 1);
  const c = generateTerrain(L, fs, rng('y').fork('terrain'), {});
  check('different seed => different hills (m)', Math.abs(c.road[0] - a.road[0]) + Math.abs(c.heights[0] - a.heights[0]), 0.01, 1e9);
  for (const name of Object.keys(LAYOUTS)) {
    const { L, t } = terr(name), B = L.bounds;
    check(`${name} cell = 1`, t.cell, 1, 1);
    check(`${name} heights length`, t.heights.length - t.nx * t.nz, 0, 0);
    check(`${name} covers minX - 150`, B.minX - 150 - t.x0, 0, 1e9);
    check(`${name} covers maxX + 150`, t.x0 + (t.nx - 1) - (B.maxX + 150), 0, 1e9);
    check(`${name} covers minZ - 150`, B.minZ - 150 - t.z0, 0, 1e9);
    check(`${name} covers maxZ + 150`, t.z0 + (t.nz - 1) - (B.maxZ + 150), 0, 1e9);
    check(`${name} road/bank length`, (t.road.length === L.n) + (t.bank.length === L.n), 2, 2);
    let lo = Infinity, hi = -Infinity; for (const h of t.heights) { lo = Math.min(lo, h); hi = Math.max(hi, h); }
    check(`${name} height range spread (m)`, hi - lo, 5, 80);
  }
});

test('terrain: heightAt', () => {
  const { t } = terr('circle'), r = rng('h');
  let gridErr = 0, biErr = 0;
  for (let k = 0; k < 2000; k++) {
    const ix = r.int(0, t.nx - 2), iz = r.int(0, t.nz - 2), fx = r.next(), fz = r.next();
    const h = (a, b) => t.heights[b * t.nx + a];
    gridErr = Math.max(gridErr, Math.abs(heightAt(t, t.x0 + ix, t.z0 + iz) - h(ix, iz)));
    // Rapier's split: triangles on either side of the (x+1, z)–(x, z+1) diagonal.
    const a = h(ix, iz), b = h(ix + 1, iz), c = h(ix, iz + 1), d = h(ix + 1, iz + 1);
    const want = fx + fz < 1 ? a + (b - a) * fx + (c - a) * fz : d + (c - d) * (1 - fx) + (b - d) * (1 - fz);
    biErr = Math.max(biErr, Math.abs(heightAt(t, t.x0 + ix + fx, t.z0 + iz + fz) - want));
  }
  check('heightAt == heights at grid points (m)', gridErr, 0, 1e-5);
  check('heightAt on the heightfield triangles between (m)', biErr, 0, 1e-4);
  check('heightAt clamps outside', +Number.isFinite(heightAt(t, t.x0 - 1e4, t.z0 + 1e5)), 1, 1);
});

test('terrain: road profile and bank', () => {
  for (const name of Object.keys(LAYOUTS)) for (const obstacles of ['mild', 'wild']) {
    const { L, fs, t } = terr(name, obstacles);
    let g = 0, b = 0, extra = 0, offErr = 0;
    const base = (i) => t.road[i] - profileOffset(fs, i);
    const last = L.closed ? L.n : L.n - 1;
    for (let i = 0; i < last; i++) g = Math.max(g, Math.abs(base((i + 1) % L.n) - base(i)) / L.ds);
    for (let i = 0; i < L.n; i++) {
      b = Math.max(b, Math.abs(t.bank[i]));
      extra = Math.max(extra, Math.abs(t.bank[i] - bermBank(fs, i)));
    }
    check(`${name} ${obstacles} grade outside features (%)`, g * 100, 0, 12);
    check(`${name} ${obstacles} base bank (deg)`, extra / DEG, 0, 4.001);
    check(`${name} ${obstacles} total bank (deg)`, b / DEG, 0, 22.001);
    void offErr;
  }
  const { L, t } = terr('circle');
  check('circle (left turn) banks into the corner: left side down (deg)', t.bank[500] / DEG, -4.001, -0.5);
  // sbend wild: the berm (if any) adds bank
  const S = terr('sbend', 'mild', 'berm-terrain');
  void L;
  check('sbend hairpin bank (deg)', Math.abs(S.t.bank[Math.round(250 + 157 + 120 + 37)]) / DEG, 3, 22);
});

test('terrain: flattening', () => {
  for (const name of Object.keys(LAYOUTS)) for (const obstacles of ['mild', 'wild']) {
    const key = `${name}|${obstacles}|ter`;
    const { L, t } = terr(name, obstacles), nat = NAT[key], r = rng('flat' + name + obstacles);
    let road = 0, shoulder = 0, far = 0, nRoad = 0, nSh = 0, nFar = 0;
    for (let k = 0; k < 4000; k++) {
      const i = r.int(0, L.n - 1), d = r.range(-24, 24), h = L.heading[i];
      const px = Math.round(L.x[i] + d * Math.cos(h) - t.x0) + t.x0, pz = Math.round(L.z[i] - d * Math.sin(h) - t.z0) + t.z0;
      const p = project(L, px, pz, i, 6);
      const ix = px - t.x0, iz = pz - t.z0, g = t.heights[iz * t.nx + ix];
      if (p.t === 0 && p.a === 0 && !L.closed) continue; // beyond the start cap
      if (p.t === 1 && p.b === L.n - 1 && !L.closed) continue;
      const rh = lerp(t.road[p.a], t.road[p.b], p.t), bk = lerp(t.bank[p.a], t.bank[p.b], p.t);
      const target = rh + Math.tan(bk) * p.d, ad = Math.abs(p.d);
      if (ad <= 3.5) { nRoad++; road = Math.max(road, Math.abs(g - target)); }
      else if (ad <= 5.5) { nSh++; shoulder = Math.max(shoulder, Math.abs(g - target)); }
      else if (ad >= 20.5) {
        // only where no other part of the road is within 20.5 m
        let near = Infinity; for (let j = 0; j < L.n; j += 1) near = Math.min(near, Math.hypot(L.x[j] - px, L.z[j] - pz));
        if (near < 21.5) continue;
        nFar++; far = Math.max(far, Math.abs(g - nat.heights[iz * t.nx + ix]));
      }
    }
    check(`${name} ${obstacles} road |d|<=3.5: ground - (road + tan(bank) d) (m, n=${nRoad})`, road, 0, 0.02);
    check(`${name} ${obstacles} shoulder |d|<=5.5 still flat (m, n=${nSh})`, shoulder, 0, 0.02);
    check(`${name} ${obstacles} |d|>=20.5 natural hills + bumps (m, n=${nFar})`, far, 0, 0.05);
  }
  // blend is in between: at |d| ~ 13 the ground less its bumps lies between target and the hills
  const { L, t } = terr('straight'), nat = NAT['straight|mild|ter'], hl = HILLS['straight|mild|ter'];
  let between = 0, cnt = 0;
  for (let i = 100; i < L.n - 100; i += 37) {
    const px = Math.round(L.x[i] + 13), pz = Math.round(L.z[i]);
    const c = (pz - t.z0) * t.nx + px - t.x0, n = hl.heights[c], g = t.heights[c] - (nat.heights[c] - n);
    const tg = t.road[i] + Math.tan(t.bank[i]) * (px - L.x[i]);
    cnt++; if (g >= Math.min(n, tg) - 1e-3 && g <= Math.max(n, tg) + 1e-3) between++;
  }
  check('blend zone between road and hills (fraction)', between / cnt, 1, 1);
});

test('terrain: off-road bumps', () => {
  const { L, t } = terr('circle'), key = 'circle|mild|ter', nat = NAT[key], hl = HILLS[key];
  // Bump field = natural - hills; only far from the road (> 24 m) so the fade doesn't count.
  const B = (ix, iz) => nat.heights[iz * t.nx + ix] - hl.heights[iz * t.nx + ix];
  let mx = 0, s2 = 0, n = 0, zc = 0, run = 0;
  const cx = (L.bounds.minX + L.bounds.maxX) / 2 - t.x0, cz = (L.bounds.minZ + L.bounds.maxZ) / 2 - t.z0;
  // Rows through the middle of the loop (the circle's inside is > 300 m from the road).
  for (let iz = Math.round(cz - 100); iz <= cz + 100; iz += 7) {
    let prev = null;
    for (let ix = Math.round(cx - 200); ix <= cx + 200; ix++) {
      const b = B(ix, iz); mx = Math.max(mx, Math.abs(b)); s2 += b * b; n++;
      if (prev !== null && Math.sign(b) !== Math.sign(prev)) zc++;
      prev = b; run++;
    }
  }
  check('bump peak |h| (m)', mx, BUMPS.amp[0], BUMPS.amp[1]);
  check('bump rms (m)', Math.sqrt(s2 / n), 0.04, 0.12);
  check('bump wavelength from zero crossings (m)', 2 * run / zc, 2.5, 4.5);
  // Fade: smooth (no bumps) out to |d| 6 m, partial between, full past 10 m.
  const flat = generateTerrain(L, terr('circle').fs, rng('ter').fork('terrain'), { bumps: false });
  const r = rng('bumpfade');
  const F = 5.5; // the flat shoulder without edges (3.5 + 2 m); the verge bumps' fade is measured past it
  let inner = 0, mid = 0, outer = 0, nO = 0;
  for (let k = 0; k < 4000; k++) {
    const i = r.int(0, L.n - 1), d = r.range(-14, 14), h = L.heading[i];
    const px = Math.round(L.x[i] + d * Math.cos(h)), pz = Math.round(L.z[i] - d * Math.sin(h));
    const p = project(L, px, pz, i, 6), c = (pz - t.z0) * t.nx + px - t.x0, ad = Math.abs(p.d);
    const dh = Math.abs(t.heights[c] - flat.heights[c]), b = Math.abs(nat.heights[c] - hl.heights[c]);
    if (ad <= F + BUMPS.from) inner = Math.max(inner, dh);
    else if (ad < F + BUMPS.to) mid = Math.max(mid, dh - b);
    else { outer = Math.max(outer, Math.abs(dh - b)); nO++; }
  }
  check(`no bumps within |d| <= ${F + BUMPS.from} m (m)`, inner, 0, 1e-5);
  check(`fade zone bumps no taller than full ones (m)`, mid, -1, 1e-5);
  check(`full bumps from |d| >= ${F + BUMPS.to} m (m, n=${nO})`, outer, 0, 1e-4);
});

test('terrain: obstacles in road[]', () => {
  const L = LAYOUTS.straight;
  let kk = null, wh = null, seedK;
  for (let k = 0; k < 200 && !(kk && wh); k++) {
    const fs = feats(L, 'ob' + k, 'mild');
    if (!kk) { kk = fs.find((f) => f.type === 'kicker'); seedK = 'ob' + k; }
    if (!wh) wh = fs.find((f) => f.type === 'whoops');
  }
  {
    const fs = feats(L, seedK, 'mild'), t = generateTerrain(L, fs, rng(seedK).fork('terrain'), {});
    const lip = Math.round(kk.s0 + kk.lipS);
    const rise = t.road[lip] - t.road[Math.round(kk.s0)];
    check('kicker rises to the lip in road[] (m)', rise, 0.5 * kk.height, 1.5 * kk.height + 1.5);
    check('kicker lands downhill in road[] (m over 10 m)', t.road[lip] - t.road[lip + 10], 0.5, 3);
  }
});

test('terrain: performance', () => {
  for (const name of Object.keys(LAYOUTS)) { const e = terr(name); console.log(`  ${name}: ${e.t.nx}x${e.t.nz} in ${e.ms.toFixed(0)} ms`); }
  const big = circle(700); // ~4.4 km, bounds 1400 m => ~1700 x 1700 cells
  const fs = placeFeatures(big, rng('big').fork('features'), { obstacles: 'wild' });
  const t0 = performance.now();
  const t = generateTerrain(big, fs, rng('big').fork('terrain'), {});
  const ms = performance.now() - t0;
  console.log(`  1400 m loop: ${t.nx}x${t.nz} (${(t.heights.byteLength / 1e6).toFixed(1)} MB heights), ${fs.length} features`);
  check('1400 m-bounds terrain time (ms)', ms, 0, 1500);
});

test('feature counts (report)', () => {
  for (const [name, L] of Object.entries(LAYOUTS)) for (const obstacles of ['mild', 'wild']) {
    const c = {}; let n = 0;
    for (const seed of SEEDS) for (const f of feats(L, seed, obstacles)) { c[f.type] = (c[f.type] || 0) + 1; n++; }
    console.log(`  ${name} ${obstacles}: ${(n / SEEDS.length).toFixed(1)}/seed ${JSON.stringify(c)}`);
  }
});

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) { console.log('FAILED:', failed.map((f) => f.name).join('; ')); process.exit(1); }
