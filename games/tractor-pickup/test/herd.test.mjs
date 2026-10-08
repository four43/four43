import test from 'node:test';
import assert from 'node:assert/strict';
import { createHerd, MAIN_TYPES, GONE_KEEP } from '../src/sim/herd.js';
import { makeRng } from '../src/sim/rng.js';

// A straight east-west route along z = 0 (walkable |z| <= 6.5), a 60 m farmyard at the center with a pond and the barn.
const env = {
  bounds: 190,
  roadNearest: (x, z) => ({ d: Math.abs(z), pt: { x, z: 0, tx: 1, tz: 0 } }),
  roadAhead: (x, z, yaw, dist) => ({ x: x + Math.sin(yaw) * dist, z: 0 }),
  routePoint: r => ({ x: (r.chance(0.5) ? 1 : -1) * r.range(40, 180), z: r.range(-5, 5) }),
  mudSpots: [{ x: -150, z: 0 }, { x: -90, z: 0 }, { x: 60, z: 0 }, { x: 120, z: 0 }], pond: { x: -20, z: -20, r: 5 }, hideSpots: [{ x: 50, z: 8.5 }, { x: -50, z: -8.5 }],
  yard: { half: 30, randomPoint: r => ({ x: r.range(-25, 25), z: r.range(-25, -8) }) },
  barn: { x: 0, z: 0, yaw: 0, half: 6, leaf: 5 },
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
test('delivered animals first walk to a point on the barn axis outside the end on their side, then into the barn (no walking through the door leaves)', () => {
  const h = createHerd({ rng: makeRng(8), env }), a = h.free()[0], b = h.free()[1];
  Object.assign(a, { state: 'show', x: 10, z: -15 }); Object.assign(b, { state: 'show', x: 10, z: 15 });
  h.toBarn([a, b]);
  assert.deepEqual([a.tx, a.tz], [0, -12]); assert.deepEqual([b.tx, b.tz], [0, 12]); // barn + f * (half + leaf + 1), on each animal's side
  let maxSide = 0;
  for (let i = 0; i < 60 * 30; i++) { h.step(1 / 60, { tractor: far }); if (a.state === 'toBarn' && Math.abs(a.z) < 11) maxSide = Math.max(maxSide, Math.abs(a.x)); }
  assert.equal(a.state, 'gone'); assert.equal(b.state, 'gone');
  assert.ok(maxSide < 1, `walked between the door leaves, not through them (|x| ${maxSide.toFixed(2)})`);
});
test('respawn refills the route and yard counts along the routes (G-3)', () => {
  const h = createHerd({ rng: makeRng(9), env }), list = h.free().filter(a => a.home === 'route').slice(0, 6).concat(h.free().filter(a => a.home === 'yard').slice(0, 1));
  h.toBarn(list); h.respawn();
  assert.equal(h.free().filter(a => a.home === 'route').length, 18); assert.equal(h.free().filter(a => a.home === 'yard').length, 3);
  assert.ok(h.free().filter(a => a.golden).length <= 1);
  for (const a of h.free().filter(a => a.home === 'route' && !a.hidden).slice(-6)) assert.ok(Math.abs(a.x) > 30, 'respawned on a route, not in the yard');
});
test('respawn never hides a hen that leads chicks or a golden animal (hide-spot refill)', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const h = createHerd({ rng: makeRng(seed), env });
    h.toBarn(h.free().filter(a => a.home === 'route' && a.type !== 'cow'));
    h.respawn();
    const hid = h.animals.filter(a => a.hidden && a.state === 'hide');
    assert.ok(hid.length <= env.hideSpots.length, `seed ${seed}: hidden ${hid.length}`);
    for (const a of hid) { assert.ok(!h.animals.some(c => c.leader === a.id), `seed ${seed}: hen with chicks hid`); assert.ok(!a.golden, `seed ${seed}: golden hid`); }
  }
});
test('hidden animals stay put while the tractor drives past', () => {
  const h = createHerd({ rng: makeRng(10), env }), hid = h.animals.filter(a => a.hidden), p0 = hid.map(a => [a.x, a.z]);
  for (let i = 0; i < 60 * 60; i++) h.step(1 / 60, { tractor: { x: -60 + i * 0.03, z: 0, yaw: Math.PI / 2, speed: 6 } });
  hid.forEach((a, i) => { assert.equal(a.x, p0[i][0]); assert.equal(a.z, p0[i][1]); });
});
test('respawn refill with only cows spawned still leaves the hen with chicks out of the bushes', () => {
  const rng = makeRng(11); let cows = false; const pick = rng.pick.bind(rng); rng.pick = a => cows ? 'cow' : pick(a);
  const h = createHerd({ rng, env }), hen = h.animals.find(a => h.animals.some(c => c.leader === a.id));
  h.toBarn(h.free().filter(a => a.home === 'route' && a.type !== 'cow' && a !== hen && a.type !== 'chick'));
  cows = true; h.respawn();
  assert.ok(!hen.hidden && hen.state !== 'hide', 'hen with chicks hid');
});

