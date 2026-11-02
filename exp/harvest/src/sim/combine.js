// The vehicles (the combine, the mower) and the carts they tow, on the engine's vehicle kit (raycast backend), after Tractor Pickup's
// tractor and hitch. KINDS holds each vehicle's body: mass, colliders, wheels, the cutter's strip and the cart it tows. The chassis
// frame is the model's: +z forward, +y up, +x left (the kit's forward: 'z'), so the GLBs need no axis fix. The big wheels drive.
// Steering is arcade (H-C4): the steer input asks for a turn rate, which the combine eases its yaw rate to (even standing still),
// and a strong side grip keeps it going where it points; no wheel steers. The carts are dynamic bodies on two wheels each, joined
// tongue to tow point by spherical joints, with Tractor's jackknife limit; backing up, each is turned in line behind the one in front.
// Sim-pure.
import { createVehicle } from 'lion-hawk/kits/vehicle';
import { COMBINE, CART, HEADER, MOWER, TIPCART, TRACTOR, BALETRAILER } from '../defs/models.js';
import { afterWheels } from './wheels.js';

export const GROUPS = Object.freeze(['ground', 'static', 'vehicle', 'cart', 'wall']);
const RAYS = { member: [...GROUPS], filter: ['ground', 'static'] };
const Q0 = [0, 0, 0, 1], QI = { x: 0, y: 0, z: 0, w: 1 };

// Feel (mutable for ?tune), for the combine's mass: a kind's forces scale with its mass. vmax: the road speed; vcut: the speed in
// crop (the speed upgrade's)
export const CP = {
  mass: 4000, force: 16000, revForce: 14000, vrev: 3.5, brake: 85, handbrake: 170, coast: 60,
  steerRate: 5, inputRate: 4, suspRest: 0.35, stiffness: 20, compression: 2.2, relaxation: 2.8, travel: 0.4,
  slip: 2.4, side: 1.2, turnRate: 1.4, revTurn: 0.5, grip: 6, rightTilt: Math.cos(35 * Math.PI / 180), rightK: 26000,
};
// straighten: rate (1/s) a backing cart's hitch angle is pulled to 0. rightK, rightC: for a 500 kg cart (scaled by the cart's mass)
export const CARTP = { limit: 75 * Math.PI / 180, limitBeta: 1, straighten: 6, rightK: 9000, rightC: 450, rightTarget: 0.9 };

// The vehicle kinds. colliders(width): the body's colliders with the cutter that wide; cut: the cutter strip's centre along z and its
// depth; cart: the towed cart's model, dimensions and body. susp.stiffness is set so each sits at its model's height at rest (a
// softer spring sags: the wheels ride up into the fenders and the carts pitch forward).
const box = (half, p, part) => ({ shape: 'box', half, p, q: Q0, part, material: 'chassis' });
export const KINDS = Object.freeze({
  combine: Object.freeze({
    model: 'combine', mass: CP.mass, com: [0, 1.0, 0], inertia: [8000, 9000, 3000], wheels: COMBINE.wheels, hitch: COMBINE.hitch,
    susp: { rest: CP.suspRest, travel: CP.travel, stiffness: 40 }, turn: 1, driveFront: true,
    colliders: w => [box([1.3, 0.8, 2.9], [0, 1.7, -0.2], 'body'), box([0.9, 0.7, 0.8], [0, 2.9, 1.8], 'cab'),
      box([w / 2, 0.35, HEADER.depth / 2], [0, 0.55, COMBINE.header[2] + HEADER.depth / 2], 'header')],
    cut: Object.freeze({ z: COMBINE.header[2] + HEADER.depth / 2, depth: HEADER.depth }),
    cart: Object.freeze({ model: 'cart', dims: CART, mass: 500, inertia: [380, 530, 250], com: [0, 1.0, -0.4], bed: [0, 1.45], susp: { rest: 0.35, travel: 0.35, lift: 0.3, stiffness: 80 } }),
  }),
  tractor: Object.freeze({
    model: 'tractor', mass: 2000, com: [0, 0.85, -0.3], inertia: [1800, 2200, 900], wheels: TRACTOR.wheels, hitch: TRACTOR.hitch,
    susp: { rest: 0.3, travel: 0.25, stiffness: 60 }, turn: 1.15, driveFront: false,
    colliders: w => [box([0.8, 0.55, 1.7], [0, 1.15, 0.05], 'body'), box([0.7, 0.6, 0.75], [0, 2.0, -0.35], 'cab'),
      box([w / 2, 0.08, TRACTOR.deck.depth / 2], [0, TRACTOR.deck.y + 0.3, TRACTOR.deck.z], 'deck')],
    cut: Object.freeze({ z: TRACTOR.deck.z, depth: TRACTOR.deck.depth }),
    cart: Object.freeze({ model: 'baletrailer', dims: BALETRAILER, mass: 400, inertia: [300, 420, 200], com: [0, 0.9, -0.2], bed: [0, 1.6], susp: { rest: 0.3, travel: 0.25, lift: 0.25, stiffness: 80 } }),
  }),
  mower: Object.freeze({
    model: 'mower', mass: 350, com: [0, 0.45, -0.1], inertia: [60, 80, 40], wheels: MOWER.wheels, hitch: MOWER.hitch,
    susp: { rest: 0.25, travel: 0.2, stiffness: 80 }, turn: 1.3, driveFront: false,
    // the deck's collider rides high (the deck itself skims the grass): low, it rubs the ground when the suspension squats
    colliders: w => [box([0.55, 0.3, 1.1], [0, 0.75, -0.1], 'body'), box([w / 2, 0.05, MOWER.deck.depth / 2], [0, MOWER.deck.y + 0.25, MOWER.deck.z], 'deck')],
    cut: Object.freeze({ z: MOWER.deck.z, depth: MOWER.deck.depth }),
    cart: Object.freeze({ model: 'tipcart', dims: TIPCART, mass: 60, inertia: [8, 10, 5], com: [0, 0.45, -0.15], bed: [0, 0.6], susp: { rest: 0.18, travel: 0.12, lift: 0.15, stiffness: 80 } }),
  }),
});

