// The farm ground on the World (3l Task 5; Review Focus 1). Tractor's grid is x-major (heights[ix*n+iz]); world.heightfield takes
// row-major heights[iz*nx+ix]. A missing transpose mirrors the farm across its diagonal, which only asymmetric points can show.
import test from 'node:test';
import assert from 'node:assert/strict';
import { testWorld } from './helpers/world.mjs';
import { addGround, rowMajor, rayMask } from '../src/sim/ground.js';
import { generateFarm } from '../src/sim/track.js';
import { buildRoad } from '../src/sim/road.js';
import { createTerrain } from '../src/sim/terrain.js';
import { makeRng } from '../src/sim/rng.js';

const terrainOf = seed => { const farm = generateFarm(seed), road = buildRoad(farm); return createTerrain(farm, road, makeRng(seed ^ 0x7e11a1)); };
// Rapier's scene queries see a collider only after a step (the query pipeline updates in World.step)
const hitY = (world, x, z) => { const R = world.R, hit = world.rapier.castRay(new R.Ray({ x, y: 60, z }, { x: 0, y: -1, z: 0 }), 120, true, undefined, rayMask(world)); return hit ? 60 - (hit.timeOfImpact ?? hit.toi) : null; };

test('rowMajor transposes an x-major grid', () => {
  assert.deepEqual([...rowMajor({ n: 2, heights: new Float32Array([1, 2, 3, 4]) })], [1, 3, 2, 4]);
});
test('ray casts land on terrain.height at grid points where the farm is not symmetric', () => {
  const T = terrainOf(5), { n, step, heights } = T.grid, F = T.grid.size / 2, { world, step: run } = testWorld(); addGround(world, { terrain: T }); run(1);
  const pts = [];
  for (let i = 0; i < n && pts.length < 12; i += 7) for (let j = 0; j < n && pts.length < 12; j += 11) if (Math.abs(heights[i * n + j] - heights[j * n + i]) > 1) pts.push([i, j]);
  assert.ok(pts.length >= 6, `only ${pts.length} asymmetric points`);
  for (const [i, j] of pts) { const x = -F + i * step, z = -F + j * step, y = hitY(world, x, z); assert.ok(Math.abs(y - T.height(x, z)) < 0.02, `(${x}, ${z}): hit ${y}, height ${T.height(x, z)}`); }
});
test('without a terrain the ground is the sandbox slab, top at y = 0, material pad', () => {
  const { world, step } = testWorld(), e = addGround(world); step(1);
  const y = hitY(world, 13, -7); assert.ok(y !== null && Math.abs(y) < 1e-6, `hit ${y}`); assert.equal(world.materialOf(e.colliders[0].collider.handle), 'pad');
});
