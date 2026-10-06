import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { createPhysics, DT } from '../src/sim/physics.js';
import { generateFarm, tileCenter, DIRS } from '../src/sim/track.js';
import { buildRoad, ROAD_HALF } from '../src/sim/road.js';
import { addFarmColliders } from '../src/sim/scenery.js';
import { EDGE, edgeStrips, edgeRocks } from '../src/sim/edges.js';
import { createTractor, quatAxes } from '../src/sim/tractor.js';
import { createTrain } from '../src/sim/hitch.js';
import { makeRng } from '../src/sim/rng.js';
await RAPIER.init();

for (const seed of [1, 2, 3]) test(`edge strips ${seed}: valid mesh, banks 0-3 m high, crest 11-13 m out, faces up and inward`, () => {
  const farm = generateFarm(seed), road = buildRoad(farm);
  for (const r of road.routes) {
    const { vertices: V, indices: I } = edgeStrips(r), n = V.length / 3;
    assert.ok(n > 0 && I.length > 0 && I.length % 3 === 0);
    for (const i of I) assert.ok(i < n, `index ${i} >= ${n}`);
    let crest = 0;
    for (let i = 0; i < n; i++) {
      const y = V[i * 3 + 1]; assert.ok(y >= 0 && y <= EDGE.height, `y ${y}`);
      if (y === EDGE.height) { crest++; const d = road.nearest(V[i * 3], V[i * 3 + 2]).d; assert.ok(d > EDGE.crest - 0.5 && d < EDGE.crestOut + 0.5, `crest at ${d}`); }
    }
    assert.ok(crest > 0);
    for (let t = 0; t < I.length; t += 3) { // face normals point up; on the inner slope they also point back toward the road
      const P = k => [V[I[t + k] * 3], V[I[t + k] * 3 + 1], V[I[t + k] * 3 + 2]], [a, b, c] = [P(0), P(1), P(2)];
      const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
      if (Math.hypot(nx, ny, nz) < 1e-9) continue;
      assert.ok(ny > 0, 'face points down');
      const mx = (a[0] + b[0] + c[0]) / 3, mz = (a[2] + b[2] + c[2]) / 3, near = road.nearest(mx, mz);
      if (near.d < EDGE.crest - 0.3) assert.ok(nx * (near.pt.x - mx) + nz * (near.pt.z - mz) > 0, 'inner slope faces away from the road');
    }
  }
});

test('edge rocks sit on the crests', () => {
  const farm = generateFarm(1), road = buildRoad(farm), rocks = edgeRocks(road, makeRng(1));
  assert.ok(rocks.length > 100);
  for (const k of rocks) { assert.ok(['rockA', 'rockB', 'rockC'].includes(k.kind)); const d = road.nearest(k.x, k.z).d; assert.ok(d > EDGE.crest - 1 && d < EDGE.crestOut + 1, `rock at ${d}`); }
});

// A tractor (and optionally its trailer and wagon) on the seed's farm with every static collider.
function farmDrive(seed, { x, z, yaw, power = 'high', train = false }) {
  const farm = generateFarm(seed), road = buildRoad(farm), phys = createPhysics(RAPIER); addFarmColliders(phys, farm, road);
  const t = createTractor(phys, { x, z, yaw, power, surfaceAt: road.surfaceAt }), tr = train ? createTrain(phys, t) : null;
  const bodies = () => [t.body, ...(tr ? tr.cars.map(c => c.body) : [])];
  const s = { maxD: 0, minUp: 1 };
  const run = (sec, thr, steer = 0) => { for (let i = 0; i < sec * 60; i++) {
    t.setInput(thr, typeof steer === 'function' ? steer() : steer); t.step(DT); tr?.step(DT, { parked: Math.abs(thr) < 0.05 && t.speed < 0.3 }); phys.world.step();
    for (const b of bodies()) { const p = b.translation(); s.maxD = Math.max(s.maxD, road.nearest(p.x, p.z).d); }
  } };
  const ups = () => bodies().map(b => quatAxes(b.rotation()).u.y);
  return { farm, road, t, tr, run, s, ups };
}
const straightTile = (farm, type = 'straight') => { for (const R of farm.routes) for (const t of R.tiles) if (t.type === type) return t; };