// heading (f), up (u) and left (l) of a rotation, for the +z-forward chassis frame
export function axes(q, out = { f: { x: 0, y: 0, z: 0 }, u: { x: 0, y: 0, z: 0 }, l: { x: 0, y: 0, z: 0 } }) {
  const { x, y, z, w } = q, f = out.f, u = out.u, l = out.l;
  f.x = 2 * (x * z + w * y); f.y = 2 * (y * z - w * x); f.z = 1 - 2 * (x * x + y * y);
  u.x = 2 * (x * y - w * z); u.y = 1 - 2 * (x * x + z * z); u.z = 2 * (y * z + w * x);
  l.x = 1 - 2 * (y * y + z * z); l.y = 2 * (x * y + w * z); l.z = 2 * (x * z - w * y);
  return out;
}
// a chassis-frame point to the world, through a body's pose
export function toWorld(body, p, out = { x: 0, y: 0, z: 0 }) {
  const t = body.translation(), A = axes(body.rotation());
  out.x = t.x + A.l.x * p[0] + A.u.x * p[1] + A.f.x * p[2];
  out.y = t.y + A.l.y * p[0] + A.u.y * p[1] + A.f.y * p[2];
  out.z = t.z + A.l.z * p[0] + A.u.z * p[1] + A.f.z * p[2];
  return out;
}
const yawQ = yaw => [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)];
const ease = (cur, tgt, rate, dt) => cur + Math.max(-rate * dt, Math.min(rate * dt, tgt - cur));

// A vehicle's spawn desc. width: its cutter's (the cutter is a collider too)
export function vehicleDesc(kind, { x, z, yaw, y = 0.15, width = 3, player = 1 }) {
  const K = KINDS[kind];
  return { tags: ['rig', kind], model: K.model, kind, player, cutWidth: width, at: [x, y, z], q: yawQ(yaw),
    body: { type: 'dynamic', canSleep: false, linearDamping: 0.05, angularDamping: 0.8,
      massProps: { mass: K.mass, com: K.com, inertia: K.inertia } }, // lh-allow: toy-feel masses, not the real machines'
    colliders: K.colliders(width),
    groups: { member: ['vehicle'], filter: ['ground', 'static', 'vehicle', 'wall'] } };
}

