// The jumps fly like jumps at the speed they are built for (rally-spec R17, R18-3): every kicker, crest and tabletop on
// the t1-t6 wild stages, hit on the centreline at its design speed (the flat-out speed at its lip) and 15% over it,
// held by throttle and steered by the autopilot. Every flight ends on the wheels: none over 1.5 s, no car upside down
// within the feature, landing at most 12 deg nose-down against the ground. Impreza (AWD) and Escort (RWD), no assists.
// Run: node test/jumps.mjs [car id]
import R from '@dimforge/rapier3d-compat';
import { benchSim } from './helpers/bench.mjs';
import { DT } from '../src/sim.js';
import { generateTrack } from '../src/gen/track.js';
import { TrackWorld, pointAt } from '../src/world/trackWorld.js';
import { heightAt } from '../src/gen/terrain.js';
import { autopilot } from './autopilot.js';
import { qrot } from '../src/vehicle.js';
await R.init();

const only = process.argv[2];
const results = [];
function check(name, val, lo, hi, unit = '') {
  const ok = Number.isFinite(val) && val >= lo && val <= hi;
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${Number.isFinite(val) ? val.toFixed(3) : val}${unit}  [${lo}..${hi}]`);
  return ok;
}
const DEG = 180 / Math.PI, JUMPS = ['kicker', 'crest', 'tabletop'], LEAD = 25;

// One jump at k × its design speed, from LEAD m before it on the centreline: the main flight (airtime, pitch against
// the ground at touchdown), whether it left the lip on the line, and whether the car went over within the feature.
function hit(sim, track, f, k) {
  const p0 = pointAt(track.layout, f.s0 - LEAD), p1 = pointAt(track.layout, f.s0 - LEAD + 1);
  const yaw = Math.atan2(p1.x - p0.x, p1.z - p0.z), v = k * f.v, car = sim.car;
  car.reset({ x: p0.x, y: heightAt(track.terrain, p0.x, p0.z) + car.cfg.comHeight + 0.1, z: p0.z }, yaw);
  car.body.setLinvel({ x: Math.sin(yaw) * v, y: 0, z: Math.cos(yaw) * v }, true);
  for (const w of car.wheels) w.omega = v / car.cfg.radius;
  const out = { air: 0, land: null, line: true, over: false };
  let state = 'ground', was = true;
  for (let i = 0; i < 8 / DT; i++) {
    if (i % 4 === 0) {
      const a = autopilot(sim, track, { caps: {} }), e = v - car.speed;
      Object.assign(car.input, { steer: a.steer, throttle: Math.max(0, Math.min(1, 0.5 + 0.5 * e)), brake: e < -2 ? 0.3 : 0, handbrake: 0 });
    }
    sim.step();
    const b = car.body, q = b.rotation(), F = qrot(q, { x: 0, y: 0, z: 1 }), U = qrot(q, { x: 0, y: 1, z: 0 });
    const p = b.translation(), l = track.locator.locate(p.x, p.z), on = car.wheels.some(w => w.contact);
    if (l.s > f.s1 + 10) break;
    if (l.s >= f.s0 && U.y < 0.3) out.over = true;
    if (state === 'ground' && was && !on && l.s > f.s0) { state = 'air'; out.line = Math.abs(l.d) < 1; }
    if (state === 'air') {
      if (!on) out.air += DT;
      else if (out.air > 0.05) {
        const h = Math.hypot(F.x, F.z), fx = F.x / h, fz = F.z / h;
        const slope = Math.atan2(heightAt(track.terrain, p.x + fx * 1.25, p.z + fz * 1.25) - heightAt(track.terrain, p.x - fx * 1.25, p.z - fz * 1.25), 2.5);
        out.land = (Math.asin(F.y) - slope) * DEG; state = 'done';
      }
    }
    was = on;
  }
  return out;
}

for (const id of ['impreza-555', 'escort-rs1800']) {
  if (only && id !== only) continue;
  for (const k of [1, 1.15]) {
    console.log(`\n# ${id} at ${k} x design speed`);
    const all = [];
    for (const seed of ['t1', 't2', 't3', 't4', 't5', 't6']) {
      const track = generateTrack(seed, { kind: 'stage', obstacles: 'wild' });
      const sim = benchSim({ world: new TrackWorld(track), car: id, assist: false });
      for (const f of track.features.filter(f => JUMPS.includes(f.type))) all.push({ seed, f, ...hit(sim, track, f, k) });
    }
    const clean = all.filter(r => r.line), flew = clean.filter(r => r.land !== null);
    for (const r of clean.filter(r => r.over)) console.log(`  over: ${r.seed} ${r.f.type} at ${r.f.s0.toFixed(0)} for ${(r.f.v * 3.6).toFixed(0)} km/h, air ${r.air.toFixed(2)} s`);
    check('jumps hit, leaving the lip on the line', clean.length, 8, 1e9);
    check('flights', flew.length, 4, 1e9);
    check('longest flight (s)', Math.max(...flew.map(r => r.air)), 0, 1.5);
    check('cars upside down within a jump', clean.filter(r => r.over).length, 0, 0);
    check('worst landing against the ground (deg)', Math.min(...flew.map(r => r.land)), -12, 1e9);
  }
}

const passed = results.filter(r => r.ok).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
