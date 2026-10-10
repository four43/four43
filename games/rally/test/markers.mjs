// Marker posts (spec tracks T-6, R3-3): knocked posts tip over and settle quickly instead of
// rolling and spinning away. Run: node test/markers.mjs
import R from '@dimforge/rapier3d-compat';
import { Sim, DT } from '../src/sim.js';
import { generateTrack } from '../src/gen/track.js';
import { TrackWorld } from '../src/world/trackWorld.js';
await R.init();

const results = [];
function check(name, val, lo, hi, unit = '') {
  const ok = val >= lo && val <= hi;
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${val.toFixed(3)}${unit}  [${lo}..${hi}]`);
}

const track = generateTrack('markers', { kind: 'loop', style: 'flowing' }); // pinned: marker physics, not layout
const sim = new Sim(R, { world: new TrackWorld(track), car: 'awd', assist: true });
const markers = () => sim.world.props.filter((p) => p.kind === 'marker');
const speedOf = (b) => { const v = b.linvel(), w = b.angvel(); return { v: Math.hypot(v.x, v.y, v.z), w: Math.hypot(w.x, w.y, w.z) }; };

console.log('\n# a post flung at 20 m/s and 30 rad/s settles');
{
  const m = markers()[5], b = m.body, p0 = { ...b.translation() };
  b.wakeUp(); b.setLinvel({ x: 20, y: 3, z: 0 }, true); b.setAngvel({ x: 0, y: 5, z: 30 }, true);
  let tStop = 0;
  for (let i = 0; i < 240 * 8; i++) {
    sim.step();
    const s = speedOf(b);
    if (!tStop && s.v < 0.1 && s.w < 0.3) tStop = (i + 1) * DT;
    if (tStop && (s.v > 0.3 || s.w > 1)) tStop = 0; // started moving again
  }
  const p1 = b.translation();
  check('time until it stops (s)', tStop || 99, 0, 3, ' s');
  check('distance it travels (m)', Math.hypot(p1.x - p0.x, p1.z - p0.z), 0, 15, ' m');
}

console.log('\n# the car hits a post at 72 km/h');
{
  const m = markers()[12], h = m.home.yaw;
  const car = sim.car, back = 15;
  car.reset({ x: m.home.x - Math.sin(h) * back, y: m.home.y + 0.3, z: m.home.z - Math.cos(h) * back }, h);
  car.body.setLinvel({ x: Math.sin(h) * 20, y: 0, z: Math.cos(h) * 20 }, true);
  for (const w of car.wheels) w.omega = 20 / car.cfg.radius;
  const p0 = { ...m.body.translation() };
  let tStop = 0, hit = false;
  for (let i = 0; i < 240 * 8; i++) {
    car.input.throttle = 0; car.input.brake = i * DT > 1.2 ? 1 : 0; // drive through, then stop
    sim.step();
    const s = speedOf(m.body);
    if (s.v > 2) hit = true;
    if (hit && !tStop && s.v < 0.1 && s.w < 0.3) tStop = (i + 1) * DT;
    if (tStop && (s.v > 0.3 || s.w > 1)) tStop = 0;
  }
  const p1 = m.body.translation(), q = m.body.rotation();
  const tilt = Math.acos(Math.min(1, 1 - 2 * (q.x * q.x + q.z * q.z))) * 180 / Math.PI;
  check('post was hit', hit ? 1 : 0, 1, 1);
  check('post knocked over (tilt deg)', tilt, 45, 180, '°');
  check('time until it stops after the hit (s)', tStop || 99, 0, 3.5, ' s');
  check('distance it ends up from home (m)', Math.hypot(p1.x - p0.x, p1.z - p0.z), 0.5, 20, ' m');
}

console.log('\n# untouched posts stay standing');
{
  let fallen = 0;
  for (const m of markers().slice(20, 60)) { const q = m.body.rotation(); if (1 - 2 * (q.x * q.x + q.z * q.z) < 0.9) fallen++; }
  check('untouched posts down', fallen, 0, 0);
}

const fails = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - fails}/${results.length} passed`);
process.exit(fails ? 1 : 0);
