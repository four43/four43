// Field scenery (4.6), the farmyard walls and props (4.7), and the static colliders for the farm.
import { TILE, SIZE, DIRS, tileCenter, YARD_HALF, barnLocal } from './track.js';
import { ROAD_HALF } from './road.js';
import { G, groups } from './physics.js';
import { addRamp } from './sandbox.js';
export const TALL = ['oak', 'tree', 'treeFat'], SMALL = ['bush', 'bushS', 'rock', 'pumpkin', 'grass', 'flowerY', 'flowerR', 'log', 'stump', 'hay'];
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
export const yardWalls = () => wallsOfRect({ x0: -H, x1: H, z0: -H, z1: H }, [[H, 0], [0, H], [-H, 0], [0, -H]].map(([x, z]) => ({ x, z, w: 8 })));
export const paddockWalls = farm => wallsOfRect(farm.yard.paddock, [{ ...farm.yard.paddock.gate, w: 1.6 }]);

function addWall(phys, [ax, az, bx, bz], h, group) {
  const { RAPIER, world } = phys, L = Math.hypot(bx - ax, bz - az), th = Math.atan2(-(bz - az), bx - ax);
  world.createCollider(RAPIER.ColliderDesc.cuboid(L / 2, h / 2, 0.15).setTranslation((ax + bx) / 2, h / 2, (az + bz) / 2).setRotation(yawQ(th)).setFriction(0.1).setRestitution(0).setCollisionGroups(group));
}

// Arc centers of every curve tile: the corner shared by the entry and exit edges. The inside of the curve is the quarter disc around it.
export const curveCenters = farm => farm.routes.flatMap(R2 => R2.tiles.filter(t => t.inDir !== t.outDir).map(t => {
  const c = tileCenter(t.i, t.j), [ix, iz] = DIRS[t.inDir], [ox, oz] = DIRS[t.outDir];
  return { x: c.x + (ox - ix) * TILE / 2, z: c.z + (oz - iz) * TILE / 2 };
}));

export function scatterScenery(farm, road, rng) {
  const inner = curveCenters(farm), items = [], ok = (x, z, r, gap, tall) => (!tall || inner.every(k => Math.hypot(k.x - x, k.z - z) >= TILE / 2)) && road.nearest(x, z).d > ROAD_HALF + gap + r && !road.inYard(x, z) && Math.hypot(x - farm.pond.x, z - farm.pond.z) > farm.pond.r + r + 1
    && items.every(o => Math.hypot(o.x - x, o.z - z) > o.r + r + 0.5) && farm.hideSpots.every(h => Math.hypot(h.x - x, h.z - z) > 3);
  for (let j = 0; j < SIZE; j++) for (let i = 0; i < SIZE; i++) {
    if (farm.grid[j][i] !== 'field') continue;
    const c = tileCenter(i, j), cornField = rng.chance(0.15), n = cornField ? 40 : rng.int(4, 9);
    let placed = 0;
    for (let m = 0; m < n * 3 && placed < n; m++) {
      const kind = cornField ? 'corn' : rng.chance(0.3) ? rng.pick(TALL) : rng.pick(SMALL), r = R[kind];
      const x = c.x + rng.range(-TILE / 2 + 1, TILE / 2 - 1), z = c.z + rng.range(-TILE / 2 + 1, TILE / 2 - 1);
      if (!ok(x, z, r, TALL.includes(kind) ? 6 : 1.5, TALL.includes(kind))) continue;
      items.push({ kind, x, z, yaw: rng.range(0, Math.PI * 2), scale: rng.range(0.85, 1.25) * (TALL.includes(kind) ? 1.6 : 1.2), r }); placed++;
    }
  }
  for (const h of farm.hideSpots) items.push({ kind: 'bush', x: h.x, z: h.z, yaw: 0, scale: 1.8, r: 1.2, hide: true });
  return items;
}

export function addSceneryColliders(phys, items) {
  const { RAPIER, world } = phys, cg = groups(G.STATIC, 0xffff);
  for (const it of items) if (TALL.includes(it.kind) || it.kind === 'rock' || it.kind === 'hay' || it.kind === 'stump')
    world.createCollider(RAPIER.ColliderDesc.cylinder(1.5, it.r * 0.6).setTranslation(it.x, 1.5, it.z).setFriction(0.1).setRestitution(0.1).setCollisionGroups(cg));
}

export function addFarmColliders(phys, farm, road) {
  const { RAPIER, world } = phys, cg = groups(G.STATIC, 0xffff), y = farm.yard, b = y.barn;
  farm.routes.forEach((R2, r) => R2.tiles.forEach((t, k) => { if (t.type === 'ramp') addRamp(phys, road.featureCenter(r, k)); }));
  for (const sd of [-1, 1]) { // drive-through barn: two side walls along the axis (T-28)
    const ox = Math.cos(b.yaw) * sd * b.width, oz = -Math.sin(b.yaw) * sd * b.width;
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.3, 2.5, b.half).setTranslation(b.x + ox, 2.5, b.z + oz).setRotation(yawQ(b.yaw)).setFriction(0.1).setCollisionGroups(cg));
  }
  for (const seg of yardWalls(farm)) addWall(phys, seg, 1.0, cg);
  for (const seg of paddockWalls(farm)) addWall(phys, seg, 1.0, cg);
  const st = y.stage; // low platform: the tractor can bump up onto it
  world.createCollider(RAPIER.ColliderDesc.cuboid((st.x1 - st.x0) / 2, st.y / 2, (st.z1 - st.z0) / 2).setTranslation((st.x0 + st.x1) / 2, st.y / 2, (st.z0 + st.z1) / 2).setCollisionGroups(cg));
}

// T-31: bales roll (cylinder on its side), cones and barrels tip; posts and trees are fixed. T-32: reset() on each show.
export function addYardProps(phys, farm) {
  const { RAPIER, world } = phys, cg = groups(G.PROP, 0xffff), fixed = groups(G.STATIC, 0xffff), props = [], S = Math.SQRT1_2;
  for (const o of farm.yard.obstacles) {
    if (o.kind === 'post' || o.kind === 'tree') {
      world.createCollider(RAPIER.ColliderDesc.cylinder(1.2, o.kind === 'tree' ? 0.7 : 0.18).setTranslation(o.x, 1.2, o.z).setFriction(0.1).setCollisionGroups(fixed));
      props.push({ ...o, body: null }); continue;
    }
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
