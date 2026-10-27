// The jumps fly like jumps (rally-spec R17): driven by the autopilot at ~70-100 km/h over the test stages, every flight
// off a kicker, crest or tabletop ends on the wheels (no flight over 1.5 s: a hull strike cartwheeled the car), leaves
// the ramp no faster than 30 deg/s nose-down, and lands at most 16 deg nose-down against the ground (12 deg on average
// per jump type). What nose-down is left is the car running off the lip: its front is free while the rear is still on
// the ramp. Impreza (AWD) and Escort (RWD), assisted.
// Run: node test/jumps.mjs [car id]
import R from '@dimforge/rapier3d-compat';
import { benchSim } from './helpers/bench.mjs';
import { DT } from '../src/sim.js';
import { generateTrack } from '../src/gen/track.js';
import { TrackWorld } from '../src/world/trackWorld.js';
import { heightAt } from '../src/gen/terrain.js';
import { runUntil } from './autopilot.js';
import { qrot } from '../src/vehicle.js';
import { CAPS } from '../src/game/pace.js';
await R.init();

const only = process.argv[2];
const results = [];
function check(name, val, lo, hi, unit = '') {
  const ok = Number.isFinite(val) && val >= lo && val <= hi;
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${Number.isFinite(val) ? val.toFixed(3) : val}${unit}  [${lo}..${hi}]`);
  return ok;
}
const DEG = 180 / Math.PI, JUMPS = ['kicker', 'crest', 'tabletop'];
const caps = { ...CAPS, kicker: 22, crest: 28, tabletop: 28 }; // 79 / 100 / 100 km/h: the speeds the shapes are for

// Every flight (all four wheels off >= 0.4 s) that took off on a jump: pitch rate at take-off and pitch against the
// ground under the car at touchdown (deg, nose up +), airtime.
function flights(id) {
  const out = [];
  for (const seed of ['t1', 't2', 't3', 't4']) {
    const track = generateTrack(seed, { kind: 'stage', obstacles: 'wild' });
    const sim = benchSim({ world: new TrackWorld(track), car: id, assist: true });
    let air = 0, take = null, was = true;
    runUntil(sim, track, { maxTime: track.layout.length / 10, opts: { caps }, onStep: (s) => {
      const b = s.car.body, q = b.rotation(), F = qrot(q, { x: 0, y: 0, z: 1 }), Rt = qrot(q, { x: 1, y: 0, z: 0 });
      const p = b.translation(), av = b.angvel(), on = s.car.wheels.some(w => w.contact);
      if (was && !on) {
        const l = track.locator.locate(p.x, p.z), f = track.features.find(f => JUMPS.includes(f.type) && l.s >= f.s0 && l.s <= f.s1);
        take = f && { type: f.type, rate: -(av.x * Rt.x + av.y * Rt.y + av.z * Rt.z) * DEG };
        air = 0;
      }
      if (!on) air += DT;
      if (!was && on && take && air >= 0.4) {
        const h = Math.hypot(F.x, F.z), fx = F.x / h, fz = F.z / h;
        const slope = Math.atan2(heightAt(track.terrain, p.x + fx * 1.25, p.z + fz * 1.25) - heightAt(track.terrain, p.x - fx * 1.25, p.z - fz * 1.25), 2.5);
        out.push({ ...take, air, land: (Math.asin(F.y) - slope) * DEG });
      }
      was = on;
      return Math.abs(track.locator.locate(p.x, p.z).d) > 8;
    } });
  }
  return out;
}

for (const id of ['impreza-555', 'escort-rs1800']) {
  if (only && id !== only) continue;
  console.log(`\n# ${id}`);
  const all = flights(id);
  check('flights off jumps', all.length, 10, 1e9);
  check('longest flight (s)', Math.max(...all.map(f => f.air)), 0, 1.5);
  check('fastest nose-down rate at take-off (deg/s)', Math.min(...all.map(f => f.rate)), -30, 1e9);
  check('worst landing against the ground (deg)', Math.min(...all.map(f => f.land)), -16, 1e9);
  for (const type of JUMPS) {
    const t = all.filter(f => f.type === type);
    if (t.length) check(`${type}: mean landing against the ground (deg, ${t.length} flights)`, t.reduce((a, f) => a + f.land, 0) / t.length, -12, 12);
  }
}

const passed = results.filter(r => r.ok).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
