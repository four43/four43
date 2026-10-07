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

test('in the reward state the tractor is held: full throttle goes nowhere, a coasting tractor stops, and nothing is booped or broken', () => {
  const g = createGame(RAPIER, { seed: 11, power: 'medium' }); quiet(g);
  for (let i = 0; i < 60; i++) g.step(STILL);
  for (let i = 0; i < 150; i++) g.step({ thr: 1, steer: 0, horn: false }); // get up to speed, then the card comes up
  assert.ok(g.tractor.speed > 3, 'coasting at speed when the card appears');
  const trunk = g.trees.list[0], p0 = g.tractor.body.translation(); // a standing tree right in the path must not break while held
  trunk.x = p0.x + Math.sin(g.tractor.yaw) * 3; trunk.z = p0.z + Math.cos(g.tractor.yaw) * 3;
  g.mode = 'reward'; // main.js sets this while the sticker card is up (the trip's reward state)
  const a = pickable(g)[0], p = g.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); a.x = p.x; a.z = p.z; a.state = 'idle'; a.timer = 99;
  const ev = []; for (let i = 0; i < 240; i++) ev.push(...g.step({ thr: 1, steer: 0, horn: true }));
  assert.ok(g.tractor.speed < 0.3, 'the tractor is braked to a stop');
  assert.ok(!ev.some(e => e.type === 'boop' || e.type === 'horn' || e.type === 'barnPass' || e.type === 'treeBreak'));
  const x0 = g.tractor.x, z0 = g.tractor.z; g.mode = 'drive';
  for (let i = 0; i < 120; i++) g.step({ thr: 1, steer: 0, horn: false });
  assert.ok(Math.hypot(g.tractor.x - x0, g.tractor.z - z0) > 3, 'driving works again after the card');
});

test('tractorLocal is fresh outside a step (the per-step axes cache is dropped) and the unused air event is gone', () => {
  const g = createGame(RAPIER, { seed: 11, power: 'medium' }); quiet(g);
  const ev = []; for (let i = 0; i < 30; i++) ev.push(...g.step(STILL));
  assert.equal(ev.filter(e => e.type === 'air').length, 0);
  const p = g.tractor.body.translation(), before = g.tractorLocal(p.x + 3, p.y, p.z + 1, {});
  const a = 0.7 + 2 * Math.atan2(g.tractor.body.rotation().y, g.tractor.body.rotation().w); g.tractor.body.setRotation({ x: 0, y: Math.sin(a / 2), z: 0, w: Math.cos(a / 2) }, true); // turn the tractor by 0.7 rad
  const after = g.tractorLocal(p.x + 3, p.y, p.z + 1, {});
  assert.ok(Math.abs(before.x - after.x) + Math.abs(before.z - after.z) > 1, `local ${before.x},${before.z} -> ${after.x},${after.z}`);
});
test('with a full train there is no boop: an animal ahead or beside a trailer hops out of the way (B-14)', () => {
  const g = createGame(RAPIER, { seed: 12, power: 'medium' }); quiet(g); unhide(g);
  for (let i = 0; i < 60; i++) g.step(STILL);
  const list = pickable(g); for (const a of list.slice(0, 12)) place(g, a);
  assert.equal(g.load.landed(), 12); assert.ok(g.load.full());
  const [ahead, beside] = list.slice(12);
  const put = (a, l) => { const p = g.tractorWorld(l, {}); a.x = p.x; a.z = p.z; a.state = 'idle'; a.timer = 99; };
  put(ahead, { x: 2.5, y: 0, z: 0.3 });
  const car = g.train.cars[0].body.translation(); beside.x = car.x; beside.z = car.z; beside.state = 'idle'; beside.timer = 99; // inside the first trailer's footprint
  const ev = []; for (let i = 0; i < 40; i++) ev.push(...g.step(STILL));
  assert.ok(!ev.some(e => e.type === 'boop' || e.type === 'launch'), 'booped while full');
  for (const a of [ahead, beside]) assert.ok(ev.some(e => e.type === 'dodge' && e.animal === a), `${a.type} did not hop away`);
  assert.ok(g.tractorLocal(ahead.x, 0, ahead.z, {}).z > 3, 'the animal ahead is not clear of the nose, on its own side');
  assert.equal(ahead.y, 0); assert.notEqual(ahead.state, 'dodge', 'the hop ends');
});
test('a boop does not slow the tractor (B-7 removed)', () => {
  const g = createGame(RAPIER, { seed: 11, power: 'medium' }); quiet(g); unhide(g);
  for (let i = 0; i < 60; i++) g.step(STILL);
  for (let i = 0; i < 90; i++) g.step({ thr: 1, steer: 0, horn: false });
  const a = pickable(g)[0], p = g.tractorWorld({ x: 4, y: 0, z: 0 }, {}); a.x = p.x; a.z = p.z; a.state = 'idle'; a.timer = 99;
  const v0 = g.tractor.speed, ev = []; for (let i = 0; i < 20; i++) ev.push(...g.step({ thr: 1, steer: 0, horn: false }));
  assert.ok(ev.some(e => e.type === 'boop')); assert.ok(g.tractor.speed >= v0 - 0.05, `slowed from ${v0} to ${g.tractor.speed}`);
});
test('3/4 of the way through the barn with a rider, the train stops by itself, at any speed, and the show starts (F-1, F-5)', () => {
  for (const power of ['medium', 'high']) {
    const g = createGame(RAPIER, { seed: 14, power }); quiet(g);
    for (let i = 0; i < 60; i++) g.step(STILL);
    place(g, pickable(g)[0]); assert.equal(g.load.landed(), 1);
    const b = g.farm.yard.barn, f = [Math.sin(b.yaw), Math.cos(b.yaw)], back = 40; // run up from 40 m out along the barn axis
    moveTrain(g, b.x - f[0] * back, b.z - f[1] * back, b.yaw); for (let i = 0; i < 30; i++) g.step(STILL);
    const along = () => { const t = g.tractor.body.translation(); return (t.x - b.x) * f[0] + (t.z - b.z) * f[1]; };
    let pass = null, top = 0;
    for (let i = 0; i < 60 * 12 && !pass; i++) { const ev = g.step({ thr: 1, steer: 0, horn: false }); top = Math.max(top, g.tractor.speed); if (ev.some(e => e.type === 'barnPass')) pass = along(); }
    assert.ok(pass !== null, `${power}: no barn pass`); assert.ok(top > g.tractor.P.vmax * 0.8, `${power}: only ${top.toFixed(1)} m/s`);
    assert.ok(Math.abs(pass - b.half * 0.5) < 1, `${power}: show started at ${pass.toFixed(2)} m, not 3/4 through`);
    assert.equal(g.mode, 'arrive');
    for (let i = 0; i < 60; i++) g.step({ thr: 1, steer: 0, horn: false }); // full throttle is ignored
    assert.ok(g.tractor.speed < 0.3 && g.train.cars.every(c => Math.hypot(c.body.linvel().x, c.body.linvel().z) < 0.3), `${power}: still moving at ${g.tractor.speed.toFixed(2)} m/s`);
    assert.ok(along() < b.half + 1, `${power}: rolled out of the barn to ${along().toFixed(2)} m`);
  }
});
test('an empty train drives on through the barn (F-1)', () => {
  const g = createGame(RAPIER, { seed: 14, power: 'medium' }); quiet(g);
  const b = g.farm.yard.barn, f = [Math.sin(b.yaw), Math.cos(b.yaw)];
  moveTrain(g, b.x - f[0] * 30, b.z - f[1] * 30, b.yaw); for (let i = 0; i < 30; i++) g.step(STILL);
  const ev = []; for (let i = 0; i < 60 * 8; i++) ev.push(...g.step({ thr: 1, steer: 0, horn: false }));
  assert.ok(!ev.some(e => e.type === 'barnPass')); assert.equal(g.mode, 'drive');
});

