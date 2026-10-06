import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { createGame, CAPACITY } from '../src/sim/game.js';
import { quatAxes } from '../src/sim/tractor.js';
await RAPIER.init();

const STILL = { thr: 0, steer: 0, horn: false };
// Farmyard animals wander near the start; send them away so only the animals a test places get booped.
const quiet = g => g.herd.animals.filter(a => a.home === 'yard').forEach(a => { a.state = 'gone'; });
// Single animals only: no chicks and no hen leading a chick line (a boop on those launches the whole line).
const pickable = g => g.herd.free().filter(x => !x.hidden && x.type !== 'chick' && !g.herd.animals.some(c => c.leader === x.id));
const unhide = g => g.herd.animals.forEach(a => { if (a.hidden) { a.hidden = false; a.state = 'idle'; } });
const place = (g, a) => { const p = g.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); a.x = p.x; a.z = p.z; a.state = 'idle'; a.timer = 99; for (let i = 0; i < 90; i++) g.step(STILL); };
// Move the whole (straight, parked) train so the tractor stands at (x, z) facing yaw; the cars keep their offsets in the tractor frame.
const moveTrain = (g, x, z, yaw) => {
  const tb = g.tractor.body, p0 = tb.translation(), a = yaw - Math.PI / 2, q = { x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) }, { f, u, r } = quatAxes(q);
  const list = [tb, ...g.train.cars.map(c => c.body)].map(b => { const t = b.translation(); return [b, g.tractorLocal(t.x, t.y, t.z, {})]; });
  for (const [b, l] of list) {
    b.setTranslation({ x: x + f.x * l.x + u.x * l.y + r.x * l.z, y: p0.y + f.y * l.x + u.y * l.y + r.y * l.z, z: z + f.z * l.x + u.z * l.y + r.z * l.z }, true);
    b.setRotation(q, true); b.setLinvel({ x: 0, y: 0, z: 0 }, true); b.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }
};

