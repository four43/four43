// Simulation: Rapier setup, a World (test pad or generated track), fixed-step loop.
import { Vehicle, DT } from './vehicle.js';
import { CARS } from './cars.js';
import { SnowField } from './snow.js';
import { PadWorld, GROUP_GROUND, GROUP_CAR, groups } from './world/padWorld.js';

export { GROUP_GROUND, GROUP_PROP, GROUP_CAR, groups, PAD, buildPad, coneLayout } from './world/padWorld.js';

export class Sim {
  // opts: { world, car, assist, pos, yaw } plus, when no world is given, the pad options
  // { surface, cones, pad } used to make a PadWorld (keeps every pre-World call working).
  constructor(R, opts = {}) {
    this.R = R;
    this.assist = opts.assist ?? true;
    this.time = 0;
    this.carId = opts.car || 'awd';
    this.setWorld(opts.world || new PadWorld({ pad: opts.pad, cones: opts.cones, surface: opts.surface }), opts.pos, opts.yaw);
  }

  // Swaps worlds by rebuilding the Rapier world from scratch (simplest way to drop every old
  // collider and prop) and re-creating the car at the new world's spawn (or pos/yaw).
  setWorld(world, pos, yaw) {
    if (this.phys) { this.phys.free(); this.car = null; }
    this.world = world;
    this.phys = new this.R.World({ x: 0, y: -9.81, z: 0 });
    this.phys.timestep = DT;
    world.build(this.R, this.phys);
    this.setSurface(world.surfaceKey);
    this.setCar(this.carId, pos, yaw);
  }

  get props() { return this.world.props; }
  get cones() { return this.world.props; } // pre-World alias
  get surfaceKey() { return this.world.surfaceKey; }

  // Surface choice is a pad feature. 'snow' is deformable fresh snow bound to the pad's flat
  // ground collider (spec R2-6); the features poking through it are packed snow.
  setSurface(key) {
    if (this.world.kind !== 'pad') { this.snow = null; return; }
    this.world.setSurface(key);
    if (key === 'snow') { this.snow = new SnowField(); this.snow.groundHandle = this.world.groundCollider.handle; }
    else this.snow = null;
  }

  surfaceAt(x, z, collider) { return this.world.surfaceAt(x, z, collider); }

  spawnPos(cfg) {
    const sp = this.world.spawn;
    return { x: sp.x, y: sp.y ?? cfg.comHeight + 0.05, z: sp.z };
  }

  setCar(id, pos, yaw) {
    if (this.car) this.phys.removeRigidBody(this.car.body);
    const cfg = CARS[id];
    this.car = new Vehicle(this.R, this.phys, cfg, {
      pos: pos || this.spawnPos(cfg), yaw: yaw ?? this.world.spawn.yaw, assist: this.assist,
      surfaceAt: (x, z, c) => this.surfaceAt(x, z, c), snow: () => this.snow,
      rayGroups: groups(0x0008, GROUP_GROUND),
    });
    this.car.colliders.forEach((c) => c.setCollisionGroups(groups(GROUP_CAR, 0xffff)));
    this.carId = id;
  }

  setAssist(on) { this.assist = on; this.car.assist = on; }

  resetCar() {
    this.car.reset(this.spawnPos(this.car.cfg), this.world.spawn.yaw);
    if (this.snow) this.snow.clear();
    this.world.resetProps();
  }

  step() {
    this.car.step();
    this.phys.step();
    this.time += DT;
  }
}

export { DT };
