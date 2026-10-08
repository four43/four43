// Flat test arena for the physics playtest: one ramp straight ahead, a mud patch to the side.
import { createPhysics, DT, G, groups } from './physics.js';
import { createTractor } from './tractor.js';
import { createTrain } from './hitch.js';

export function addRamp(phys, { x, z, yaw, width = 7 }) { // kicker along +heading: 5 m up to 0.6 m, 1 m table, 3 m down (spec T-14)
  const { RAPIER, world } = phys, fx = Math.sin(yaw), fz = Math.cos(yaw), rx = fz, rz = -fx, pts = [];
  for (const [a, y] of [[-5, 0], [0, 0.6], [1, 0.6], [4, 0]]) for (const s of [-width / 2, width / 2]) {
    const px = x + fx * a + rx * s, pz = z + fz * a + rz * s; pts.push(px, y, pz, px, -0.2, pz);
  }
  world.createCollider(RAPIER.ColliderDesc.convexHull(new Float32Array(pts)).setFriction(0.9).setCollisionGroups(groups(G.STATIC, 0xffff)));
}

export function createSandbox(RAPIER, { power = 'medium' } = {}) {
  const phys = createPhysics(RAPIER);
  const ramps = [{ x: 0, z: 40, yaw: 0 }], mud = [{ x: 25, z: 20, r: 8 }];
  ramps.forEach(r => addRamp(phys, r));
  const surfaceAt = (x, z) => mud.some(m => Math.hypot(x - m.x, z - m.z) < m.r) ? 'mud' : 'gravel';
  const tractor = createTractor(phys, { x: 0, z: 0, yaw: 0, power, surfaceAt });
  const train = createTrain(phys, tractor);
  return {
    phys, tractor, train, surfaceAt, ramps, mud,
    step(input) {
      tractor.setInput(input.thr, input.steer, input.turn || 0); tractor.step(DT);
      train.step(DT, { parked: Math.abs(input.thr) < 0.05 && tractor.speed < 0.3 });
      phys.world.step();
    },
  };
}