// What a desc cannot hold: the vehicle kit, the driving maths and the after-wheels help
export function attachVehicle(world, e, kind, { vmax = 8, vcut = 4 } = {}) {
  const K = KINDS[kind], body = e.body, W = K.wheels, m = K.mass / CP.mass; // m: forces and brakes scale with the mass
  const car = createVehicle(world, e, { forward: 'z', rayGroups: RAYS,
    wheels: W.map(w => ({ at: [w.x, w.y + K.susp.rest - 0.05, w.z], radius: w.r, front: w.front, part: w.name,
      suspension: { rest: K.susp.rest, stiffness: K.susp.stiffness ?? CP.stiffness, compression: CP.compression, relaxation: CP.relaxation, travel: K.susp.travel, maxForce: 1e6 } })) });
  const set = { steer: 0, engine: 0, brake: 0, slip: CP.slip, side: CP.side }, A = axes(QI);
  let armed = false;
  const c = {
    e, body, car, kind, vmax, vcut, cutting: false, hold: false,
    thr: 0, steer: 0, inThr: 0, inSteer: 0, x: 0, z: 0, yaw: 0, speed: 0, fwd: 0, engine: 0,
    setInput(thr, steer) { c.inThr = Math.max(-1, Math.min(1, thr)); c.inSteer = Math.max(-1, Math.min(1, steer)); },
    // before the kit's wheel update: throttle and brakes; the steer input eased (the turn rate it asks for is set in after())
    // slow: a share of the cutting speed (pushing through a crop it cannot cut)
    step(dt, slow = 1) {
      const p = body.translation(), lv = body.linvel(); axes(body.rotation(), A);
      c.fwd = lv.x * A.f.x + lv.z * A.f.z; c.speed = Math.hypot(lv.x, lv.z); c.x = p.x; c.z = p.z; c.yaw = Math.atan2(A.f.x, A.f.z);
      c.thr = ease(c.thr, c.inThr, CP.inputRate, dt);
      const v = c.fwd;
      c.steer = ease(c.steer, c.inSteer, CP.steerRate, dt);
      const vmax = c.cutting ? Math.min(c.vmax, c.vcut * slow) : c.vmax;
      let force = 0, brake = 0;
      if (c.thr > 0.05) { if (v < -0.3) brake = CP.brake * c.thr; else force = CP.force * c.thr * Math.max(-0.5, Math.min(1, 3 * (1 - v / vmax))); } // full pull until ~2/3 of vmax
      else if (c.thr < -0.05) { if (v > 0.3) brake = CP.brake * -c.thr; else force = -CP.revForce * -c.thr * Math.max(0, 1 + v / CP.vrev); }
      else brake = c.speed < 0.3 ? CP.handbrake : CP.coast; // stick let go: brake to a stop
      if (force < 0 && c.thr > 0) { brake = -force / CP.force * CP.brake; force = 0; } // over the top speed (cutting slows it): brake gently
      if (c.hold) { force = 0; brake = CP.handbrake; }
      c.engine = Math.abs(force) / CP.force;
      force *= m; brake *= m;
      for (let i = 0; i < 4; i++) {
        const w = W[i];
        set.steer = 0;
        set.engine = w.front === K.driveFront ? force / 2 : 0; set.brake = brake;
        car.set(i, set);
      }
      armed = true;
    },
    // after the kit's wheel update, before the Rapier step: the yaw rate set to the steer's turn rate (the steer input is eased, and
    // a gentler pull loses to the tyres' side grip), the side grip, self-righting
    after(dt) {
      if (!armed) return; armed = false;
      axes(body.rotation(), A); const u = A.u, l = A.l;
      const av = body.angvel(), want = c.hold ? 0 : c.steer * CP.turnRate * K.turn * (c.fwd < -0.2 ? CP.revTurn : 1); // backing: the wagons must keep up
      body.setAngvel({ x: av.x, y: want, z: av.z }, true);
      const lv = body.linvel(), side = (lv.x * l.x + lv.z * l.z) * Math.min(1, CP.grip * dt);
      body.setLinvel({ x: lv.x - l.x * side, y: lv.y, z: lv.z - l.z * side }, true);
      if (u.y < CP.rightTilt) {
        const k = CP.rightK * m * (CP.rightTilt - u.y + 0.2) * dt;
        body.applyTorqueImpulse({ x: -u.z * k, y: 0, z: u.x * k }, true);
      }
    },
  };
  { const p = body.translation(); axes(body.rotation(), A); c.x = p.x; c.z = p.z; c.yaw = Math.atan2(A.f.x, A.f.z); }
  afterWheels(world, e, dt => c.after(dt));
  return c;
}

// The cutter strip in the world: its centre and heading (H-H1). out: { x, z, fx, fz, hw, hd }
const AH = axes(QI);
export function headerStrip(c, width, out) {
  const cut = KINDS[c.kind].cut, A = axes(c.body.rotation(), AH), t = c.body.translation();
  const h = Math.hypot(A.f.x, A.f.z) || 1, fx = A.f.x / h, fz = A.f.z / h;
  out.x = t.x + fx * cut.z; out.z = t.z + fz * cut.z; out.fx = fx; out.fz = fz; out.hw = width / 2; out.hd = cut.depth / 2;
  return out;
}

