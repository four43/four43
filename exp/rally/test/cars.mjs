// Every real car drives (rally-spec R16-2): it settles on its springs, pulls away (0-100 km/h on tarmac, about what its
// power and weight say), tops out where its gearing says, turns without rolling over, stops, and holds its gear through
// the air (R16-6). Sim mode, auto box.
// Run: node test/cars.mjs [car id]
import R from '@dimforge/rapier3d-compat';
import { benchSim } from './helpers/bench.mjs';
import { DT, PAD } from '../src/sim.js';
import { CARS, CAR_IDS } from '../src/cars.js';
await R.init();

const only = process.argv[2];
const results = [];
function check(name, val, lo, hi, unit = '') {
  const ok = Number.isFinite(val) && val >= lo && val <= hi;
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${Number.isFinite(val) ? val.toFixed(3) : val}${unit}  [${lo}..${hi}]`);
  return ok;
}
// A big tarmac pad, the car far from the cones and ramps.
const mk = id => benchSim({ car: id, surface: 'tarmac', cones: false, assist: false, pad: { ...PAD, size: 8000 }, pos: { x: 300, y: 0.6, z: -1500 }, yaw: 0 });
const run = (sim, secs, fn) => { const n = Math.round(secs / DT); for (let i = 0; i < n; i++) { if (fn?.(sim, i * DT) === false) return; sim.step(); } };
const speed = sim => { const v = sim.car.body.linvel(); return Math.hypot(v.x, v.z); };
const finite = sim => { const t = sim.car.body.translation(), v = sim.car.body.linvel(); return [t.x, t.y, t.z, v.x, v.y, v.z].every(Number.isFinite); };
const upright = sim => { const q = sim.car.body.rotation(); return 1 - 2 * (q.x * q.x + q.z * q.z); }; // the body's up · world up

const table = [];
for (const id of CAR_IDS) {
  if (only && id !== only) continue;
  const c = CARS[id], row = { id };
  console.log(`\n# ${id}`);

  let sim = mk(id); run(sim, 2);
  const fz = sim.car.wheels.map(w => w.fz), sum = fz.reduce((a, b) => a + b, 0);
  check('sum Fz / m g', sum / (c.mass * 9.81), 0.99, 1.01);
  check('front share', (fz[0] + fz[1]) / sum, c.frontWeight - 0.015, c.frontWeight + 0.015);
  check('creep at rest (m/s)', speed(sim), 0, 0.005);

  // 0-100 km/h, then on to the top speed (60 s flat out on the straight)
  let t100 = NaN, vmax = 0;
  run(sim, 60, (s, t) => {
    s.car.input.throttle = 1; s.car.input.steer = 0;
    const v = speed(s); if (v > vmax) vmax = v;
    if (Number.isNaN(t100) && v >= 100 / 3.6) t100 = t;
  });
  row.t100 = t100; row.vmax = vmax * 3.6;
  // power to weight sets the launch: the 450 hp Group B cars near 3 s, the 240 hp 70s cars near 6 s (tyres limit both)
  const pw = c.power / (c.mass / 1000);
  check('0-100 km/h tarmac (s)', t100, pw > 400 ? 2.4 : 3.2, pw > 400 ? 4.4 : 7.5, ' s');
  const vTop = c.drive.engine.redline * 2 * Math.PI / 60 * c.radius / (c.drive.gears.at(-1) * c.drive.final) * 3.6; // the redline in top gear
  check('top speed (km/h)', vmax * 3.6, Math.min(150, 0.8 * vTop), vTop * 1.02, ' km/h');
  check('state stays finite', finite(sim) ? 1 : 0, 1, 1);

  // a steady turn at 60 km/h, then a full stop from 100
  sim = mk(id); run(sim, 1);
  run(sim, 20, s => { s.car.input.throttle = speed(s) < 60 / 3.6 ? 1 : 0; return speed(s) < 60 / 3.6; });
  let minUp = 1, yawRate = 0;
  run(sim, 4, s => { s.car.input.throttle = speed(s) < 60 / 3.6 ? 0.6 : 0.2; s.car.input.steer = 0.35; minUp = Math.min(minUp, upright(s)); yawRate = Math.abs(s.car.body.angvel().y); });
  check('turns (yaw rate, rad/s)', yawRate, 0.2, 3);
  check('stays upright (min up)', minUp, 0.85, 1);

  sim = mk(id); run(sim, 1);
  run(sim, 20, s => { s.car.input.throttle = 1; return speed(s) < 100 / 3.6; });
  const p0 = sim.car.body.translation(); let stopped = NaN;
  run(sim, 8, (s, t) => { s.car.input.throttle = 0; s.car.input.brake = 1; if (speed(s) < 0.3) { stopped = t; return false; } });
  const p1 = sim.car.body.translation(); row.d100 = Math.hypot(p1.x - p0.x, p1.z - p0.z);
  check('stops from 100 km/h (s)', stopped, 0.5, 6, ' s');
  check('100-0 tarmac (m)', row.d100, 30, 48, ' m');
  // R16-6: flat out in the air (a jump) the box holds its gear: the free wheels flare the engine, which is not road speed
  sim = mk(id); run(sim, 1);
  run(sim, 20, s => { s.car.input.throttle = 1; return s.car.gear < 2 || speed(s) < 50 / 3.6; });
  const gear = sim.car.gear, b = sim.car.body, t = b.translation(), v = b.linvel();
  b.setTranslation({ x: t.x, y: t.y + 2.5, z: t.z }, true); b.setLinvel({ x: v.x, y: 4, z: v.z }, true);
  let flare = 0;
  let airGear = gear;
  run(sim, 0.9, s => { s.car.input.throttle = 1; flare = Math.max(flare, s.car.rpm); if (!s.car.wheels.some(w => w.contact)) airGear = Math.max(airGear, s.car.gear); });
  check('engine flares in the air (x redline)', flare / sim.car.redline, 0.94, 1.2);
  check('gear held through the air', airGear - gear, 0, 0);
  table.push(row);
}

console.log('\ncar                  0-100 s  top km/h  100-0 m');
for (const r of table) console.log(`${r.id.padEnd(20)} ${r.t100.toFixed(2).padStart(7)} ${r.vmax.toFixed(0).padStart(9)} ${r.d100.toFixed(1).padStart(8)}`);
const passed = results.filter(r => r.ok).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