test('createGame puts player n at its spawn point (M-10)', async () => {
  const { spawnPoint } = await import('../src/sim/spawn.js');
  const g = createGame(RAPIER, { seed: 41, power: 'medium', player: 3 }), p = spawnPoint(g.farm, 3);
  assert.ok(Math.hypot(g.tractor.x - p.x, g.tractor.z - p.z) < 0.01);
});
test('with claims on, a booped animal waits at the top of its arc for the answer, then lands (M-14)', () => {
  const g = createGame(RAPIER, { seed: 42, power: 'medium' }); quiet(g); g.claims = true;
  for (let i = 0; i < 60; i++) g.step(STILL);
  const a = pickable(g)[0], p = g.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); a.x = p.x; a.z = p.z; a.state = 'idle'; a.timer = 99;
  let ev = []; for (let i = 0; i < 90; i++) ev.push(...g.step(STILL)); // 1.5 s: past the top of every arc (at most 0.75 x 1.4 s), inside the 1 s hold (ends at 1.75 s at the earliest)
  assert.ok(ev.some(e => e.type === 'launch')); assert.ok(!ev.some(e => e.type === 'land'), 'no landing without a yes');
  assert.equal(g.flights.length, 1); assert.equal(g.flights[0].claim, 'pending');
  assert.deepEqual(g.resolveClaim(a.id, true), []);
  ev = []; for (let i = 0; i < 60; i++) ev.push(...g.step(STILL));
  assert.ok(ev.some(e => e.type === 'land' && e.animal === a)); assert.equal(a.state, 'ride');
});
test('a refused claim drops the flight with a poof, and frees its slot (M-14)', () => {
  const g = createGame(RAPIER, { seed: 43, power: 'medium' }); quiet(g); g.claims = true;
  for (let i = 0; i < 60; i++) g.step(STILL);
  const a = pickable(g)[0], p = g.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); a.x = p.x; a.z = p.z; a.state = 'idle'; a.timer = 99;
  for (let i = 0; i < 20; i++) g.step(STILL);
  const ev = g.resolveClaim(a.id, false);
  assert.equal(ev.length, 1); assert.equal(ev[0].type, 'unclaim'); assert.equal(ev[0].reason, 'refused'); assert.ok(Number.isFinite(ev[0].pos.y));
  assert.equal(g.flights.length, 0); assert.equal(g.load.slots.length, 0); assert.equal(a.state, 'elsewhere');
});
test('a claim with no answer for 1 s at the top of the arc times out (M-14)', () => {
  const g = createGame(RAPIER, { seed: 44, power: 'medium' }); quiet(g); g.claims = true;
  for (let i = 0; i < 60; i++) g.step(STILL);
  const a = pickable(g)[0], p = g.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); a.x = p.x; a.z = p.z; a.state = 'idle'; a.timer = 99;
  const ev = []; for (let i = 0; i < 60 * 4; i++) ev.push(...g.step(STILL));
  const u = ev.find(e => e.type === 'unclaim'); assert.ok(u); assert.equal(u.reason, 'timeout'); assert.equal(g.load.slots.length, 0);
});
test('paused boops: nothing is booped (M-40)', () => {
  const g = createGame(RAPIER, { seed: 45, power: 'medium' }); quiet(g); g.boopsPaused = true;
  for (let i = 0; i < 60; i++) g.step(STILL);
  const a = pickable(g)[0], p = g.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); a.x = p.x; a.z = p.z; a.state = 'idle'; a.timer = 99;
  const ev = []; for (let i = 0; i < 60; i++) ev.push(...g.step(STILL)); assert.ok(!ev.some(e => e.type === 'boop'));
});
test('with a remote herd there is no B-14 dodge and no respawn after the show (M-12, M-16)', () => {
  const g = createGame(RAPIER, { seed: 46, power: 'medium' }); quiet(g);
  for (let i = 0; i < 60; i++) g.step(STILL);
  for (const a of pickable(g).slice(0, 12)) place(g, a);
  g.herd.remote = true;
  const a = pickable(g)[0], p = g.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); a.x = p.x; a.z = p.z; a.state = 'idle'; a.timer = 99;
  for (let i = 0; i < 30; i++) g.step(STILL); assert.notEqual(a.state, 'dodge');
  const n = g.herd.animals.length, riders = g.startShow(); riders.forEach(r => { r.animal.state = 'show'; }); g.finishShow(riders);
  assert.equal(g.herd.animals.length, n, 'no new animals: the host makes them');
});
test('fullDodge makes animals hop out of the way of any full train given as poses (M-12, B-14)', async () => {
  const { fullDodge } = await import('../src/sim/game.js');
  const g = createGame(RAPIER, { seed: 47, power: 'medium' }); quiet(g);
  for (let i = 0; i < 60; i++) g.step(STILL);
  const a = pickable(g)[0], p = g.tractorWorld({ x: 3, y: 0, z: 0 }, {}); a.x = p.x; a.z = p.z; a.state = 'idle'; a.timer = 99;
  const ev = []; fullDodge(g.herd, g.tractor.body.translation(), g.tractor.body.rotation(), g.train.cars.map(c => ({ p: c.body.translation(), q: c.body.rotation() })), ev);
  assert.equal(a.state, 'dodge'); assert.ok(ev.some(e => e.type === 'dodge' && e.animal === a));
});
test('a guest whose only flight is refused in the barn gets no show: the train drives on (M-14, F-1)', () => {
  const g = createGame(RAPIER, { seed: 14, power: 'medium' }); quiet(g); g.claims = true;
  const b = g.farm.yard.barn, f = [Math.sin(b.yaw), Math.cos(b.yaw)];
  moveTrain(g, b.x - f[0] * 30, b.z - f[1] * 30, b.yaw); for (let i = 0; i < 30; i++) g.step(STILL);
  const along = () => { const t = g.tractor.body.translation(); return (t.x - b.x) * f[0] + (t.z - b.z) * f[1]; };
  const a = pickable(g)[0], ev = [];
  for (let i = 0; i < 60 * 8 && g.mode === 'drive'; i++) { // run up; just inside the barn, an animal is booped (a pending claim) as the only one aboard
    if (a.state !== 'fly' && along() > -3 && !g.flights.length) { const p = g.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); a.x = p.x; a.z = p.z; a.state = 'idle'; a.timer = 99; }
    ev.push(...g.step({ thr: 1, steer: 0, horn: false }));
  }
  assert.equal(g.mode, 'arrive'); assert.equal(g.flights.length, 1); assert.equal(g.flights[0].claim, 'pending'); assert.equal(g.load.landed(), 0);
  ev.push(...g.resolveClaim(a.id, false)); for (let i = 0; i < 30; i++) ev.push(...g.step(STILL));
  assert.ok(ev.some(e => e.type === 'unclaim')); assert.ok(!ev.some(e => e.type === 'barnPass'), 'no show for no animals'); assert.equal(g.mode, 'drive');
});
