// Trailer and wagon: dynamic bodies on two-wheel ray-cast controllers, joined by spherical joints (D-4, D-10, D-11).
import { G, groups } from './physics.js';
import { quatAxes } from './tractor.js';

export const TR = {
  half: { x: 1.4, y: 0.15, z: 1.0 }, mass: 260, wheelR: 0.45, axleX: -0.25, track: 0.95, suspRest: 0.35,
  tongue: { x: 2.35, y: -0.2, z: 0 }, rear: { x: -1.55, y: -0.2, z: 0 }, bedTop: 0.15,
  limit: 75 * Math.PI / 180, limitBeta: 1, rightK: 6000, rightC: 300, rightTarget: 0.9,
};
export const TRACTOR_HITCH = { x: -1.75, y: 0.62, z: 0 };

const local2world = (b, l) => { const p = b.translation(), { f, u, r } = quatAxes(b.rotation()); return { x: p.x + f.x * l.x + u.x * l.y + r.x * l.z, y: p.y + f.y * l.x + u.y * l.y + r.y * l.z, z: p.z + f.z * l.x + u.z * l.y + r.z * l.z }; };

function createCar(phys, front, frontAnchor, index) {
  const { RAPIER, world } = phys;
  const h = local2world(front, frontAnchor), q = front.rotation(), { f } = quatAxes(q);
  const cx = h.x - f.x * TR.tongue.x, cz = h.z - f.z * TR.tongue.x;
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(cx, h.y - TR.tongue.y, cz).setRotation(q)
    .setCanSleep(false).setLinearDamping(0.05).setAngularDamping(0.6));
  const cg = groups(G.TRAILER, G.GROUND | G.STATIC | G.PROP);
  world.createCollider(RAPIER.ColliderDesc.cuboid(TR.half.x, TR.half.y, TR.half.z).setMass(TR.mass).setFriction(0.2).setCollisionGroups(cg), body);
  world.createCollider(RAPIER.ColliderDesc.cuboid(0.9, 0.06, 0.08).setTranslation(TR.half.x + 0.9, -0.15, 0).setMass(5).setCollisionGroups(cg), body); // tongue
  const vc = world.createVehicleController(body);
  for (const side of [-1, 1]) vc.addWheel({ x: TR.axleX, y: 0, z: side * TR.track }, { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 1 }, TR.suspRest, TR.wheelR);
  for (let i = 0; i < 2; i++) {
    vc.setWheelSuspensionStiffness(i, 22); vc.setWheelSuspensionCompression(i, 2.2); vc.setWheelSuspensionRelaxation(i, 2.8);
    vc.setWheelFrictionSlip(i, 2.5); vc.setWheelSideFrictionStiffness(i, 1.2); vc.setWheelMaxSuspensionForce(i, 1e5); vc.setWheelMaxSuspensionTravel(i, 0.4);
  }
  const joint = world.createImpulseJoint(RAPIER.JointData.spherical(frontAnchor, TR.tongue), front, body, true);
  joint.setContactsEnabled(false);
  return { body, vc, index, joint, front, frontAnchor, dirt: 0 };
}

export function createTrain(phys, tractor) {
  const c0 = createCar(phys, tractor.body, TRACTOR_HITCH, 0);
  const c1 = createCar(phys, c0.body, TR.rear, 1);
  const cars = [c0, c1], rayGroups = groups(0xffff, G.GROUND | G.STATIC);
  const angle = i => {
    const a = quatAxes(cars[i].front.rotation()).f, b = quatAxes(cars[i].body.rotation()).f;
    return Math.atan2(a.z * b.x - a.x * b.z, a.x * b.x + a.z * b.z);
  };
  return {
    cars, angle,
    hitchGap(i) { const c = cars[i], a = local2world(c.front, c.frontAnchor), b = local2world(c.body, TR.tongue); return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); },
    step(dt, { parked }) {
      for (const c of cars) {
        for (let i = 0; i < 2; i++) c.vc.setWheelBrake(i, parked ? 20 : 0.2);
        c.vc.updateVehicle(dt, undefined, rayGroups);
        // D-10 jackknife limit, applied as a velocity-level impulse pair (equal and opposite on the car and its front body),
        // split by yaw inertia, so it stays stable at any stiffness and the tractor cannot overpower it.
        const a = angle(c.index), over = Math.abs(a) - TR.limit;
        {
          const s = Math.sign(a), rel = s * (c.body.angvel().y - c.front.angvel().y);
          // fastest outward yaw rate allowed: just reach the limit this step, or (past it) pull back with a Baumgarte bias
          const want = over < 0 ? -over / dt : -TR.limitBeta * over / dt;
          if (rel > want) {
            const J = s * (want - rel) / (1 / c.body.effectiveAngularInertia().m22 + 1 / c.front.effectiveAngularInertia().m22);
            c.body.applyTorqueImpulse({ x: 0, y: J, z: 0 }, true);
            c.front.applyTorqueImpulse({ x: 0, y: -J, z: 0 }, true);
          }
        }
        // D-11 soft self-righting past 45 degrees, with roll damping
        const { u } = quatAxes(c.body.rotation());
        if (u.y < Math.cos(Math.PI / 4)) {
          const k = TR.rightK * (TR.rightTarget - u.y) * dt, w = c.body.angvel();
          c.body.applyTorqueImpulse({ x: -u.z * k - TR.rightC * w.x * dt, y: 0, z: u.x * k - TR.rightC * w.z * dt }, true);
        }
      }
    },
  };
}
export { local2world };
