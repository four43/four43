// Off-road verge (spec tracks T-3, T-5): tall-grass drag and the bumpy ground away from the road.
// Run: node test/verge.mjs [filter]
import R from '@dimforge/rapier3d-compat';
import { Sim, DT, PAD } from '../src/sim.js';
import { qrot } from '../src/vehicle.js';
import { SURFACES } from '../src/tire.js';
import { generateTrack } from '../src/gen/track.js';
import { heightAt } from '../src/gen/terrain.js';
import { TrackWorld } from '../src/world/trackWorld.js';
await R.init();

const only = process.argv[2];
const results = [];
function check(name, val, lo, hi, unit = '') {
  const ok = val >= lo && val <= hi;
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${val.toFixed(3)}${unit}  [${lo}..${hi}]`);
  return ok;
}
const test = (name, f) => { if (!only || name.includes(only)) { console.log(`\n# ${name}`); f(); } };
const run = (sim, secs, fn) => { const n = Math.round(secs / DT); for (let i = 0; i < n; i++) { fn && fn(sim, i * DT); sim.step(); } };
const pad = (surface) => new Sim(R, { car: 'awd', surface, cones: false, assist: true, pad: { ...PAD, size: 4000 }, pos: { x: 300, y: 0.6, z: -900 } });
// Roll the car at v m/s along its heading (wheels spinning to match), in the lowest gear that
// keeps the engine under 75 % of the redline (as if it had driven up to v).
const roll = (sim, v) => {
  const c = sim.car, f = qrot(c.body.rotation(), { x: 0, y: 0, z: 1 }), dc = c.cfg.drive, wo = v / c.cfg.radius;
  c.body.setLinvel({ x: f.x * v, y: 0, z: f.z * v }, true);
  for (const w of c.wheels) w.omega = wo;
  let g = 1;
  while (g < dc.gears.length && wo * dc.gears[g - 1] * dc.final * 60 / (2 * Math.PI) > 0.75 * dc.redline) g++;
  c.dt.gear = g; c.dt.we = wo * dc.gears[g - 1] * dc.final;
};
const topSpeed = (surface) => {
  const sim = pad(surface);
  run(sim, 1);
  let top = 0;
  run(sim, 30, (s) => { s.car.input.throttle = 1; top = Math.max(top, s.car.speed * 3.6); });
  return top;
};
// Average deceleration (g) over the first 2 s of coasting from 80 km/h.
const coast = (surface) => {
  const sim = pad(surface);
  run(sim, 1); roll(sim, 80 / 3.6);
  const v0 = sim.car.speed;
  run(sim, 2, (s) => { s.car.input.throttle = 0; });
  return (v0 - sim.car.speed) / 2 / 9.81;
};

test('surface drag table', () => {
  for (const k of ['tarmac', 'hardpack', 'gravel', 'packed', 'ice']) check(`${k} drag`, SURFACES[k].drag, 0, 0);
  check('grass drag', SURFACES.grass.drag, 0.05, 0.3);
  check('snowbank drag', SURFACES.snowbank.drag, 0.05, 0.3);
});

test('awd flat out on grass', () => {
  const grass = topSpeed('grass'), gravel = topSpeed('gravel');
  console.log(`  30 s full throttle: grass ${grass.toFixed(1)} km/h, gravel ${gravel.toFixed(1)} km/h`);
  check('grass top speed (km/h)', grass, 70, 100, ' km/h');
  check('gravel top speed unaffected (km/h)', gravel, 150, 250, ' km/h');
});

test('awd coasting on grass from 80 km/h', () => {
  const grass = coast('grass'), gravel = coast('gravel'), tarmac = coast('tarmac');
  console.log(`  first 2 s, throttle off: grass ${grass.toFixed(3)} g, gravel ${gravel.toFixed(3)} g, tarmac ${tarmac.toFixed(3)} g`);
  check('grass decel (g)', grass, 0.3, 0.75, ' g');
  // Gravel/tarmac: just engine braking, rolling resistance and aero.
  check('gravel decel stays light (g)', gravel, 0, 0.18, ' g');
  check('tarmac decel stays light (g)', tarmac, 0, 0.18, ' g');
  check('grass - gravel decel (g)', grass - gravel, 0.2, 1, ' g');
});

test('awd parked on grass does not creep', () => {
  const sim = pad('grass');
  run(sim, 3);
  const v = sim.car.body.linvel();
  check('speed at rest (m/s)', Math.hypot(v.x, v.z), 0, 0.01, ' m/s');
});

// Generated loop: leave the road square to the left at 60 km/h into the bumpy grass, once lifting
// off and once at half throttle (which holds well over 60 km/h on gravel).
test('off the road into the grass', () => {
  const track = generateTrack('v1', { kind: 'loop', theme: 'summer' });
  const world = new TrackWorld(track), L = track.layout, loc = track.locator, T = track.terrain;
  const sim = new Sim(R, { world, car: 'awd', assist: true });
  // Spots where the 80 m run to the left is all verge (no other road) and roughly level.
  const spots = [];
  for (let i = 0; i < L.n && spots.length < 4; i += 37) {
    const h = L.heading[i], ux = Math.cos(h), uz = -Math.sin(h); // left normal
    let ok = true; // the road stays behind: nothing nearer than the way back (or 25 m)
    for (let d = 4; d <= 80 && ok; d += 4) if (Math.abs(loc.locate(L.x[i] + ux * d, L.z[i] + uz * d).d) < Math.min(d, 25) - 1) ok = false;
    const rise = heightAt(T, L.x[i] + ux * 60, L.z[i] + uz * 60) - T.road[i];
    if (ok && Math.abs(rise) < 3 && (!spots.length || i - spots[spots.length - 1] > 300)) spots.push(i);
  }
  check('level verge spots found', spots.length, 3, 4);
  const drive = (i, thr) => {
    sim.car.reset({ x: L.x[i], y: T.road[i] + 0.6, z: L.z[i] }, L.heading[i] + Math.PI / 2); // heading +90° = left
    run(sim, 0.5);
    roll(sim, 60 / 3.6);
    let minUp = 1, at35 = null, v4 = 0;
    run(sim, 4, (s, t) => {
      const c = s.car;
      c.input.throttle = thr; c.input.steer = 0; c.input.brake = 0;
      minUp = Math.min(minUp, qrot(c.body.rotation(), { x: 0, y: 1, z: 0 }).y);
      if (at35 === null && c.speed * 3.6 < 35) at35 = t;
      v4 = c.speed * 3.6;
    });
    const p = sim.car.body.translation();
    console.log(`  sample ${i} throttle ${thr}: < 35 km/h after ${at35 === null ? '-' : at35.toFixed(2) + ' s'}, ${v4.toFixed(1)} km/h at 4 s, ${Math.abs(loc.locate(p.x, p.z).d).toFixed(1)} m out, min up.y ${minUp.toFixed(3)}`);
    return { at35, v4, minUp };
  };
  for (const i of spots) {
    const off = drive(i, 0), half = drive(i, 0.5);
    check(`sample ${i}: lifting off, time to slow under 35 km/h (s)`, off.at35 ?? Infinity, 0, 4, ' s');
    check(`sample ${i}: half throttle, speed after 4 s (km/h)`, half.v4, -5, 55, ' km/h');
    check(`sample ${i}: stays upright over the bumps (min up.y)`, Math.min(off.minUp, half.minUp), 0.5, 1);
  }
});

const fails = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - fails}/${results.length} passed`);
process.exit(fails ? 1 : 0);
