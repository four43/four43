// Obstacles along the road (spec tracks T-4): kickers, crests, whoops, tabletops on straight-ish
// stretches, and bermed hairpins. Features are pure data; profileOffset / bermBank evaluate their
// shapes analytically so terrain, rendering and the autopilot all agree on them. Whoops are only a
// stretch here: their ridges are 2D road bumps (gen/bumps.js, rally spec R11), not a profile.

import { styleLevel, obstacleLevel } from './levels.js';
import { flatOut } from './speed.js';

const DEG = Math.PI / 180, G = 9.81;
// Ranges from the spec; the obstacles level only changes how often they come (rally spec R14-4). The jumps (rally spec
// R18-3) are sized for `v`, the flat-out speed at their lip (gen/speed.js): a concave entry (radius ≥ entryR and
// v² / g, ~1 g at most) up to the take-off angle, a straight of `straight` m to the lip so both axles leave from one
// plane, then a downhill landing long enough for the flat-out flight. Take-off θ and landing n split the angle a car
// meets the landing at, θ + n ≈ impact / v (so it touches down at ~`impact` m/s into the slope at any speed); θ takes
// `share` of it. Their height and depth follow from those numbers. Narrow (R18-2): `len` m of road squeezed to a
// half-width of `half` m, eased in and out over NARROW_RAMP m.
export const FEATURE_RANGES = {
  kicker: { entryR: [65, 85], straight: [3, 4], impact: [2.8, 3.6], share: [0.4, 0.5] },
  crest: { entryR: [110, 150], straight: [4, 8], impact: [2.8, 3.6], share: [0.3, 0.4] },
  whoops: { count: [4, 10], pitch: [5, 6] }, // the stretch: count × pitch m; bumps.js lays its ridges
  tabletop: { entryR: [65, 85], straight: [3, 3.5], topS: [10, 18], impact: [2.8, 3.6], share: [0.45, 0.55] },
  narrow: { len: [40, 100], half: [1.3, 1.5] },
  berm: { angle: [10 * DEG, 18 * DEG] },
};
// deg: [take-off, landing] at most (a slow jump's angles; the R17 shapes'), and at least MIN_ANGLE each.
export const MAX_ANGLE = { kicker: [7.5, 12], crest: [7, 9], tabletop: [8, 12] }, MIN_ANGLE = 2;
// Fixed bends of the jump profiles (m): the convex lip (a short round-over, which a fast car flies past) and the
// tabletop's top edges; the concave foot of a landing and the climb back to the road are at least LAND_R and 2 v² / g
// (half a g, on top of the landing).
const LIP_R = { kicker: 3, crest: 8, tabletop: 3 }, LAND_R = { kicker: 60, crest: 100, tabletop: 60 };
// Landing straight past the flat-out touchdown: LAND_MARGIN m and LAND_SETTLE s at v, so the suspension recovers
// before the foot.
const LAND_MARGIN = 5, LAND_SETTLE = 0.4;
// A car flies straight: under its flight (lip to touchdown, X m) the road may bend it at most DRIFT m off the line
// (κ X² / 2), so |κ| ≤ 2 DRIFT / X² there.
const DRIFT = 1.5;
export const NARROW_RAMP = 15;
const WEIGHTS = [['kicker', 4], ['whoops', 2], ['crest', 3], ['tabletop', 3], ['narrow', 4]];
// obstacles level 1 … 5: features per metre × PACK (2 = the old mild; heights never change: the old wild's ×1.4 tossed the car)
export const PACK = { 1: 0.6, 2: 1, 3: 1.3, 4: 1.6, 5: 2 };
const RUN_UP = 60, RUN_OUT = 40, MAX_K = 1 / 120; // straight-ish stretch around a feature
// Twisty layouts rarely run 160 m at |κ| ≤ 1/120, so there the run-up is 40 m and the run-out
// 30 m; whoops and tabletops (ridden slowly, no flight) may sit on mild bends (|κ| ≤ 1/60), and
// kickers, crests (which launch) and narrows keep |κ| ≤ 1/120 from the run-up to their end, with a mild
// run-out. Either way the whole stretch stays clear of hairpins and tight corners.
const MILD_K = 1 / 60;
const TWISTY = { runUp: 40, runOut: 30, gap: [120, 250], launch: { narrow: 1 } };
const HAIRPIN_K = 1 / 40, BERM_CHANCE = 0.3, BERM_RAMP = 12;
const START_CLEAR = 60; // keep the spawn / start gate area plain (s = 0..60 before a run-up)

const smooth = (t) => t * t * (3 - 2 * t);
const halfCos = (t) => (1 - Math.cos(Math.PI * t)) / 2; // 0 → 1 with flat ends

function weighted(r, list) {
  let tot = 0; for (const [, w] of list) tot += w;
  let u = r.next() * tot;
  for (const [v, w] of list) { if ((u -= w) < 0) return v; }
  return list[list.length - 1][0];
}