test('an animal in the catch zone is booped, flies, and lands in slot 0', () => {
  const g = createGame(RAPIER, { seed: 11, power: 'medium' }); quiet(g);
  for (let i = 0; i < 60; i++) g.step(STILL);
  const a = pickable(g)[0], p = g.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); a.x = p.x; a.z = p.z; a.state = 'idle'; a.timer = 99;
  const ev = []; for (let i = 0; i < 120; i++) ev.push(...g.step(STILL));
  assert.ok(ev.some(e => e.type === 'boop' && e.animal === a));
  const land = ev.find(e => e.type === 'land'); assert.ok(land); assert.equal(land.slot.car, 0); assert.equal(land.n, 1);
  assert.equal(a.state, 'ride');
});
test('riders stay in their slot through a full-speed drive (R-4)', () => {
  const g = createGame(RAPIER, { seed: 12, power: 'high' }); quiet(g);
  for (let i = 0; i < 60; i++) g.step(STILL);
  for (const a of pickable(g).slice(0, 8)) place(g, a);
  assert.equal(g.load.landed(), 8);
  const w = {}; for (let i = 0; i < 60 * 15; i++) { g.step({ thr: 1, steer: Math.sin(i / 50), horn: false });
    for (const s of g.load.slots) { g.slotWorld(s, w); const pa = s.animal; assert.equal(pa.state, 'ride'); assert.ok(Math.hypot(pa.x - w.x, pa.z - w.z) < 0.6, 'animal left its slot'); } }
});
test('the trailer and wagon never over-fill (G-1)', () => {
  const g = createGame(RAPIER, { seed: 13, power: 'medium' }); quiet(g); unhide(g);
  for (let i = 0; i < 60; i++) g.step(STILL);
  const list = pickable(g); assert.ok(list.length >= 14, `only ${list.length} single animals`);
  for (const a of list.slice(0, 14)) place(g, a);
  assert.equal(g.load.landed(), CAPACITY); assert.equal(g.load.slots.length, CAPACITY);
  assert.deepEqual([0, 1].map(c => g.load.slots.filter(s => s.car === c).length), [6, 6]);
});
test('show hooks: riders in order, props reset, delivery into the barn, respawn and an empty trailer (F-5, F-10, G-3)', () => {
  const g = createGame(RAPIER, { seed: 14, power: 'medium' }); quiet(g);
  for (let i = 0; i < 60; i++) g.step(STILL);
  const placed = pickable(g).slice(0, 3); for (const a of placed) place(g, a);
  const prop = g.yardProps.props.find(p => p.body); prop.body.setTranslation({ x: prop.start.x + 5, y: prop.start.y, z: prop.start.z }, true);
  const riders = g.startShow();
  assert.equal(g.mode, 'show'); assert.deepEqual(riders.map(r => r.animal), placed);
  assert.ok(Math.abs(prop.body.translation().x - prop.start.x) < 1e-3);
  riders.forEach(r => { r.animal.state = 'show'; });
  g.finishShow(riders);
  assert.equal(g.mode, 'drive'); assert.equal(g.load.landed(), 0);
  for (const a of placed) assert.equal(a.state, 'toBarn');
  assert.equal(g.herd.free().filter(a => a.home === 'route').length, 18);
});
test('no boops and no driving during the show', () => {
  const g = createGame(RAPIER, { seed: 15, power: 'medium' }); quiet(g);
  for (let i = 0; i < 60; i++) g.step(STILL);
  g.startShow(); const a = pickable(g)[0], p = g.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); a.x = p.x; a.z = p.z; a.state = 'idle'; a.timer = 99;
  let booped = false; for (let i = 0; i < 120; i++) booped ||= g.step({ thr: 1, steer: 0, horn: false }).some(e => e.type === 'boop');
  assert.equal(booped, false); assert.ok(g.tractor.speed < 0.5);
});
test('the show resets broken trees (T-34)', () => {
  const g = createGame(RAPIER, { seed: 16, power: 'medium' }); quiet(g);
  const t = g.trees.list[0]; t.state = 'broken';
  g.startShow();
  assert.equal(t.state, 'growing');
});
test('driving into a hiding bush boops the animal hidden there (A-13)', () => {
  const g = createGame(RAPIER, { seed: 17, power: 'medium' }); quiet(g);
  for (let i = 0; i < 30; i++) g.step(STILL);
  const h = g.herd.animals.find(a => a.hidden && a.state === 'hide'); assert.ok(h, 'no hidden animal');
  // stand on the road 14 m before the bush, 1 m in from its line, facing along the road
  const n = g.road.nearest(h.x, h.z), sx = (h.x - n.pt.x) / n.d, sz = (h.z - n.pt.z) / n.d, off = n.d - 1;
  moveTrain(g, n.pt.x + sx * off - n.pt.tx * 14, n.pt.z + sz * off - n.pt.tz * 14, Math.atan2(n.pt.tx, n.pt.tz));
  for (let i = 0; i < 30; i++) g.step(STILL);
  const d0 = Math.hypot(g.tractor.body.translation().x - h.x, g.tractor.body.translation().z - h.z); assert.ok(d0 > 10, `started ${d0} m away`); assert.equal(h.hidden, true);
  let boop = null; for (let i = 0; i < 60 * 6 && !boop; i++) { const ev = g.step({ thr: 0.5, steer: 0, horn: false }); boop = ev.find(e => e.type === 'boop' && e.animal === h); if (boop) assert.equal(h.hidden, false); }
  assert.ok(boop, 'the hidden animal was not booped');
  assert.equal(h.state, 'fly');
});
test('flights keep their previous step position for render interpolation (X-1)', () => {
  const g = createGame(RAPIER, { seed: 18, power: 'medium' }); quiet(g);
  for (let i = 0; i < 60; i++) g.step(STILL);
  const a = pickable(g)[0], p = g.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); a.x = p.x; a.z = p.z; a.state = 'idle'; a.timer = 99;
  g.step(STILL); const fl = g.flights.find(f => f.animal === a); assert.ok(fl);
  for (let i = 0; i < 20; i++) { const before = { ...fl.pos }; g.step({ thr: 1, steer: 0, horn: false }); assert.deepEqual(fl.prev, before); }
  assert.ok(Math.hypot(fl.pos.x - fl.prev.x, fl.pos.y - fl.prev.y, fl.pos.z - fl.prev.z) > 0);
});
test('a boop always launches: no boop event without a launch (load full)', () => {
  const g = createGame(RAPIER, { seed: 19, power: 'medium' }); quiet(g); unhide(g);
  for (let i = 0; i < 60; i++) g.step(STILL);
  const ev = []; for (const a of pickable(g).slice(0, 14)) { const p = g.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); a.x = p.x; a.z = p.z; a.state = 'idle'; a.timer = 99; for (let i = 0; i < 90; i++) ev.push(...g.step(STILL)); }
  const boops = ev.filter(e => e.type === 'boop'), launches = ev.filter(e => e.type === 'launch');
  assert.equal(launches.length, CAPACITY); assert.ok(boops.length <= launches.length);
  for (const b of boops) assert.ok(launches.some(l => l.animal === b.animal || l.animal.leader === b.animal.id || b.animal.leader === l.animal.id));
});
