// Rally-feel tractor on Rapier's ray-cast vehicle controller (spec D-1..D-9).
// Chassis frame: +x forward, +y up, +z right. Kenney model +z maps to chassis +x.
import { G, groups } from './physics.js';

export const POWER = {
  low:    { vmax: 6,  force: 5200,  rearSide: 0.85, slideMax: 0.35, loose: 0.08 },
  medium: { vmax: 9,  force: 7600,  rearSide: 0.62, slideMax: 0.6, loose: 0.03 },
  high:   { vmax: 12, force: 10000, rearSide: 0.48, slideMax: 0.78, loose: 0.02 },
};
export const SURFACE = { gravel: { grip: 1, vmul: 1 }, grass: { grip: 0.8, vmul: 0.7 }, mud: { grip: 0.55, vmul: 0.5 } };
export const TP = {
  scale: 1.6, mass: 1400, revForce: 3200, vrev: 3, brake: 30, handbrake: 60, roll: 1.5,
  steerMax: 0.62, steerRate: 2.8, inputRate: 4, suspRest: 0.32, stiffness: 18, compression: 2.0, relaxation: 2.6,
  slip: 2.4, travel: 0.45, yawRateMax: 2.6, slideK: 6, yawInertia: 2200, slideTorque: 30, rightTilt: Math.cos(35 * Math.PI / 180), rightK: 9000,
  steep: Math.cos(30 * Math.PI / 180), steepGrip: 0.2, // T-17: a wheel on ground steeper than 30 degrees (an edge bank) loses most of its grip
};
export function quatAxes(q) {
  const { x, y, z, w } = q;
  return {
    f: { x: 1 - 2 * (y * y + z * z), y: 2 * (x * y + w * z), z: 2 * (x * z - w * y) },
    u: { x: 2 * (x * y - w * z), y: 1 - 2 * (x * x + z * z), z: 2 * (y * z + w * x) },
    r: { x: 2 * (x * z + w * y), y: 2 * (y * z - w * x), z: 1 - 2 * (x * x + y * y) },
  };
}
const yawQuat = yaw => { const a = yaw - Math.PI / 2; return { x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) }; };
const ease = (cur, tgt, rate, dt) => cur + Math.max(-rate * dt, Math.min(rate * dt, tgt - cur));

