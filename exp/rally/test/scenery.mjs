// Off-track scenery (rally-spec R19): placement keeps its clearances, is the same for the same seed, and the car stops at a
// tree, rides into a rock and smashes through a fence. Run: node test/scenery.mjs
import R from '@dimforge/rapier3d-compat';
import { benchSim } from './helpers/bench.mjs';
import { DT } from '../src/sim.js';
import { generateTrack } from '../src/gen/track.js';
import { edgeAt } from '../src/gen/edges.js';
import { SCENERY } from '../src/gen/scenery.js';
import { TrackWorld } from '../src/world/trackWorld.js';
await R.init();

const results = [];
function check(name, val, lo, hi, unit = '') {
  const ok = val >= lo && val <= hi;
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${val.toFixed(3)}${unit}  [${lo}..${hi}]`);
}

console.log('\n# placement');
for (const [seed, kind, theme] of [['t1', 'loop', 'summer'], ['t2', 'stage', 'winter'], ['t3', 'loop', 'summer']]) {
  const t = generateTrack(seed, { kind, theme }), S = t.scenery, L = t.layout;
  // Past the edge: the locator's across distance, or on a stage past its ends, the distance to the end sample.
  const past = (o) => {
    const { s, d } = t.locator.locate(o.x, o.z), e = edgeAt(t.edges, L, s, d);
    if (!L.closed && (s <= 0.5 || s >= L.length - 0.5)) { const i = s <= 0.5 ? 0 : L.n - 1; return Math.hypot(o.x - L.x[i], o.z - L.z[i]) - e; }
    return Math.abs(d) - e;
  };
  check(`${seed} ${kind} ${theme}: trees`, S.trees.length, 500, 40000);
  check(`${seed}: closest trunk past the edge (m)`, Math.min(...S.trees.map(past)), SCENERY.clear.tree - 0.01, 99, ' m');
  check(`${seed}: closest rock past the edge (m)`, Math.min(...S.rocks.map(past)), SCENERY.clear.rock - 0.01, 99, ' m');
  if (S.bushes.length) check(`${seed}: closest bush past the edge (m)`, Math.min(...S.bushes.map(past)), SCENERY.clear.bush - 0.01, 99, ' m');
  const posts = S.fences.flatMap((r) => r.sections);
  if (posts.length) check(`${seed}: closest fence past the edge (m)`, Math.min(...posts.map(past)), SCENERY.fence.off[0] - 1.5, 99, ' m');
  check(`${seed}: winter has only pines`, theme === 'winter' ? S.trees.filter((x) => x.kind !== 'pine').length + S.bushes.length : 0, 0, 0);
  const again = generateTrack(seed, { kind, theme }).scenery;
  check(`${seed}: same seed, same scenery`, JSON.stringify(again) === JSON.stringify(S) ? 1 : 0, 1, 1);
}

const track = generateTrack('t1', { kind: 'loop' });
const world = new TrackWorld(track), sim = benchSim({ world, car: 'impreza-555', assist: true }), car = sim.car;
const speed = () => { const v = car.body.linvel(); return Math.hypot(v.x, v.z); };
// Aim the car at (x, z) from `back` m away at v m/s, coasting.
function launch(x, z, y, back, v) {
  const dx = x - track.spawn.x, dz = z - track.spawn.z, h = Math.atan2(dx, dz);
  car.reset({ x: x - Math.sin(h) * back, y: y + 0.6, z: z - Math.cos(h) * back }, h);
  car.body.setLinvel({ x: Math.sin(h) * v, y: 0, z: Math.cos(h) * v }, true);
  for (const w of car.wheels) w.omega = v / car.cfg.radius;
  return h;
}
const clearPath = (o, back, list) => list.every((q) => q === o || Math.hypot(q.x - o.x, q.z - o.z) > back + 4);

console.log('\n# the car hits a tree at 72 km/h');
{
  const all = [...track.scenery.trees, ...track.scenery.rocks];
  const tree = track.scenery.trees.find((t) => t.scale > 1 && clearPath(t, 15, all));
  launch(tree.x, tree.z, tree.y, 15, 20);
  let minV = 99, t = 0;
  for (let i = 0; i < 240 * 2; i++) { car.input.throttle = 0; car.input.brake = 0; sim.step(); if (speed() < minV) { minV = speed(); t = (i + 1) * DT; } }
  const p = car.e.xf.p, beyond = (p.x - tree.x) * Math.sin(Math.atan2(tree.x - track.spawn.x, tree.z - track.spawn.z)) + (p.z - tree.z) * Math.cos(Math.atan2(tree.x - track.spawn.x, tree.z - track.spawn.z));
  check('slowest speed after the hit (m/s)', minV, 0, 6, ' m/s');
  check('the car is not through the trunk (m past it)', beyond, -10, 0.5, ' m');
}

console.log('\n# the car smashes through a fence at 72 km/h');
{
  const fences = world.props.filter((p) => p.kind === 'fence'), f = fences[Math.floor(fences.length / 2)];
  const h = Math.atan2(f.home.q[1], f.home.q[3]) * 2, side = h + Math.PI / 2; // run across the section
  car.reset({ x: f.home.x - Math.sin(side) * 15, y: f.home.y + 0.6, z: f.home.z - Math.cos(side) * 15 }, side);
  car.body.setLinvel({ x: Math.sin(side) * 20, y: 0, z: Math.cos(side) * 20 }, true);
  for (const w of car.wheels) w.omega = 20 / car.cfg.radius;
  for (let i = 0; i < 240 * 1.5; i++) { car.input.throttle = 0; car.input.brake = 0; sim.step(); }
  const p = f.e.xf.p;
  check('section knocked from its place (m)', Math.hypot(p.x - f.home.x, p.z - f.home.z), 0.5, 40, ' m');
  check('the car keeps going (m/s)', speed(), 8, 25, ' m/s');
  const still = fences.filter((q) => q !== f && Math.abs(fences.indexOf(q) - fences.indexOf(f)) > 3);
  let moved = 0; for (const q of still) if (Math.hypot(q.e.xf.p.x - q.home.x, q.e.xf.p.z - q.home.z) > 0.05) moved++;
  check('sections far from the hit untouched', moved, 0, 0);
}

console.log('\n# reset puts the fences back');
{
  world.resetProps();
  sim.step();
  const off = world.props.filter((p) => p.kind === 'fence').filter((p) => Math.hypot(p.e.xf.p.x - p.home.x, p.e.xf.p.z - p.home.z) > 0.05).length;
  check('sections away from home after reset', off, 0, 0);
}

const fails = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - fails}/${results.length} passed`);
process.exit(fails ? 1 : 0);
