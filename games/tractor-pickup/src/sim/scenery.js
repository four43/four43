// Field scenery outside the edges (4.6), the farmyard fence and props (4.7), and the static colliders for the farm.
import { TILE, SIZE, DIRS, tileCenter, YARD_HALF, TREE_R } from './track.js';
import { ROAD_HALF, CORRIDOR } from './road.js';
import { CUT } from './terrain.js';
import { G, groups } from './physics.js';
import { addRamp } from './sandbox.js';
export const TALL = ['oak', 'tree', 'treeFat'];
export const FIELD_D = CUT.top + 2; // field scenery stands this far (plus its radius) from a centerline: past the cut top and the fence
const UNDER = ['bush', 'bush', 'bushS', 'bushS', 'grass', 'grass', 'rock', 'flowerY', 'flowerR', 'log', 'stump']; // forest floor: mostly bushes and grass
const R = { oak: 1.4, tree: 1.0, treeFat: 1.3, bush: 0.9, bushS: 0.5, rock: 0.5, pumpkin: 0.4, corn: 0.4, grass: 0.2, flowerY: 0.15, flowerR: 0.15, log: 0.6, stump: 0.5, hay: 0.8 };
const yawQ = y => ({ x: 0, y: Math.sin(y / 2), z: 0, w: Math.cos(y / 2) });

// Four sides of an axis-aligned rect as wall segments, with openings { x, z, w } cut where they sit on a side.
export function wallsOfRect(Rc, gaps = []) {
  const sides = [[Rc.x0, Rc.z0, Rc.x1, Rc.z0], [Rc.x1, Rc.z0, Rc.x1, Rc.z1], [Rc.x1, Rc.z1, Rc.x0, Rc.z1], [Rc.x0, Rc.z1, Rc.x0, Rc.z0]], out = [];
  for (const [ax, az, bx, bz] of sides) {
    const L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L;
    const cuts = gaps.filter(g => Math.abs((g.x - ax) * -uz + (g.z - az) * ux) < 0.5).map(g => [(g.x - ax) * ux + (g.z - az) * uz, g.w]).sort((p, q) => p[0] - q[0]);
    let t = 0;
    for (const [c, w] of cuts) { if (c - w / 2 > t) out.push([ax + ux * t, az + uz * t, ax + ux * (c - w / 2), az + uz * (c - w / 2)]); t = c + w / 2; }
    if (t < L) out.push([ax + ux * t, az + uz * t, bx, bz]);
  }
  return out;
}
const H = YARD_HALF;
export const GATE_W = 17; // T-3: the gate gap equals the corridor between the edge feet (2 x 8.5 m)
export const yardWalls = () => wallsOfRect({ x0: -H, x1: H, z0: -H, z1: H }, [[H, 0], [0, H], [-H, 0], [0, -H]].map(([x, z]) => ({ x, z, w: GATE_W })));

function addWall(phys, [ax, az, bx, bz], h, group, y0 = 0) { // a 0.3 m thick wall from y0 up to y0 + h
  const { RAPIER, world } = phys, L = Math.hypot(bx - ax, bz - az), th = Math.atan2(-(bz - az), bx - ax);
  world.createCollider(RAPIER.ColliderDesc.cuboid(L / 2, h / 2, 0.15).setTranslation((ax + bx) / 2, y0 + h / 2, (az + bz) / 2).setRotation(yawQ(th)).setFriction(0.1).setRestitution(0).setCollisionGroups(group));
}

// Arc centers of every curve tile: the corner shared by the entry and exit edges. The inside of the curve is the quarter disc around it.
export const curveCenters = farm => farm.routes.flatMap(R2 => R2.tiles.filter(t => t.inDir !== t.outDir).map(t => {
  const c = tileCenter(t.i, t.j), [ix, iz] = DIRS[t.inDir], [ox, oz] = DIRS[t.outDir];
  return { x: c.x + (ox - ix) * TILE / 2, z: c.z + (oz - iz) * TILE / 2 };
}));

