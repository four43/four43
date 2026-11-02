// The load (H-H4, H-S1) and the field cells (H-H1, H-H2) without physics.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLoad } from '../src/sim/load.js';
import { createFields, GROW_EVERY } from '../src/sim/field.js';
import { FIELDS } from '../src/sim/layout.js';
import { TUNE, CROP, CROP_IDS } from '../src/defs/econ.js';
import { VEHICLES, costOf } from '../src/defs/vehicles.js';

test('the wagons fill in order; unloading empties the last first and pays by crop; one wagon unloads on its own', () => {
  const l = createLoad([3, 2, 2]), WH = CROP_IDS.indexOf('wheat'), CO = CROP_IDS.indexOf('corn');
  for (let i = 0; i < 4; i++) l.add(WH);
  assert.deepEqual(l.bins.map(b => b.n), [3, 1, 0]);
  l.add(CO); l.add(CO); l.add(CO);
  assert.deepEqual(l.bins.map(b => b.n), [3, 2, 2]);
  assert.equal(l.full(), true); assert.equal(l.add(WH), false);
  const W = CROP.wheat.price, C = CROP.corn.price;
  assert.equal(l.unload(2), 2 * C, 'two corn'); assert.deepEqual(l.bins.map(b => b.n), [3, 2, 0]);
  assert.equal(l.unload(10), C + 4 * W, 'a corn, then four wheat'); assert.equal(l.total(), 0);
  for (let i = 0; i < 4; i++) l.add(WH);
  assert.equal(l.filling(), 1); assert.equal(l.unloadBin(1, 9), W); assert.deepEqual(l.bins.map(b => b.n), [3, 0, 0]);
});

test('resize keeps the grain, poured forward', () => {
  const l = createLoad([3, 2]); for (let i = 0; i < 5; i++) l.add(0);
  l.resize([4, 2, 2]); assert.deepEqual(l.bins.map(b => b.n), [4, 1, 0]); assert.equal(l.capacity(), 8);
});

test('a strip cuts the ripe cells its blades can, one grain each; they grow back once the field is done', () => {
  const f = createFields(), W = FIELDS.wheat, cut = [];
  const n = f.cutStrip(W.x0 + 10.3, W.z0 + 10, 0, 1, 1.5, 0.95, 'combine', 0, () => 99, c => cut.push(c.crop));
  assert.equal(n, 3 * 2, 'a 3 m by 1.9 m strip over 1 m cells'); assert.ok(cut.every(c => c === 'wheat'));
  assert.equal(f.cutStrip(W.x0 + 10.3, W.z0 + 10, 0, 1, 1.5, 0.95, 'combine', 0, () => 99, () => {}), 0, 'stubble does not cut');
  const C = FIELDS.corn;
  assert.equal(f.cutStrip(C.x0 + 10.3, C.z0 + 10, 0, 1, 1.5, 0.95, 'combine', 0, () => 99, () => {}), 0, 'blunt blades do not cut corn');
  assert.equal(f.cutStrip(C.x0 + 10.3, C.z0 + 10, 0, 1, 1.5, 0.95, 'combine', 1, () => 99, () => {}), 6, 'blades 1 do');
  const ripe = f.byId.wheat.ripe, grow = () => { for (let s = 0; s < Math.ceil(TUNE.growS * 60) + GROW_EVERY; s++) f.step(1 / 60); };
  grow(); assert.equal(f.byId.wheat.ripe, ripe, 'a field not done stays cut');
  assert.equal(f.finish(), null, 'six cells is not done');
  f.byId.wheat.ripe = 0; assert.equal(f.finish()?.id, 'wheat'); assert.equal(f.finish(), null, 'done once');
  f.byId.wheat.ripe = ripe; grow(); assert.equal(f.byId.wheat.ripe, ripe + 6, 'a done field grows back');
  assert.equal(f.byId.wheat.done, false, 'all ripe again, it is a fresh field');
  f.cutStrip(W.x0 + 10.3, W.z0 + 10, 0, 1, 1.5, 0.95, 'combine', 0, () => 99, () => {}); grow();
  assert.equal(f.byId.wheat.ripe, ripe, 'cut again, it stays cut until it is done again');
});

test('cut runs round-trip: restore puts back the active field\'s stubble', () => {
  const f = createFields(), w = f.byId.wheat;
  for (const c of [0, 1, 7, 500, w.total - 1]) { w.grow[c] = 0; w.ripe--; }
  const runs = f.cutRuns(w), g = createFields();
  assert.equal(runs.reduce((a, b) => a + b, 0), w.total); assert.equal(runs[0], 0, 'a field that starts cut starts with an empty ripe run');
  g.restore({ wheat: { cut: runs } }); assert.deepEqual([...g.byId.wheat.grow], [...w.grow]); assert.equal(g.byId.wheat.ripe, w.ripe);
});

test('room stops the cutting', () => {
  const f = createFields(), W = FIELDS.wheat; let room = 2;
  assert.equal(f.cutStrip(W.x0 + 20, W.z0 + 20, 0, 1, 1.5, 0.95, 'combine', 0, () => room, () => { room--; }), 2);
});

test('upgrade prices grow and stop at the top level', () => {
  for (const [v, def] of Object.entries(VEHICLES)) for (const [id, u] of Object.entries(def.upgrades)) {
    let last = 0;
    for (let l = 0; l < u.max; l++) { const c = costOf(v, id, l); assert.ok(c > last && c % 5 === 0, `${v} ${id} ${l}: ${c}`); last = c; }
    assert.equal(costOf(v, id, u.max), null);
  }
});