export function createTractor(phys, { x, z, yaw, power = 'medium', surfaceAt = () => 'gravel' }) {
  const { RAPIER, world } = phys, S = TP.scale;
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, 0.3, z).setRotation(yawQuat(yaw))
    .setCanSleep(false).setLinearDamping(0.05).setAngularDamping(0.8)
    .setAdditionalMassProperties(TP.mass, { x: 0.15, y: 0.45, z: 0 }, { x: 900, y: 2200, z: 2000 }, { x: 0, y: 0, z: 0, w: 1 }));
  const cg = groups(G.VEHICLE, G.GROUND | G.STATIC | G.PROP | G.WALL);
  const cols = [
    world.createCollider(RAPIER.ColliderDesc.cuboid(1.55, 0.5, 1.0).setTranslation(0.27, 0.95, 0).setDensity(0.1).setFriction(0.2).setRestitution(0).setCollisionGroups(cg), body),
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.55, 0.55, 0.62).setTranslation(-0.55, 1.95, 0).setDensity(0.1).setFriction(0.2).setCollisionGroups(cg), body),
  ];
  const vc = world.createVehicleController(body);
  const W = [
    { name: 'wheel-front-left', mx: 0.415, my: 0.325, mz: 0.735, r: 0.325, front: true },
    { name: 'wheel-front-right', mx: -0.415, my: 0.325, mz: 0.735, r: 0.325, front: true },
    { name: 'wheel-back-left', mx: 0.465, my: 0.525, mz: -0.575, r: 0.525, front: false },
    { name: 'wheel-back-right', mx: -0.465, my: 0.525, mz: -0.575, r: 0.525, front: false },
  ];
  W.forEach((w, i) => {
    w.cx = w.mz * S; w.cy = w.my * S; w.cz = -w.mx * S; w.radius = w.r * S;
    vc.addWheel({ x: w.cx, y: w.cy + 0.12, z: w.cz }, { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 1 }, TP.suspRest, w.radius);
    vc.setWheelSuspensionStiffness(i, TP.stiffness); vc.setWheelSuspensionCompression(i, TP.compression);
    vc.setWheelSuspensionRelaxation(i, TP.relaxation); vc.setWheelMaxSuspensionForce(i, 1e6); vc.setWheelMaxSuspensionTravel(i, TP.travel);
  });
  const rayGroups = groups(0xffff, G.GROUND | G.STATIC), own = new Set(cols.map(c => c.handle));

  const t = {
    body, vc, W, cols, power, P: POWER[power], thr: 0, steer: 0, inThr: 0, inSteer: 0, assist: 0,
    x, z, yaw, speed: 0, fwd: 0, slip: 0, engine: 0, surface: 'gravel',
    setPower(name) { this.power = name; this.P = POWER[name]; },
    setInput(thr, steer) { this.inThr = Math.max(-1, Math.min(1, thr)); this.inSteer = Math.max(-1, Math.min(1, steer)); },
    setAssist(bias) { this.assist = bias; },
    step(dt) {
      const P = this.P, q = body.rotation(), { f, u, r } = quatAxes(q), lv = body.linvel(), p = body.translation();
      this.fwd = lv.x * f.x + lv.z * f.z; const side = lv.x * r.x + lv.z * r.z; this.speed = Math.hypot(lv.x, lv.z);
      this.slip = this.speed > 1 ? Math.atan2(side, Math.abs(this.fwd)) : 0;
      this.surface = surfaceAt(p.x, p.z); const SF = SURFACE[this.surface];
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
        const w = W[i];
        vc.setWheelSteering(i, w.front ? this.steer : 0);
        vc.setWheelEngineForce(i, w.front ? 0 : force / 2);
        vc.setWheelBrake(i, brake);
        const n = vc.wheelIsInContact(i) && vc.wheelContactNormal(i), g = SF.grip * (n && n.y < TP.steep ? TP.steepGrip : 1);
        vc.setWheelFrictionSlip(i, TP.slip * g);
        vc.setWheelSideFrictionStiffness(i, (w.front ? 1 : rearSide) * SF.grip * (steep ? TP.steepGrip : 1)); // slide sideways off the bank
      }
      vc.updateVehicle(dt, undefined, rayGroups, c => !own.has(c.handle));
      // D-7 slide help: past slideMax, push the slide back toward the direction of travel
      const excess = Math.abs(this.slip) - P.slideMax;
      if (this.speed > 1 && excess > 0) {
        const k = -Math.sign(side) * excess * TP.slideK * TP.mass * dt;
        body.applyImpulse({ x: r.x * k, y: 0, z: r.z * k }, true);
        const tq = -Math.sign(this.slip) * excess * TP.slideTorque * TP.yawInertia * dt; // swing the nose back toward travel
        body.applyTorqueImpulse({ x: u.x * tq, y: u.y * tq, z: u.z * tq }, true);
      }
      const av = body.angvel();
      if (Math.abs(av.y) > TP.yawRateMax) body.setAngvel({ x: av.x, y: Math.sign(av.y) * TP.yawRateMax, z: av.z }, true);
      // D-2 soft self-righting past 35 degrees of tilt
      if (u.y < TP.rightTilt) {
        const k = TP.rightK * (TP.rightTilt - u.y + 0.2) * dt;
        body.applyTorqueImpulse({ x: -u.z * k, y: 0, z: u.x * k }, true);
        if (u.y < 0.2) body.applyImpulse({ x: 0, y: TP.mass * 4 * dt, z: 0 }, true);
      }
      this.x = p.x; this.z = p.z; this.yaw = Math.atan2(f.x, f.z);
    },
  };
  return t;
}
