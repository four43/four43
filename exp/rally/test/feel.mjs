// Feel sample for golden re-blessing (lion-hawk overview §5.5): stage times on three seeds through the engine path with
// the autopilot, and the verge speed samples. Prints JSON; with --check <file> compares against that record using the
// tolerances the 3j plan fixed before any physics swap (times ±3 %; speeds ±3 % or ±1 km/h; decelerations ±3 % or
// ±0.01 g) and exits 1 outside them. Run: node test/feel.mjs [--check test/feel-baseline.json]
import fs from 'node:fs';
import R from '@dimforge/rapier3d-compat';
import { headless } from 'lion-hawk/test';
import { DT, PAD } from '../src/sim.js';
import { benchSim, game } from './helpers/bench.mjs';
import { qrot } from '../src/vehicle.js';
import { engage } from '../src/drivetrain.js';
import { generateTrack } from '../src/gen/track.js';
import { heightAt } from '../src/gen/terrain.js';
import { TrackWorld } from '../src/world/trackWorld.js';
await R.init();

function stageTime(seed) {
  const h = headless(game(), { seed: 7, args: { settings: { mode: 'stage', world: 'stage', seed, theme: 'summer', assist: true } } });
  h.tap('title.drive');
  let fin = null;
  const off = h.engine.events.on(e => { if (e.type === 'finish') fin = e.time; });
  for (let i = 0; i < 600 / DT && fin === null; i++) h.step(1, 'autopilot');
  off?.();
  if (fin === null) throw new Error(`feel: stage ${seed} never finished`);
  return fin;
}
const run = (sim, secs, fn) => { const n = Math.round(secs / DT); for (let i = 0; i < n; i++) { fn?.(sim, i * DT); sim.step(); } };
const pad = surface => benchSim({ car: 'awd', surface, cones: false, assist: true, pad: { ...PAD, size: 4000 }, pos: { x: 300, y: 0.6, z: -900 } });
const roll = (sim, v) => { // as test/verge.mjs: rolling at v m/s in the lowest gear under 75 % of the redline
  const c = sim.car, f = qrot(c.body.rotation(), { x: 0, y: 0, z: 1 }), dc = c.cfg.drive, wo = v / c.cfg.radius;
  c.body.setLinvel({ x: f.x * v, y: 0, z: f.z * v }, true);
  for (const w of c.wheels) w.omega = wo;
  let g = 1;
  while (g < dc.gears.length && wo * dc.gears[g - 1] * dc.final * 60 / (2 * Math.PI) > 0.75 * c.redline) g++;
  engage(c.pt, g, wo * dc.gears[g - 1] * dc.final * 60 / (2 * Math.PI));
};
const topSpeed = surface => { const sim = pad(surface); run(sim, 1); let top = 0; run(sim, 30, s => { s.car.input.throttle = 1; top = Math.max(top, s.car.speed * 3.6); }); return top; };
const coast = surface => { const sim = pad(surface); run(sim, 1); roll(sim, 80 / 3.6); const v0 = sim.car.speed; run(sim, 2, s => { s.car.input.throttle = 0; }); return (v0 - sim.car.speed) / 2 / 9.81; };
function offRoad() { // test/verge.mjs 'off the road into the grass', half throttle: km/h after 4 s per spot
  const track = generateTrack('v1', { kind: 'loop', theme: 'summer' });
  const world = new TrackWorld(track), L = track.layout, loc = track.locator, T = track.terrain;
  const sim = benchSim({ world, car: 'awd', assist: true }), spots = [];
  for (let i = 0; i < L.n && spots.length < 4; i += 37) {
    const h = L.heading[i], ux = Math.cos(h), uz = -Math.sin(h);
    let ok = true;
    for (let d = 4; d <= 80 && ok; d += 4) if (Math.abs(loc.locate(L.x[i] + ux * d, L.z[i] + uz * d).d) < Math.min(d, 25) - 1) ok = false;
    const rise = heightAt(T, L.x[i] + ux * 60, L.z[i] + uz * 60) - T.road[i];
    if (ok && Math.abs(rise) < 3 && (!spots.length || i - spots[spots.length - 1] > 300)) spots.push(i);
  }
  return spots.map(i => {
    sim.car.reset({ x: L.x[i], y: T.road[i] + 0.6, z: L.z[i] }, L.heading[i] + Math.PI / 2);
    run(sim, 0.5); roll(sim, 60 / 3.6);
    let v4 = 0;
    run(sim, 4, s => { const c = s.car; c.input.throttle = 0.5; c.input.steer = 0; c.input.brake = 0; v4 = c.speed * 3.6; });
    return v4;
  });
}
const sample = {
  stage: Object.fromEntries(['t1', 't2', 't3'].map(s => [s, stageTime(s)])),
  verge: { grassTop: topSpeed('grass'), gravelTop: topSpeed('gravel'), grassCoast: coast('grass'), gravelCoast: coast('gravel'), offRoad: offRoad() },
};
console.log(JSON.stringify(sample, null, 1));
const i = process.argv.indexOf('--check');
if (i > 0) {
  const base = JSON.parse(fs.readFileSync(process.argv[i + 1], 'utf8')), bad = [];
  const within = (name, a, b, rel, abs) => { const tol = Math.max(Math.abs(b) * rel, abs); if (!(Math.abs(a - b) <= tol)) bad.push(`${name}: ${a.toFixed(3)} vs ${b.toFixed(3)} (±${tol.toFixed(3)})`); };
  for (const k of Object.keys(base.stage)) within(`stage ${k} (s)`, sample.stage[k], base.stage[k], 0.03, 0);
  within('grass top (km/h)', sample.verge.grassTop, base.verge.grassTop, 0.03, 1);
  within('gravel top (km/h)', sample.verge.gravelTop, base.verge.gravelTop, 0.03, 1);
  within('grass coast (g)', sample.verge.grassCoast, base.verge.grassCoast, 0.03, 0.01);
  within('gravel coast (g)', sample.verge.gravelCoast, base.verge.gravelCoast, 0.03, 0.01);
  if (sample.verge.offRoad.length !== base.verge.offRoad.length) bad.push(`offRoad spots: ${sample.verge.offRoad.length} vs ${base.verge.offRoad.length}`);
  else base.verge.offRoad.forEach((b, k) => within(`off-road spot ${k} (km/h)`, sample.verge.offRoad[k], b, 0.03, 1));
  if (bad.length) { console.error('feel: outside tolerance\n  ' + bad.join('\n  ')); process.exit(1); }
  console.error('feel: within tolerance');
}