// A jump profile is a slope program: arcs [length, slope at start, slope at end], the slope changing linearly along
// each (a parabola: constant curvature), so height and slope are continuous by construction.
const arc = (len, m0, m1) => [len, m0, m1];
const rise = ([len, m0, m1]) => len * (m0 + m1) / 2;
const bend = (r, m0, m1) => arc(r * Math.abs(m1 - m0), m0, m1); // radius r: |slope change| per metre = 1 / r

// Height at u along arcs (past their end: the last slope carried on).
function heightOf(arcs, u) {
  let y = 0, m = 0;
  for (const [len, m0, m1] of arcs) {
    if (u <= len) return y + u * m0 + (m1 - m0) * u * u / (2 * len);
    y += rise([len, m0, m1]); u -= len; m = m1;
  }
  return y + u * m;
}
const sum = (arcs, k) => arcs.reduce((a, x) => a + (k ? rise(x) : x[0]), 0);

// Where a car leaving the lip (at lipS, height y) at v and angle th first meets the ground of `arcs` (m from s0).
function touchdown(arcs, lipS, y, v, th) {
  const vx = v * Math.cos(th), vy = v * Math.sin(th);
  for (let x = 0.5; x < 400; x += 0.25) {
    const t = x / vx;
    if (y + vy * t - G * t * t / 2 <= heightOf(arcs, lipS + x)) return lipS + x;
  }
  return lipS + 400;
}

// The jump's arcs, where its lip is (m from s0), and its angles (rad) and design numbers.
function program(f) {
  const A = MAX_ANGLE[f.type], tot = f.impact / f.v, rv = f.v * f.v / G;
  const th = Math.min(A[0], Math.max(MIN_ANGLE, tot * f.share / DEG)) * DEG;
  const nAng = Math.min(A[1], Math.max(MIN_ANGLE, (tot - th) / DEG)) * DEG;
  const m = Math.tan(th), n = Math.tan(nAng), footR = Math.max(LAND_R[f.type], 2 * rv);
  const up = [bend(Math.max(f.entryR, rv), 0, m), arc(f.straight, m, m)], lipS = sum(up);
  let pre = up, mTop = m, topS = 0;
  if (f.type === 'tabletop') { // a top shorter than the flat-out flight back to lip height
    topS = Math.max(4, Math.min(f.topS, 0.7 * 2 * f.v * f.v * Math.cos(th) * Math.sin(th) / G));
    pre = [...up, bend(LIP_R.tabletop, m, 0), arc(topS, 0, 0)]; mTop = 0;
  }
  pre = [...pre, bend(LIP_R[f.type], mTop, -n)];
  // The landing straight runs LAND_MARGIN past the flat-out touchdown, and at least down to the road.
  const down = touchdown([...pre, arc(400, -n, -n)], lipS, sum(up, 1), f.v, th), reach = down + Math.max(LAND_MARGIN, LAND_SETTLE * f.v) - sum(pre);
  const foot = bend(footR, -n, 0), yPre = sum(pre, 1);
  let straight = Math.max(0, reach);
  const above = yPre - n * straight + rise(foot);
  if (above > 0) straight += above / n;
  const arcs = [...pre, arc(straight, -n, -n), foot];
  const depth = -sum(arcs, 1);
  if (depth > 1e-3) { // back up to the road: an S of radius footR, at most the landing slope
    let k = n, run = (depth - footR * k * k) / k;
    if (run < 0) { k = Math.sqrt(depth / footR); run = 0; }
    arcs.push(bend(footR, 0, k), arc(run, k, k), bend(footR, k, 0));
  }
  return { arcs, lipS, flight: down - lipS, takeoff: th / DEG, landing: nAng / DEG, topS, depth: Math.max(0, depth) };
}

function makeFeature(type, s0, r, speed) {
  const R = FEATURE_RANGES[type], rg = (k) => r.range(R[k][0], R[k][1]);
  if (type === 'whoops') {
    const count = r.int(R.count[0], R.count[1]), pitch = rg('pitch');
    return { type, s0, s1: s0 + count * pitch, count, pitch };
  }
  if (type === 'narrow') {
    const len = rg('len'), half = rg('half');
    return { type, s0, s1: s0 + len + 2 * NARROW_RAMP, len, half, ramp: NARROW_RAMP };
  }
  const f = { type, s0 };
  for (const k of Object.keys(R)) f[k] = rg(k);
  f.v = speed(s0);
  const { arcs, ...shape } = program(f);
  Object.assign(f, shape);
  let y = 0, height = 0, len = 0;
  for (const a of arcs) { // the peak can sit inside an arc (the lip's round-over), where its slope passes 0
    const [l, m0, m1] = a;
    if (m0 > 0 && m1 < 0) height = Math.max(height, y + m0 * m0 * l / (2 * (m0 - m1)));
    y += rise(a); len += l; height = Math.max(height, y);
  }
  return Object.assign(f, { s1: s0 + len, height, arcs });
}

