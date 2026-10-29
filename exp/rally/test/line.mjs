// Across the line flat out and still on the road (rally-spec R18-5): on loops of every style, the Impreza arrives at
// the line flat out (the autopilot driving from 250 m out, then the throttle pinned from the exit of the last corner
// before the line, where the flat-out profile last meets its corner limit, the autopilot steering), then the
// autopilot brakes (0.6 μg) for what follows. For the 300 m after it must stay on the road or its flat shoulder (EDGE.shoulder
// m past the edge: the test driver runs a little wide braking from ~180 km/h on the fastest loops), the right way up.
// Run: node test/line.mjs
import R from '@dimforge/rapier3d-compat';
import { benchSim } from './helpers/bench.mjs';
import { DT } from '../src/sim.js';
import { generateTrack } from '../src/gen/track.js';
import { TrackWorld, pointAt } from '../src/world/trackWorld.js';
import { heightAt } from '../src/gen/terrain.js';
import { edgeAt, EDGE } from '../src/gen/edges.js';
import { autopilot } from './autopilot.js';
import { qrot } from '../src/vehicle.js';
import { flatOut, FLAT } from '../src/gen/speed.js';
import { ROADSIDE } from '../src/gen/roadside.js';
await R.init();

const results = [];
function check(name, val, lo, hi) {
  const ok = Number.isFinite(val) && val >= lo && val <= hi;
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${Number.isFinite(val) ? val.toFixed(2) : val}  [${lo}..${hi}]`);
}
const LINE = ROADSIDE.gateS, BACK = 250, AFTER = 300, G = 9.81;

for (const style of [1, 2, 3, 4, 5]) for (const seed of ['t1', 't2']) {
  const track = generateTrack(seed, { kind: 'loop', style }), L = track.layout, v0 = flatOut(L, 0.8);
  const sim = benchSim({ world: new TrackWorld(track), car: 'impreza-555', assist: true }), car = sim.car;
  const s0 = L.length + LINE - BACK, p0 = pointAt(L, s0), p1 = pointAt(L, s0 + 1), yaw = Math.atan2(p1.x - p0.x, p1.z - p0.z);
  const v = 0.8 * v0[Math.round(s0) % L.n];
  let exit = BACK; // run (m from s0) where the last corner before the line lets go
  for (let k = 0; k < BACK; k++) {
    const i = Math.round(s0 + k) % L.n;
    if (v0[i] >= Math.sqrt(FLAT.lat * 0.8 * G / Math.max(Math.abs(L.curvature[i]), 1e-6)) - 0.01) exit = k;
  }
  if (exit === BACK) exit = 0;
  car.reset({ x: p0.x, y: heightAt(track.terrain, p0.x, p0.z) + car.cfg.comHeight + 0.1, z: p0.z }, yaw);
  car.body.setLinvel({ x: Math.sin(yaw) * v, y: 0, z: Math.cos(yaw) * v }, true);
  for (const w of car.wheels) w.omega = v / car.cfg.radius;
  let crossed = null, worst = -Infinity, run = 0, prev = s0, over = false;
  for (let i = 0; i < 60 / DT && run < BACK + AFTER; i++) {
    if (i % 4 === 0) {
      const a = autopilot(sim, track, { brake: 0.6, caps: {} }), pin = run > exit && run < BACK;
      Object.assign(car.input, { steer: a.steer, throttle: pin ? 1 : a.throttle, brake: pin ? 0 : a.brake, handbrake: 0 });
    }
    sim.step();
    const p = car.body.translation(), l = track.locator.locate(p.x, p.z);
    run += ((l.s - prev) % L.length + L.length + L.length / 2) % L.length - L.length / 2; prev = l.s;
    if (crossed === null && run >= BACK) crossed = car.speed * 3.6;
    if (run >= BACK) worst = Math.max(worst, Math.abs(l.d) - edgeAt(track.edges, L, l.s, l.d));
    if (qrot(car.body.rotation(), { x: 0, y: 1, z: 0 }).y < 0.3) over = true;
  }
  console.log(`\n# style ${style} ${seed}: flat-out at the line ${(v0[LINE] * 3.6).toFixed(0)} km/h, pinned for the last ${BACK - exit} m`);
  check('crossed the line (km/h)', crossed ?? NaN, 0.8 * v0[LINE] * 3.6, 1e9);
  check(`furthest past the road's edge in the ${AFTER} m after (m)`, worst, -9, EDGE.shoulder);
  check('upside down', +over, 0, 0);
}

const passed = results.filter(r => r.ok).length;
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
