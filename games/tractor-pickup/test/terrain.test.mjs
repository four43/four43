import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { createPhysics, DT } from '../src/sim/physics.js';
import { generateFarm, tileCenter, DIRS, YARD_HALF, SIZE, yardFree } from '../src/sim/track.js';
import { buildRoad, ROAD_HALF, FARM_HALF } from '../src/sim/road.js';
import { addFarmColliders } from '../src/sim/scenery.js';
import { createTerrain, HIGH, CELL, CUT, FENCE_D, YARD_LOW } from '../src/sim/terrain.js';
import { createTractor, quatAxes } from '../src/sim/tractor.js';
import { createTrain } from '../src/sim/hitch.js';
import { makeRng } from '../src/sim/rng.js';
await RAPIER.init();

const world = seed => { const farm = generateFarm(seed), road = buildRoad(farm); return { farm, road, terrain: createTerrain(farm, road, makeRng(seed)) }; };
const at = (p, side, d) => ({ x: p.x - p.tz * side * d, z: p.z + p.tx * side * d }); // side +1: left of the direction of travel
const segDist = (q, [ax, az, bx, bz]) => {
  const dx = bx - ax, dz = bz - az, t = Math.max(0, Math.min(1, ((q.x - ax) * dx + (q.z - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(q.x - ax - dx * t, q.z - az - dz * t);
};
const fenceNear = (T, q, r = 1) => T.fences.some(s => segDist(q, s) < r);

test('terrain constants', () => {
  assert.equal(HIGH, 4); assert.equal(CELL, 72); assert.deepEqual(CUT, { foot: 8.5, top: 11.5 }); assert.equal(FENCE_D, 9.2); assert.equal(YARD_LOW, 20);
});

for (const seed of [1, 2, 3, 4, 5]) test(`terrain ${seed}: patches 0-4 m, the yard surroundings low, both high and low field tiles`, () => {
  const { farm, terrain: T } = world(seed), rng = makeRng(seed + 100), LOW = YARD_HALF + YARD_LOW;
  for (let k = 0; k < 4000; k++) {
    const x = rng.range(-FARM_HALF, FARM_HALF), z = rng.range(-FARM_HALF, FARM_HALF), p = T.patch(x, z);
    assert.ok(p >= 0 && p <= HIGH, `patch ${p}`);
    if (Math.abs(x) <= LOW && Math.abs(z) <= LOW) assert.equal(p, 0, `patch ${p} at ${x.toFixed(1)},${z.toFixed(1)} near the yard`);
  }
  for (let x = -LOW; x <= LOW; x += 2) for (const z of [-LOW, LOW]) { assert.equal(T.patch(x, z), 0); assert.equal(T.patch(z, x), 0); }
  const field = []; for (let j = 0; j < SIZE; j++) for (let i = 0; i < SIZE; i++) if (farm.grid[j][i] === 'field') { const c = tileCenter(i, j); field.push(T.patch(c.x, c.z)); }
  const high = field.filter(p => p >= 3.5).length / field.length, low = field.filter(p => p <= 0.5).length / field.length;
  assert.ok(high >= 0.25, `high ${high}`); assert.ok(low >= 0.25, `low ${low}`);
});

for (const seed of [1, 2, 3]) test(`terrain ${seed}: road and shoulder flat, barriers on every side, fences overlap banks by 6 m`, () => {
  const { road, terrain: T } = world(seed);
  assert.equal(T.height(0, 0), 0);
  for (const R of road.routes) for (const side of [-1, 1]) {
    const P = R.pts, bank = P.map(p => { const q = at(p, side, 12); return T.height(q.x, q.z) >= 2.5; });
    P.forEach((p, i) => {
      for (const d of [0, 3, 6, 7, 8, 8.5]) { const q = at(p, side, d); const h = T.height(q.x, q.z); assert.ok(h >= 0 && h < 1e-9, `height ${h} at d ${d}`); } // 1e-9: d = 8.5 can come out a hair over
      if (!bank[i]) assert.ok(fenceNear(T, at(p, side, FENCE_D)), `no bank and no fence at route ${R.pts[0].r} point ${i} side ${side}`);
    });
    for (let i = 0; i + 1 < P.length; i++) {
      if (bank[i] === bank[i + 1]) continue;
      const dir = bank[i + 1] ? 1 : -1, first = bank[i + 1] ? i + 1 : i; // the first bank point past the change
      for (let k = 0; k <= 6; k++) { const j = first + dir * k; if (j < 0 || j >= P.length) break; assert.ok(fenceNear(T, at(P[j], side, FENCE_D)), `fence stops ${k} m into the bank at point ${j}`); }
    }
  }
  for (const [ax, az, bx, bz] of T.fences) assert.ok(Math.abs(road.nearest((ax + bx) / 2, (az + bz) / 2).d - FENCE_D) < 0.3, 'fence off the fence line');
  for (const b of T.banks) { const d = road.nearest(b.x, b.z).d; assert.ok(d > CUT.top - 1 && d < CUT.top + 2, `rock ${d} m out`); assert.ok(b.y >= 2.4, `rock on low ground ${b.y}`); }
  assert.ok(T.banks.length > 20 && T.fences.length > 20);
});

for (const seed of [1, 2, 3]) test(`terrain ${seed}: the heightfield collider matches terrain.height`, () => {
  const { terrain: T } = world(seed), phys = createPhysics(RAPIER, { terrain: T }), rng = makeRng(seed + 7);
  phys.world.step();
  let cut = 0;
  for (let k = 0; k < 200; k++) {
    const x = rng.range(-FARM_HALF + 1, FARM_HALF - 1), z = rng.range(-FARM_HALF + 1, FARM_HALF - 1);
    const hit = phys.world.castRay(new RAPIER.Ray({ x, y: 30, z }, { x: 0, y: -1, z: 0 }), 60, true);
    assert.ok(hit, `no ground at ${x},${z}`);
    const y = 30 - hit.timeOfImpact, h = T.height(x, z); if (h > 0.1 && h < HIGH - 0.1) cut++;
    assert.ok(Math.abs(y - h) < 0.15, `ground ${y.toFixed(3)} vs height ${h.toFixed(3)} at ${x.toFixed(2)},${z.toFixed(2)}`);
  }
  for (const [x, z] of [[-150, 60], [120, -170], [30, 140]]) { // asymmetric spots catch a transposed or flipped grid
    const hit = phys.world.castRay(new RAPIER.Ray({ x, y: 30, z }, { x: 0, y: -1, z: 0 }), 60, true);
    assert.ok(Math.abs(30 - hit.timeOfImpact - T.height(x, z)) < 0.15);
  }
  assert.ok(T.grid.heights.some(h => h > HIGH - 0.01), 'no high ground');
});

// A tractor (and optionally its trailer and wagon) on the seed's farm with the terrain and every static collider.
function farmDrive(seed, { x, z, yaw, power = 'high', train = false }) {
  const { farm, road, terrain } = world(seed), phys = createPhysics(RAPIER, { terrain }); addFarmColliders(phys, farm, road, terrain);
  const t = createTractor(phys, { x, z, yaw, power, surfaceAt: road.surfaceAt }), tr = train ? createTrain(phys, t) : null;
  const bodies = () => [t.body, ...(tr ? tr.cars.map(c => c.body) : [])];
  const s = { maxD: 0 };
  const run = (sec, thr, steer = 0) => { for (let i = 0; i < sec * 60; i++) {
    t.setInput(thr, steer); t.step(DT); tr?.step(DT, { parked: Math.abs(thr) < 0.05 && t.speed < 0.3 }); phys.world.step();
    for (const b of bodies()) { const p = b.translation(); s.maxD = Math.max(s.maxD, road.nearest(p.x, p.z).d); }
  } };
  const ups = () => bodies().map(b => quatAxes(b.rotation()).u.y);
  return { farm, road, terrain, t, tr, run, s, ups };
}
// A route point on a plain tile with a long stretch of one barrier kind on one side: a full-height bank, or fence on low ground.
function sectionOf(seed, kind, side) {
  const { farm, road, terrain: T } = world(seed);
  for (const R of road.routes) for (let i = 20; i + 20 < R.pts.length; i++) {
    const ok = R.pts.slice(i - 12, i + 13).every(p => {
      const tile = farm.routes[p.r].tiles[p.k], q = at(p, side, 12), h = T.height(q.x, q.z);
      return ['straight', 'curve', 'gate'].includes(tile.type) && (kind === 'bank' ? h >= HIGH - 0.3 : h < 0.5);
    });
    if (ok) return R.pts[i];
  }
}

for (const seed of [1, 2, 3]) for (const kind of ['bank', 'fence']) for (const side of [-1, 1]) {
  test(`seed ${seed}: the full train at High driven straight at a ${kind} on the ${side > 0 ? 'left' : 'right'} stays in and ends upright`, (tc) => {
    const p = sectionOf(seed, kind, side);
    if (!p) { assert.ok(kind === 'bank', `no ${kind} section`); tc.skip(`no long full-height bank on this side for seed ${seed}`); return; }
    const n = at(p, side, 1), s0 = at(p, side, 1.5), limit = kind === 'bank' ? 11 : FENCE_D + 0.5; // start 1.5 m toward the side so the wagon clears the far side
    const { run, s, ups } = farmDrive(seed, { x: s0.x, z: s0.z, yaw: Math.atan2(n.x - p.x, n.z - p.z), train: true });
    run(1, 0); run(6, 1);
    assert.ok(s.maxD > 5, `never reached the side (${s.maxD.toFixed(2)})`);
    assert.ok(s.maxD < limit, `reached ${s.maxD.toFixed(2)} m from the centerline`);
    run(4, 0);
    for (const u of ups()) assert.ok(u > 0.9, `up ${u}`);
  });
}
test('every seed 1-3 has a bank section to drive at', () => {
  for (const seed of [1, 2, 3]) assert.ok([-1, 1].some(side => sectionOf(seed, 'bank', side)), `seed ${seed}`);
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
  assert.ok(s.maxD < 11, `reached ${s.maxD.toFixed(2)} m`);
  run(4, 0);
  for (const u of ups()) assert.ok(u > 0.8, `up ${u}`);
});
for (const seed of [1, 2]) test(`seed ${seed}: jumping a ramp at an angle toward an edge stays in and upright`, () => {
  const farm = generateFarm(seed), road = buildRoad(farm);
  let ramp; farm.routes.forEach((R, r) => R.tiles.forEach((t, k) => { if (!ramp && t.type === 'ramp') ramp = road.featureCenter(r, k); }));
  assert.ok(ramp, 'no ramp');
  for (const ang of [0.3, -0.3]) {
    const yaw = ramp.yaw + ang; // a line through the ramp center, starting 16 m back on the far side of the road
    const { run, s, ups } = farmDrive(seed, { x: ramp.x - Math.sin(yaw) * 16, z: ramp.z - Math.cos(yaw) * 16, yaw, train: true });
    run(1, 0); run(6, 1);
    assert.ok(s.maxD < 11, `reached ${s.maxD.toFixed(2)} m (angle ${ang})`);
    run(4, 0);
    for (const u of ups()) assert.ok(u > 0.8, `up ${u} (angle ${ang})`);
  }
});

test('no stage: the line-up is bare yard ground, clear of obstacles (T-29)', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const y = generateFarm(seed).yard, L = y.lineup;
    assert.equal(y.stage, undefined);
    assert.ok(L && L.x0 < L.x1 && L.z0 < L.z1, 'no line-up');
    for (const v of [L.x0, L.x1, L.z0, L.z1]) assert.ok(Math.abs(v) < YARD_HALF, 'line-up outside the yard');
    assert.equal(L.y, undefined, 'the line-up has no platform');
    for (const o of y.obstacles) { const gx = Math.max(L.x0 - o.x, 0, o.x - L.x1), gz = Math.max(L.z0 - o.z, 0, o.z - L.z1); assert.ok(Math.hypot(gx, gz) > o.r, `${o.kind} on the line-up`); }
    assert.ok(!yardFree(y, (L.x0 + L.x1) / 2, (L.z0 + L.z1) / 2, 0.5));
  }
});

// Wheel rays ignore fences (G.WALL): a trailer wheel poking over a fence must not start its ray inside it and tip the car.
// Random swerves into the side from the road (Medium and High); the cars end level, not leaning on a fence.
test('the train swerving into fences and banks ends level', () => {
  const { road } = world(1), rng = makeRng(31);
  for (let k = 0; k < 16; k++) {
    const R = road.routes[k % 2], p = R.pts[rng.int(15, R.pts.length - 40)], power = rng.pick(['medium', 'high']), steer = rng.pick([-1, 1]), hold = rng.range(0.3, 1.6);
    const { run, ups } = farmDrive(1, { x: p.x, z: p.z, yaw: Math.atan2(p.tx, p.tz), power, train: true });
    run(2, 1); run(hold, 1, steer); run(4, 1); run(3, 0);
    for (const u of ups()) assert.ok(u > 0.9, `run ${k}: up ${u.toFixed(2)}`);
  }
});