// style: 1 … 5 (default: the layout's own); 1–3 place as tight roads do. obstacles: 1 … 5.
// speed: the flat-out speed per layout sample the jumps are sized for (default: flatOut on a μ 1 road).
export function placeFeatures(layout, r, { obstacles: ob = 2, style: sv = layout.style ?? 4, speed: vs = flatOut(layout) } = {}) {
  const { n, closed, length, curvature: K } = layout, style = styleLevel(sv), obstacles = obstacleLevel(ob);
  const tw = style <= 3, runUp = tw ? TWISTY.runUp : RUN_UP, runOut = tw ? TWISTY.runOut : RUN_OUT;
  const pack = PACK[obstacles];
  const kAt = (s) => {
    let i = Math.round(s);
    if (closed) i = ((i % n) + n) % n; else if (i < 0 || i > n - 1) return Infinity;
    return Math.abs(K[i]);
  };
  const clear = (a, b, kMax = MAX_K) => { for (let s = Math.floor(a); s <= Math.ceil(b); s++) if (kAt(s) > kMax + 1e-7) return false; return true; };
  // Design speed: the fastest over the entry (the lip is 10-40 m in), at least 10 m/s.
  const speed = (s0) => { let v = 10; for (let s = s0; s <= s0 + 40; s += 2) v = Math.max(v, vs[closed ? ((Math.round(s) % n) + n) % n : Math.min(n - 1, Math.round(s))]); return v; };
  const out = [];
  // Obstacles: walk the road; at each candidate start try a feature, else step 10 m on. After a
  // placement the next candidate is a random 300–500 m (tight 120–250 m) ÷ PACK further on.
  const types = r.fork('types'), params = r.fork('params'), gaps = r.fork('gaps');
  const [g0, g1] = tw ? TWISTY.gap : [300, 500], gap = () => gaps.range(g0, g1) / pack;
  const sMax = length - (closed ? START_CLEAR : 0); // loops: keep the run-up to the line plain
  let s = START_CLEAR + runUp + gaps.range(0, 60);
  // Twisty: the short straights fit only some types, so try up to 4 draws per spot, 5 m apart.
  const draws = tw ? 6 : 3, step = tw ? 5 : 10;
  let first = null;
  while (s < sMax) {
    let f = null;
    for (let t = 0; t < draws && !f; t++) {
      const c = makeFeature(weighted(types, WEIGHTS), s, params, speed);
      const wrapOk = !closed || !first || first.s0 + length - c.s0 >= g0 / pack;
      const ok = !tw ? clear(c.s0 - RUN_UP, c.s1 + RUN_OUT)
        : clear(c.s0 - runUp, c.s1 + runOut, MILD_K) && (!TWISTY.launch[c.type] || clear(c.s0, c.s1));
      const straight = !c.flight || clear(c.s0, c.s0 + c.lipS + c.flight + LAND_MARGIN, 2 * DRIFT / c.flight ** 2);
      if (c.s1 + runOut <= sMax && wrapOk && ok && straight) f = c;
    }
    if (f) {
      out.push(f); first = first || f;
      s = f.s0 + Math.max(gap(), f.s1 - f.s0 + runUp + runOut);
    } else s += step;
  }
  // Berms: every hairpin (contiguous |κ| > 1/40) gets one with some chance; banks to the outside.
  const berm = r.fork('berms');
  for (let i = 0; i < n;) {
    if (Math.abs(K[i]) <= HAIRPIN_K) { i++; continue; }
    let j = i; while (j + 1 < n && Math.abs(K[j + 1]) > HAIRPIN_K) j++;
    const roll = berm.next(), angle = berm.range(...FEATURE_RANGES.berm.angle);
    const s0 = Math.max(0, i - BERM_RAMP), s1 = Math.min(length, j + BERM_RAMP);
    if (roll < BERM_CHANCE) out.push({ type: 'berm', s0, s1, angle, dir: Math.sign(K[(i + j) >> 1]), rampS: BERM_RAMP });
    i = j + 1;
  }
  return out.sort((a, b) => a.s0 - b.s0);
}

// Height (m) a feature adds at u = s - s0 (0 outside).
function offset(f, u) {
  return f.arcs ? heightOf(f.arcs, Math.min(u, f.s1 - f.s0)) : 0;
}

// Metres added to the road height at s (berms and whoops add none: whoops are road bumps).
export function profileOffset(features, s) {
  let y = 0;
  for (const f of features) if (f.arcs && s >= f.s0 && s <= f.s1) y += offset(f, s - f.s0);
  return y;
}

// Extra bank (rad, + = left side up) at s. A berm banks into the corner: for a left hairpin
// (κ > 0) the right side is raised, so the bank is negative.
export function bermBank(features, s) {
  let b = 0;
  for (const f of features) {
    if (f.type !== 'berm' || s < f.s0 || s > f.s1) continue;
    const w = smooth(Math.min(1, (s - f.s0) / f.rampS, (f.s1 - s) / f.rampS));
    b += -f.dir * f.angle * w;
  }
  return b;
}
