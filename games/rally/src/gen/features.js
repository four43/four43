// Obstacles along the road (spec tracks T-4): kickers, crests, whoops, tabletops on straight-ish
// stretches, and bermed hairpins. Features are pure data; profileOffset / bermBank evaluate their
// shapes analytically so terrain, rendering and the autopilot all agree on them.

const DEG = Math.PI / 180;
// Mild ranges from the spec; `wild` scales heights by WILD_HEIGHT.
export const FEATURE_RANGES = {
  kicker: { height: [1, 1.5], lipS: [8, 10], landS: [20, 40], recS: [15, 25] },
  crest: { height: [2, 4], length: [30, 50] },
  whoops: { count: [4, 8], height: [0.25, 0.45], pitch: [6.5, 8] },
  tabletop: { height: [1, 1.5], upS: [7, 10], topS: [10, 20], downS: [8, 14] },
  berm: { angle: [10 * DEG, 18 * DEG] },
};
const WEIGHTS = [['kicker', 3], ['whoops', 3], ['crest', 2], ['tabletop', 2]];
const WILD_HEIGHT = 1.4, WILD_PACK = 1.6;
// Whoops must clear the hull: with wheels in two troughs 2.4 m apart (the wheelbase), the ridge
// between them stands h·sin²(π·1.2/pitch) above them; keep that under the car's ~0.2 m clearance.
export const WHOOPS_RIDGE_MAX = 0.15;
// ...and their faces (steepest slope π·h/pitch) must stay climbable by the front overhang (~13°),
// which wild's ×1.4 heights broke: cap the height outright.
export const WHOOPS_MAX_H = 0.5;
const RUN_UP = 60, RUN_OUT = 40, MAX_K = 1 / 120; // straight-ish stretch around a feature
// Twisty layouts rarely run 160 m at |κ| ≤ 1/120, so there the run-up is 40 m and the run-out
// 30 m; whoops and tabletops (ridden slowly, no flight) may sit on mild bends (|κ| ≤ 1/60), and
// kickers and crests (which launch) keep |κ| ≤ 1/120 from the run-up to their end, with a mild
// run-out. Either way the whole stretch stays clear of hairpins and tight corners.
const MILD_K = 1 / 60;
const TWISTY = { runUp: 40, runOut: 30, gap: [120, 250], launch: { kicker: 1, crest: 1 } };
const HAIRPIN_K = 1 / 40, BERM_CHANCE = 0.3, BERM_RAMP = 12;
const START_CLEAR = 60; // keep the spawn / start gate area plain (s = 0..60 before a run-up)
const KICKER_FACE = 2;  // m: the steep back face behind a kicker's lip

const smooth = (t) => t * t * (3 - 2 * t);
const halfCos = (t) => (1 - Math.cos(Math.PI * t)) / 2; // 0 → 1 with flat ends

function weighted(r, list) {
  let tot = 0; for (const [, w] of list) tot += w;
  let u = r.next() * tot;
  for (const [v, w] of list) { if ((u -= w) < 0) return v; }
  return list[list.length - 1][0];
}

function makeFeature(type, s0, r, hk) {
  const R = FEATURE_RANGES[type], rg = (k) => r.range(R[k][0], R[k][1]);
  switch (type) {
    case 'kicker': {
      const height = rg('height') * hk, lipS = rg('lipS'), landS = rg('landS'), recS = rg('recS');
      return { type, s0, s1: s0 + lipS + landS + recS, height, lipS, landS, recS };
    }
    case 'crest': { const height = rg('height') * hk, length = rg('length'); return { type, s0, s1: s0 + length, height, length }; }
    case 'whoops': {
      const count = r.int(R.count[0], R.count[1]), pitch = rg('pitch'), ridge = Math.sin(Math.PI * 1.2 / pitch) ** 2;
      const height = Math.min(rg('height') * hk, WHOOPS_RIDGE_MAX / ridge, WHOOPS_MAX_H);
      return { type, s0, s1: s0 + count * pitch, count, height, pitch };
    }
    case 'tabletop': {
      const height = rg('height') * hk, upS = rg('upS'), topS = rg('topS'), downS = rg('downS');
      return { type, s0, s1: s0 + upS + topS + downS, height, upS, topS, downS };
    }
  }
}

// style: 'flowing' | 'twisty' (default: the layout's own style, else flowing).
export function placeFeatures(layout, r, { density = 'mild', style = layout.style } = {}) {
  const { n, closed, length, curvature: K } = layout;
  const tw = style === 'twisty', runUp = tw ? TWISTY.runUp : RUN_UP, runOut = tw ? TWISTY.runOut : RUN_OUT;
  const wild = density === 'wild', hk = wild ? WILD_HEIGHT : 1, pack = wild ? WILD_PACK : 1;
  const kAt = (s) => {
    let i = Math.round(s);
    if (closed) i = ((i % n) + n) % n; else if (i < 0 || i > n - 1) return Infinity;
    return Math.abs(K[i]);
  };
  const clear = (a, b, kMax = MAX_K) => { for (let s = Math.floor(a); s <= Math.ceil(b); s++) if (kAt(s) > kMax + 1e-7) return false; return true; };
  const out = [];
  // Obstacles: walk the road; at each candidate start try a feature, else step 10 m on. After a
  // placement the next candidate is a random 300–500 m (twisty 200–360 m; ÷1.6 wild) further on.
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
      const c = makeFeature(weighted(types, WEIGHTS), s, params, hk);
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
  const h = f.height;
  switch (f.type) {
    case 'kicker': {
      // u² ramp: flat entry, steepest (sharp) at the lip; a steep face back to road level; a
      // long downhill landing to -h at lip + landS; then a gentle recovery to 0.
      if (u < f.lipS) { const t = u / f.lipS; return h * t * t; }
      u -= f.lipS;
      if (u < KICKER_FACE) return h * (1 - u / KICKER_FACE);
      if (u < f.landS) return -h * halfCos((u - KICKER_FACE) / (f.landS - KICKER_FACE));
      return -h * (1 - halfCos((u - f.landS) / f.recS));
    }
    case 'crest': return h * (1 - Math.cos(2 * Math.PI * u / f.length)) / 2;
    case 'whoops': { const v = Math.sin(Math.PI * u / f.pitch); return h * v * v; }
    case 'tabletop': {
      if (u < f.upS) return h * smooth(u / f.upS);
      if (u < f.upS + f.topS) return h;
      return h * (1 - smooth((u - f.upS - f.topS) / f.downS));
    }
  }
  return 0;
}

// Metres added to the road height at s (berms add none).
export function profileOffset(features, s) {
  let y = 0;
  for (const f of features) if (f.type !== 'berm' && s >= f.s0 && s <= f.s1) y += offset(f, s - f.s0);
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
