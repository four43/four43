import test from 'node:test';
import assert from 'node:assert/strict';
import { generateFarm, YARD_HALF } from '../src/sim/track.js';
import { buildRoad, ROAD_HALF, makeBarnPass } from '../src/sim/road.js';
import { scatterScenery, yardWalls } from '../src/sim/scenery.js';
import { makeRng } from '../src/sim/rng.js';

for (const seed of [1, 2, 3, 4, 5, 77, 1234]) test(`roads ${seed}: continuous, start and end at a yard gate`, () => {
  const farm = generateFarm(seed), road = buildRoad(farm);
  for (const r of road.routes) {
    const P = r.pts; for (let i = 0; i + 1 < P.length; i++) assert.ok(Math.hypot(P[i].x - P[i + 1].x, P[i].z - P[i + 1].z) < 1.3, `gap at ${i}`);
    for (const p of [P[0], P.at(-1)]) { // gate points: middle of a yard side
      assert.ok(Math.abs(Math.max(Math.abs(p.x), Math.abs(p.z)) - YARD_HALF) < 0.01 && Math.min(Math.abs(p.x), Math.abs(p.z)) < 0.01, `${p.x},${p.z}`);
    }
  }
});
test('surfaces: yard gravel, road gravel, off-road grass, mud tile mud', () => {
  const farm = generateFarm(5), road = buildRoad(farm);
  assert.equal(road.surfaceAt(10, 10), 'gravel');
  const p = road.routes[0].pts[30]; assert.equal(road.surfaceAt(p.x, p.z), 'gravel');
  assert.equal(road.surfaceAt(p.x + p.tz * (ROAD_HALF + 2), p.z - p.tx * (ROAD_HALF + 2)), 'grass');
  for (const [r, R] of farm.routes.entries()) R.tiles.forEach((t, k) => { if (t.type === 'mud') { const c = road.featureCenter(r, k); assert.equal(road.surfaceAt(c.x, c.z), 'mud'); } });
});
test('sprinkler zone is at the sprinkler tile center', () => {
  const farm = generateFarm(5), road = buildRoad(farm);
  for (const [r, R] of farm.routes.entries()) R.tiles.forEach((t, k) => { if (t.type === 'sprinkler') { const c = road.featureCenter(r, k); assert.ok(road.inSprinkler(c.x, c.z)); } });
  assert.ok(!road.inSprinkler(0, 0));
});
test('ahead stays on the route and stops at its ends', () => {
  const farm = generateFarm(5), road = buildRoad(farm), P = road.routes[1].pts;
  assert.equal(road.ahead(P[5], 1000), P.at(-1)); assert.equal(road.ahead(P[5], -1000), P[0]); assert.equal(road.ahead(P[5], 3).n, 8);
});
test('barn pass: through counts, backing out and passing beside do not (F-1)', () => {
  const barn = { x: 0, z: 0, yaw: 0, half: 6, width: 5 }, drive = (pts) => { const pass = makeBarnPass(barn); return pts.map(([x, z]) => pass(x, z)).filter(Boolean).length; };
  const line = (x, z0, z1) => Array.from({ length: 41 }, (_, i) => [x, z0 + (z1 - z0) * i / 40]);
  assert.equal(drive(line(0, -12, 12)), 1); assert.equal(drive(line(0, 12, -12)), 1);
  assert.equal(drive([...line(0, -12, 0), ...line(0, 0, -12)]), 0);
  assert.equal(drive(line(9, -12, 12)), 0);
});
test('scenery stays on field tiles: not on roads, not in the yard', () => {
  for (const seed of [1, 2, 3]) {
    const farm = generateFarm(seed), road = buildRoad(farm), items = scatterScenery(farm, road, makeRng(seed));
    assert.ok(items.length > 60);
    for (const it of items) { assert.ok(road.nearest(it.x, it.z).d > ROAD_HALF + 1.5 + (it.r || 0), `${it.kind} on road`); assert.ok(!road.inYard(it.x, it.z), `${it.kind} in yard`); }
  }
});
test('yard fence has an opening at each gate', () => {
  const farm = generateFarm(5), segs = yardWalls(farm);
  assert.equal(segs.length, 8);
  for (const [gx, gz] of [[YARD_HALF, 0], [0, YARD_HALF], [-YARD_HALF, 0], [0, -YARD_HALF]]) for (const [ax, az, bx, bz] of segs) {
    const t = Math.max(0, Math.min(1, ((gx - ax) * (bx - ax) + (gz - az) * (bz - az)) / ((bx - ax) ** 2 + (bz - az) ** 2)));
    assert.ok(Math.hypot(gx - ax - (bx - ax) * t, gz - az - (bz - az) * t) > 3.5, 'gate blocked');
  }
});
