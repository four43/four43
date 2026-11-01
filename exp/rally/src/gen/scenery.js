// Off-track scenery (rally-spec R19-2): trees in forest patches, bushes, rocks and fence runs, placed from the seed over
// the whole terrain. Pure data: TrackWorld gives trees and rocks fixed colliders and fences knock-over bodies; TrackView
// draws them with distance LODs. Clearances are from the road's edge on that side, wider on the outside of bends, around
// jumps and at the gates, so a car that stays near the road never meets a trunk it couldn't see coming.
import { noise2, fbm } from './noise.js';
import { heightAt } from './terrain.js';
import { edgeAt } from './edges.js';

export const SCENERY = {
  sink: 0.15,           // m: trunks, posts and (× scale) rocks stand this far into the ground, so slopes never show a gap
  grid: 5,              // m between tree candidates (jittered)
  forest: { scale: 170, cut: [-0.05, 0.25] }, // fbm below cut[0]: open ground; above cut[1]: full forest
  meadow: 0.04,         // chance of a lone tree out in the open
  clear: { tree: 5, rock: 3, bush: 2.5, outside: 12, feature: 16, gate: 18 }, // m past the edge
  ramp: 8,              // m over which density rises to full past the clearance
  near: 40,             // m from the centreline: inside it, distances are exact (locator) and features apply
  tightKappa: 1 / 90,   // the outside of bends tighter than this keeps the wider clearance
  pine: { summer: 0.55, winter: 1 },   // pine share where the species noise is neutral
  scale: { tree: [0.75, 1.3], bush: [0.7, 1.3], rock: [0.5, 1.4] },
  rocks: { perCell: 0.035, slope: [0.92, 0.75], slopeBoost: 0.5 }, // per grid cell; up to +boost on slopes (ny range)
  bushes: { forestEdge: 0.35, open: 0.03 },
  fence: { len: 3, chance: 0.5, sections: [6, 24], off: [6, 11], straightKappa: 1 / 150 },
};

