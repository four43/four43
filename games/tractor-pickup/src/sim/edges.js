// The rock edges that keep the tractor on a route (spec T-17): an earth bank along both sides of each route,
// from the outer edge of the shoulder up to a 3 m crest and back down. Distances are from the centerline, in m.
import { G, groups } from './physics.js';
export const EDGE = { foot: 8.5, crest: 11, crestOut: 13, outFoot: 16, height: 3 };
const PROFILE = [[EDGE.foot, 0], [EDGE.crest, EDGE.height], [EDGE.crestOut, EDGE.height], [EDGE.outFoot, 0]];

// Both banks of one route as one mesh. Side +1 is the left of the direction of travel, side -1 the right.
// Each route point gives 4 profile vertices; consecutive points are joined with quads, wound so the faces point up
// (and, on the inner slope, back toward the road) for three.js; the trimesh collider is double-sided anyway.
export function edgeStrips(route) {
  const P = route.pts, pos = [], idx = [];
  for (const side of [-1, 1]) {
    const base = pos.length / 3;
    for (const p of P) for (const [d, h] of PROFILE) pos.push(p.x - p.tz * side * d, h, p.z + p.tx * side * d);
    for (let i = 0; i + 1 < P.length; i++) for (let k = 0; k < 3; k++) {
      const a = base + i * 4 + k, b = a + 1, c = a + 4, e = a + 5;
      if (side > 0) idx.push(a, b, c, b, e, c); else idx.push(a, c, b, b, c, e);
    }
  }
  return { vertices: new Float32Array(pos), indices: new Uint32Array(idx) };
}

export function addEdgeColliders(phys, road) {
  const { RAPIER, world } = phys;
  for (const r of road.routes) {
    const { vertices, indices } = edgeStrips(r);
    world.createCollider(RAPIER.ColliderDesc.trimesh(vertices, indices).setFriction(0.6).setRestitution(0).setCollisionGroups(groups(G.STATIC, 0xffff)));
  }
}

// Rocks along both crests, about every 3 m (one per 3 route points at the 1 m road step).
export function edgeRocks(road, rng) {
  const out = [];
  for (const r of road.routes) for (let i = 0; i < r.pts.length; i += 3) for (const side of [-1, 1]) {
    const p = r.pts[i], d = rng.range(EDGE.crest - 0.5, EDGE.crestOut + 0.5);
    out.push({ x: p.x - p.tz * side * d, z: p.z + p.tx * side * d, yaw: rng.range(0, 6.28), scale: rng.range(1.2, 2.4), kind: rng.pick(['rockA', 'rockB', 'rockC']) });
  }
  return out;
}
