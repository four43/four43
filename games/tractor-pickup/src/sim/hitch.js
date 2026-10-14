// Trailer and wagon: dynamic bodies on the engine's vehicle kit (two wheels each), joined by spherical joints (D-4, D-10, D-11).
import { createVehicle } from 'lion-hawk/kits/vehicle';
import { GROUPS } from './ground.js';
import { afterWheels } from './wheels.js';
import { quatAxes } from './tractor.js';

export const TR = {
  half: { x: 1.4, y: 0.15, z: 1.0 }, mass: 260, wheelR: 0.45, axleX: -0.25, track: 1.25, suspRest: 0.35,
  tongue: { x: 2.35, y: -0.2, z: 0 }, rear: { x: -1.55, y: -0.2, z: 0 }, bedTop: 0.15,
  limit: 75 * Math.PI / 180, limitBeta: 1, rightK: 6000, rightC: 300, rightTarget: 0.9,
};
export const TRACTOR_HITCH = { x: -1.75, y: 0.62, z: 0 };

const local2world = (b, l) => { const p = b.translation(), { f, u, r } = quatAxes(b.rotation()); return { x: p.x + f.x * l.x + u.x * l.y + r.x * l.z, y: p.y + f.y * l.x + u.y * l.y + r.y * l.z, z: p.z + f.z * l.x + u.z * l.y + r.z * l.z }; };

const Q0 = [0, 0, 0, 1];
export const CAR_WHEELS = ['wheel-left', 'wheel-right']; // the kit's wheel parts, side -1 then +1 (the view's car hook names the nodes)
// a car's spawn desc behind its front body (anything with translation() and rotation()) at frontAnchor; also a remote train's
export function carDesc(front, frontAnchor) {
  const h = local2world(front, frontAnchor), q = front.rotation(), { f } = quatAxes(q);
  const cx = h.x - f.x * TR.tongue.x, cz = h.z - f.z * TR.tongue.x;
  return { tags: ['car'], model: 'trailer', coverage: { dirt: 0 }, at: [cx, h.y - TR.tongue.y, cz], q: [q.x, q.y, q.z, q.w],
    body: { type: 'dynamic', canSleep: false, linearDamping: 0.05, angularDamping: 0.6 },
    colliders: [ // bed: 260 kg and tongue: 5 kg through their materials' densities (src/defs/materials.js), as setMass gave
      { shape: 'box', half: [TR.half.x, TR.half.y, TR.half.z], p: [0, 0, 0], q: Q0, part: 'bed', material: 'bed' },
      { shape: 'box', half: [0.9, 0.06, 0.08], p: [TR.half.x + 0.9, -0.15, 0], q: Q0, part: 'tongue', material: 'tongue' },
    ],
    groups: { member: ['trailer'], filter: ['ground', 'static', 'prop', 'wall'] } };
}
// what a desc cannot hold: the vehicle kit and the hitch joint to the front entity
function attachCar(world, e, frontE, frontAnchor, index) {
  const front = frontE.body;
  const body = e.body, car = createVehicle(world, e, { forward: 'x', rayGroups: { member: [...GROUPS], filter: ['ground', 'static'] },
    wheels: [-1, 1].map((side, k) => ({ at: [TR.axleX, 0, side * TR.track], radius: TR.wheelR, front: false, part: CAR_WHEELS[k], slip: 2.5, side: 1.2,
      suspension: { rest: TR.suspRest, stiffness: 22, compression: 2.2, relaxation: 2.8, travel: 0.4, maxForce: 1e5 } })) }), vc = car.controller;
  const joint = world.joint(frontE, e, world.R.JointData.spherical(frontAnchor, TR.tongue)); // engine request: world.joint without JointData (notes, Integrator request 1)
  joint.setContactsEnabled(false);
  return { e, body, car, vc, index, joint, front, frontAnchor,
    get dirt() { return e.coverage.dirt; }, set dirt(v) { e.coverage.dirt = v; } }; // the coverage kit's level (T-16)
}

const createCar = (world, frontE, frontAnchor, index) => attachCar(world, world.spawn(carDesc(frontE.body, frontAnchor)), frontE, frontAnchor, index);
// the trailer and wagon behind a tractor, linked on its entity as e.trailer and e.wagon (the train's net record reads all three bodies, 3i)
export function createTrain(world, tractor) {
  const c0 = createCar(world, tractor.e, TRACTOR_HITCH, 0);
  const c1 = createCar(world, c0.e, TR.rear, 1);
  world.add(tractor.e, 'trailer', c0.e); world.add(tractor.e, 'wagon', c1.e);
  return trainOf(world, [c0, c1]);
}
// the same train over existing car entities (a remote train: the net part spawned and linked them)
export const attachTrain = (world, tractor, trailerE, wagonE) => trainOf(world, [attachCar(world, trailerE, tractor.e, TRACTOR_HITCH, 0), attachCar(world, wagonE, trailerE, TR.rear, 1)]);
function trainOf(world, cars) {
  const c0 = cars[0], carSet = { brake: 0 };
  const angle = i => {
    const a = quatAxes(cars[i].front.rotation()).f, b = quatAxes(cars[i].body.rotation()).f;
    return Math.atan2(a.z * b.x - a.x * b.z, a.x * b.x + a.z * b.z);
  };
  let armed = false;
  const train = {
    cars, angle,
    hitchGap(i) { const c = cars[i], a = local2world(c.front, c.frontAnchor), b = local2world(c.body, TR.tongue); return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z); },
    step(dt, { parked }) { // before the kit's wheel update: the brakes
      carSet.brake = parked ? 20 : 0.2;
      for (const c of cars) for (let i = 0; i < 2; i++) c.car.set(i, carSet);
      armed = true;
    },
    // after the kit's wheel update, before the Rapier step (sim/wheels.js): the jackknife limit and the self-righting
    after(dt) {
      if (!armed) return; armed = false;
      for (const c of cars) {
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
  afterWheels(world, c0.e, dt => train.after(dt));
  return train;
}
export { local2world };
