// Drivable tractor: a World entity (two paintwork boxes, massProps) on Rapier's ray-cast vehicle controller.
// Chassis frame: +x forward, +y up, +z to the right-hand side (model +x maps to chassis -z).
export const TP = {
  scale: 1.6, mass: 1400, maxForce: 5200, revForce: 3000, vmax: 6.5, vrev: 3.0, brake: 28, handbrake: 60, roll: 2.5,
  steerMax: 0.6, steerRate: 2.4, inputRate: 4, suspRest: 0.22, stiffness: 24, compression: 2.6, relaxation: 3.2, slip: 6,
};

export function createTractor(world, spawn) {
  const S = TP.scale;
  const yaw = spawn.yaw - Math.PI / 2; // model faces +z, chassis faces +x
  const e = world.spawn({
    body: { type: 'dynamic', canSleep: false, linearDamping: 0.05, angularDamping: 0.6,
      // D3: 2.1.0's body as Rapier summed it: the tuned 1400 kg (com 0.15, 0.55; inertia 900, 2200, 2000) plus the two
      // chassis boxes at density 5 (38.5 kg), about the joint centre of mass (the 0.3° tilt of its principal frame dropped)
      massProps: { mass: 1438.5, com: [0.1489, 0.5659, 0], inertia: [933.9, 2241.0, 2052.3] } }, // lh-allow: massProps, the playtested 2.1.0 tractor
    colliders: [{ shape: 'box', half: [1.55, 0.5, 1.0], p: [0.27, 0.95, 0], material: 'paintwork' },
                { shape: 'box', half: [0.55, 0.55, 0.62], p: [-0.55, 1.95, 0], material: 'paintwork' }],
    groups: { member: ['tractor'], filter: ['ground', 'static', 'pig', 'chick', 'food', 'dog', 'fox'] },
    at: [spawn.x, 0.05, spawn.z], q: [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)], tags: ['tractor'], model: 'tractor',
  });
  const body = e.body;
  // INTERIM until lion-hawk/kits/vehicle reaches phase-3 (3h): Rapier's ray-cast vehicle controller, freed with the entity
  const vc = world.rapier.createVehicleController(body);
  world.own(e, () => world.rapier?.removeVehicleController(vc));
  // model-space wheel centres and radii (from the Kenney tractor), scaled into the chassis frame
  const W = [
    { name: 'wheel-front-left', mx: 0.415, my: 0.325, mz: 0.735, r: 0.325, front: true },
    { name: 'wheel-front-right', mx: -0.415, my: 0.325, mz: 0.735, r: 0.325, front: true },
    { name: 'wheel-back-left', mx: 0.465, my: 0.525, mz: -0.575, r: 0.525, front: false },
    { name: 'wheel-back-right', mx: -0.465, my: 0.525, mz: -0.575, r: 0.525, front: false },
  ];
  for (const w of W) {
    w.cx = w.mz * S; w.cy = w.my * S; w.cz = -w.mx * S; w.radius = w.r * S;
    vc.addWheel({ x: w.cx, y: w.cy + 0.12, z: w.cz }, { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 1 }, TP.suspRest, w.radius);
  }
  for (let i = 0; i < W.length; i++) {
    vc.setWheelSuspensionStiffness(i, TP.stiffness); vc.setWheelSuspensionCompression(i, TP.compression);
    vc.setWheelSuspensionRelaxation(i, TP.relaxation); vc.setWheelFrictionSlip(i, TP.slip);
    vc.setWheelMaxSuspensionForce(i, 1e6); vc.setWheelMaxSuspensionTravel(i, 0.3);
  }
  const rayGroups = world.groups.mask(['ground', 'static', 'pig', 'food', 'dog', 'chick', 'fox', 'tractor'], ['ground', 'static']);
  const own = new Set(e.colliders.map(c => c.collider.handle));

  const t = {
    e, body, vc, W, driven: false, steer: 0, thr: 0, inThr: 0, inSteer: 0, speed: 0, fwd: 0, x: spawn.x, z: spawn.z, yaw: spawn.yaw,
    engine: 0, horn: 0,
    setInput(throttle, steer) { this.inThr = Math.max(-1, Math.min(1, throttle)); this.inSteer = Math.max(-1, Math.min(1, steer)); },
    step(DT) {
      // ease the stick so taps don't jolt the tractor
      const ease = (cur, tgt, rate) => cur + Math.max(-rate * DT, Math.min(rate * DT, tgt - cur));
      this.thr = ease(this.thr, this.driven ? this.inThr : 0, TP.inputRate);
      const q = body.rotation(), lv = body.linvel();
      const fx = 1 - 2 * (q.y * q.y + q.z * q.z), fz = 2 * (q.x * q.z - q.w * q.y); // chassis +x in world
      this.fwd = lv.x * fx + lv.z * fz; this.speed = Math.hypot(lv.x, lv.z);
      const v = this.fwd, maxSteer = TP.steerMax / (1 + Math.abs(v) * 0.09);
      this.steer = ease(this.steer, (this.driven ? this.inSteer : 0) * maxSteer, TP.steerRate);
      let force = 0, brake = 0;
      if (!this.driven) brake = TP.handbrake;
      else if (this.thr > 0.05) { if (v < -0.3) brake = TP.brake * this.thr; else force = TP.maxForce * this.thr * Math.max(0, 1 - v / TP.vmax); }
      else if (this.thr < -0.05) { if (v > 0.3) brake = TP.brake * -this.thr; else force = -TP.revForce * -this.thr * Math.max(0, 1 + v / TP.vrev); }
      else brake = TP.roll;
      this.engine = Math.abs(force) / TP.maxForce;
      for (let i = 0; i < 4; i++) {
        vc.setWheelSteering(i, W[i].front ? this.steer : 0);
        vc.setWheelEngineForce(i, W[i].front ? 0 : force / 2);
        vc.setWheelBrake(i, brake);
      }
      vc.updateVehicle(DT, undefined, rayGroups, c => !own.has(c.handle)); // the wheel rays: Rapier's controller (moves to the vehicle kit)
      if (this.horn > 0) this.horn -= DT;
      const p = body.translation(); this.x = p.x; this.z = p.z; this.yaw = Math.atan2(fx, fz);
    },
    // upright again if it ever ends up on its side or roof
    rightIfTipped() {
      const q = body.rotation(); const upY = 1 - 2 * (q.x * q.x + q.z * q.z);
      if (upY < 0.3) { const p = body.translation(); world.place(e, { at: [p.x, 0.6, p.z] }, { yaw: this.yaw - Math.PI / 2 }); return true; }
      return false;
    },
  };
  return t;
}
