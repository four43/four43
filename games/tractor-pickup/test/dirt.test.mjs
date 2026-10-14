import test from 'node:test';
import assert from 'node:assert/strict';
import { stepRiderDirt } from '../src/sim/dirt.js';
import MATERIALS, { DIRT_RATES } from '../src/defs/materials.js';
import { POWER } from '../src/sim/tractor.js';
const run = (fn, sec, l = 0) => { for (let i = 0; i < sec * 60; i++) l = fn(l); return l; };

test('riders get splashed in mud only while moving, and washed too', () => {
  assert.equal(run(l => stepRiderDirt(l, { carInMud: true, speed: 0.2, washing: false }, 1 / 60), 3), 0);
  assert.ok(run(l => stepRiderDirt(l, { carInMud: true, speed: 4, washing: false }, 1 / 60), 3) > 0.9);
  assert.equal(run(l => stepRiderDirt(l, { carInMud: false, speed: 4, washing: true }, 1 / 60), 2, 1), 0);
});

// In the game: mud dirties and squelches, the sprinkler washes the tractor and both cars and says so once.
import { testGame } from './helpers/world.mjs';
import { WASH } from '../src/sim/track.js';
import { moveTrain as moveTrainBy } from './train.mjs';
const GO = { thr: 1, steer: 0, horn: false };
const moveTrain = (g, x, z, yaw) => moveTrainBy(g, x, z, yaw, { ground: true });
const feature = (g, type) => { for (const [r, R] of g.farm.routes.entries()) for (const [k, t] of R.tiles.entries()) if (t.type === type) return g.road.featureCenter(r, k); };
const approach = (g, c, back) => { moveTrain(g, c.x - Math.sin(c.yaw) * back, c.z - Math.cos(c.yaw) * back, c.yaw); for (let i = 0; i < 90; i++) g.step({ thr: 0, steer: 0, horn: false }); };

test('driving into mud sends one mud-enter and dirties the tractor and the cars', () => {
  const g = testGame({ seed: 1, power: 'medium' }); approach(g, feature(g, 'mud'), 18);
  const ev = []; for (let i = 0; i < 60 * 6; i++) ev.push(...g.step(GO));
  assert.equal(ev.filter(e => e.type === 'mud-enter').length, 1);
  assert.ok(g.dirt.tractor > 0.5, `${g.dirt.tractor}`);
  assert.ok(g.train.cars.every(c => c.dirt > 0.2), g.train.cars.map(c => c.dirt).join());
});
test('driving through the sprinkler washes the tractor and the cars (the gravel afterwards adds a little) and sends one washed event', () => {
  const g = testGame({ seed: 1, power: 'medium' }); approach(g, feature(g, 'sprinkler'), 14);
  g.dirt.tractor = 1; g.train.cars.forEach(c => { c.dirt = 1; });
  const ev = []; for (let i = 0; i < 60 * 9; i++) ev.push(...g.step(GO));
  assert.equal(ev.filter(e => e.type === 'washed').length, 1);
  assert.ok(g.dirt.tractor < 0.1 && g.train.cars.every(c => c.dirt < 0.1), `${g.dirt.tractor} ${g.train.cars.map(c => c.dirt)}`);
});
test('driving through the farmyard wash cleans the tractor and the cars, and its posts are solid (T-36)', () => {
  const g = testGame({ seed: 1, power: 'medium' }), w = g.farm.yard.wash, c = { x: w.x, z: w.z, yaw: w.yaw };
  approach(g, c, 16); g.dirt.tractor = 1; g.train.cars.forEach(car => { car.dirt = 1; });
  const ev = []; for (let i = 0; i < 60 * 6; i++) ev.push(...g.step(GO));
  assert.equal(ev.filter(e => e.type === 'washed').length, 1);
  assert.ok(g.dirt.tractor < 0.1 && g.train.cars.every(car => car.dirt < 0.1), `${g.dirt.tractor} ${g.train.cars.map(car => car.dirt)}`);
  const post = { x: w.x + Math.cos(w.yaw) * (WASH.width + 0.3), z: w.z - Math.sin(w.yaw) * (WASH.width + 0.3) }; // drive straight at a side post
  approach(g, { ...post, yaw: w.yaw }, 14 + WASH.half); for (let i = 0; i < 60 * 4; i++) g.step(GO);
  const t = g.tractor.body.translation(), l = { a: (t.x - w.x) * Math.sin(w.yaw) + (t.z - w.z) * Math.cos(w.yaw) };
  assert.ok(l.a < -WASH.half, `drove through a post (${l.a.toFixed(2)} m along)`);
});

// Task 13b: dirt per metre on the coverage kit (a feel change: playtest list)
test('per-metre rates equal the old per-second curve at Medium speeds (route, meadow) and at mud top speed', () => {
  const r = id => MATERIALS.get(id).dirtRate, v = POWER.medium.vmax;
  assert.equal(r('route'), DIRT_RATES.route);
  for (const s of [1, 4, 6.5, v]) { assert.ok(Math.abs(r('route') * s - 0.006 * Math.min(1, s / v)) < 1e-12, `route at ${s}`); assert.ok(Math.abs(r('meadow') * s - 0.004 * Math.min(1, s / v)) < 1e-12, `meadow at ${s}`); }
  assert.ok(Math.abs(r('mudhole') * v * 0.5 - 0.6) < 1e-12);
});
test('a Medium drive on the route dirties the tractor as the old per-second rule did over the same speeds (within 2 %)', () => {
  const g = testGame({ seed: 14 }), v = POWER.medium.vmax; let old = 0;
  g.step({ thr: 0, steer: 0, horn: false });
  for (let i = 0; i < 360; i++) { g.step({ thr: 1, steer: 0, horn: false }); if (g.tractor.surface === 'gravel' && !g.road.inSprinkler(g.tractor.x, g.tractor.z)) old += 0.006 * Math.min(1, g.tractor.speed / v) / 60; }
  assert.ok(old > 0.005, 'the drive stayed on gravel long enough to compare');
  assert.ok(Math.abs(g.dirt.tractor - old) <= old * 0.02, `kit ${g.dirt.tractor} vs old ${old}`);
});
