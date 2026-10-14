// Rally-feel tractor on the engine's vehicle kit (Rapier's ray-cast vehicle controller; spec D-1..D-9). The game keeps every tuning
// value and the per-step maths and hands the per-wheel results to car.set() each step; the kit runs updateVehicle before lh.physics.step.
// Chassis frame: +x forward, +y up, +z right. Kenney model +z maps to chassis +x.
import { createVehicle } from 'lion-hawk/kits/vehicle';
import { GROUPS } from './ground.js';
import { afterWheels } from './wheels.js';
const Q0 = [0, 0, 0, 1];

export const POWER = {
  low:    { vmax: 6,  force: 5200,  rearSide: 0.85, slideMax: 0.35, loose: 0.08 },
  medium: { vmax: 9,  force: 7600,  rearSide: 0.62, slideMax: 0.6, loose: 0.03 },
  high:   { vmax: 12, force: 10000, rearSide: 0.48, slideMax: 0.78, loose: 0.02 },
};
export const TP = {
  scale: 1.6, mass: 1400, revForce: 7600, vrev: 3, // revForce: as strong as Medium forward, so reverse can push jackknifed wagons back (review 3)
  brake: 30, handbrake: 60, roll: 1.5,
  steerMax: 0.62, steerRate: 2.8, inputRate: 4, suspRest: 0.32, stiffness: 18, compression: 2.0, relaxation: 2.6,
  slip: 2.4, travel: 0.45, yawRateMax: 2.6, slideK: 6, yawInertia: 2200, slideTorque: 30, rightTilt: Math.cos(35 * Math.PI / 180), rightK: 9000,
  steep: Math.cos(30 * Math.PI / 180), steepGrip: 0.2,
  turnHelp: 4, // C-10: rad/s^2 of extra yaw while the pilot asks for it (slow and well off target), so the tractor turns near a fence or a bush // T-17: a wheel on ground steeper than 30 degrees (an edge bank) loses most of its grip
};
export const TRACTOR_WHEELS = [
  { name: 'wheel-front-left', mx: 0.415, my: 0.325, mz: 0.735, r: 0.325, front: true },
  { name: 'wheel-front-right', mx: -0.415, my: 0.325, mz: 0.735, r: 0.325, front: true },
  { name: 'wheel-back-left', mx: 0.465, my: 0.525, mz: -0.575, r: 0.525, front: false },
  { name: 'wheel-back-right', mx: -0.465, my: 0.525, mz: -0.575, r: 0.525, front: false },
].map(w => ({ ...w, cx: w.mz * TP.scale, cy: w.my * TP.scale, cz: -w.mx * TP.scale, radius: w.r * TP.scale }));
export function quatAxes(q) {
  const { x, y, z, w } = q;
  return {
    f: { x: 1 - 2 * (y * y + z * z), y: 2 * (x * y + w * z), z: 2 * (x * z - w * y) },
    u: { x: 2 * (x * y - w * z), y: 1 - 2 * (x * x + z * z), z: 2 * (y * z + w * x) },
    r: { x: 2 * (x * z + w * y), y: 2 * (y * z - w * x), z: 1 - 2 * (x * x + y * y) },
  };
}
const ease = (cur, tgt, rate, dt) => cur + Math.max(-rate * dt, Math.min(rate * dt, tgt - cur));

