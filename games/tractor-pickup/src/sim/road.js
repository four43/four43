// Route centerlines and surface queries. Straights run edge-midpoint to edge-midpoint; curves are quarter circles
// (radius TILE/2) about the tile corner shared by the entry and exit edges. Each route starts and ends on the yard edge.
import { TILE, SIZE, DIRS, tileCenter, YARD_HALF, barnLocal } from './track.js';
export const SPRINKLER_HALF = 9, ROAD_HALF = 7, SHOULDER = 1.5, CORRIDOR = ROAD_HALF + SHOULDER, FARM_HALF = SIZE * TILE / 2;
export const MUD_HALF = 0.35; // the mud area on a mud tile: |u - 0.5| < MUD_HALF (in tiles), across the full road width

function tilePts(t, N) {
  const c = tileCenter(t.i, t.j), [ix, iz] = DIRS[t.inDir], [ox, oz] = DIRS[t.outDir], ex = c.x - ix * TILE / 2, ez = c.z - iz * TILE / 2, out = [];
  for (let m = 0; m < N; m++) {
    const u = m / N;
    if (t.inDir === t.outDir) { out.push({ x: ex + ix * TILE * u, z: ez + iz * TILE * u, u }); continue; }
    const cx = ex + ox * TILE / 2, cz = ez + oz * TILE / 2, a0 = Math.atan2(ez - cz, ex - cx), a1 = Math.atan2(c.z + oz * TILE / 2 - cz, c.x + ox * TILE / 2 - cx);
    let da = a1 - a0; da = Math.atan2(Math.sin(da), Math.cos(da)); const a = a0 + da * u;
    out.push({ x: cx + (TILE / 2) * Math.cos(a), z: cz + (TILE / 2) * Math.sin(a), u });
  }
  return out;
}

export function buildRoad(farm, step = 1) {
  const N = Math.round(TILE / step), pts = [];
  const routes = farm.routes.map((R, r) => {
    const P = [];
    R.tiles.forEach((t, k) => { for (const p of tilePts(t, N)) P.push({ ...p, r, k }); });
    const last = R.tiles.at(-1), c = tileCenter(last.i, last.j), [ox, oz] = DIRS[last.outDir];
    P.push({ x: c.x + ox * TILE / 2, z: c.z + oz * TILE / 2, u: 1, r, k: R.tiles.length - 1 });
    let s = 0;
    P.forEach((p, n) => {
      const a = P[Math.max(0, n - 1)], b = P[Math.min(P.length - 1, n + 1)], dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
      if (n > 0) s += Math.hypot(p.x - P[n - 1].x, p.z - P[n - 1].z);
      Object.assign(p, { n, s, tx: dx / l, tz: dz / l });
    });
    pts.push(...P); return { pts: P, length: s };
  });
  const tileOf = p => farm.routes[p.r].tiles[p.k];
  // nearest route point, searched ring by ring through a coarse grid of buckets (exact: stops once no closer ring can win)
  const CELL = 12, NC = Math.ceil(FARM_HALF * 2 / CELL) + 2, cellOf = v => Math.max(0, Math.min(NC - 1, Math.floor((v + FARM_HALF) / CELL) + 1));
  const buckets = new Map(); for (const p of pts) { const key = cellOf(p.x) * NC + cellOf(p.z); if (!buckets.has(key)) buckets.set(key, []); buckets.get(key).push(p); }
  const nearest = (x, z) => {
    const ci = cellOf(x), cj = cellOf(z); let best = Infinity, pt = pts[0];
    for (let k = 0; k < NC; k++) {
      for (let i = ci - k; i <= ci + k; i++) for (let j = cj - k; j <= cj + k; j++) {
        if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== k || i < 0 || j < 0 || i >= NC || j >= NC) continue;
        for (const p of buckets.get(i * NC + j) || []) { const d = (p.x - x) ** 2 + (p.z - z) ** 2; if (d < best) { best = d; pt = p; } }
      }
      if (best <= (k * CELL) ** 2) break; // every point in ring k + 1 or beyond is at least k cells away
    }
    return { d: Math.sqrt(best), pt };
  };
  const inYard = (x, z) => Math.abs(x) <= YARD_HALF && Math.abs(z) <= YARD_HALF;
  return {
    routes, pts, nearest, inYard,
    surfaceAt(x, z) {
      if (inYard(x, z)) return 'gravel';
      const n = nearest(x, z); if (n.d > ROAD_HALF) return 'grass';
      return tileOf(n.pt).type === 'mud' && Math.abs(n.pt.u - 0.5) < MUD_HALF ? 'mud' : 'gravel';
    },
    inSprinkler(x, z) { if (inYard(x, z)) return false; const n = nearest(x, z); return tileOf(n.pt).type === 'sprinkler' && n.d < ROAD_HALF + 1 && Math.abs(n.pt.u - 0.5) * TILE < SPRINKLER_HALF; }, // T-15: the zone is 18 m long, so driving through at full speed still washes for about 1.5 s
    featureCenter(r, k) { const t = farm.routes[r].tiles[k], c = tileCenter(t.i, t.j); return { x: c.x, z: c.z, yaw: Math.atan2(DIRS[t.outDir][0], DIRS[t.outDir][1]) }; },
    ahead(pt, dist) { const P = routes[pt.r].pts; return P[Math.max(0, Math.min(P.length - 1, pt.n + Math.round(dist / step)))]; },
  };
}

// F-1: remembers which end the tractor came in by; true once when it is DELIVER_AT of the way to the other end. Leaving the barn resets it.
export const DELIVER_AT = 0.75; // F-1: the show starts when the tractor is this far through the barn, at any speed
export function makeBarnPass(barn) {
  let entered = 0, fired = false;
  return (x, z) => {
    const { a, s } = barnLocal(barn, x, z), inside = Math.abs(a) < barn.half && Math.abs(s) < barn.width;
    if (!inside) { entered = 0; fired = false; return false; }
    if (!entered) entered = Math.sign(a) || 1;
    if (fired || -entered * a < barn.half * (2 * DELIVER_AT - 1)) return false;
    fired = true; return true;
  };
}
