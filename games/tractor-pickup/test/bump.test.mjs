import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { createPhysics, DT } from '../src/sim/physics.js';
import { createTractor } from '../src/sim/tractor.js';
import { bumpNormal, createBumper, BUMP } from '../src/sim/bump.js';
await RAPIER.init();

test('two tractors touch when their capsules overlap; the normal points from the other to us (M-7)', () => {
  const n = bumpNormal({ x: 0, z: 0, yaw: 0 }, { x: 2, z: 0, yaw: 0 }); // side by side, 2 m apart
  assert.ok(n && n.x < -0.99, JSON.stringify(n));
  assert.equal(bumpNormal({ x: 0, z: 0, yaw: 0 }, { x: 3, z: 0, yaw: 0 }), null, '3 m apart side by side: no touch');
  assert.ok(bumpNormal({ x: 0, z: 0, yaw: 0 }, { x: 0, z: 4.5, yaw: Math.PI }), 'nose to nose');
  assert.equal(bumpNormal({ x: 0, z: 0, yaw: 0 }, { x: 0, z: 6, yaw: Math.PI }), null);
});
test('a bump pushes only our own tractor away at 2 m/s, with a boing event and a cooldown (M-7)', () => {
  const phys = createPhysics(RAPIER), t = createTractor(phys, { x: 0, z: 0, yaw: 0 }), b = createBumper(), ev = [];
  for (let i = 0; i < 30; i++) { t.setInput(0, 0); t.step(DT); phys.world.step(); }
  b.step(DT, t, [{ n: 2, x: 2, z: 0, yaw: 0 }], ev);
  const v = t.body.linvel(); assert.ok(v.x <= -BUMP.push + 1e-6, `vx ${v.x}`);
  assert.deepEqual(ev, [{ type: 'bump', other: 2 }]);
  b.step(DT, t, [{ n: 2, x: 2, z: 0, yaw: 0 }], ev); assert.equal(ev.length, 1, 'cooldown');
});
