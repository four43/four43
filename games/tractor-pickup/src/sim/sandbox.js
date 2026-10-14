// Flat test arena for the physics playtest: one ramp straight ahead, a mud patch to the side.
import { addGround, DT } from './ground.js';
import { createTractor } from './tractor.js';
import { createTrain } from './hitch.js';

export function addRamp(world, { x, z, yaw, width = 7 }) { // kicker along +heading: 5 m up to 0.6 m, 1 m table, 3 m down (spec T-14)
  const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = fz, rz = -fx, pts = [];
  for (const [a, y] of [[-5, 0], [0, 0.6], [1, 0.6], [4, 0]]) for (const s of [-width / 2, width / 2]) {
    const px = x + fx * a + rx * s, pz = z + fz * a + rz * s; pts.push(px, y, pz, px, -0.2, pz);
  }
  return world.spawn({ tags: ['ramp'], body: 'fixed', groups: { member: ['static'] }, colliders: [{ shape: 'hull', points: pts, p: [0, 0, 0], q: [0, 0, 0, 1], material: 'ramp' }] });
}

export function createSandbox(world, { power = 'medium' } = {}) {
  addGround(world);
  const ramps = [{ x: 0, z: 40, yaw: 0 }], mud = [{ x: 25, z: 20, r: 8 }];
  ramps.forEach(r => addRamp(world, r));
  const surfaceAt = (x, z) => mud.some(m => Math.hypot(x - m.x, z - m.z) < m.r) ? 'mud' : 'gravel';
  const tractor = createTractor(world, { x: 0, z: 0, yaw: 0, power, surfaceAt });
  const train = createTrain(world, tractor);
  return {
    world, tractor, train, surfaceAt, ramps, mud,
    pre(input) { // before lh.physics.step
      tractor.setInput(input.thr, input.steer, input.turn || 0); tractor.step(DT);
      train.step(DT, { parked: Math.abs(input.thr) < 0.05 && tractor.speed < 0.3 });
    },
    post() { return NONE; },
  };
}
const NONE = [];
