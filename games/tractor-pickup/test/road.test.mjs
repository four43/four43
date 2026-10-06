import test from 'node:test';
import assert from 'node:assert/strict';
import { generateFarm, YARD_HALF } from '../src/sim/track.js';
import { buildRoad, ROAD_HALF, SHOULDER, CORRIDOR, makeBarnPass } from '../src/sim/road.js';
import { scatterScenery, yardWalls, curveCenters, TALL, FIELD_D } from '../src/sim/scenery.js';
import { createTerrain, CUT, FENCE_D } from '../src/sim/terrain.js';
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
test('bucketed nearest() matches a brute-force search', () => {
  const rng = makeRng(9);
  for (const seed of [1, 2, 7]) { const road = buildRoad(generateFarm(seed));
    for (let i = 0; i < 3000; i++) { const x = rng.range(-210, 210), z = rng.range(-210, 210); let b = Infinity; for (const p of road.pts) b = Math.min(b, Math.hypot(p.x - x, p.z - z)); assert.ok(Math.abs(b - road.nearest(x, z).d) < 1e-9); } }
});
test('road sizes (T-2)', () => { assert.equal(ROAD_HALF, 7); assert.equal(SHOULDER, 1.5); assert.equal(CORRIDOR, 8.5); });
test('surfaces: yard gravel, road gravel, grass shoulder, mud tile mud', () => {
  const farm = generateFarm(5), road = buildRoad(farm);
  assert.equal(road.surfaceAt(10, 10), 'gravel'); assert.equal(road.surfaceAt(50, -50), 'gravel');
  const p = road.routes[0].pts[60]; assert.equal(road.surfaceAt(p.x, p.z), 'gravel');
  assert.equal(road.surfaceAt(p.x + p.tz * 6.5, p.z - p.tx * 6.5), 'gravel');
  assert.equal(road.surfaceAt(p.x + p.tz * 8, p.z - p.tx * 8), 'grass');
  assert.equal(road.surfaceAt(p.x - p.tz * 8, p.z + p.tx * 8), 'grass');
  let muds = 0;
  for (const [r, R] of farm.routes.entries()) R.tiles.forEach((t, k) => { if (t.type === 'mud') {
    const c = road.featureCenter(r, k), fx = Math.sin(c.yaw), fz = Math.cos(c.yaw); muds++;
    assert.equal(road.surfaceAt(c.x, c.z), 'mud');
    assert.equal(road.surfaceAt(c.x + fx * 12, c.z + fz * 12), 'mud'); assert.equal(road.surfaceAt(c.x + fz * 6, c.z - fx * 6), 'mud');  // 0.35 TILE along, the full width across
    assert.equal(road.surfaceAt(c.x + fx * 13.5, c.z + fz * 13.5), 'gravel');
  } });
  assert.ok(muds > 0);
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
test('barn pass fires 3/4 of the way in, once, and again only after leaving (F-1)', () => {
  const barn = { x: 0, z: 0, yaw: 0, half: 6, width: 5 }, pass = makeBarnPass(barn), at = z => pass(0, z);
  assert.equal(at(-12), false); assert.equal(at(-5.9), false); assert.equal(at(0), false); assert.equal(at(2.9), false); // entered at -6: 3/4 is z = 3
  assert.equal(at(3.1), true); assert.equal(at(3.5), false); assert.equal(at(-1), false);                             // once while inside
  assert.equal(at(-12), false); assert.equal(at(5.9), false); assert.equal(at(-3.1), true);                            // out, then in from the other end
});
test('scenery stays outside the edges and the yard, and hide bushes sit on the shoulder', () => {
  for (const seed of [1, 2, 3]) {
    const farm = generateFarm(seed), road = buildRoad(farm), terrain = createTerrain(farm, road, makeRng(seed)), items = scatterScenery(farm, road, makeRng(seed), terrain);
    const field = items.filter(it => !it.hide), tiles = farm.grid.flat().filter(g => g === 'field').length;
    assert.ok(field.length > tiles * 25, `only ${field.length} items on ${tiles} field tiles`);                   // dense forest (4.6)
    const wood = field.filter(it => it.kind !== 'corn'); assert.ok(wood.filter(it => TALL.includes(it.kind)).length > wood.length / 2, 'forest is mostly trees');
    assert.ok(FIELD_D > CUT.top && FIELD_D > FENCE_D);
    for (const it of field) { assert.ok(road.nearest(it.x, it.z).d > FIELD_D + it.r, `${it.kind} inside the edges`); assert.equal(it.y, terrain.height(it.x, it.z), `${it.kind} not on the ground`); assert.ok(!road.inYard(it.x, it.z), `${it.kind} in yard`); }
    for (const it of items.filter(i => i.hide)) { const d = road.nearest(it.x, it.z).d; assert.ok(d > 7.3 && d < 8.3, `hide bush ${d} m out`); }  // A-13: on the shoulder, in front of the bank
  }
});
test('yard fence has a 17 m opening at each gate', () => {
  const farm = generateFarm(5), segs = yardWalls(farm);
  assert.equal(segs.length, 8);
  for (const [gx, gz] of [[YARD_HALF, 0], [0, YARD_HALF], [-YARD_HALF, 0], [0, -YARD_HALF]]) for (const [ax, az, bx, bz] of segs) {
    const t = Math.max(0, Math.min(1, ((gx - ax) * (bx - ax) + (gz - az) * (bz - az)) / ((bx - ax) ** 2 + (bz - az) ** 2)));
    assert.ok(Math.hypot(gx - ax - (bx - ax) * t, gz - az - (bz - az) * t) > 8, 'gate blocked');
  }
});

test('tall scenery stays off the inside of curves (spec 4.6)', () => {
  for (const seed of [1, 2, 3]) {
    const farm = generateFarm(seed), road = buildRoad(farm), items = scatterScenery(farm, road, makeRng(seed), createTerrain(farm, road, makeRng(seed))), centers = curveCenters(farm);
    assert.ok(centers.length > 0);
    for (const it of items.filter(i => TALL.includes(i.kind) && !i.hide)) for (const k of centers) assert.ok(Math.hypot(it.x - k.x, it.z - k.z) >= 10, `${it.kind} inside a curve, seed ${seed}`);
  }
});
test('barn pass works for a barn turned 90 degrees', () => {
  const barn = { x: 0, z: 0, yaw: Math.PI / 2, half: 6, width: 5 }, drive = (pts) => { const pass = makeBarnPass(barn); return pts.map(([x, z]) => pass(x, z)).filter(Boolean).length; };
  const line = (z, x0, x1) => Array.from({ length: 41 }, (_, i) => [x0 + (x1 - x0) * i / 40, z]);
  assert.equal(drive(line(0, -12, 12)), 1); assert.equal(drive(line(0, 12, -12)), 1);
  assert.equal(drive([...line(0, -12, 0), ...line(0, 0, -12)]), 0);
  assert.equal(drive(line(9, -12, 12)), 0);
});
