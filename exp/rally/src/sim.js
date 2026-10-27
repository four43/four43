// Simulation: a World (test pad or generated track) and the car, on the scene's lion-hawk World, which owns the Rapier
// world and steps it (overview §4.4). Rally's vehicle runs before Rapier's step (system rally.vehicle, preStep) and the
// clock after it (rally.after, postStep).
import { Vehicle, DT } from './vehicle.js';
import { CARS, DEFAULT_CAR } from './cars.js';
import { SnowField } from './snow.js';
import { PadWorld } from './world/padWorld.js';

export { PAD, padColliders, coneLayout } from './world/padWorld.js';
export const HZ = 240; // 1 / HZ === DT exactly, so the World's timestep is today's

export class Sim {
  // lh: the scene's World. opts: { world, car, assist, pos, yaw, step } plus, when no world is given, the pad options
  // { surface, cones, pad }. opts.step advances one engine step (test/helpers/bench.mjs); the stage never calls step().
  constructor(lh, opts = {}) {
    this.lh = lh;
    this.R = lh.R;
    this.assist = opts.assist ?? true;
    this.time = 0;
    this.carId = opts.car || DEFAULT_CAR;
    this.stepper = opts.step ?? null;
    this.world = null;
    this.setWorld(opts.world || new PadWorld({ pad: opts.pad, cones: opts.cones, surface: opts.surface }), opts.pos, opts.yaw);
  }

  get phys() { return this.lh ? this.lh.rapier : null; }

  // The engine disposes the World after the stage's exit ([S-3]); this only drops the references. Idempotent.
  dispose() { this.lh = null; this.car = null; }

  // Swaps worlds: world.clear() drops every body and collider (a new Rapier world, overview §4.4), then the new world
  // and the car at its spawn (or pos/yaw). The first build uses the fresh World as it is.
  setWorld(world, pos, yaw) {
    if (this.world) this.lh.clear();
    this.car = null;
    this.world = world;
    world.build(this.lh);
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
    if (this.car) this.lh.despawn(this.car.e);
    const cfg = CARS[id];
    this.car = new Vehicle(this.lh, cfg, {
      pos: pos || this.spawnPos(cfg), yaw: yaw ?? this.world.spawn.yaw, assist: this.assist,
      surfaceAt: (x, z, c) => this.surfaceAt(x, z, c), snow: () => this.snow,
      rayGroups: this.lh.groups.mask(['ray'], ['ground']),
    });
    this.carId = id;
  }

  setAssist(on) { this.assist = on; this.car.assist = on; }

  resetCar() {
    this.car.reset(this.spawnPos(this.car.cfg), this.world.spawn.yaw);
    if (this.snow) this.snow.clear();
    this.world.resetProps();
  }

  preStep() { this.car.step(); }
  postStep() { this.time += DT; } // props sleep through the World (#2)

  // One engine step; only for a Sim made with opts.step (test/helpers/bench.mjs).
  step() {
    if (!this.stepper) throw new Error('Sim.step: this Sim is stepped by its engine; build it with benchSim() to step it alone');
    this.stepper();
  }
}

export { DT };