export function createTractor(world, { x, z, yaw, power = 'medium', materialAt = () => 'route' }) { // materialAt: the ground's material id (M-10)
  const a = yaw - Math.PI / 2; // the chassis +x is the heading
  const e = world.spawn({ tags: ['tractor'], at: [x, 0.3, z], q: [0, Math.sin(a / 2), 0, Math.cos(a / 2)],
    body: { type: 'dynamic', canSleep: false, linearDamping: 0.05, angularDamping: 0.8,
      massProps: { mass: TP.mass, com: [0.15, 0.45, 0], inertia: [900, 2200, 2000] } }, // lh-allow: D3, the playtested 1400 kg and tuned inertia
    colliders: [
      { shape: 'box', half: [1.55, 0.5, 1.0], p: [0.27, 0.95, 0], q: Q0, part: 'body', material: 'chassis' },
      { shape: 'box', half: [0.55, 0.55, 0.62], p: [-0.55, 1.95, 0], q: Q0, part: 'cab', material: 'chassis' },
    ],
    groups: { member: ['vehicle'], filter: ['ground', 'static', 'prop', 'wall'] } });
  const body = e.body, cols = e.colliders.map(c => c.collider), W = TRACTOR_WHEELS.map(w => ({ ...w }));
  const car = createVehicle(world, e, { forward: 'x', rayGroups: { member: [...GROUPS], filter: ['ground', 'static'] },
    wheels: W.map(w => ({ at: [w.cx, w.cy + 0.12, w.cz], radius: w.radius, front: w.front, part: w.name, // the baked node: the kit writes its pose
      suspension: { rest: TP.suspRest, stiffness: TP.stiffness, compression: TP.compression, relaxation: TP.relaxation, travel: TP.travel, maxForce: 1e6 } })) });
  const vc = car.controller, wheelSet = { steer: 0, engine: 0, brake: 0, slip: 0, side: 0 }; // vc: read-only wheel queries
  let armed = false, side = 0, u = null, r = null; // from step() to the hook after the wheel update (sim/wheels.js)

  const t = {
    e, body, car, vc, W, cols, power, P: POWER[power], thr: 0, steer: 0, inThr: 0, inSteer: 0, inTurn: 0, assist: 0,
    x, z, yaw, speed: 0, fwd: 0, slip: 0, engine: 0, ground: 'route', surface: 'gravel', // ground: material id; surface: its game.surface
    setPower(name) { this.power = name; this.P = POWER[name]; },
    setInput(thr, steer, turn = 0) { this.inThr = Math.max(-1, Math.min(1, thr)); this.inSteer = Math.max(-1, Math.min(1, steer)); this.inTurn = Math.max(-1, Math.min(1, turn)); },
    setAssist(bias) { this.assist = bias; },
    step(dt) {
      const P = this.P, q = body.rotation(), ax = quatAxes(q), f = ax.f, lv = body.linvel(), p = body.translation(); u = ax.u; r = ax.r;
      this.fwd = lv.x * f.x + lv.z * f.z; side = lv.x * r.x + lv.z * r.z; this.speed = Math.hypot(lv.x, lv.z);
      this.slip = this.speed > 1 ? Math.atan2(side, Math.abs(this.fwd)) : 0;
      this.ground = materialAt(p.x, p.z); const SF = world.materials.get(this.ground).game; this.surface = SF.surface; // grip, vmul from the registry
      this.thr = ease(this.thr, this.inThr, TP.inputRate, dt);
      const v = this.fwd, maxSteer = TP.steerMax / (1 + Math.abs(v) * 0.06);
      const want = Math.max(-1, Math.min(1, this.inSteer + this.assist));
      this.steer = ease(this.steer, want * maxSteer, TP.steerRate, dt);
      const vmax = P.vmax * SF.vmul, steep = W.some((w, i) => { const n = vc.wheelIsInContact(i) && vc.wheelContactNormal(i); return n && n.y < TP.steep; });
      let force = 0, brake = 0;
      if (this.thr > 0.05) { if (v < -0.3) brake = TP.brake * this.thr; else force = P.force * this.thr * Math.max(0, 1 - v / vmax); }
      else if (this.thr < -0.05) { if (v > 0.3) brake = TP.brake * -this.thr; else force = -TP.revForce * -this.thr * Math.max(0, 1 + v / TP.vrev); }
      else brake = this.speed < 0.3 && !steep ? TP.handbrake : TP.roll; // no parking brake with a wheel up a bank: roll back to the road
      if (this.hold) { force = 0; brake = TP.handbrake; } // set by the game outside driving (start, show, sticker card): stand still
      this.engine = Math.abs(force) / P.force;
      // D-6 rally drift: steering hard at speed with throttle lets the rear tyres let go (rear side stiffness
      // falls from P.rearSide to P.loose); the D-7 limiter below keeps the slide bounded.
      const drift = Math.abs(this.steer / maxSteer) * Math.min(1, this.speed / (0.5 * P.vmax)) * Math.max(0, this.thr);
      const rearSide = P.rearSide + (P.loose - P.rearSide) * drift;
      for (let i = 0; i < 4; i++) {
        const w = W[i], n = vc.wheelIsInContact(i) && vc.wheelContactNormal(i), g = SF.grip * (n && n.y < TP.steep ? TP.steepGrip : 1);
        wheelSet.steer = w.front ? this.steer : 0; wheelSet.engine = w.front ? 0 : force / 2; wheelSet.brake = brake;
        wheelSet.slip = TP.slip * g; wheelSet.side = (w.front ? 1 : rearSide) * SF.grip * (steep ? TP.steepGrip : 1); // slide sideways off the bank
        car.set(i, wheelSet);
      }
      this.x = p.x; this.z = p.z; this.yaw = Math.atan2(f.x, f.z); armed = true;
    },
    // after the kit's wheel update, before the Rapier step (sim/wheels.js), with step()'s axes and slide: the impulses
    after(dt) {
      if (!armed) return; armed = false;
      const P = this.P;
      // D-7 slide help: past slideMax, push the slide back toward the direction of travel
      const excess = Math.abs(this.slip) - P.slideMax;
      if (this.speed > 1 && excess > 0) {
        const k = -Math.sign(side) * excess * TP.slideK * TP.mass * dt;
        body.applyImpulse({ x: r.x * k, y: 0, z: r.z * k }, true);
        const tq = -Math.sign(this.slip) * excess * TP.slideTorque * TP.yawInertia * dt; // swing the nose back toward travel
        body.applyTorqueImpulse({ x: u.x * tq, y: u.y * tq, z: u.z * tq }, true);
      }
      if (this.inTurn && !this.hold) { const tq = this.inTurn * TP.turnHelp * TP.yawInertia * dt; body.applyTorqueImpulse({ x: u.x * tq, y: u.y * tq, z: u.z * tq }, true); } // C-10
      const av = body.angvel();
      if (Math.abs(av.y) > TP.yawRateMax) body.setAngvel({ x: av.x, y: Math.sign(av.y) * TP.yawRateMax, z: av.z }, true);
      // D-2 soft self-righting past 35 degrees of tilt
      if (u.y < TP.rightTilt) {
        const k = TP.rightK * (TP.rightTilt - u.y + 0.2) * dt;
        body.applyTorqueImpulse({ x: -u.z * k, y: 0, z: u.x * k }, true);
        if (u.y < 0.2) body.applyImpulse({ x: 0, y: TP.mass * 4 * dt, z: 0 }, true);
      }
    },
  };
  afterWheels(world, e, dt => t.after(dt));
  return t;
}
