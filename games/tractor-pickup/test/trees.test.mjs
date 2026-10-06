import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { createPhysics, DT } from '../src/sim/physics.js';
import { createTractor, quatAxes } from '../src/sim/tractor.js';
import { createTrain } from '../src/sim/hitch.js';
import { generateFarm, layoutYard, yardFree, YARD_HALF, segDist, barnLocal } from '../src/sim/track.js';
import { createTrees, TREE } from '../src/sim/trees.js';
import { stepGib } from '../src/render/gibs.js';
await RAPIER.init();

const oneTree = (x = 0, z = 0, young = false) => ({ yard: { obstacles: [{ kind: 'tree', x, z, r: young ? 0.7 : 1.2, young, scale: young ? 0.6 : 1 }] } });
const setup = (farm, { x = -25, power = 'high' } = {}) => {
  const phys = createPhysics(RAPIER), trees = createTrees(phys, farm), t = createTractor(phys, { x, z: 0, yaw: Math.PI / 2, power }), train = createTrain(phys, t);
  const events = [];
  const tick = thr => { t.setInput(thr, 0); t.step(DT); train.step(DT, { parked: false }); events.push(...trees.step(DT, [t.body, ...train.cars.map(c => c.body)])); phys.world.step(); };
  return { phys, trees, t, train, events, tick };
};

test('the farm has 10 trees, some in young groups, all inside the yard and clear of lanes, barn and line-up (T-31)', () => {
  for (const seed of [1, 5, 9, 23, 77]) {
    const y = generateFarm(seed).yard, trees = y.obstacles.filter(o => o.kind === 'tree');
    assert.equal(trees.length, 10, `seed ${seed}`);
    assert.equal(trees.filter(o => !o.young).length, 5); assert.ok(trees.filter(o => o.young).length >= 4, 'young groups');
    for (const o of trees) {
      assert.ok(o.young ? o.r === 0.7 && Math.abs(o.scale - 0.6) < 0.01 : o.r === 1.2);
      assert.ok(Math.abs(o.x) < YARD_HALF - 2 - o.r && Math.abs(o.z) < YARD_HALF - 2 - o.r, 'outside the yard');
      assert.ok(yardFree(y, o.x, o.z, o.r), 'in a lane, the barn, the line-up or the pond');
      for (const l of y.lanes) assert.ok(segDist(o.x, o.z, l) > 5 + o.r - 1e-9);
      const others = y.obstacles.filter(q => q !== o && !(q.kind === 'tree' && q.young && q.group === o.group));
      for (const q of others) assert.ok(Math.hypot(q.x - o.x, q.z - o.z) >= q.r + o.r + 2 - 1e-9, `${q.kind} too close to a tree`);
    }
    for (const g of [0, 1]) { const m = trees.filter(o => o.group === g); assert.ok(m.length >= 2 && m.length <= 3);
      for (const a of m) for (const b of m) if (a !== b) assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 2.2 && Math.hypot(a.x - b.x, a.z - b.z) > 1.4, 'group spacing'); }
  }
});

test('a fast tractor breaks a tree once, loses little speed and drives on upright (T-34)', () => {
  const { trees, t, events, tick } = setup(oneTree());
  const tree = trees.list[0]; assert.ok(tree.collider); let pre = 0, passed = false;
  for (let i = 0; i < 60 * 9 && !passed; i++) {
    tick(1); if (!events.length) pre = t.speed;
    if (events.length && t.body.translation().x > tree.x) { passed = true; assert.ok(t.speed > 0.6 * pre, `speed ${t.speed} vs ${pre}`); }
  }
  assert.ok(passed, 'did not pass through the tree');
  assert.equal(events.filter(e => e.type === 'treeBreak').length, 1);
  const ev = events.find(e => e.type === 'treeBreak'); assert.equal(ev.tree, tree); assert.ok(ev.dir.x > 0.99 && ev.speed >= TREE.breakSpeed);
  assert.equal(tree.state, 'broken'); assert.equal(tree.collider, null);
  for (let i = 0; i < 60; i++) tick(1);
  const { u } = quatAxes(t.body.rotation()); assert.ok(u.y > 0.9, `tilted ${u.y}`);
});

