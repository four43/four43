import test from 'node:test';
import assert from 'node:assert/strict';
import { addGround, DT } from '../src/sim/ground.js';
import { testWorld } from './helpers/world.mjs';
import { generateFarm } from '../src/sim/track.js';
import { addYardProps } from '../src/sim/scenery.js';

test('props: dynamic bales/cones/barrels, no fixed posts, and reset puts them back (T-31, T-32)', () => {
  const { world, step } = testWorld(); addGround(world); const farm = generateFarm(5), { props, reset } = addYardProps(world, farm);
  assert.equal(props.length, 32); assert.ok(props.every(p => p.body)); assert.ok(!props.some(p => p.kind === 'post'));
  step(60);
  const bale = props.find(p => p.kind === 'bale'), p0 = { ...bale.body.translation() };
  bale.body.applyImpulse({ x: 900, y: 0, z: 0 }, true);
  step(120);
  assert.ok(Math.hypot(bale.body.translation().x - p0.x, bale.body.translation().z - p0.z) > 2, 'bale did not roll');
  reset(); const p1 = bale.body.translation();
  assert.ok(Math.hypot(p1.x - bale.start.at[0], p1.z - bale.start.at[2]) < 1e-3);
});

test('the tractor cannot drive through the yard fence or up a barn wall', async () => {
  const { addFarmColliders } = await import('../src/sim/scenery.js'), { buildRoad } = await import('../src/sim/road.js'), { createTractor } = await import('../src/sim/tractor.js');
  const { createTerrain } = await import('../src/sim/terrain.js'), { makeRng } = await import('../src/sim/rng.js');
  const farm = generateFarm(5), road = buildRoad(farm), terrain = createTerrain(farm, road, makeRng(5)), { world: w, step: run } = testWorld(); addGround(w, { terrain }); addFarmColliders(w, farm, road, terrain);
  const t = createTractor(w, { x: -22, z: -44, yaw: Math.PI, power: 'medium', surfaceAt: () => 'gravel' });
  run(60 * 8, () => { t.setInput(1, 0); t.step(DT); });
  assert.ok(t.z > -54, `drove through the fence to z=${t.z}`);
});
