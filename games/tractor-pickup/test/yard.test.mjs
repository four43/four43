import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { createPhysics, DT } from '../src/sim/physics.js';
import { generateFarm } from '../src/sim/track.js';
import { addYardProps } from '../src/sim/scenery.js';
await RAPIER.init();

test('props: dynamic bales/cones/barrels, fixed posts/trees, and reset puts them back (T-31, T-32)', () => {
  const phys = createPhysics(RAPIER), farm = generateFarm(5), { props, reset } = addYardProps(phys, farm);
  assert.equal(props.filter(p => p.body).length, 16); assert.equal(props.filter(p => !p.body).length, 6);
  for (let i = 0; i < 60; i++) phys.world.step();
  const bale = props.find(p => p.kind === 'bale'), p0 = { ...bale.body.translation() };
  bale.body.applyImpulse({ x: 900, y: 0, z: 0 }, true);
  for (let i = 0; i < 120; i++) phys.world.step();
  assert.ok(Math.hypot(bale.body.translation().x - p0.x, bale.body.translation().z - p0.z) > 2, 'bale did not roll');
  reset(); const p1 = bale.body.translation();
  assert.ok(Math.hypot(p1.x - bale.start.x, p1.z - bale.start.z) < 1e-3);
});

test('the tractor cannot drive through the yard fence or up a barn wall', async () => {
  const { addFarmColliders } = await import('../src/sim/scenery.js'), { buildRoad } = await import('../src/sim/road.js'), { createTractor } = await import('../src/sim/tractor.js');
  const phys = createPhysics(RAPIER), farm = generateFarm(5), road = buildRoad(farm); addFarmColliders(phys, farm, road);
  const t = createTractor(phys, { x: -18, z: -24, yaw: Math.PI, power: 'medium', surfaceAt: () => 'gravel' });
  for (let i = 0; i < 60 * 8; i++) { t.setInput(1, 0); t.step(DT); phys.world.step(); }
  assert.ok(t.z > -30, `drove through the fence to z=${t.z}`);
});