test('a slow tractor bumps a tree: it wobbles and stays solid (T-34)', () => {
  const { trees, t, events, tick } = setup(oneTree(), { x: -8, power: 'medium' });
  const tree = trees.list[0]; let maxX = -99, maxSpeed = 0;
  t.body.setLinvel({ x: 2, y: 0, z: 0 }, true);
  for (let i = 0; i < 60 * 8; i++) {
    // hold about 2 m/s: no throttle once above it
    tick(t.speed < 2 ? 0.3 : 0); maxX = Math.max(maxX, t.body.translation().x); maxSpeed = Math.max(maxSpeed, t.speed);
  }
  assert.ok(maxSpeed < TREE.breakSpeed, `speed ${maxSpeed}`);
  assert.equal(events.filter(e => e.type === 'treeBreak').length, 0); assert.equal(events.filter(e => e.type === 'treeBump').length, 1);
  assert.equal(tree.state, 'standing'); assert.ok(tree.collider);
  assert.ok(maxX < tree.x - 1.5, `the tractor reached x=${maxX}`); // stopped before the trunk
});

test('a trailer car pushed into a standing tree does not break it', () => {
  const { trees, train, events, tick } = setup(oneTree(-9, 0), { x: 0 }); // the tractor reverses and the rear car meets the tree
  const tree = trees.list[0]; let minGap = 99;
  for (let i = 0; i < 60 * 8; i++) { tick(-1); minGap = Math.min(minGap, train.cars[1].body.translation().x - tree.x); }
  assert.equal(events.filter(e => e.type === 'treeBreak').length, 0); assert.equal(tree.state, 'standing'); assert.ok(tree.collider);
  assert.ok(minGap > 0.7, `the car reached the trunk center: ${minGap}`); assert.ok(minGap < 2.6, `the car never touched the tree: ${minGap}`);
});

test('reset() grows broken trees back with their colliders (T-32)', () => {
  const { trees, tick } = setup(oneTree());
  const tree = trees.list[0]; for (let i = 0; i < 60 * 9 && tree.state === 'standing'; i++) tick(1);
  assert.equal(tree.state, 'broken'); assert.equal(tree.collider, null);
  trees.reset(); assert.equal(tree.state, 'growing'); assert.ok(tree.collider);
  for (let i = 0; i < Math.ceil(TREE.regrowTime * 60) + 2; i++) trees.step(DT, [{ translation: () => ({ x: 99, y: 0, z: 99 }), rotation: () => ({ x: 0, y: 0, z: 0, w: 1 }), linvel: () => ({ x: 0, y: 0, z: 0 }) }]);
  assert.equal(tree.state, 'standing'); assert.equal(tree.grow, 1);
});

test('stepGib: bounces, never goes below the ground, comes to rest and dies (gibs)', () => {
  const g = { x: 0, y: 1, z: 0, vx: 3, vy: 6, vz: 1, size: 0.3, ax: 0, ay: 0, az: 0, wx: 5, wy: 3, wz: 4, rest: 0, scale: 1, alive: true };
  let t = 0, bounced = false, restedAt = null, prevVy = g.vy;
  while (g.alive && t < 20) { stepGib(g, DT); t += DT; assert.ok(g.y >= g.size / 2 - 1e-9, `below ground ${g.y}`); if (g.vy > 0 && prevVy < 0) bounced = true; prevVy = g.vy; if (g.rest > 0 && restedAt === null) restedAt = t; }
  assert.ok(bounced); assert.ok(restedAt !== null && restedAt < 8, 'never came to rest'); assert.ok(!g.alive, 'never removed'); assert.ok(t - restedAt > 3 && t - restedAt < 5.5, `life after rest ${t - restedAt}`);
});