// Distance (m) from each cell of a coarse grid to the nearest centreline sample: exact near the samples, then a chamfer
// pass (8-neighbour, two sweeps) carries it outwards. Error under ~8%, which only shifts where far trees start.
function roadField(layout, T, cell) {
  const nx = Math.ceil((T.nx - 1) * T.cell / cell) + 1, nz = Math.ceil((T.nz - 1) * T.cell / cell) + 1;
  const D = new Float32Array(nx * nz).fill(1e9), R = 2;
  for (let i = 0; i < layout.n; i++) {
    const fx = (layout.x[i] - T.x0) / cell, fz = (layout.z[i] - T.z0) / cell, cx = Math.round(fx), cz = Math.round(fz);
    for (let a = cx - R; a <= cx + R; a++) for (let b = cz - R; b <= cz + R; b++) {
      if (a < 0 || b < 0 || a >= nx || b >= nz) continue;
      const d = Math.hypot(a - fx, b - fz) * cell, k = b * nx + a;
      if (d < D[k]) D[k] = d;
    }
  }
  const s = cell, d2 = cell * Math.SQRT2;
  const relax = (k, j, w) => { if (D[j] + w < D[k]) D[k] = D[j] + w; };
  for (let b = 0; b < nz; b++) for (let a = 0; a < nx; a++) {
    const k = b * nx + a;
    if (a > 0) relax(k, k - 1, s);
    if (b > 0) { relax(k, k - nx, s); if (a > 0) relax(k, k - nx - 1, d2); if (a < nx - 1) relax(k, k - nx + 1, d2); }
  }
  for (let b = nz - 1; b >= 0; b--) for (let a = nx - 1; a >= 0; a--) {
    const k = b * nx + a;
    if (a < nx - 1) relax(k, k + 1, s);
    if (b < nz - 1) { relax(k, k + nx, s); if (a < nx - 1) relax(k, k + nx + 1, d2); if (a > 0) relax(k, k + nx - 1, d2); }
  }
  return (x, z) => {
    const a = Math.min(nx - 1, Math.max(0, Math.round((x - T.x0) / cell))), b = Math.min(nz - 1, Math.max(0, Math.round((z - T.z0) / cell)));
    return D[b * nx + a];
  };
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Ground normal's y at (x, z) from the heightfield (1 m central differences).
function slopeNy(T, x, z) {
  const dx = heightAt(T, x + 1, z) - heightAt(T, x - 1, z), dz = heightAt(T, x, z + 1) - heightAt(T, x, z - 1);
  return 2 / Math.hypot(dx, 2, dz);
}

export function placeScenery({ layout, terrain: T, edges, features, locator, roadside, seed }, r, { theme = 'summer' } = {}) {
  const C = SCENERY, winter = theme === 'winter';
  const forest = noise2(`${seed}|forest`), species = noise2(`${seed}|species`);
  const far = roadField(layout, T, 4);
  const jumps = features.filter((f) => f.type !== 'narrow' && f.type !== 'berm');
  const gates = roadside.gates.map((g) => g.s);
  const near = (s, list, pad) => list.some((f) => s >= f.s0 - pad && s <= f.s1 + pad);
  const wrapD = (a, b) => { const d = Math.abs(a - b); return layout.closed ? Math.min(d, layout.length - d) : d; };

  // Clearance-relative distance past the road edge, and the clearance that applies there; null = too close.
  const room = (x, z, kind) => {
    const dc = far(x, z), base = C.clear[kind];
    if (dc > C.near) return { past: dc - EDGE_TYPICAL, clear: base };
    const { s, d } = locator.locate(x, z), past = Math.abs(d) - edgeAt(edges, layout, s, d);
    let clear = base;
    if (kind !== 'bush') {
      const i = Math.min(layout.n - 1, Math.max(0, Math.round(s / layout.ds))), k = layout.curvature[i];
      if (Math.abs(k) > C.tightKappa && Math.sign(k) === -Math.sign(d)) clear = Math.max(clear, C.clear.outside);
      if (near(s, jumps, 30)) clear = Math.max(clear, C.clear.feature);
      if (gates.some((g) => wrapD(g, s) < 30)) clear = Math.max(clear, C.clear.gate);
    }
    return { past, clear };
  };

  const trees = [], bushes = [], rocks = [];
  const g = C.grid, x1 = T.x0 + (T.nx - 1) * T.cell, z1 = T.z0 + (T.nz - 1) * T.cell;
  for (let z = T.z0 + g / 2; z < z1 - 1; z += g) for (let x = T.x0 + g / 2; x < x1 - 1; x += g) {
    const px = x + r.range(-0.45, 0.45) * g, pz = z + r.range(-0.45, 0.45) * g, roll = r.next(), roll2 = r.next(), roll3 = r.next();
    const f = smooth(C.forest.cut[0], C.forest.cut[1], fbm(forest, px, pz, { octaves: 3, scale: C.forest.scale }));
    const ny = slopeNy(T, px, pz);
    // Trees: forest patches, the odd lone tree in the open.
    const pTree = f * 0.62 + C.meadow * (1 - f);
    if (roll < pTree) {
      const q = room(px, pz, 'tree');
      if (q.past >= q.clear && roll < pTree * smooth(q.clear, q.clear + C.ramp, q.past)) {
        const pine = winter || species(px / 120, pz / 120) * 0.5 + 0.5 < C.pine.summer + (f - 0.5) * 0.2;
        trees.push({ kind: pine ? 'pine' : 'leafy', x: px, y: heightAt(T, px, pz), z: pz, yaw: r.next() * 2 * Math.PI, scale: r.range(...C.scale.tree) });
        continue;
      }
    }
    // Rocks: rare, more on slopes.
    const pRock = C.rocks.perCell * (1 + C.rocks.slopeBoost * 10 * (1 - smooth(C.rocks.slope[1], C.rocks.slope[0], ny)));
    if (roll2 < pRock) {
      const q = room(px, pz, 'rock');
      if (q.past >= q.clear) {
        rocks.push({ kind: roll3 < 0.6 ? 'rock-a' : 'rock-b', x: px, y: heightAt(T, px, pz), z: pz, yaw: r.next() * 2 * Math.PI, scale: r.range(...C.scale.rock) });
        continue;
      }
    }
    // Bushes (summer): along forest edges, a few in the open.
    if (!winter) {
      const edge = f * (1 - f) * 4, pBush = C.bushes.forestEdge * edge + C.bushes.open;
      if (roll3 < pBush) {
        const q = room(px, pz, 'bush');
        if (q.past >= q.clear) bushes.push({ kind: 'bush', x: px, y: heightAt(T, px, pz), z: pz, yaw: r.next() * 2 * Math.PI, scale: r.range(...C.scale.bush) });
      }
    }
  }
  return { trees, bushes, rocks, fences: placeFences(layout, T, edges, jumps, gates, locator, r, trees) };
}
const EDGE_TYPICAL = 3; // m: the road's half-width far from it, where the exact edge doesn't matter

// Fence runs: on straights, a fixed offset past one side's edge, sections post to post along the road. Trees standing on
// the line are dropped so a run never passes through a trunk.
function placeFences(layout, T, edges, features, gates, locator, r, trees) {
  const F = SCENERY.fence, { n, ds, closed, length } = layout, runs = [];
  const busy = (s0, s1) => features.some((f) => s1 > f.s0 - 30 && s0 < f.s1 + 30) || gates.some((g) => g > s0 - 40 && g < s1 + 40);
  const at = (s, d) => {
    const i = Math.round((((s % length) + length) % length) / ds) % n, h = layout.heading[i];
    return { x: layout.x[i] + d * Math.cos(h), z: layout.z[i] - d * Math.sin(h) };
  };
  // Straight stretches [s0, s1): runs of samples gentler than straightKappa.
  const stretches = [];
  for (let i = 0, a = -1; i <= n; i++) {
    const ok = i < n && Math.abs(layout.curvature[i]) <= F.straightKappa;
    if (ok && a < 0) a = i;
    if (!ok && a >= 0) { stretches.push([a * ds, i * ds]); a = -1; }
  }
  for (const [a, b] of stretches) {
    const s0 = Math.max(a + 5, closed ? 0 : 60), s1 = Math.min(b - 5, closed ? length : length - 60);
    const count = Math.min(F.sections[1], Math.floor((s1 - s0) / F.len));
    if (count < F.sections[0] || r.next() > F.chance || busy(s0, s0 + count * F.len)) continue;
    const s = s0 + r.range(0, s1 - s0 - count * F.len), side = r.next() < 0.5 ? 1 : -1, off = r.range(...F.off);
    const posts = [];
    for (let k = 0; k <= count; k++) {
      const sk = s + k * F.len, p = at(sk, side * (edgeAt(edges, layout, sk, side) + off));
      posts.push({ x: p.x, y: heightAt(T, p.x, p.z), z: p.z });
    }
    // Where the road doubles back, the line may cross another stretch of it: no run there.
    if (posts.some((p) => { const q = locator.locate(p.x, p.z); return Math.abs(q.d) - edgeAt(edges, layout, q.s, q.d) < off - 1; })) continue;
    const sections = [];
    for (let k = 0; k < count; k++) {
      const a = posts[k], b = posts[k + 1], dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
      sections.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2, yaw: Math.atan2(dx, dz), pitch: -Math.atan2(b.y - a.y, len), len });
    }
    runs.push({ sections, end: posts[count], side });
  }
  // Keep trees off the fence lines (2.5 m either side).
  if (runs.length) {
    const segs = runs.flatMap((run) => run.sections);
    for (let i = trees.length - 1; i >= 0; i--) {
      const t = trees[i];
      if (segs.some((q) => { const dx = t.x - q.x, dz = t.z - q.z, along = dx * Math.sin(q.yaw) + dz * Math.cos(q.yaw), across = dx * Math.cos(q.yaw) - dz * Math.sin(q.yaw); return Math.abs(along) < q.len / 2 + 2 && Math.abs(across) < 2.5; })) trees.splice(i, 1);
    }
  }
  return runs;
}
