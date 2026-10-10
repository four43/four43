// Road surface sections along a layout (spec tracks T-5). A weighted random walk over a per-theme
// transition table: each section is 200–700 m (a stage's last may be 100+), loops also close the
// walk (last → first is a legal transition). Keys are SURFACES entries in src/tire.js; "dirt" is
// `hardpack`, and winter snow sections use `packed` in Phase 1.

// Allowed next road surface → weight. Same → same is never listed (no invisible boundaries).
export const TRANSITIONS = {
  summer: {
    gravel:   { hardpack: 1 },
    hardpack: { gravel: 0.6, tarmac: 0.4 },
    tarmac:   { hardpack: 1 },
  },
  winter: {
    packed: { ice: 0.7, gravel: 0.3 },
    ice:    { packed: 1 },
    gravel: { packed: 1 },
  },
};
// First-section weights.
export const START = {
  summer: { gravel: 0.4, hardpack: 0.4, tarmac: 0.2 },
  winter: { packed: 0.6, ice: 0.25, gravel: 0.15 },
};
export const VERGE = { summer: 'grass', winter: 'snowbank' };
// Per-surface section length cap (m) and share-of-track cap.
export const MAX_LEN = { ice: 400 };
export const MAX_SHARE = { winter: { gravel: 0.15 } };
export const SECTION = { min: 200, max: 700, minLast: 100 };
export const BLEND = 10; // m, at the end of each section

const ATTEMPTS = 50;

function pickWeighted(r, weights) {
  const keys = Object.keys(weights);
  let total = 0;
  for (const k of keys) total += weights[k];
  let u = r.next() * total;
  for (const k of keys) { u -= weights[k]; if (u < 0) return k; }
  return keys[keys.length - 1];
}

// One walk; returns sections, or null if it painted itself into a corner (retry with a new fork).
function walk(r, theme, length, closed) {
  const table = TRANSITIONS[theme], shares = MAX_SHARE[theme] || {};
  const used = {};
  const sections = [];
  let s = 0, prev = null;
  while (length - s > 1e-9) {
    const rem = length - s;
    // Longest section each candidate may have here (length cap and remaining share budget).
    const cap = (k) => Math.min(SECTION.max, MAX_LEN[k] ?? Infinity,
      k in shares ? shares[k] * length - (used[k] || 0) : Infinity);
    const opts = {};
    for (const [k, w] of Object.entries(prev ? table[prev] : START[theme])) {
      if (cap(k) >= Math.min(SECTION.min, rem)) opts[k] = w;
    }
    if (!Object.keys(opts).length) return null;
    const road = pickWeighted(r, opts);
    const hi = cap(road);
    let L = r.range(SECTION.min, Math.max(SECTION.min, hi));
    if (rem - L < SECTION.min) {
      // Don't leave a stub: take the rest if it fits, else leave exactly one minimum section.
      if (rem <= hi) L = rem;
      else if (rem - SECTION.min >= SECTION.min) L = Math.min(hi, rem - SECTION.min);
      else return null;
    }
    if (L < SECTION.min && L !== rem) return null;
    sections.push({ s0: s, s1: L === rem ? length : s + L, road, verge: VERGE[theme] });
    used[road] = (used[road] || 0) + L;
    s = L === rem ? length : s + L;
    prev = road;
  }
  const last = sections[sections.length - 1];
  if (last.s1 - last.s0 < SECTION.minLast) return null;
  if (closed) {
    if (sections.length < 2) return null;
    if (!(table[last.road][sections[0].road] > 0)) return null;
    if (last.s1 - last.s0 < SECTION.min) return null; // on a loop every section is a full one
  }
  return sections;
}

export function generateSurfaces(layout, r, { theme = 'summer' } = {}) {
  if (!TRANSITIONS[theme]) throw new Error(`generateSurfaces: unknown theme ${theme}`);
  for (let a = 0; a < ATTEMPTS; a++) {
    const sections = walk(r.fork(`attempt${a}`), theme, layout.length, !!layout.closed);
    if (sections) return { theme, closed: !!layout.closed, length: layout.length, sections };
  }
  throw new Error(`generateSurfaces: no valid ${theme} sections for length ${layout.length} after ${ATTEMPTS} attempts`);
}

// Surface at distance s. t ramps 0 → 1 over the last BLEND m of a section towards `next`
// (loops: the last section blends into the first; a stage's last section has no next, t = 0).
export function roadSurfaceAt(surfaces, s) {
  const sec = surfaces.sections, n = sec.length;
  const length = surfaces.length ?? sec[n - 1].s1;
  const closed = surfaces.closed ?? false;
  if (closed) s = ((s % length) + length) % length;
  else s = Math.min(Math.max(s, 0), length);
  let lo = 0, hi = n - 1; // last section with s0 <= s
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (sec[m].s0 <= s) lo = m; else hi = m - 1; }
  const cur = sec[lo];
  const nx = lo + 1 < n ? sec[lo + 1] : closed ? sec[0] : null;
  const out = { road: cur.road, verge: cur.verge, t: 0 };
  if (nx) {
    out.next = { road: nx.road, verge: nx.verge };
    out.t = Math.min(1, Math.max(0, (s - (cur.s1 - BLEND)) / BLEND));
  }
  return out;
}
