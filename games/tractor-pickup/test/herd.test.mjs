import test from 'node:test';
import assert from 'node:assert/strict';
import { createHerd, MAIN_TYPES } from '../src/sim/herd.js';
import { makeRng } from '../src/sim/rng.js';

// A straight east-west route along z = 0 (walkable |z| <= 6.5), a 60 m farmyard at the center with a pond and the barn.
const env = {
  bounds: 190,
  roadNearest: (x, z) => ({ d: Math.abs(z), pt: { x, z: 0, tx: 1, tz: 0 } }),
  roadAhead: (x, z, yaw, dist) => ({ x: x + Math.sin(yaw) * dist, z: 0 }),
  routePoint: r => ({ x: (r.chance(0.5) ? 1 : -1) * r.range(40, 180), z: r.range(-5, 5) }),
  mudSpots: [{ x: -150, z: 0 }, { x: -90, z: 0 }, { x: 60, z: 0 }, { x: 120, z: 0 }], pond: { x: -20, z: -20, r: 5 }, hideSpots: [{ x: 50, z: 8.5 }, { x: -50, z: -8.5 }],
  yard: { half: 30, randomPoint: r => ({ x: r.range(-25, 25), z: r.range(-25, -8) }) },
  barn: { x: 0, z: 0 },
};
const far = { x: 500, z: 500, yaw: 0, speed: 0 };
const run = (h, sec, tractor = far) => { for (let i = 0; i < sec * 60; i++) h.step(1 / 60, { tractor }); };

test('spawns route and yard animals, every main type, a hen with two chicks, at most one golden', () => {
  const h = createHerd({ rng: makeRng(1), env, count: 18, yardCount: 3 });
  assert.equal(h.animals.length, 21);
  assert.equal(h.animals.filter(a => a.home === 'yard').length, 3);
  for (const t of MAIN_TYPES) assert.ok(h.animals.some(a => a.type === t), t);
  assert.ok(h.animals.some(a => a.type === 'duck' && Math.hypot(a.x - env.pond.x, a.z - env.pond.z) < env.pond.r + 3), 'duck at the pond');
  assert.equal(h.animals.filter(a => a.type === 'chick').length, 2);
  assert.ok(h.animals.filter(a => a.golden).length <= 1);
  assert.equal(h.animals.filter(a => a.hidden).length, 2);
  for (const a of h.animals.filter(a => a.home === 'route')) { assert.ok(Math.abs(a.x) > 30 || Math.abs(a.z) > 30, 'route animal spawned in the yard'); if (!a.hidden) assert.ok(Math.abs(a.z) <= 6.5, 'route animal off the road'); }
});
test('animals stay inside the farm and mosey; yard animals stay in the yard (A-9, A-15)', () => {
  const h = createHerd({ rng: makeRng(2), env }), x0 = h.animals.map(a => [a.x, a.z]);
  run(h, 300);
  for (const a of h.animals.filter(a => a.home === 'route' && !a.hidden)) assert.ok(Math.abs(a.z) <= 6.5 + 1e-6 || (Math.abs(a.x) < 30 && Math.abs(a.z) < 30), `route animal left the road: ${a.x},${a.z}`);
  for (const a of h.animals.filter(a => a.home === 'yard')) assert.ok(Math.abs(a.x) < 30 && Math.abs(a.z) < 30, 'yard animal left the yard');
  const moved = h.animals.filter((a, i) => !a.hidden && Math.hypot(a.x - x0[i][0], a.z - x0[i][1]) > 3).length;
  assert.ok(moved >= 14, `moved ${moved}`);
});
test('flee types run off slowly from the tractor (A-10)', () => {
  const h = createHerd({ rng: makeRng(3), env }), s = h.animals.find(a => a.type === 'sheep' && !a.hidden && a.home === 'route');
  s.z = 0; let maxV = 0; const t = { x: s.x - 4, z: s.z, yaw: Math.PI / 2, speed: 5 };
  for (let i = 0; i < 120; i++) { const px = s.x, pz = s.z; h.step(1 / 60, { tractor: t }); maxV = Math.max(maxV, Math.hypot(s.x - px, s.z - pz) * 60); }
  assert.ok(s.x > t.x + 4, 'did not move away'); assert.ok(maxV < 3, `too fast ${maxV}`); // the tractor is always faster (6+ m/s)
  assert.ok(Math.abs(s.z) <= 6.5 + 1e-6, 'fled off the road');
});
test('horn: everyone looks; come types walk toward the tractor (A-11)', () => {
  const h = createHerd({ rng: makeRng(4), env }), t = { x: 40, z: 0, yaw: 0, speed: 0 };
  const cows = h.animals.filter(a => !a.hidden && (a.type === 'cow' || a.type === 'dog' || a.type === 'pig'));
  const d0 = cows.map(a => Math.hypot(a.x - t.x, a.z - t.z));
  h.horn(t); assert.ok(h.free().filter(a => !a.hidden).every(a => a.lookT > 0));
  run(h, 5, t);
  cows.forEach((a, i) => { if (d0[i] < 25 && d0[i] > 8) assert.ok(Math.hypot(a.x - t.x, a.z - t.z) < d0[i], `${a.type} did not come`); });
});
test('chicks follow their hen in a line (A-12)', () => {
  const h = createHerd({ rng: makeRng(5), env }); run(h, 60);
  const hen = h.animals.find(a => h.animals.some(c => c.leader === a.id));
  for (const c of h.animals.filter(c => c.leader === hen.id)) assert.ok(Math.hypot(c.x - hen.x, c.z - hen.z) < 3.5);
});
test('pigs find the mud and get dirty (A-14)', () => {
  const h = createHerd({ rng: makeRng(6), env }); run(h, 180);
  assert.ok(h.animals.some(a => a.type === 'pig' && a.dirt > 0.9));
});
test('help call brings the nearest free animal onto the road ahead (F-4)', () => {
  const h = createHerd({ rng: makeRng(7), env }), t = { x: 50, z: 0, yaw: Math.PI / 2, speed: 0 };
  const a = h.callHelp(t); assert.ok(a);
  for (let i = 0; i < 20 * 60 && a.state !== 'wave'; i++) h.step(1 / 60, { tractor: t });
  assert.equal(a.state, 'wave'); assert.ok(Math.hypot(a.x - 65, a.z) < 3, `at ${a.x},${a.z}`);
});
test('delivered animals walk into the barn and are gone; they are never free again (A-16, F-10)', () => {
  const h = createHerd({ rng: makeRng(8), env }), list = h.free().slice(0, 5);
  list.forEach(a => { a.state = 'show'; a.x = 14; a.z = 9; });
  h.toBarn(list); assert.ok(list.every(a => a.state === 'toBarn' && !h.free().includes(a)));
  run(h, 30);
  for (const a of list) assert.equal(a.state, 'gone');
});
test('respawn refills the route and yard counts along the routes (G-3)', () => {
  const h = createHerd({ rng: makeRng(9), env }), list = h.free().filter(a => a.home === 'route').slice(0, 6).concat(h.free().filter(a => a.home === 'yard').slice(0, 1));
  h.toBarn(list); h.respawn();
  assert.equal(h.free().filter(a => a.home === 'route').length, 18); assert.equal(h.free().filter(a => a.home === 'yard').length, 3);
  assert.ok(h.free().filter(a => a.golden).length <= 1);
  for (const a of h.free().filter(a => a.home === 'route' && !a.hidden).slice(-6)) assert.ok(Math.abs(a.x) > 30, 'respawned on a route, not in the yard');
});
