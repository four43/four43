// High and low ground (spec T-17): the farm is cut into large CELL patches that are high (HIGH m) or low (0 m), with
// smooth ~20 m slopes between them. The farmyard and the ground near it are low. Each route runs at 0 m: through a
// cutting (a steep rock bank) where the ground beside it is high, and between fences where it is low.
// Pure (no three): createTerrain gives height queries, fence segments, crest rocks and a height grid for physics and render.
import { YARD_HALF } from './track.js';
import { FARM_HALF } from './road.js';
export const HIGH = 4, CELL = 72;
export const CUT = { foot: 8.5, top: 11.5 };  // the cutting slope rises from the shoulder edge to full height over 3 m (~50 degrees)
export const FENCE_D = 9.2;                    // the fence line, at the outer side of the shoulder
export const YARD_LOW = 20;                    // ground within 20 m of the yard edge is low
export const BANK_MIN = 2.5;                   // a side is a bank where the ground at the top of the cut is at least this high
const BLEND = 10;                              // half-width of a high-low change (the slope spans ~20 m)
const OVERLAP = 8;                             // fence runs reach this far (m along the route) into the bank on both ends (T-17: >= 6 m)
const RANGE = CUT.top + 1;                     // past this distance from a centerline the cut is done: height = patch
export const smoothstep = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

export function createTerrain(farm, road, rng, { step = 0.5 } = {}) {
  // Patch map: cell centers at o + k * CELL (k = -K..K). The +-18 m offset keeps every tile center 18 m from a cell
  // border, so tile centers sit on flat high or low ground, never on a slope.
  const ox = rng.pick([-18, 18]), oz = rng.pick([-18, 18]), K = Math.ceil(FARM_HALF / CELL) + 1, N = 2 * K + 1;
  const cells = new Float32Array(N * N), free = [], LOW = YARD_HALF + YARD_LOW;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const cx = ox + (i - K) * CELL, cz = oz + (j - K) * CELL;
    if (Math.abs(cx) - CELL / 2 < LOW && Math.abs(cz) - CELL / 2 < LOW) continue; // overlaps the yard + YARD_LOW: forced low
    free.push(i * N + j);
  }
  for (const c of rng.shuffle(free).slice(0, Math.round(free.length / 2))) cells[c] = 1; // half of the other cells are high
  const cell = (i, j) => cells[Math.max(0, Math.min(N - 1, i)) * N + Math.max(0, Math.min(N - 1, j))];
  const e0 = 0.5 - BLEND / CELL, e1 = 0.5 + BLEND / CELL;
  // bilinear between the four nearest cell centers, with each axis weight eased by a smoothstep around the cell border
  const patch = (x, z) => {
    const fx = (x - ox) / CELL + K, fz = (z - oz) / CELL + K, i = Math.floor(fx), j = Math.floor(fz);
    const tx = smoothstep(e0, e1, fx - i), tz = smoothstep(e0, e1, fz - j);
    const a = cell(i, j) + (cell(i + 1, j) - cell(i, j)) * tx, b = cell(i, j + 1) + (cell(i + 1, j + 1) - cell(i, j + 1)) * tx;
    return HIGH * (a + (b - a) * tz);
  };
  const inYard = (x, z) => Math.abs(x) <= YARD_HALF && Math.abs(z) <= YARD_HALF;
  const cutHeight = (p, d) => p * smoothstep(CUT.foot, CUT.top, d);
  const height = (x, z) => {
    if (inYard(x, z)) return 0;
    const p = patch(x, z); return p === 0 ? 0 : cutHeight(p, road.nearest(x, z).d);
  };

  // Height grid over the farm (0.5 m: at 1 m the flat triangles miss the curved cut by up to 0.36 m), vertex (i, j) at x = -FARM_HALF + i * step, z = -FARM_HALF + j * step, stored at
  // heights[i * n + j] (x-major, the column-major layout Rapier's heightfield reads). Distances to the routes are
  // stamped from the route points (the same points road.nearest searches), so the grid equals height() at each vertex.
  const size = FARM_HALF * 2, n = Math.round(size / step) + 1, dist = new Float32Array(n * n).fill(Infinity), heights = new Float32Array(n * n);
  const reach = Math.ceil(RANGE / step);
  for (const p of road.pts) {
    const ci = Math.round((p.x + FARM_HALF) / step), cj = Math.round((p.z + FARM_HALF) / step);
    for (let i = Math.max(0, ci - reach); i <= Math.min(n - 1, ci + reach); i++) for (let j = Math.max(0, cj - reach); j <= Math.min(n - 1, cj + reach); j++) {
      const d = Math.hypot(-FARM_HALF + i * step - p.x, -FARM_HALF + j * step - p.z); if (d < dist[i * n + j]) dist[i * n + j] = d;
    }
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const x = -FARM_HALF + i * step, z = -FARM_HALF + j * step;
    heights[i * n + j] = inYard(x, z) ? 0 : cutHeight(patch(x, z), dist[i * n + j]);
  }

  // Barriers (T-17), per route and side: a side is low where the ground at the top of the cut (sampled at CUT.top + 0.5
  // and + 1) is below BANK_MIN. Low points get a fence at FENCE_D; each fence run reaches OVERLAP m into the bank at both
  // ends. Bank points get rocks along the crest.
  const fences = [], banks = [];
  const at = (p, side, d) => ({ x: p.x - p.tz * side * d, z: p.z + p.tx * side * d });
  for (const R of road.routes) for (const side of [-1, 1]) {
    const P = R.pts, low = P.map(p => [CUT.top + 0.5, CUT.top + 1].some(d => { const q = at(p, side, d); return patch(q.x, q.z) < BANK_MIN; }));
    const fenced = P.map((_, i) => low.slice(Math.max(0, i - OVERLAP), i + OVERLAP + 1).some(Boolean));
    for (let i = 0; i < P.length;) {
      if (!fenced[i]) { i++; continue; }
      let e = i; while (e + 1 < P.length && fenced[e + 1]) e++;
      fences.push(...simplify(P.slice(i, e + 1).map(p => at(p, side, FENCE_D))));
      i = e + 1;
    }
    for (let i = 0; i < P.length; i += 3) {
      if (low[i]) continue;
      const q = at(P[i], side, rng.range(CUT.top - 0.2, CUT.top + 1.5));
      if (road.nearest(q.x, q.z).d < CUT.top - 0.5) continue; // too close to another part of a route
      banks.push({ ...q, y: height(q.x, q.z), yaw: rng.range(0, Math.PI * 2), scale: rng.range(1.2, 2.4), kind: rng.pick(['rockA', 'rockB', 'rockC']) });
    }
  }
  return { patch, height, fences, banks, grid: { n, size, step, heights } };
}

// A polyline as straight segments [ax, az, bx, bz]: each segment runs as far as the points stay within 5 cm of it.
function simplify(Q) {
  const out = []; let a = 0;
  while (a < Q.length - 1) {
    let b = a + 1;
    while (b + 1 < Q.length && Q.slice(a + 1, b + 1).every(q => lineDist(q, Q[a], Q[b + 1]) < 0.05)) b++;
    out.push([Q[a].x, Q[a].z, Q[b].x, Q[b].z]); a = b;
  }
  return out;
}
function lineDist(q, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
  return Math.abs((q.x - a.x) * dz - (q.z - a.z) * dx) / l;
}
