// Mass and pose of the train on the World (3l Task 6; Review Focus 3): the tractor keeps its playtested 1400 kg and inertia (D3,
// massProps), each car weighs today's 260 + 5 kg from its materials' densities, and spawn puts the bodies where createTractor did.
import test from 'node:test';
import assert from 'node:assert/strict';
import { testWorld } from './helpers/world.mjs';
import { addGround } from '../src/sim/ground.js';
import { createTractor, TP } from '../src/sim/tractor.js';
import { createTrain } from '../src/sim/hitch.js';

const near = (a, b, rel, msg) => assert.ok(Math.abs(a - b) <= Math.abs(b) * rel, `${msg}: ${a} vs ${b}`);
test('the tractor weighs TP.mass with its tuned inertia; each car 265 kg; materials are mapped', () => {
  const { world } = testWorld(); addGround(world);
  const t = createTractor(world, { x: 3, z: -4, yaw: 0.7 }), tr = createTrain(world, t);
  near(t.body.mass(), TP.mass, 0.001, 'tractor');
  // Rapier sorts the principal moments and turns the inertia frame to match (here 90 degrees about x), so compare them as a set
  const I = t.body.principalInertia(), m = [I.x, I.y, I.z].sort((a, b) => a - b); [900, 2000, 2200].forEach((v, i) => near(m[i], v, 0.001, `I${i}`));
  for (const c of tr.cars) near(c.body.mass(), 265, 0.005, `car ${c.index}`);
  assert.equal(world.materialOf(t.e.colliders[0].collider.handle), 'chassis');
  assert.deepEqual(tr.cars[0].e.colliders.map(c => world.materialOf(c.collider.handle)), ['bed', 'tongue']);
});
test('spawn keeps createTractor\'s pose: (x, 0.3, z), rotated yaw - 90 degrees about y', () => {
  const { world } = testWorld(); addGround(world);
  const t = createTractor(world, { x: 3, z: -4, yaw: 0.7 }), p = t.body.translation(), q = t.body.rotation(), a = 0.7 - Math.PI / 2;
  assert.deepEqual([p.x, p.y, p.z].map(v => +v.toFixed(6)), [3, 0.3, -4]);
  for (const [k, v] of [['x', 0], ['y', Math.sin(a / 2)], ['z', 0], ['w', Math.cos(a / 2)]]) assert.ok(Math.abs(q[k] - v) < 1e-6, `q.${k}`);
  assert.ok(Math.abs(t.yaw - 0.7) < 1e-12, 'the yaw it reports before its first step');
});
test('the train despawns cleanly (controllers and joints freed with their entities)', () => {
  const { world } = testWorld(); addGround(world);
  const t = createTractor(world, { x: 0, z: 0, yaw: 0 }), tr = createTrain(world, t), n = world.stats.bodies;
  for (const c of [...tr.cars].reverse()) world.despawn(c.e); world.despawn(t.e);
  assert.equal(world.stats.bodies, n - 3);
});
