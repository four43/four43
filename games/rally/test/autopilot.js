// Test driver for generated tracks (spec tracks T-12): pure pursuit on the centreline, target speed
// from upcoming curvature (v ≤ sqrt(0.55·μ·g/|κ|)), slowing for obstacles, P throttle/brake.
import { SURFACES } from '../src/tire.js';
import { roadSurfaceAt } from '../src/gen/surfaces.js';
import { pointAt } from '../src/world/trackWorld.js';
import { qrot } from '../src/vehicle.js';
import { DT } from '../src/sim.js';

const G = 9.81;
// Speed caps (m/s) from OBSTACLE_LEAD m before an obstacle to its end, swept per feature on the
// test seeds: kickers sometimes nose-dive into the landing from ~16, whoops launch and flip from
// ~16 (and the tallest can't be crawled either: the hull grounds on the ridges).
const OBSTACLE_V = 16, OBSTACLE_LEAD = 15;
const V_MAX = 38;
const CAPS = { kicker: 12, whoops: 12, crest: 16, tabletop: 16 };

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
    const muK = SURFACES[roadSurfaceAt(track.surfaces, pk.s).road].mu;
    const kk = Math.max(Math.abs(L.curvature[pk.i]), Math.abs(L.curvature[pk.j]), 1e-4);
    const va = Math.min(V_MAX, Math.sqrt(lat * muK * G / kk), obstacleCap(track, pk.s, caps));
    vt = Math.min(vt, Math.sqrt(va * va + 2 * a * k));
  }

  // P throttle/brake; never brake near standstill (the gearbox would select reverse).
  const err = vt - v;
  let throttle = 0, brake = 0;
  if (err > -0.5) throttle = Math.max(0, Math.min(1, 0.3 + 0.4 * err));
  else if (v > 2) brake = Math.max(0, Math.min(1, -0.25 * (err + 0.5)));
  return { steer, throttle, brake, handbrake: 0, target: vt, s };
}

function obstacleCap(track, s, caps) {
  const len = track.layout.length;
  for (const f of track.features) {
    if (f.type === 'berm') continue;
    let ds = s - (f.s0 - OBSTACLE_LEAD);
    if (track.layout.closed) ds = ((ds % len) + len) % len;
    if (ds >= 0 && ds <= f.s1 - f.s0 + OBSTACLE_LEAD) return caps[f.type] ?? OBSTACLE_V;
  }
  return V_MAX;
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
