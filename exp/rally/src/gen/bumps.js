// Road bumps (rally spec R11): small 2D humps and ridges on the road and its shoulder, in road space (s along, d across,
// + = left), stamped into the heightfield with the road (terrain.js), so the wheels feel what the ribbon shows.
// - Scatter: everywhere but jumps (kicker, crest and tabletop faces and landings stay graded), in rough and smooth
//   stretches by noise; per bump a size (log-spread), an elongation (round hump to short ridge), an angle and a height
//   that grows with size; per road surface density and height (tarmac smooth).
// - Ridge sets (the `whoops` features): a run of ridges across the road, each with its own angle, thickness, reach across
//   and offset, small enough to ride (playtest 2026-10-25: full-width 0.25–0.45 m whoops tossed the car).
// The heightfield is 1 m, so nothing is shorter than ~1.8 m along its narrow axis. Pure.
import { noise2 } from './noise.js';
import { roadSurfaceAt } from './surfaces.js';
import { obstacleLevel } from './levels.js';

export const BUMPS = {
  // scatter: bumps per m² by road surface (× the stretch's roughness), height scale by surface
  perM2: { tarmac: 0.012, hardpack: 0.06, gravel: 0.07, packed: 0.045, ice: 0.03 },
  heightScale: { tarmac: 0.4, hardpack: 1, gravel: 1, packed: 0.8, ice: 0.5 },
  size: [0.9, 3.0],        // m, half-length along the bump's long axis
  aspect: [1, 4],          // long / short half-length (≥ 0.9 m short)
  height: [0.015, 0.035],  // m per m of half-length, before the surface scale (a 3 m hump ~ 0.06–0.1 m)
  maxH: 0.09,              // m, scatter cap
  roughScale: 70,          // m, length of rough / smooth stretches
  reach: 1,                // m past the edge that scatter centres may sit (the shoulder)
  fade: [1, 2],            // m past the edge over which bumps fade out (the flat shoulder ends 2 m past it)
  jumpClear: [10, 15],     // m before / after a kicker, crest or tabletop kept free of scatter: faces and landings are graded
  // obstacles level 1 … 5: scatter density × count (2 = the old mild). Heights never scale (×1.4 heights put the car in
  // the air for 0.3–0.7 s over a ridge set; rally spec R14-4).
  count: { 1: 0.6, 2: 1, 3: 1.25, 4: 1.5, 5: 1.8 },
  // ridge sets
  overlap: 0.33,           // overlapping bumps: the tallest plus this share of the rest (a sum stacked them into walls)
  ridges: { count: [4, 10], height: [0.06, 0.16], maxH: 0.17, pitch: [3.5, 7], angle: 30, jitter: 10,
    thick: [0.9, 1.6], halfWidth: [1.5, 4.5], offset: 1.5 },
};
const DEG = Math.PI / 180, MIN_SHORT = 0.9;

