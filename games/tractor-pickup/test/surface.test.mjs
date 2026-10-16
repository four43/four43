// M-10, D6 (3l Task 10): the surfaces come from the registry. materialAt names a material; its game block carries the grip, vmul and
// dirt rate the sim used to read from SURFACE and DIRT.
import test from 'node:test';
import assert from 'node:assert/strict';
import MATERIALS from '../src/defs/materials.js';
import { generateFarm } from '../src/sim/track.js';
import { buildRoad, ROAD_HALF } from '../src/sim/road.js';
import { testWorld } from './helpers/world.mjs';
import { addGround, DT } from '../src/sim/ground.js';
import { createTractor, POWER } from '../src/sim/tractor.js';

test('road.materialAt: route in the yard and on the road, meadow off it, mudhole on a mud tile', () => {
  const farm = generateFarm(9), road = buildRoad(farm);
  assert.equal(road.materialAt(0, 0), 'route');
  const p = road.routes[0].pts[40]; assert.equal(road.materialAt(p.x, p.z), farm.routes[p.r].tiles[p.k].type === 'mud' && Math.abs(p.u - 0.5) < 0.35 ? 'mudhole' : 'route');
  assert.equal(road.materialAt(p.x - p.tz * (ROAD_HALF + 3), p.z + p.tx * (ROAD_HALF + 3)), 'meadow');
  assert.equal(road.surfaceAt, undefined, 'one lookup, the material one');
});
test('the tractor reads grip and vmul through materialAt (mud from the registry halves the top speed)', () => {
  const { world, step } = testWorld(); addGround(world);
  const t = createTractor(world, { x: 0, z: 0, yaw: 0, materialAt: () => 'mudhole' });
  step(60, () => { t.setInput(0, 0); t.step(DT); }); step(600, () => { t.setInput(1, 0); t.step(DT); });
  assert.equal(t.surface, 'mud'); assert.equal(t.ground, 'mudhole');
  assert.ok(t.speed < POWER.medium.vmax * 0.55, `speed ${t.speed}`);
});