// A cart's spawn desc (the kind's cart) behind a front body's tow point (anything with translation() and rotation())
export function cartDesc(kind, front, tow, k, player = 1) {
  const C = KINDS[kind].cart, D = C.dims, H = D.hopper;
  const h = toWorld(front, tow), A = axes(front.rotation()), q = front.rotation();
  const x = h.x - A.f.x * D.hitch[2], z = h.z - A.f.z * D.hitch[2];
  return { tags: ['cart'], model: C.model, player, cart: k, at: [x, h.y - D.hitch[1] + 0.05, z], q: [q.x, q.y, q.z, q.w],
    body: { type: 'dynamic', canSleep: false, linearDamping: 0.05, angularDamping: 0.6,
      massProps: { mass: C.mass, com: C.com, inertia: C.inertia } }, // lh-allow: a light cart that follows easily
    colliders: [
      box([H.half, (H.top - H.floor) / 2, (H.z1 - H.z0) / 2], [0, (H.top + H.floor) / 2, (H.z0 + H.z1) / 2], 'bed'),
      box([0.08, 0.06, (D.hitch[2] - H.z1) / 2], [0, D.hitch[1], (D.hitch[2] + H.z1) / 2], 'tongue'),
    ],
    groups: { member: ['cart'], filter: ['ground', 'static', 'wall', 'vehicle'] } };
}

function attachCart(world, kind, e, frontE, tow, k) {
  const C = KINDS[kind].cart, S = C.susp;
  const car = createVehicle(world, e, { forward: 'z', rayGroups: RAYS,
    wheels: C.dims.wheels.map(w => ({ at: [w.x, w.y + S.lift, w.z], radius: w.r, front: false, part: w.name, slip: 2.5, side: 1.2,
      suspension: { rest: S.rest, stiffness: S.stiffness ?? 22, compression: 2.2, relaxation: 2.8, travel: S.travel, maxForce: 1e5 } })) });
  const joint = world.joint(frontE, e, { type: 'spherical', a: [...tow], b: [...C.dims.hitch] });
  joint.setContactsEnabled(false);
  return { e, body: e.body, car, k, joint, front: frontE.body, m: C.mass / 500 };
}

// n carts (the kind's) behind the vehicle entity, in a straight line along its heading
export function createCarts(world, kind, vehicleE, n, player = 1) {
  const carts = [], C = KINDS[kind].cart;
  let front = vehicleE, tow = KINDS[kind].hitch;
  for (let k = 0; k < n; k++) {
    const e = world.spawn(cartDesc(kind, front.body, tow, k, player));
    carts.push(attachCart(world, kind, e, front, tow, k)); front = e; tow = C.dims.tow;
  }
  return trainOf(world, vehicleE, carts);
}

// signed yaw from the front body's heading to the cart's
const A1 = axes(QI), A2 = axes(QI);
function hitchAngle(c) {
  const a = axes(c.front.rotation(), A1).f, b = axes(c.body.rotation(), A2).f;
  return Math.atan2(a.z * b.x - a.x * b.z, a.x * b.x + a.z * b.z);
}
function trainOf(world, combineE, carts) {
  const set = { brake: 0 };
  let armed = false;
  const train = {
    carts,
    step(parked) { set.brake = (parked ? 20 : 0.2) * (carts[0]?.m ?? 1); for (const c of carts) for (let i = 0; i < 2; i++) c.car.set(i, set); armed = true; },
    // Tractor's D-10 jackknife limit (an equal and opposite yaw impulse pair) and D-11 self-righting; backing up (H-C4), each cart
    // turned in line behind the one in front, so the train backs like one long machine
    after(dt) {
      if (!armed) return; armed = false;
      const cb = combineE.body, lv = cb.linvel(), f = axes(cb.rotation(), A1).f, back = lv.x * f.x + lv.z * f.z < -0.2;
      for (const c of carts) {
        if (back) {
          const a = hitchAngle(c), rel = c.body.angvel().y - c.front.angvel().y;
          c.body.applyTorqueImpulse({ x: 0, y: (-CARTP.straighten * a - rel) * c.body.effectiveAngularInertia().m22, z: 0 }, true);
        }
        const a = hitchAngle(c), over = Math.abs(a) - CARTP.limit, s = Math.sign(a), rel = s * (c.body.angvel().y - c.front.angvel().y);
        const want = over < 0 ? -over / dt : -CARTP.limitBeta * over / dt;
        if (rel > want) {
          const J = s * (want - rel) / (1 / c.body.effectiveAngularInertia().m22 + 1 / c.front.effectiveAngularInertia().m22);
          c.body.applyTorqueImpulse({ x: 0, y: J, z: 0 }, true); c.front.applyTorqueImpulse({ x: 0, y: -J, z: 0 }, true);
        }
        const u = axes(c.body.rotation(), A1).u;
        if (u.y < Math.cos(Math.PI / 4)) {
          const k = CARTP.rightK * c.m * (CARTP.rightTarget - u.y) * dt, w = c.body.angvel(), rc = CARTP.rightC * c.m;
          c.body.applyTorqueImpulse({ x: -u.z * k - rc * w.x * dt, y: 0, z: u.x * k - rc * w.z * dt }, true);
        }
      }
    },
  };
  if (carts.length) afterWheels(world, carts[0].e, dt => train.after(dt));
  return train;
}
