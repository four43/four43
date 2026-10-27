// Obstacles along the road (spec tracks T-4): kickers, crests, whoops, tabletops on straight-ish
// stretches, and bermed hairpins. Features are pure data; profileOffset / bermBank evaluate their
// shapes analytically so terrain, rendering and the autopilot all agree on them. Whoops are only a
// stretch here: their ridges are 2D road bumps (gen/bumps.js, rally spec R11), not a profile.

import { styleLevel, obstacleLevel } from './levels.js';

const DEG = Math.PI / 180;
// Ranges from the spec; the obstacles level only changes how often they come (rally spec R14-4). The jumps (rally spec
// R17) are shaped for ~70-100 km/h: a concave entry (radius entryR, m) up to the take-off angle (deg), a straight of
// `straight` m to the lip so both axles leave from one plane, then a downhill landing (deg) to `depth` m below the road
// (recovering over recS m). Their height follows from those numbers.
export const FEATURE_RANGES = {
  kicker: { takeoff: [5, 7.5], entryR: [65, 85], straight: [3, 4], landing: [8, 12], depth: [0, 0.4], recS: [15, 25] },
  crest: { takeoff: [4, 7], entryR: [110, 150], straight: [4, 8], landing: [6, 9], depth: [0.5, 1.5], recS: [25, 40] },
  whoops: { count: [4, 10], pitch: [5, 6] }, // the stretch: count × pitch m; bumps.js lays its ridges
  tabletop: { takeoff: [6, 8], entryR: [65, 85], straight: [3, 3.5], topS: [10, 18], landing: [8, 12] },
  berm: { angle: [10 * DEG, 18 * DEG] },
};
// Fixed bends of the jump profiles (m): the convex lip (a short round-over, which a fast car flies past) and the
// tabletop's top edges; the concave foot of a landing is at least LAND_R (a low jump eases its landing angle to fit).
// Concave bends are sized for ~1 g of extra load at 90-100 km/h: tighter ones bottomed the suspension and the hull
// struck the ramp.
const LIP_R = { kicker: 3, crest: 8, tabletop: 3 }, LAND_R = { kicker: 60, crest: 100, tabletop: 60 };
const WEIGHTS = [['kicker', 3], ['whoops', 3], ['crest', 2], ['tabletop', 2]];
// obstacles level 1 … 5: features per metre × PACK (2 = the old mild; heights never change: the old wild's ×1.4 tossed the car)
export const PACK = { 1: 0.6, 2: 1, 3: 1.3, 4: 1.6, 5: 2 };
const RUN_UP = 60, RUN_OUT = 40, MAX_K = 1 / 120; // straight-ish stretch around a feature
// Twisty layouts rarely run 160 m at |κ| ≤ 1/120, so there the run-up is 40 m and the run-out
// 30 m; whoops and tabletops (ridden slowly, no flight) may sit on mild bends (|κ| ≤ 1/60), and
// kickers and crests (which launch) keep |κ| ≤ 1/120 from the run-up to their end, with a mild
// run-out. Either way the whole stretch stays clear of hairpins and tight corners.
const MILD_K = 1 / 60;
const TWISTY = { runUp: 40, runOut: 30, gap: [120, 250], launch: { kicker: 1, crest: 1 } };
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

// Downhill from slope m at height y to `depth` below the road: round over the lip, a straight at the landing slope -n
// (eased when the drop is too small for a LAND_R foot), a concave foot back to level, then (with depth) a gentle climb
// back to the road over recS.
function landing(type, y, m, n, depth, recS) {
  const drop = y + rise(bend(LIP_R[type], m, -n)) + depth;
  n = Math.min(n, Math.sqrt(2 * drop / LAND_R[type]));
  const lip = bend(LIP_R[type], m, -n), d = y + rise(lip) + depth; // drop left after the lip
  const footR = Math.min(LAND_R[type], 2 * d / (n * n)); // under LAND_R only by the lip's rounding: no straight then
  const foot = bend(footR, -n, 0), straight = Math.max(0, (d + rise(foot)) / n);
  const out = [lip, arc(straight, -n, -n), foot];
  if (depth > 0) { const k = 2 * depth / recS; out.push(arc(recS / 2, 0, k), arc(recS / 2, k, 0)); }
  return out;
}

