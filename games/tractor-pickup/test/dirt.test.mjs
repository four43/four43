import test from 'node:test';
import assert from 'node:assert/strict';
import { stepDirt, stepRiderDirt, DIRT } from '../src/sim/dirt.js';
const run = (fn, sec, l = 0) => { for (let i = 0; i < sec * 60; i++) l = fn(l); return l; };

test('gravel dirties slowly, a few trips to full', () => {
  const l = run(l => stepDirt(l, { surface: 'gravel', speedFrac: 1, washing: false }, 1 / 60), 60);
  assert.ok(l > 0.25 && l < 0.5, `${l}`);
});
test('mud dirties fast', () => {
  assert.ok(run(l => stepDirt(l, { surface: 'mud', speedFrac: 0.3, washing: false }, 1 / 60), 2) > 0.95);
});
test('parked tractor does not get dirtier on gravel', () => {
  assert.equal(run(l => stepDirt(l, { surface: 'gravel', speedFrac: 0, washing: false }, 1 / 60), 10, 0.2), 0.2);
});
test('the sprinkler cleans from full to zero in 1.5 s', () => {
  const l = run(l => stepDirt(l, { surface: 'gravel', speedFrac: 1, washing: true }, 1 / 60), DIRT.washTime + 0.02, 1);
  assert.equal(l, 0);
});
test('riders get splashed in mud only while moving, and washed too', () => {
  assert.equal(run(l => stepRiderDirt(l, { carInMud: true, speed: 0.2, washing: false }, 1 / 60), 3), 0);
  assert.ok(run(l => stepRiderDirt(l, { carInMud: true, speed: 4, washing: false }, 1 / 60), 3) > 0.9);
  assert.equal(run(l => stepRiderDirt(l, { carInMud: false, speed: 4, washing: true }, 1 / 60), 2, 1), 0);
});

// In the game: mud dirties and squelches, the sprinkler washes the tractor and both cars and says so once.
import RAPIER from '@dimforge/rapier3d-compat';
import { createGame } from '../src/sim/game.js';
import { quatAxes } from '../src/sim/tractor.js';
await RAPIER.init();
const GO = { thr: 1, steer: 0, horn: false };
const moveTrain = (g, x, z, yaw) => {
  const tb = g.tractor.body, p0 = tb.translation(), a = yaw - Math.PI / 2, q = { x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) }, { f, u, r } = quatAxes(q);
  const dy = g.terrain.height(x, z) - g.terrain.height(p0.x, p0.z) + 0.3;
  const list = [tb, ...g.train.cars.map(c => c.body)].map(b => { const t = b.translation(); return [b, g.tractorLocal(t.x, t.y, t.z, {})]; });
  for (const [b, l] of list) {
    b.setTranslation({ x: x + f.x * l.x + u.x * l.y + r.x * l.z, y: p0.y + dy + f.y * l.x + u.y * l.y + r.y * l.z, z: z + f.z * l.x + u.z * l.y + r.z * l.z }, true);
    b.setRotation(q, true); b.setLinvel({ x: 0, y: 0, z: 0 }, true); b.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }
};
const feature = (g, type) => { for (const [r, R] of g.farm.routes.entries()) for (const [k, t] of R.tiles.entries()) if (t.type === type) return g.road.featureCenter(r, k); };
const approach = (g, c, back) => { moveTrain(g, c.x - Math.sin(c.yaw) * back, c.z - Math.cos(c.yaw) * back, c.yaw); for (let i = 0; i < 90; i++) g.step({ thr: 0, steer: 0, horn: false }); };

test('driving into mud sends one mud-enter and dirties the tractor and the cars', () => {
  const g = createGame(RAPIER, { seed: 1, power: 'medium' }); approach(g, feature(g, 'mud'), 18);
  const ev = []; for (let i = 0; i < 60 * 6; i++) ev.push(...g.step(GO));
  assert.equal(ev.filter(e => e.type === 'mud-enter').length, 1);
  assert.ok(g.dirt.tractor > 0.5, `${g.dirt.tractor}`);
  assert.ok(g.train.cars.every(c => c.dirt > 0.2), g.train.cars.map(c => c.dirt).join());
});
test('driving through the sprinkler washes the tractor and the cars (the gravel afterwards adds a little) and sends one washed event', () => {
  const g = createGame(RAPIER, { seed: 1, power: 'medium' }); approach(g, feature(g, 'sprinkler'), 14);
  g.dirt.tractor = 1; g.train.cars.forEach(c => { c.dirt = 1; });
  const ev = []; for (let i = 0; i < 60 * 9; i++) ev.push(...g.step(GO));
  assert.equal(ev.filter(e => e.type === 'washed').length, 1);
  assert.ok(g.dirt.tractor < 0.1 && g.train.cars.every(c => c.dirt < 0.1), `${g.dirt.tractor} ${g.train.cars.map(c => c.dirt)}`);
});
