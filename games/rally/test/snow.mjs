// Fresh snow (spec R2-6): the snow field and how the car drives on it. Run: node test/snow.mjs [filter]
import R from '@dimforge/rapier3d-compat';
import { Sim, DT, PAD } from '../src/sim.js';
import { SnowField, SNOW } from '../src/snow.js';
import { SURFACES } from '../src/tire.js';
await R.init();

const only = process.argv[2];
const results = [];
function check(name, val, lo, hi, unit = '') {
  const ok = val >= lo && val <= hi;
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${val.toFixed(3)}${unit}  [${lo}..${hi}]`);
  return ok;
}
const mk = (car, surface, extra = {}) => new Sim(R, { car, surface, cones: false, assist: false, ...extra });
const run = (sim, secs, fn) => { const n = Math.round(secs / DT); for (let i = 0; i < n; i++) { fn && fn(sim, i * DT); sim.step(); } };
const test = (name, f) => { if (!only || name.includes(only)) { console.log(`\n# ${name}`); f(); } };
const roll = (sim, vx, vz) => {
  sim.car.body.setLinvel({ x: vx, y: 0, z: vz }, true);
  for (const w of sim.car.wheels) w.omega = vz / sim.car.cfg.radius;
};

test('field: fresh, pressed, polished', () => {
  const f = new SnowField();
  check('fresh height (m)', f.height(3.3, -7.1), SNOW.depth - 1e-3, SNOW.depth + 1e-3, ' m');
  check('fresh surface is fresh snow', f.surface(3.3, -7.1).name === 'Fresh snow' ? 1 : 0, 1, 1);
  f.press(0, 0, 0, 1, 3000, 0, DT);
  check('pressed height (m)', f.height(0, 0), SNOW.packed - 2e-3, SNOW.packed + 0.01, ' m');
  check('pressed surface mu (packed)', f.surface(0, 0).mu, SURFACES.packed.mu - 0.01, SURFACES.packed.mu + 0.01);
  check('berm beside the rut (m)', f.height(0.3125, 0), SNOW.depth + SNOW.berm * 0.8, SNOW.depth + SNOW.berm + 1e-3, ' m');
  check('0.6 m to the side untouched (m)', f.height(0.6, 0), SNOW.depth - 1e-3, SNOW.depth + 1e-3, ' m');
  const light = new SnowField(); light.press(0, 0, 0, 1, SNOW.fullLoad / 2, 0, DT);
  check('half load presses half way (m)', light.height(0, 0), 0.06, 0.09, ' m');
  // ~6 m of slip at 3 kN polishes to ice.
  for (let i = 0; i < 1.5 / DT; i++) f.press(0, 0, 0, 1, 3000, 5, DT);
  check('polished surface mu (ice)', f.surface(0, 0).mu, SURFACES.ice.mu - 0.01, SURFACES.ice.mu + 0.03);
  f.clear();
  check('clear restores fresh (m)', f.height(0, 0), SNOW.depth - 1e-3, SNOW.depth + 1e-3, ' m');
});

for (const car of ['awd', 'rwd']) {
  test(`${car} sinks into the snow`, () => {
    const sim = mk(car, 'snow');
    run(sim, 3);
    const c = sim.car;
    check('CoM height above hard ground (m)', c.body.translation().y - c.cfg.comHeight, SNOW.packed - 0.015, SNOW.packed + 0.015, ' m');
    check('snow under FL (m)', sim.snow.height(c.wheels[0].point.x, c.wheels[0].point.z), 0, SNOW.packed + 0.01, ' m');
    check('creep at rest (m/s)', Math.hypot(c.body.linvel().x, c.body.linvel().z), 0, 0.01, ' m/s');
  });
}

test('awd fresh snow drags more than packed', () => {
  const coast = (surf) => {
    const sim = mk('awd', surf);
    run(sim, 1); roll(sim, 0, 14);
    run(sim, 3, (s) => { s.car.input.throttle = 0; });
    return sim.car.speed;
  };
  const packed = coast('packed'), fresh = coast('snow');
  console.log(`  after 3 s coasting from 14 m/s: packed ${packed.toFixed(2)}, fresh ${fresh.toFixed(2)} m/s`);
  check('speed lost to plowing (m/s)', packed - fresh, 0.8, 8, ' m/s'); // >= ~0.03 g extra drag
});

test('awd driving in its own ruts drags less', () => {
  const sim = mk('awd', 'snow');
  run(sim, 1);
  const start = { ...sim.car.body.translation() };
  const pass = () => {
    sim.car.reset(start, 0); run(sim, 0.5); roll(sim, 0, 14);
    run(sim, 2, (s) => { s.car.input.throttle = 0; });
    return sim.car.speed;
  };
  const first = pass(), second = pass();
  console.log(`  after 2 s coasting: first pass ${first.toFixed(2)}, second pass ${second.toFixed(2)} m/s`);
  check('speed kept on the second pass (m/s)', second - first, 0.5, 8, ' m/s');
});

test('awd sideways slide dies faster in fresh snow', () => {
  const slide = (surf) => {
    const sim = mk('awd', surf);
    run(sim, 1);
    const x0 = sim.car.body.translation().x;
    sim.car.body.setLinvel({ x: 6, y: 0, z: 0 }, true);
    run(sim, 3);
    return sim.car.body.translation().x - x0;
  };
  const packed = slide('packed'), fresh = slide('snow');
  console.log(`  sideways slide from 6 m/s: packed ${packed.toFixed(2)} m, fresh ${fresh.toFixed(2)} m`);
  check('fresh / packed slide distance', fresh / packed, 0, 0.8);
});

test('awd ruts pull the wheels in', () => {
  const sim = mk('awd', 'snow');
  const half = sim.car.cfg.track / 2;
  for (let z = -20; z < 80; z += SNOW.cell) for (const x of [-half, half]) sim.snow.press(x, z, 0, 1, 3000, 0, DT);
  const off = 0.08;
  sim.car.reset({ x: off, y: sim.car.cfg.comHeight + 0.05, z: 0 }, 0);
  run(sim, 0.5); roll(sim, 0, 8);
  let sum = 0, n = 0;
  run(sim, 3, (s, t) => { s.car.input.throttle = 0.2; if (t > 2) { sum += Math.abs(s.car.body.translation().x); n++; } });
  check('mean |offset| from rut centre in the last second (m)', sum / n, 0, off * 0.5, ' m');
});

test('rwd wheelspin polishes snow towards ice', () => {
  const sim = mk('rwd', 'snow');
  run(sim, 1);
  const rl = sim.car.wheels[2].point, at = { x: rl.x, z: rl.z };
  run(sim, 1.5, (s) => { s.car.input.throttle = 1; });
  check('surface mu where the rear wheel started (polished part-way to ice)', sim.snow.surface(at.x, at.z).mu, 0, SURFACES.packed.mu - 0.1 * (SURFACES.packed.mu - SURFACES.ice.mu));
});

test('awd top speed in fresh snow', () => {
  // Deep snow caps speed well under tarmac's 184 km/h (plow drag grows with v^2), but doesn't trap.
  const sim = mk('awd', 'snow', { assist: true, pad: { ...PAD, size: 8000 }, pos: { x: 300, y: 0.6, z: -300 } });
  run(sim, 1);
  let top = 0;
  run(sim, 35, (s) => { s.car.input.throttle = 1; top = Math.max(top, s.car.speed * 3.6); });
  check('top speed (km/h)', top, 100, 145, ' km/h');
});

const fails = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - fails}/${results.length} passed`);
process.exit(fails ? 1 : 0);
