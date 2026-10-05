// Drivable tractor on Rapier's ray-cast vehicle controller.
// Chassis frame: +x forward, +y up, +z to the right-hand side (model +x maps to chassis -z).
export const TP = {
  scale: 1.6, mass: 1400, maxForce: 5200, revForce: 3000, vmax: 6.5, vrev: 3.0, brake: 28, handbrake: 60, roll: 2.5,
  steerMax: 0.6, steerRate: 2.4, inputRate: 4, suspRest: 0.22, stiffness: 24, compression: 2.6, relaxation: 3.2, slip: 6,
};

export function createTractor(RAPIER, world, spawn, grp, G) {
  const S = TP.scale;
  const yaw = spawn.yaw - Math.PI / 2; // model faces +z, chassis faces +x
  const desc = RAPIER.RigidBodyDesc.dynamic().setTranslation(spawn.x, 0.05, spawn.z)
    .setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) })
    .setCanSleep(false).setLinearDamping(0.05).setAngularDamping(0.6)
    .setAdditionalMassProperties(TP.mass, { x: 0.15, y: 0.55, z: 0 }, { x: 900, y: 2200, z: 2000 }, { x: 0, y: 0, z: 0, w: 1 });
  const body = world.createRigidBody(desc);
  const groups = grp(G.TRACTOR, G.GROUND | G.STATIC | G.PIG | G.CHICK | G.FOOD | G.DOG | G.FOX);
  const cols = [
    world.createCollider(RAPIER.ColliderDesc.cuboid(1.55, 0.5, 1.0).setTranslation(0.27, 0.95, 0).setDensity(5).setFriction(0.4).setCollisionGroups(groups), body),
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.55, 0.55, 0.62).setTranslation(-0.55, 1.95, 0).setDensity(5).setFriction(0.4).setCollisionGroups(groups), body),
  ];
  const vc = world.createVehicleController(body);
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
  const rayGroups = grp(0xffff, G.GROUND | G.STATIC);
  const own = new Set(cols.map(c => c.handle));

  const t = {
    body, vc, W, cols, driven: false, steer: 0, thr: 0, inThr: 0, inSteer: 0, speed: 0, fwd: 0, x: spawn.x, z: spawn.z, yaw: spawn.yaw,
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
      vc.updateVehicle(DT, undefined, rayGroups, c => !own.has(c.handle));
      if (this.horn > 0) this.horn -= DT;
      const p = body.translation(); this.x = p.x; this.z = p.z; this.yaw = Math.atan2(fx, fz);
    },
    // upright again if it ever ends up on its side or roof
    rightIfTipped() {
      const q = body.rotation(); const upY = 1 - 2 * (q.x * q.x + q.z * q.z);
      if (upY < 0.3) { const y = this.yaw - Math.PI / 2; body.setRotation({ x: 0, y: Math.sin(y / 2), z: 0, w: Math.cos(y / 2) }, true); const p = body.translation(); body.setTranslation({ x: p.x, y: 0.6, z: p.z }, true); body.setAngvel({ x: 0, y: 0, z: 0 }, true); return true; }
      return false;
    },
  };
  return t;
}