// → { n, s, d, c, sn, lu, lv, h, reach } (Float32Arrays sorted by s): centre, rotation (cos, sin of the long axis from
// the road's direction), half-lengths (lu along the long axis, lv across it), height; reach = the largest half-length.
export function generateBumps(layout, surfaces, edges, features, r, { obstacles = 2 } = {}) {
  const hk = 1, dk = BUMPS.count[obstacleLevel(obstacles)];
  const rough = noise2(r.fork('rough').int(0, 0x7fffffff)), sc = r.fork('scatter'), rr = r.fork('ridges');
  const list = [], L = layout.length ?? layout.n * layout.ds;
  const add = (s, d, ang, lu, lv, h) => list.push([s, d, Math.cos(ang), Math.sin(ang), lu, lv, h]);
  const JUMPS = new Set(['kicker', 'crest', 'tabletop']);
  const jumps = features.filter(f => JUMPS.has(f.type)), onJump = (s) => jumps.some(f => s > f.s0 - BUMPS.jumpClear[0] && s < f.s1 + BUMPS.jumpClear[1]);
  const edgeAtS = (s, side) => { const i = Math.min(layout.n - 1, Math.max(0, Math.round(s / layout.ds))); return side > 0 ? edges.left[i] : edges.right[i]; };
  // Scatter, per 10 m of road: expected count from area × density × roughness, then one bump at a time.
  for (let s0 = 0; s0 < L; s0 += 10) {
    const at = roadSurfaceAt(surfaces, s0 + 5), key = at.t > 0.5 && at.next ? at.next.road : at.road;
    const dens = (BUMPS.perM2[key] ?? BUMPS.perM2.gravel) * dk, hs = BUMPS.heightScale[key] ?? 1;
    const k = 0.25 + 1.5 * Math.max(0, 0.5 + rough(s0 / BUMPS.roughScale, 0.5)); // 0.25 (smooth) … ~1.75 (rough)
    const width = edgeAtS(s0, 1) + edgeAtS(s0, -1) + 2 * BUMPS.reach;
    let m = dens * k * 10 * width;
    for (; m > 0; m--) {
      if (m < 1 && sc.next() > m) break;
      const s = s0 + sc.next() * 10, side = sc.next() < 0.5 ? 1 : -1, d = side * sc.next() * (edgeAtS(s, side) + BUMPS.reach);
      const lu0 = sc.next(), asp = sc.range(...BUMPS.aspect), hr = sc.range(...BUMPS.height), ang = sc.next() * Math.PI;
      if (onJump(s)) continue; // (all draws taken first, so a jump never reshuffles the bumps after it)
      const lu = BUMPS.size[0] * (BUMPS.size[1] / BUMPS.size[0]) ** (lu0 ** 1.5); // mostly small
      const lv = Math.max(MIN_SHORT, lu / asp);
      add(s, d, ang, lu, lv, Math.min(BUMPS.maxH * hk, lu * hr * hs * hk));
    }
  }
  // Ridge sets where the features put whoops: across the road (long axis ~ across, ± angle), each ridge its own.
  const R = BUMPS.ridges;
  for (const f of features) {
    if (f.type !== 'whoops') continue;
    const base = (rr.next() * 2 - 1) * R.angle * DEG;
    let s = f.s0 + R.thick[1];
    for (let i = 0; i < f.count && s <= f.s1 - R.thick[1]; i++, s += rr.range(...R.pitch)) {
      const ang = Math.PI / 2 + base + (rr.next() * 2 - 1) * R.jitter * DEG;
      add(s, (rr.next() * 2 - 1) * R.offset, ang, rr.range(...R.halfWidth), rr.range(...R.thick), Math.min(R.maxH, rr.range(...R.height) * hk));
    }
  }
  list.sort((a, b) => a[0] - b[0]);
  const n = list.length, out = { n, reach: 0 };
  for (const [k, name] of ['s', 'd', 'c', 'sn', 'lu', 'lv', 'h'].entries()) out[name] = Float32Array.from(list, b => b[k]);
  for (let i = 0; i < n; i++) out.reach = Math.max(out.reach, out.lu[i]);
  return out;
}

// Height (m) the bumps add at road position (s, d): smooth raised-cosine domes over each bump's ellipse (where they
// overlap, the tallest plus BUMPS.overlap of the rest), faded out towards the shoulder's end (hw: the road's half-width on
// that side). Loops: s within [0, length) and bumps near the seam are seen from both sides.
const acc = { top: 0, sum: 0 };
export function bumpsAt(b, s, d, length = 0, hw = 3.5) {
  const fd = Math.abs(d) - hw;
  if (!b.n || fd >= BUMPS.fade[1]) return 0;
  acc.top = 0; acc.sum = 0;
  gather(b, s, d);
  if (length) { if (s < b.reach) gather(b, s + length, d); else if (s > length - b.reach) gather(b, s - length, d); }
  const y = acc.top + BUMPS.overlap * (acc.sum - acc.top);
  const t = Math.min(1, Math.max(0, (fd - BUMPS.fade[0]) / (BUMPS.fade[1] - BUMPS.fade[0])));
  return y * (1 - t * t * (3 - 2 * t));
}
function gather(b, s, d) {
  let lo = 0, hi = b.n; // first bump with s ≥ s - reach
  const from = s - b.reach;
  while (lo < hi) { const m = (lo + hi) >> 1; if (b.s[m] < from) lo = m + 1; else hi = m; }
  for (let i = lo; i < b.n && b.s[i] <= s + b.reach; i++) {
    const du = s - b.s[i], dv = d - b.d[i];
    const u = (du * b.c[i] + dv * b.sn[i]) / b.lu[i], v = (-du * b.sn[i] + dv * b.c[i]) / b.lv[i], q = u * u + v * v;
    if (q < 1) { const y = b.h[i] * (1 + Math.cos(Math.PI * Math.sqrt(q))) / 2; acc.sum += y; if (y > acc.top) acc.top = y; }
  }
}