export function scatterScenery(farm, road, rng, terrain) {
  // Forest outside the edges (4.6): 25-40 tall trees of mixed sizes per field tile, then 10-20 bushes, grass and rocks
  // under them; some tiles are corn fields. Items sit in 4 m buckets so the spacing check stays local.
  const inner = curveCenters(farm), items = [], grid = new Map(), B = 4, key = (i, j) => i * 4096 + j;
  const clear = (x, z, r, tall) => {
    const bi = Math.floor(x / B), bj = Math.floor(z / B);
    for (let i = bi - 1; i <= bi + 1; i++) for (let j = bj - 1; j <= bj + 1; j++) for (const o of grid.get(key(i, j)) || [])
      if (Math.hypot(o.x - x, o.z - z) <= (TALL.includes(o.kind) && !tall ? 0.5 : o.r) + r + 0.5) return false; // small plants may grow under a canopy
    return true;
  };
  const ok = (x, z, r, tall) => (!tall || inner.every(k => Math.hypot(k.x - x, k.z - z) >= TILE / 2)) && !road.inYard(x, z) && clear(x, z, r, tall) && road.nearest(x, z).d > FIELD_D + r;
  for (let j = 0; j < SIZE; j++) for (let i = 0; i < SIZE; i++) {
    if (farm.grid[j][i] !== 'field') continue;
    const c = tileCenter(i, j), cornField = rng.chance(0.15), trees = cornField ? 0 : rng.int(25, 40), n = cornField ? 60 : trees + rng.int(10, 20);
    let placed = 0;
    for (let m = 0; m < n * 6 && placed < n; m++) { // trees first, then the forest floor
      const kind = cornField ? 'corn' : placed < trees && m < trees * 4 ? rng.pick(TALL) : rng.pick(UNDER), r = R[kind], tall = TALL.includes(kind);
      const x = c.x + rng.range(-TILE / 2 + 1, TILE / 2 - 1), z = c.z + rng.range(-TILE / 2 + 1, TILE / 2 - 1);
      if (!ok(x, z, r, tall)) continue;
      const it = { kind, x, z, y: terrain.height(x, z), yaw: rng.range(0, Math.PI * 2), scale: tall ? rng.range(1.6, 3.4) : rng.range(1, 1.5), r }; placed++; // 4.6: forest trees 1.6 to 3.4 times the model
      items.push(it); const k = key(Math.floor(x / B), Math.floor(z / B)); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(it);
    }
  }
  // A-13: a clump of big bushes (about 2 m wide, 1.7 m tall) on the shoulder in front of the bank; the hider's tail pokes out toward the road
  for (const h of farm.hideSpots) { const { pt } = road.nearest(h.x, h.z), sd = Math.sign((h.x - pt.x) * -pt.tz + (h.z - pt.z) * pt.tx);
    for (const [along, out, yaw, sc] of [[0, 0.3, 0, 5], [-0.6, 0, 1.2, 4.2], [0.6, 0, 2.4, 4.2], [0, -0.15, 3.7, 3.6]])
      items.push({ kind: 'bush', x: h.x + pt.tx * along - pt.tz * sd * out, z: h.z + pt.tz * along + pt.tx * sd * out, y: 0, yaw, scale: sc, sy: 1.8, r: 0.95, hide: true }); }
  return items;
}

// T-35: breakable trees and bushes on the route shoulders, outside the road surface. About 1 tree and 2 bushes per route tile.
// Trees only on straight and gate tiles, or on the outer side of a curve (4.6); none on feature tiles or near a hiding bush.
export const ROADSIDE = { tree: ROAD_HALF + 0.9, bush: ROAD_HALF + 0.75, gap: 4, hide: 6 }; // m from the centerline; spacing; m from a hide bush
export function roadside(farm, road, rng) {
  const inner = curveCenters(farm), out = [];
  const ok = (x, z, r, tree) => Math.abs(x) > YARD_HALF + 3 || Math.abs(z) > YARD_HALF + 3 // clear of the yard fence and its gate posts
    ? (!tree || inner.every(k => Math.hypot(k.x - x, k.z - z) >= TILE / 2)) && farm.hideSpots.every(h => Math.hypot(h.x - x, h.z - z) >= ROADSIDE.hide)
      && out.every(o => Math.hypot(o.x - x, o.z - z) >= ROADSIDE.gap + (o.kind === 'tree' || tree ? 1 : 0)) && road.nearest(x, z).d > ROAD_HALF + 0.3 && road.nearest(x, z).d < CORRIDOR
    : false;
  road.routes.forEach((R, r) => farm.routes[r].tiles.forEach((t, k) => {
    if (['mud', 'ramp', 'sprinkler'].includes(t.type)) return;
    const pts = R.pts.filter(p => p.k === k && p.u > 0.1 && p.u < 0.9);
    for (const [kind, n] of [['tree', rng.int(0, 2)], ['bush', rng.int(1, 3)]]) for (let i = 0, tries = 0; i < n && tries < 12; tries++) {
      const p = rng.pick(pts), sd = rng.chance(0.5) ? 1 : -1, off = ROADSIDE[kind] * sd, x = p.x - p.tz * off, z = p.z + p.tx * off, tree = kind === 'tree';
      if (!ok(x, z, TREE_R[tree ? 'single' : 'bush'], tree)) continue;
      out.push({ kind, x, z, r: tree ? TREE_R.single : TREE_R.bush, scale: tree ? rng.range(0.9, 1.1) : rng.range(0.85, 1.15), yaw: rng.range(0, Math.PI * 2), roadside: true }); i++;
    }
  }));
  return out;
}