// The jump's arcs and where its lip is (m from s0).
function program(f) {
  const m = Math.tan(f.takeoff * DEG), n = Math.tan(f.landing * DEG);
  const up = [bend(f.entryR, 0, m), arc(f.straight, m, m)], lipS = up[0][0] + up[1][0];
  const y = rise(up[0]) + rise(up[1]);
  if (f.type !== 'tabletop') return { arcs: [...up, ...landing(f.type, y, m, n, f.depth, f.recS)], lipS };
  const edge = bend(LIP_R.tabletop, m, 0);
  return { arcs: [...up, edge, arc(f.topS, 0, 0), ...landing('tabletop', y + rise(edge), 0, n, 0, 0)], lipS };
}

function makeFeature(type, s0, r) {
  const R = FEATURE_RANGES[type], rg = (k) => r.range(R[k][0], R[k][1]);
  if (type === 'whoops') {
    const count = r.int(R.count[0], R.count[1]), pitch = rg('pitch');
    return { type, s0, s1: s0 + count * pitch, count, pitch };
  }
  const f = { type, s0 };
  for (const k of Object.keys(R)) f[k] = rg(k);
  if (type === 'tabletop') f.depth = 0;
  const { arcs, lipS } = program(f);
  let y = 0, height = 0, len = 0;
  for (const a of arcs) { // the peak can sit inside an arc (the lip's round-over), where its slope passes 0
    const [l, m0, m1] = a;
    if (m0 > 0 && m1 < 0) height = Math.max(height, y + m0 * m0 * l / (2 * (m0 - m1)));
    y += rise(a); len += l; height = Math.max(height, y);
  }
  return Object.assign(f, { s1: s0 + len, lipS, height });
}

// style: 1 … 5 (default: the layout's own); 1–3 place as tight roads do. obstacles: 1 … 5.
export function placeFeatures(layout, r, { obstacles: ob = 2, style: sv = layout.style ?? 4 } = {}) {
  const { n, closed, length, curvature: K } = layout, style = styleLevel(sv), obstacles = obstacleLevel(ob);
  const tw = style <= 3, runUp = tw ? TWISTY.runUp : RUN_UP, runOut = tw ? TWISTY.runOut : RUN_OUT;
  const pack = PACK[obstacles];
  const kAt = (s) => {
    let i = Math.round(s);
    if (closed) i = ((i % n) + n) % n; else if (i < 0 || i > n - 1) return Infinity;
    return Math.abs(K[i]);
  };
  const clear = (a, b, kMax = MAX_K) => { for (let s = Math.floor(a); s <= Math.ceil(b); s++) if (kAt(s) > kMax + 1e-7) return false; return true; };
  const out = [];
  // Obstacles: walk the road; at each candidate start try a feature, else step 10 m on. After a
  // placement the next candidate is a random 300–500 m (tight 120–250 m) ÷ PACK further on.
  const types = r.fork('types'), params = r.fork('params'), gaps = r.fork('gaps');
  const [g0, g1] = tw ? TWISTY.gap : [300, 500], gap = () => gaps.range(g0, g1) / pack;
  const sMax = length - (closed ? START_CLEAR : 0); // loops: keep the run-up to the line plain
  let s = START_CLEAR + runUp + gaps.range(0, 60);
  // Twisty: the short straights fit only some types, so try up to 4 draws per spot, 5 m apart.
  const draws = tw ? 4 : 1, step = tw ? 5 : 10;
  let first = null;
  while (s < sMax) {
    let f = null;
    for (let t = 0; t < draws && !f; t++) {
      const c = makeFeature(weighted(types, WEIGHTS), s, params);
      const wrapOk = !closed || !first || first.s0 + length - c.s0 >= g0 / pack;
      const ok = !tw ? clear(c.s0 - RUN_UP, c.s1 + RUN_OUT)
        : clear(c.s0 - runUp, c.s1 + runOut, MILD_K) && (!TWISTY.launch[c.type] || clear(c.s0 - runUp, c.s1));
      if (c.s1 + runOut <= sMax && wrapOk && ok) f = c;
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
  if (f.type === 'whoops') return 0;
  let y = 0;
  for (const [len, m0, m1] of program(f).arcs) {
    if (u <= len) return y + u * m0 + (m1 - m0) * u * u / (2 * len);
    y += rise([len, m0, m1]); u -= len;
  }
  return y;
}

// Metres added to the road height at s (berms and whoops add none: whoops are road bumps).
export function profileOffset(features, s) {
  let y = 0;
  for (const f of features) if (f.type !== 'berm' && f.type !== 'whoops' && s >= f.s0 && s <= f.s1) y += offset(f, s - f.s0);
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
