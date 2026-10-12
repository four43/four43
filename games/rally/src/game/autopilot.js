// Test driver for generated tracks (spec tracks T-12): pure pursuit on the centreline, target speed
// from upcoming curvature (v ≤ sqrt(0.55·μ·g/|κ|)), slowing for obstacles, P throttle/brake.
import { SURFACES } from '../tire.js';
import { roadSurfaceAt } from '../gen/surfaces.js';
import { pointAt } from '../world/trackWorld.js';
import { qrot } from '../vehicle.js';
import { DT } from '../sim.js';
import { policy } from 'lion-hawk/sim';
import { allowedSpeed, CAPS, V_MAX } from './pace.js';

const G = 9.81;

// opts: { lat = 0.55 (share of μ·g used in corners), brake = 0.4 (share of μ·g for braking),
//         kYaw = 0.15 (rad of steer per rad/s of yaw-rate error), caps: { featureType: m/s } }
export function autopilot(sim, track, opts = {}) {
  const lat = opts.lat ?? 0.55, brk = opts.brake ?? 0.4, caps = opts.caps ?? CAPS;
  const car = sim.car, L = track.layout, b = car.body;
  const p = b.translation(), q = b.rotation();
  const F = qrot(q, { x: 0, y: 0, z: 1 }), Lt = qrot(q, { x: 1, y: 0, z: 0 }); // local +x = left
  const v = Math.max(0, car.speed);
  const { s } = track.locator.locate(p.x, p.z);

  // Pure pursuit (steer +1 = left) plus a yaw-rate loop: the arc asks for yaw rate v·κ, and the
  // error to the actual yaw rate is fed back, which trims understeer and catches slides. The
  // look-ahead grows on low grip, where the car answers the wheel more slowly.
  const mu = SURFACES[roadSurfaceAt(track.surfaces, s).road].mu;
  const look = Math.max(6, v * 0.6 * Math.max(1, Math.sqrt(0.8 / mu)));
  const tp = pointAt(L, s + look);
  const dx = tp.x - p.x, dz = tp.z - p.z;
  const fwd = dx * F.x + dz * F.z, left = dx * Lt.x + dz * Lt.z, ld2 = fwd * fwd + left * left;
  const kappa = 2 * left / Math.max(ld2, 1);
  const yawErr = v > 3 ? v * kappa - b.angvel().y : 0;
  const delta = Math.atan(car.cfg.wheelbase * kappa) + (opts.kYaw ?? 0.15) * yawErr;
  const steer = Math.max(-1, Math.min(1, delta / car.cfg.maxLock));

  // Target speed: the lowest over the braking distance of sqrt(v_allow² + 2·a·dist).
  const a = brk * mu * G, span = v * v / (2 * a) + 30;
  let vt = V_MAX;
  for (let k = 0; k <= span; k += 2) {
    const pk = pointAt(L, s + k);
    if (!L.closed && pk.s >= L.length) break;
    const va = allowedSpeed(track, pk.s, { lat, caps });
    vt = Math.min(vt, Math.sqrt(va * va + 2 * a * k));
  }

  // P throttle/brake; never brake near standstill (the gearbox would select reverse).
  const err = vt - v;
  let throttle = 0, brake = 0;
  if (err > -0.5) throttle = Math.max(0, Math.min(1, 0.3 + 0.4 * err));
  else if (v > 2) brake = Math.max(0, Math.min(1, -0.25 * (err + 0.5)));
  return { steer, throttle, brake, handbrake: 0, target: vt, s };
}

// Steps the sim with the autopilot at `rate` Hz until onStep(sim, ctl) returns true or maxTime.
export function runUntil(sim, track, { maxTime = 600, rate = 60, onStep, opts } = {}) {
  const every = Math.max(1, Math.round(1 / (rate * DT)));
  const n = Math.round(maxTime / DT);
  let ctl = null;
  for (let i = 0; i < n; i++) {
    if (i % every === 0) {
      ctl = autopilot(sim, track, opts);
      const inp = sim.car.input;
      inp.steer = ctl.steer; inp.throttle = ctl.throttle; inp.brake = ctl.brake; inp.handbrake = ctl.handbrake;
    }
    sim.step();
    if (onStep && onStep(sim, ctl)) return true;
  }
  return false;
}

// The headless `autopilot` policy (lion-hawk [T-2]): drives while the stage is `running` on a track, recomputed every
// 4th step (60 Hz in the 240 Hz sim, as the golden and the game tests) and held in between (policy.every, #26, #37).
const drive = policy.every(4, h => {
  const s = h.engine.scene.state, a = autopilot(s.sim, s.sim.world.track);
  return { steer: a.steer, throttle: a.throttle, brake: a.brake, handbrake: 0 };
});
export function autopilotPolicy(h, i, sc) {
  const e = h.engine, s = e.scene.state;
  if (e.scene.name !== 'stage' || s.phase !== 'running' || !s.sim?.world.track) return {};
  return drive(h, i, sc);
}