for (const side of [-1, 1]) test(`full throttle straight at the ${side < 0 ? 'right' : 'left'} edge: stops below the crest and ends upright`, () => {
  const farm = generateFarm(1), tile = straightTile(farm), c = tileCenter(tile.i, tile.j), [dx, dz] = DIRS[tile.outDir];
  const nx = -dz * side, nz = dx * side, { t, run, s, ups } = farmDrive(1, { x: c.x, z: c.z, yaw: Math.atan2(nx, nz) });
  run(1, 0); run(6, 1);
  assert.ok(s.maxD < EDGE.crest, `reached ${s.maxD.toFixed(2)} m from the centerline`);
  run(3, 0);
  assert.ok(ups()[0] > 0.9, `tractor up ${ups()[0]}`);
  assert.ok(Number.isFinite(t.x));
});

test('driving along a straight at full speed stays on the road', () => {
  const farm = generateFarm(1);
  let start; for (const R of farm.routes) R.tiles.forEach((t, k) => { const n = R.tiles[k + 1]; if (!start && ['straight', 'gate'].includes(t.type) && n && ['straight', 'gate', 'sprinkler'].includes(n.type) && t.inDir === t.outDir && n.inDir === t.outDir) start = t; });
  assert.ok(start, 'no two straight tiles in a row');
  const c = tileCenter(start.i, start.j), [dx, dz] = DIRS[start.outDir];
  const { run, s } = farmDrive(1, { x: c.x - dx * 14, z: c.z - dz * 14, yaw: Math.atan2(dx, dz) });
  run(1, 0); s.maxD = 0; run(4, 1);
  assert.ok(s.maxD < ROAD_HALF, `wandered ${s.maxD.toFixed(2)} m`);
});

// Playtest worry: with the trailer and wagon at full High speed, steering hard into an edge or jumping a ramp at an angle.
for (const seed of [1, 2]) for (const steer of [1, -1]) test(`seed ${seed}: the full train swerving into the ${steer > 0 ? 'left' : 'right'} edge at High stays in and upright`, () => {
  const farm = generateFarm(seed), tile = farm.routes[0].tiles[0], c = tileCenter(tile.i, tile.j), [dx, dz] = DIRS[tile.outDir];
  const { run, s, ups } = farmDrive(seed, { x: c.x - dx * 17, z: c.z - dz * 17, yaw: Math.atan2(dx, dz), train: true });
  run(1, 0); run(1.5, 1); run(4, 1, steer); run(4, 1, -steer);
  assert.ok(s.maxD < EDGE.crest, `reached ${s.maxD.toFixed(2)} m`);
  run(4, 0);
  for (const u of ups()) assert.ok(u > 0.8, `up ${u}`);
});
for (const seed of [1, 2]) test(`seed ${seed}: jumping a ramp at an angle toward an edge stays in and upright`, () => {
  const farm = generateFarm(seed), road = buildRoad(farm);
  let at; farm.routes.forEach((R, r) => R.tiles.forEach((t, k) => { if (!at && t.type === 'ramp') at = road.featureCenter(r, k); }));
  assert.ok(at, 'no ramp');
  for (const ang of [0.3, -0.3]) {
    const yaw = at.yaw + ang; // a line through the ramp center, starting 16 m back on the far side of the road
    const { run, s, ups } = farmDrive(seed, { x: at.x - Math.sin(yaw) * 16, z: at.z - Math.cos(yaw) * 16, yaw, train: true });
    run(1, 0); run(6, 1);
    assert.ok(s.maxD < EDGE.crest, `reached ${s.maxD.toFixed(2)} m (angle ${ang})`);
    run(4, 0);
    for (const u of ups()) assert.ok(u > 0.8, `up ${u} (angle ${ang})`);
  }
});