export function addFarmColliders(phys, farm, road, terrain) {
  const { RAPIER, world } = phys, cg = groups(G.STATIC, 0xffff), wall = groups(G.WALL, 0xffff), y = farm.yard, b = y.barn;
  farm.routes.forEach((R2, r) => R2.tiles.forEach((t, k) => { if (t.type === 'ramp') addRamp(phys, { ...road.featureCenter(r, k), width: 14 }); }));
  const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
  for (const sd of [-1, 1]) { // drive-through barn: two side walls along the axis (T-28), and the open door leaves in line with them
    const ox = Math.cos(b.yaw) * sd * b.width, oz = -Math.sin(b.yaw) * sd * b.width;
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.3, 2.5, b.half).setTranslation(b.x + ox, 2.5, b.z + oz).setRotation(yawQ(b.yaw)).setFriction(0.1).setCollisionGroups(wall));
    for (const end of [-1, 1]) { const a = end * (b.half + b.leaf / 2);
      world.createCollider(RAPIER.ColliderDesc.cuboid(0.15, 2.3, b.leaf / 2).setTranslation(b.x + ox + fx * a, 2.3, b.z + oz + fz * a).setRotation(yawQ(b.yaw)).setFriction(0.1).setCollisionGroups(wall)); }
  }
  for (const seg of yardWalls(farm)) addWall(phys, seg, 1.0, wall);
  for (const seg of terrain.fences) { // T-17 route fences, 1.2 m above the ground; where a fence runs onto the cut foot it reaches down into the slope
    const ya = terrain.height(seg[0], seg[1]), yb = terrain.height(seg[2], seg[3]), y0 = Math.min(ya, yb) - 0.3;
    addWall(phys, seg, Math.max(ya, yb) + 1.2 - y0, wall, y0);
  }
}

// T-31: bales roll (cylinder on its side), cones and barrels tip; trees and bushes are in trees.js. T-32: reset() on each show.
export function addYardProps(phys, farm) {
  const { RAPIER, world } = phys, cg = groups(G.PROP, 0xffff), props = [], S = Math.SQRT1_2;
  for (const o of farm.yard.obstacles) {
    if (o.kind === 'tree' || o.kind === 'bush') continue; // they belong to the tree system (trees.js): the tractor breaks them (T-34)
    const cy = Math.cos(o.yaw / 2), sy = Math.sin(o.yaw / 2);
    const q = o.kind === 'bale' ? { x: cy * S, y: sy * S, z: -sy * S, w: cy * S } : yawQ(o.yaw); // bale: yaw then 90 degrees about x
    const y = { bale: 0.75, cone: 0.35, barrel: 0.5 }[o.kind];
    const shape = { bale: () => RAPIER.ColliderDesc.cylinder(0.6, 0.75).setMass(150), cone: () => RAPIER.ColliderDesc.cone(0.35, 0.25).setMass(2), barrel: () => RAPIER.ColliderDesc.cylinder(0.5, 0.4).setMass(25) }[o.kind]();
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(o.x, y, o.z).setRotation(q).setLinearDamping(0.3).setAngularDamping(0.5));
    world.createCollider(shape.setFriction(0.6).setRestitution(0.1).setCollisionGroups(cg), body);
    props.push({ ...o, body, start: { x: o.x, y, z: o.z, q } });
  }
  return {
    props,
    reset() { for (const p of props) if (p.body) { p.body.setTranslation(p.start, true); p.body.setRotation(p.start.q, true); p.body.setLinvel({ x: 0, y: 0, z: 0 }, true); p.body.setAngvel({ x: 0, y: 0, z: 0 }, true); } },
  };
}
