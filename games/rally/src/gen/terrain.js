// Terrain heightfield (spec tracks T-3): fBm hills, a grade-limited road profile with the
// obstacles added, banking, the ground flattened under the road and blended back to the hills, and
// small bumps on the ground away from the road so the verge is rough going.
import { noise2, fbm } from './noise.js';
import { profileOffset, bermBank } from './features.js';

const DEG = Math.PI / 180;
const MAX_GRADE = 0.1195;          // a hair under 12 % so Float32 storage can't tip it over
const BANK_MAX = 4 * DEG, BANK_K = 5.6; // rad per (1/m): 4° reached at radius 80 m
const FLAT = 5.5, BLEND = 15;      // half-width 3.5 + 2 m shoulder, then 15 m smoothstep to the hills
const REACH = FLAT + BLEND;        // 20.5 m: beyond this the hills are untouched
const STAMP = Math.ceil(REACH + 0.5);
// Off-road bumps: one noise octave on a 1.2 m lattice (wavelengths ~2–4 m, ≥ 2 heightfield cells),
// soft-clipped to ±amp, amp wandering 0.10–0.16 m over ~35 m (±0.25 m dug the hull's nose in);
// faded in from |d| 6 m to 10 m so the road, shoulder and first metres of verge stay smooth.
export const BUMPS = { lattice: 1.2, amp: [0.1, 0.16], ampScale: 35, from: 6, to: 10 };

// Moving average (radius rad) over a per-sample array; wraps for loops, clamps ends for stages.
function boxSmooth(a, rad, closed) {
  const n = a.length, out = new Float64Array(n), w = 2 * rad + 1;
  const at = closed ? (i) => a[((i % n) + n) % n] : (i) => a[i < 0 ? 0 : i >= n ? n - 1 : i];
  let sum = 0;
  for (let i = -rad; i <= rad; i++) sum += at(i);
  for (let i = 0; i < n; i++) { out[i] = sum / w; sum += at(i + rad + 1) - at(i - rad); }
  return out;
}

function maxGrade(p, closed, ds) {
  let g = 0;
  const last = closed ? p.length : p.length - 1;
  for (let i = 0; i < last; i++) g = Math.max(g, Math.abs(p[(i + 1) % p.length] - p[i]) / ds);
  return g;
}