test('animals react to the nearest of several tractors (M-12)', () => {
  const h = createHerd({ rng: makeRng(31), env }), s = h.animals.find(a => a.type === 'sheep' && !a.hidden && a.home === 'route');
  s.state = 'idle'; s.timer = 99; s.z = 0;
  const other = { x: s.x - 4, z: s.z, yaw: Math.PI / 2, speed: 5 };
  h.step(1 / 60, { tractor: far, others: [other] });
  assert.equal(s.state, 'flee', 'the other tractor scares it');
});
test('a remote herd does not move: the host runs it (M-12)', () => {
  const h = createHerd({ rng: makeRng(32), env }), x0 = h.animals.map(a => [a.x, a.z]);
  h.remote = true; run(h, 5);
  assert.deepEqual(h.animals.map(a => [a.x, a.z]), x0);
});
test('ensure fills the herd up to an id from the host, and every animal has an ownership number (M-26)', () => {
  const h = createHerd({ rng: makeRng(33), env }), n = h.animals.length;
  assert.ok(h.animals.every(a => a.epoch === 0));
  const a = h.ensure(n + 2, 'cow', true);
  assert.equal(h.animals.length, n + 3); assert.equal(a.id, n + 2); assert.equal(a.type, 'cow'); assert.equal(a.golden, true);
  assert.equal(h.animals[n].state, 'elsewhere'); assert.ok(!h.free().includes(h.animals[n]));
  assert.equal(h.ensure(0, h.animals[0].type, false), h.animals[0]);
});
test('carried and elsewhere animals are not free and do not move', () => {
  const h = createHerd({ rng: makeRng(34), env }), a = h.animals.find(x => !x.hidden && x.home === 'route');
  a.state = 'carried'; const p = [a.x, a.z]; run(h, 2);
  assert.ok(!h.free().includes(a)); assert.deepEqual([a.x, a.z], p);
});
test('a respawn reuses the slot of an animal gone for GONE_KEEP: a long game keeps a small herd (G-3)', () => {
  const h = createHerd({ rng: makeRng(35), env }), n = h.animals.length;
  for (let round = 0; round < 40; round++) { // 40 deliveries of 6, far more than the herd
    const list = h.free().filter(a => a.home === 'route' && !a.hidden).slice(0, 6); h.toBarn(list); h.respawn();
    run(h, GONE_KEEP + 25); // they walk in (gone), then stay gone for GONE_KEEP
  }
  assert.ok(h.animals.length < n + 20, `herd array ${h.animals.length} (started at ${n})`);
  assert.equal(h.free().filter(a => a.home === 'route').length, 18);
  h.animals.forEach((a, i) => assert.equal(a.id, i, 'an id is its index'));
});
test('a reused slot is a new animal with a higher ownership number; a slot gone for less than GONE_KEEP is kept (M-26)', () => {
  const h = createHerd({ rng: makeRng(36), env }), a = h.free().find(x => x.home === 'route' && !x.hidden && x.type !== 'chick'), n = h.animals.length;
  a.epoch = 7; a.state = 'gone'; run(h, GONE_KEEP - 1); h.toBarn([h.free().find(x => x.home === 'route' && !x.hidden && x !== a)]); h.respawn();
  assert.equal(h.animals[a.id], a, 'gone for less than GONE_KEEP: not reused'); assert.equal(h.animals.length, n + 2, 'new slots for both');
  run(h, 2); const b = h.free().find(x => x.home === 'route' && !x.hidden); h.toBarn([b]); h.respawn();
  const c = h.animals[a.id];
  assert.notEqual(c, a, 'a new object: whoever still holds the old one sees it gone'); assert.equal(a.state, 'gone');
  assert.equal(c.id, a.id); assert.ok(c.epoch > 7, 'a late claim answer or record for the old animal is older'); assert.ok(h.free().includes(c));
});
test('a reused slot is nobody\'s leader any more', () => {
  const h = createHerd({ rng: makeRng(37), env }), hen = h.animals.find(a => a.type === 'chicken' && h.animals.some(c => c.leader === a.id));
  hen.state = 'gone'; for (const c of h.animals) if (c.leader === hen.id) { c.state = 'idle'; } // a chick that lost its hen but kept the id
  run(h, GONE_KEEP + 1); h.toBarn([h.free().find(x => x.home === 'route' && !x.hidden && x.type !== 'chick')]); h.respawn();
  assert.notEqual(h.animals[hen.id], hen); assert.ok(!h.animals.some(c => c.leader === hen.id && c !== h.animals[hen.id]), 'no chick follows the new animal');
});
test('ensure never reuses a slot: the host owns the ids', () => {
  const h = createHerd({ rng: makeRng(38), env }), n = h.animals.length; h.animals[3].state = 'gone'; run(h, GONE_KEEP + 1);
  h.remote = true; h.ensure(n, 'pig', false); assert.equal(h.animals.length, n + 1); assert.equal(h.animals[n].id, n);
});
test('a horn or a help call during a dodge hop lets the hop finish on the ground (B-14, A-11)', () => {
  const h = createHerd({ rng: makeRng(4), env }), t = { x: 40, z: 0, yaw: 0, speed: 0 };
  const a = h.animals.find(a => !a.hidden && a.home === 'route' && (a.type === 'cow' || a.type === 'pig' || a.type === 'dog'));
  a.x = t.x + 5; a.z = 0;
  assert.ok(h.dodge(a, a.x + 3, 3));
  for (let i = 0; i < 12; i++) h.step(1 / 60, { tractor: far }); // mid-hop
  assert.ok(a.y > 0);
  h.horn(t); assert.equal(a.state, 'dodge');
  const helped = h.callHelp(t); assert.notEqual(helped, a);
  run(h, 1);
  assert.equal(a.y, 0); assert.notEqual(a.state, 'dodge');
});
test('a running animal with its target close at the side arrives, it does not circle it for good (A-9)', () => {
  for (const type of ['dog', 'pig', 'cow', 'sheep']) {
    const h = createHerd({ rng: makeRng(4), env }), a = h.animals.find(x => x.type === type && !x.hidden && x.home === 'route'); if (!a) continue;
    for (const side of [0.6, 1, 1.4]) {
      a.x = 100; a.z = 0; a.yaw = 0; a.state = 'help'; a.timer = 99; a.tx = a.x + side; a.tz = a.z;
      for (let i = 0; i < 60 * 5 && a.state === 'help'; i++) h.step(1 / 60, { tractor: far });
      assert.equal(a.state, 'wave', `${type} at ${side} m to the side never arrived`);
    }
  }
});
test('help gives up and walking into the barn ends after a while, even with the target out of reach (A-9)', () => {
  const h = createHerd({ rng: makeRng(4), env }), a = h.animals.find(x => !x.hidden && x.home === 'route' && x.type !== 'chick');
  const t = { x: a.x, z: a.z, yaw: 0, speed: 0 }, c = h.callHelp(t); assert.ok(c);
  c.tx = 1e6; c.tz = 0; // out of reach
  run(h, 30); assert.notEqual(c.state, 'help');
  const b = h.animals.find(x => x !== c && !x.hidden && x.type !== 'chick'); b.state = 'toBarn'; b.timer = 0; b.tx = 1e6; b.tz = 0;
  run(h, 40); assert.equal(b.state, 'gone');
});