// flatten: false gives the natural ground (hills + bumps everywhere); bumps: false leaves them out.
export function generateTerrain(layout, features, r, { margin = 150, flatten = true, bumps = true } = {}) {
  const { n, closed, ds, x: X, z: Z, curvature: K, bounds: B } = layout;
  const big = noise2(r.fork('hills').int(0, 0x7fffffff)), fine = noise2(r.fork('detail').int(0, 0x7fffffff));
  const hills = (x, z) => 25 * fbm(big, x, z, { octaves: 4, scale: 400 }) + fbm(fine, x, z, { octaves: 2, scale: 25 });
  const bn = noise2(r.fork('bumps').int(0, 0x7fffffff)), an = noise2(r.fork('bump-amp').int(0, 0x7fffffff));
  const { lattice: BL, amp: [A0, A1], ampScale: AS } = BUMPS;
  const bump = !bumps ? () => 0 : (x, z) => {
    const a = A0 + (A1 - A0) * Math.min(1, Math.max(0, 0.5 + an(x / AS, z / AS)));
    return a * Math.tanh(bn(x / BL, z / BL) / 0.38);
  };

  // Road profile: hills along the centreline, smoothed until the grade is ≤ 12 %, then obstacles.
  let p = new Float64Array(n);
  for (let i = 0; i < n; i++) p[i] = hills(X[i], Z[i]);
  for (let k = 0; k < 2000 && maxGrade(p, closed, ds) > MAX_GRADE; k++) p = boxSmooth(p, 4, closed);
  const road = new Float32Array(n), bank = new Float32Array(n);
  for (let i = 0; i < n; i++) road[i] = p[i] + profileOffset(features, i * ds);

  // Bank into corners (outside up: left turn ⇒ negative), smoothed so it eases in, plus berms.
  let b = new Float64Array(n);
  for (let i = 0; i < n; i++) b[i] = -Math.max(-BANK_MAX, Math.min(BANK_MAX, K[i] * BANK_K));
  b = boxSmooth(boxSmooth(b, 8, closed), 8, closed);
  for (let i = 0; i < n; i++) bank[i] = b[i] + bermBank(features, i * ds);

  // Grid covering the bounds + margin at 1 m.
  const x0 = Math.floor(B.minX - margin), z0 = Math.floor(B.minZ - margin);
  const nx = Math.ceil(B.maxX + margin) - x0 + 1, nz = Math.ceil(B.maxZ + margin) - z0 + 1;
  const N = nx * nz, heights = new Float32Array(N);
  for (let iz = 0, c = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++, c++) heights[c] = hills(x0 + ix, z0 + iz) + bump(x0 + ix, z0 + iz);
  const terrain = { cell: 1, nx, nz, x0, z0, heights, road, bank };
  if (!flatten) return terrain;

  // Stamp each sample's neighbourhood, keeping the nearest sample per cell (the nearer road part
  // wins where blend zones overlap). Only cells near the road are touched.
  const best = new Float32Array(N).fill(Infinity), near = new Int32Array(N).fill(-1);
  const R2 = STAMP * STAMP;
  for (let i = 0; i < n; i++) {
    const sx = X[i] - x0, sz = Z[i] - z0;
    const ax = Math.max(0, Math.ceil(sx - STAMP)), bx = Math.min(nx - 1, Math.floor(sx + STAMP));
    const az = Math.max(0, Math.ceil(sz - STAMP)), bz = Math.min(nz - 1, Math.floor(sz + STAMP));
    for (let iz = az; iz <= bz; iz++) {
      const dz = iz - sz, dz2 = dz * dz, row = iz * nx;
      for (let ix = ax; ix <= bx; ix++) {
        const dx = ix - sx, d2 = dx * dx + dz2;
        if (d2 < R2 && d2 < best[row + ix]) { best[row + ix] = d2; near[row + ix] = i; }
      }
    }
  }
  // Refine on the two segments next to the nearest sample: distance, signed lateral d, and the
  // road height/bank interpolated at the foot point; then blend towards road + tan(bank)·d.
  const seg = { dist: 0, d: 0, a: 0, b: 0, t: 0 };
  const proj = (a, b, px, pz) => {
    const ax = X[a], az = Z[a], ex = X[b] - ax, ez = Z[b] - az, ll = ex * ex + ez * ez;
    let t = ((px - ax) * ex + (pz - az) * ez) / ll;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = px - (ax + ex * t), qz = pz - (az + ez * t), dist = Math.hypot(qx, qz);
    if (dist < seg.dist) { const il = 1 / Math.sqrt(ll); seg.dist = dist; seg.d = (qx * ez - qz * ex) * il; seg.a = a; seg.b = b; seg.t = t; }
  };
  for (let c = 0; c < N; c++) {
    const i = near[c];
    if (i < 0) continue;
    const px = x0 + (c % nx), pz = z0 + ((c / nx) | 0);
    seg.dist = Infinity;
    if (closed) { proj((i - 1 + n) % n, i, px, pz); proj(i, (i + 1) % n, px, pz); }
    else { if (i > 0) proj(i - 1, i, px, pz); if (i < n - 1) proj(i, i + 1, px, pz); }
    if (seg.dist >= REACH) continue;
    const t = seg.t, rh = road[seg.a] + (road[seg.b] - road[seg.a]) * t, bk = bank[seg.a] + (bank[seg.b] - bank[seg.a]) * t;
    const target = rh + Math.tan(bk) * seg.d, bp = bump(px, pz), base = heights[c] - bp;
    const u = seg.dist <= FLAT ? 0 : (seg.dist - FLAT) / BLEND, w = 1 - u * u * (3 - 2 * u);
    const v = Math.min(1, Math.max(0, (seg.dist - BUMPS.from) / (BUMPS.to - BUMPS.from)));
    heights[c] = base + (target - base) * w + bp * v * v * (3 - 2 * v);
  }
  return terrain;
}

// Ground height at (x, z), on the same triangles as the Rapier heightfield: each 1 m cell splits
// along its (x+1, z)–(x, z+1) diagonal (bilinear differed by up to |twist|/4, ~8 cm on the
// verge bumps). Clamps to the grid's edge outside it.
export function heightAt(t, x, z) {
  let fx = (x - t.x0) / t.cell, fz = (z - t.z0) / t.cell;
  fx = fx < 0 ? 0 : fx > t.nx - 1 ? t.nx - 1 : fx;
  fz = fz < 0 ? 0 : fz > t.nz - 1 ? t.nz - 1 : fz;
  let ix = Math.floor(fx), iz = Math.floor(fz);
  if (ix > t.nx - 2) ix = t.nx - 2;
  if (iz > t.nz - 2) iz = t.nz - 2;
  const u = fx - ix, v = fz - iz, h = t.heights, c = iz * t.nx + ix;
  const a = h[c], b = h[c + 1], cc = h[c + t.nx], d = h[c + t.nx + 1];
  return u + v < 1 ? a + (b - a) * u + (cc - a) * v : d + (cc - d) * (1 - u) + (b - d) * (1 - v);
}
