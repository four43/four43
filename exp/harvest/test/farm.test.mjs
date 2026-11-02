// The farm loop headless (spec §4–§6): drive into the wheat and cut, fill the wagons, unload them over the silo pit, buy upgrades,
// finish a field, need sharper blades for the corn.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { headless } from 'lion-hawk/test';
import { harvestGame, initPhysics } from '../src/game.sim.js';
import { YARD, FIELDS, ZONES, BACKYARD } from '../src/sim/layout.js';
import { DONE_AT, TUNE, CROP } from '../src/defs/econ.js';
import { costOf, upgrade, VEHICLES } from '../src/defs/vehicles.js';
import { clampProgress } from '../src/sim/farm.js';

await initPhysics();
// a save driving the combine at these levels
const withLevels = levels => ({ v: 4, owned: { mower: true, combine: true }, active: 'combine', vehicles: { combine: { levels } } });
// the farm in the combine (most of these tests), or as a new player starts it (in the mower): fresh: true
const open = ({ fresh, progress, ...args } = {}) => headless(harvestGame(), { scene: 'farm', args: { ...args, progress: fresh ? progress : progress ?? withLevels({}) } });
// move the whole rig (combine and carts) so the combine stands at x, z, turned by `turn` about it: every body keeps its offset
function teleport(h, x, z, turn = 0) {
  const r = h.debug.rig, p = r.c.body.translation(), c = Math.cos(turn), s = Math.sin(turn), q = { x: 0, y: Math.sin(turn / 2), z: 0, w: Math.cos(turn / 2) };
  for (const b of [r.c.body, ...r.train.carts.map(k => k.body)]) {
    const t = b.translation(), ox = t.x - p.x, oz = t.z - p.z, o = b.rotation();
    b.setTranslation({ x: x + ox * c + oz * s, y: t.y, z: z - ox * s + oz * c }, true);
    b.setRotation({ x: q.w * o.x + q.y * o.z, y: q.w * o.y + q.y * o.w, z: q.w * o.z - q.y * o.x, w: q.w * o.w - q.y * o.y }, true);
    b.setLinvel({ x: 0, y: 0, z: 0 }, true); b.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }
}
const drive = (h, thr, steer, steps) => { h.debug.drive({ thr, steer }); h.step(steps); };
// move the whole rig so wagon i stands over the silo pit
function wagonToPit(h, i = 0) {
  const r = h.debug.rig, q = r.train.carts[i].body.translation(), p = r.c.body.translation();
  teleport(h, ZONES.sell.x + p.x - q.x, ZONES.sell.z + p.z - q.z);
}

test('the combine starts in the yard, settles on its wheels and stands still', () => {
  const h = open(); h.step(120);
  const s = h.state();
  assert.ok(Math.abs(s.combine.x - YARD.start.x) < 0.5 && Math.abs(s.combine.z - YARD.start.z) < 0.5, JSON.stringify(s.combine));
  assert.ok(s.combine.y > -0.2 && s.combine.y < 0.6, `rests on its wheels (y ${s.combine.y})`);
  assert.ok(s.combine.speed < 0.2);
  assert.equal(s.carts, 1);
  assert.equal(s.load.n, 0);
});

test('off the crop it drives at its road speed; in crop it slows to its cutting speed (H-H5)', () => {
  const h = open(); h.step(60);
  teleport(h, 0, -15); h.step(10); // the south of the yard: 4 s of driving stays short of the wheat
  drive(h, 1, 0, 240);
  let s = h.state();
  assert.ok(s.combine.z > 0, `moved north (z ${s.combine.z})`);
  assert.ok(s.combine.speed > VEHICLES.combine.road * 0.85 && s.combine.speed < VEHICLES.combine.road + 0.3, `road speed ${s.combine.speed}`);
  teleport(h, 0, FIELDS.wheat.z0 + 2); drive(h, 1, 0, 240);
  s = h.state(); const cut = upgrade('combine', 'speed').value(0);
  assert.ok(s.combine.cutting && s.combine.speed < cut + 0.3 && s.combine.speed > cut * 0.8, `cutting speed ${s.combine.speed} (bought ${cut})`);
});

test('positive steer turns the heading up (yaw grows) going forward', () => {
  const h = open(); h.step(60);
  drive(h, 0.6, 1, 120);
  assert.ok(h.state().combine.yaw > 0.3, `yaw ${h.state().combine.yaw}`);
});

test('driving into the wheat cuts it into the wagons in order, and FULL stops the cutting', () => {
  const h = open(); h.step(60);
  teleport(h, 0, FIELDS.wheat.z0 - 6); h.step(30);
  const ripe0 = h.state().ripe.wheat;
  drive(h, 1, 0, 60 * 8);
  const s = h.state();
  assert.ok(s.load.n > 50, `cut ${s.load.n}`);
  assert.equal(ripe0 - s.ripe.wheat, s.load.n, 'every cut cell is one grain');
  assert.ok(h.events.some(e => e.type === 'cut'));
  // keep going along the field until full
  for (let k = 0; k < 6 && h.state().load.n < h.state().load.cap; k++) { drive(h, 1, 0.4, 60 * 4); }
  const f = h.state();
  if (f.load.n === f.load.cap) assert.ok(h.events.some(e => e.type === 'full'), 'full is said');
  f.load.bins.forEach(([n], i) => { if (n > 0) for (let k = 0; k < i; k++) assert.equal(f.load.bins[k][0], f.load.bins[k][1], `bin ${k} is full before bin ${i} gets grain`); });
  assert.ok(f.load.bins[0][0] > 0, 'wagon 1 fills first');
});

test('a wagon over the silo pit unloads its grain and it is paid for; the combine over the pit is not', () => {
  const h = open(); h.step(60);
  teleport(h, 0, FIELDS.wheat.z0 - 6); h.step(30); drive(h, 1, 0, 60 * 8);
  drive(h, 0, 0, 120); // coast to a stop (it cuts on the way)
  const n = h.state().load.n; assert.ok(n > 0);
  teleport(h, ZONES.sell.x, ZONES.sell.z - 8); drive(h, 0, 0, 60); // south of the bay, heading north: only the combine's front is in it
  assert.equal(h.state().load.n, n, 'nothing drops out of the combine');
  wagonToPit(h); drive(h, 0, 0, 60 * 6);
  const s = h.state();
  assert.equal(s.load.n, 0);
  assert.equal(s.coins, n * CROP.wheat.price, 'wheat pays its price a grain');
  assert.ok(h.events.some(e => e.type === 'sold' && e.done));
  assert.ok(h.events.some(e => e.type === 'progress'));
});

test('buying: the barn opens the shop, an upgrade costs coins and changes the rig', () => {
  const h = open({ coins: 50000 }); h.step(30);
  teleport(h, ZONES.shop.x, ZONES.shop.z + 2, Math.PI); drive(h, 0, 0, 30); // drove in heading south: the carts trail out of the north door
  assert.ok(h.engine.scene.overlays.includes('shop'), 'the shop is open in the shed');
  h.engine.command('buy', { what: 'carts' }); h.step(2);
  let s = h.state();
  assert.equal(s.levels.carts, 1); assert.equal(s.carts, 2); assert.equal(s.coins, 50000 - costOf('combine', 'carts', 0));
  const bin = l => upgrade('combine', 'bins').value(l);
  assert.equal(s.load.cap, 2 * bin(0));
  h.engine.command('buy', { what: 'width' }); h.step(2);
  assert.equal(h.state().levels.width, 1);
  h.engine.command('buy', { what: 'speed' }); h.engine.command('buy', { what: 'bins' }); h.step(2);
  s = h.state(); assert.equal(s.levels.speed, 1); assert.equal(s.levels.bins, 1); assert.equal(s.load.cap, 2 * bin(1));
  h.step(120); // the respawned rig settles
  assert.ok(h.state().combine.y > -0.2 && h.state().combine.y < 0.6, JSON.stringify(h.state().combine));
  teleport(h, 0, 14); drive(h, 0, 0, 10);
  assert.ok(!h.engine.scene.overlays.includes('shop'), 'driving out closes it');
});

test('an upgrade the purse cannot pay does nothing', () => {
  const h = open({ coins: 10 }); h.step(5);
  h.engine.command('buy', { what: 'speed' }); h.step(2);
  assert.equal(h.state().levels.speed, 0); assert.equal(h.state().coins, 10);
});

// cut a field down to `left` ripe cells straight in the cells (faster than driving it)
function cutAllBut(h, id, left) {
  const f = h.debug.farm.fields.byId[id];
  for (let c = 0; c < f.total - left; c++) f.grow[c] = 0;
  f.ripe = left; f.version++;
}

test('a field is done at DONE_AT: an event, a save, it grows back once, then it is fresh and stays cut until done again', () => {
  const h = open(); h.step(30);
  const f = h.debug.farm.fields.byId.wheat;
  cutAllBut(h, 'wheat', Math.ceil(f.total * (1 - DONE_AT)) + 5);
  h.engine.command('tune', { key: 'growS', value: 5 }); h.step(60 * 7);
  assert.equal(h.state().done.wheat, false); assert.equal(f.grow[0], 0, 'a field not done does not grow back');
  cutAllBut(h, 'wheat', 10); h.step(2);
  assert.equal(h.state().done.wheat, true);
  assert.ok(h.events.some(e => e.type === 'fieldDone' && e.field === 'wheat'));
  const saved = h.events.findLast(e => e.type === 'progress').progress;
  assert.equal(saved.fields.wheat.done, true); assert.ok(Array.isArray(saved.fields.wheat.cut) && Array.isArray(saved.fields.corn.cut));
  h.step(60 * 7);
  assert.equal(h.state().ripe.wheat, f.total, 'a done field grows back');
  assert.equal(h.state().done.wheat, false, 'grown back, it is a fresh field');
  cutAllBut(h, 'wheat', f.total - 50); h.step(60 * 7);
  assert.equal(h.state().ripe.wheat, f.total - 50, 'harvested again, it does not grow back until done again');
  h.engine.command('tune', { key: 'growS', value: 45 }); h.step(1);
});

test('corn needs blades 1: blunt, the combine pushes through slowly and cuts nothing; sharp, it cuts at crop speed', () => {
  const run = levels => {
    const h = open({ progress: withLevels(levels) }); h.step(30);
    const c = FIELDS.corn; teleport(h, c.x0 + 10, c.z0 - 6); h.step(20);
    drive(h, 1, 0, 60 * 8);
    return h.state();
  };
  const blunt = run({}), sharp = run({ blades: 1 }), all = FIELDS.corn.w * FIELDS.corn.h;
  assert.equal(blunt.ripe.corn, all); assert.equal(blunt.load.n, 0); assert.equal(blunt.blocked, 'corn');
  assert.ok(sharp.ripe.corn < all && sharp.load.n > 0); assert.equal(sharp.blocked, null);
  assert.ok(blunt.combine.speed < sharp.combine.speed * (TUNE.toughSlow + 0.15), `blunt ${blunt.combine.speed} vs sharp ${sharp.combine.speed}`);
});

test('a save restores the vehicle\'s levels, the done fields and every field\'s cut cells; bad or other-version saves start fresh', () => {
  const h = open({ progress: withLevels({ blades: 1 }) }); h.step(30);
  cutAllBut(h, 'wheat', 10); h.step(2);
  const c = h.debug.farm.fields.byId.corn; for (let k = 0; k < 300; k++) c.grow[k * 3] = 0; c.ripe -= 300;
  const saved = JSON.parse(JSON.stringify(h.debug.farm.record()));
  assert.equal(saved.v, 4); assert.equal(saved.active, 'combine'); assert.equal(saved.vehicles.combine.levels.blades, 1);
  const h2 = open({ progress: saved }); h2.step(2);
  assert.equal(h2.state().done.wheat, true); assert.equal(h2.state().ripe.corn, c.total - 300); assert.equal(h2.state().levels.blades, 1);
  assert.equal(h2.debug.farm.fields.byId.corn.grow[3], 0);
  const bad = clampProgress({ v: 4, coins: -5, active: 'rocket', vehicles: { combine: { levels: { speed: 99, blades: 'x' } } }, fields: { corn: { cut: [1, 2] } } });
  assert.equal(bad.coins, 0); assert.equal(bad.active, 'mower', 'a vehicle not owned is not driven'); assert.equal(bad.vehicles.combine.levels.speed, upgrade('combine', 'speed').max); assert.equal(bad.vehicles.combine.levels.blades, 0);
  const h3 = open({ progress: bad }); h3.step(2); assert.equal(h3.state().ripe.corn, FIELDS.corn.w * FIELDS.corn.h, 'runs that do not fit are ignored');
  assert.equal(clampProgress({ v: 3, coins: 500, levels: { speed: 3 } }).coins, 0, 'another version starts fresh');
});

// ---- the backyard: the mower (H-V1..H-V3, H-F7)

test('a new farm starts in the mower in the backyard; it mows the lawn into its catcher', () => {
  const h = open({ fresh: true }); h.step(60);
  let s = h.state();
  assert.equal(s.vehicle, 'mower'); assert.deepEqual(s.owned, { mower: true, combine: false }); assert.equal(s.carts, 0);
  assert.ok(Math.hypot(s.combine.x - BACKYARD.start.x, s.combine.z - BACKYARD.start.z) < 0.5, JSON.stringify(s.combine));
  assert.ok(s.combine.y > -0.2 && s.combine.y < 0.4, `rests on its wheels (y ${s.combine.y})`);
  const lawn = FIELDS.lawn.w * FIELDS.lawn.h;
  drive(h, 1, 0, 60 * 5);
  s = h.state();
  assert.ok(s.ripe.lawn < lawn && s.load.n === lawn - s.ripe.lawn, `mowed ${lawn - s.ripe.lawn}, carried ${s.load.n}`);
  assert.equal(s.load.bins[0][2], 'lawn'); assert.equal(s.blocked, null);
});

test('the mower cannot cut wheat (the combine\'s crop) and long grass needs blades 1', () => {
  const h = open({ fresh: true }); h.step(30);
  teleport(h, 0, FIELDS.wheat.z0 - 3, Math.PI / 2); drive(h, 1, 0, 60 * 4); // the mower starts facing west: turned to face the wheat
  let s = h.state();
  assert.equal(s.blocked, 'wheat'); assert.equal(s.load.n, 0); assert.equal(s.ripe.wheat, FIELDS.wheat.w * FIELDS.wheat.h);
  const g = FIELDS.longgrass; teleport(h, g.x0 + 6, g.z0 + g.h * g.size + 2, Math.PI); drive(h, 1, 0, 60 * 3); // turned to face south
  s = h.state(); assert.equal(s.blocked, 'longgrass'); assert.equal(s.load.n, 0);
});

test('the catcher unloads by the compost bins and is paid for', () => {
  const h = open({ fresh: true }); h.step(30);
  drive(h, 1, 0, 60 * 4); drive(h, 0, 0, 60);
  const n = h.state().load.n; assert.ok(n > 0);
  teleport(h, ZONES.compost.x, ZONES.compost.z); drive(h, 0, 0, 60 * 3);
  const s = h.state(); assert.equal(s.load.n, 0); assert.equal(s.coins, n * CROP.lawn.price);
  assert.ok(h.events.some(e => e.type === 'sold' && e.done));
});

test('the combine is bought in the garage and driven; the mower keeps its load and levels; swapping back is free', () => {
  const h = open({ fresh: true, coins: 9000 }); h.step(30);
  drive(h, 1, 0, 60 * 3); drive(h, 0, 0, 30);
  h.engine.command('buy', { what: 'speed' }); h.step(2);
  assert.equal(h.state().levels.speed, 1);
  teleport(h, ZONES.garage.x, ZONES.garage.z); drive(h, 0, 0, 10);
  const mowed = h.state().load.n; assert.ok(mowed > 0);
  h.engine.command('drive', { vehicle: 'combine' }); h.step(30);
  let s = h.state();
  assert.equal(s.vehicle, 'combine'); assert.equal(s.owned.combine, true); assert.equal(s.coins, 9000 - costOf('mower', 'speed', 0) - 8000);
  assert.equal(s.levels.speed, 0); assert.equal(s.load.n, 0); assert.equal(s.carts, 1);
  assert.ok(h.events.some(e => e.type === 'vehicle' && e.how === 'bought'));
  assert.equal(h.events.findLast(e => e.type === 'progress').progress.active, 'combine');
  h.engine.command('drive', { vehicle: 'mower' }); h.step(30);
  s = h.state(); assert.equal(s.vehicle, 'mower'); assert.equal(s.load.n, mowed); assert.equal(s.levels.speed, 1); assert.equal(s.coins, 9000 - costOf('mower', 'speed', 0) - 8000);
  h.engine.command('drive', { vehicle: 'combine' }); h.step(2); assert.equal(h.state().vehicle, 'combine', 'swapping to an owned vehicle is free');
});

test('the backyard gate keeps the mower in until the combine is owned (H-F8)', () => {
  const h = open({ fresh: true, coins: 9000 }); h.step(30);
  teleport(h, BACKYARD.gate.x, BACKYARD.fence - 4, Math.PI / 2); h.step(10); // turned to face north, at the gate
  drive(h, 1, 0, 60 * 3);
  assert.ok(h.state().combine.z < BACKYARD.fence, `held by the shut gate (z ${h.state().combine.z})`);
  teleport(h, ZONES.garage.x, ZONES.garage.z); drive(h, 0, 0, 10);
  assert.ok(h.engine.scene.overlays.includes('shop'), 'the garage opens the workshop card');
  h.engine.command('drive', { vehicle: 'combine' }); h.step(10);
  const c = h.state(); assert.ok(Math.hypot(c.combine.x - YARD.start.x, c.combine.z - YARD.start.z) < 1, 'the combine starts at its home in the yard');
  h.engine.command('drive', { vehicle: 'mower' }); h.step(30);
  teleport(h, BACKYARD.gate.x, BACKYARD.fence - 4, Math.PI / 2); h.step(10); // back from its home, facing north
  drive(h, 1, 0, 60 * 3);
  assert.ok(h.state().combine.z > BACKYARD.fence + 2, `through the open gate (z ${h.state().combine.z})`);
});

test('a new farm cannot afford the combine', () => {
  const h = open({ fresh: true, coins: 100 }); h.step(5);
  h.engine.command('drive', { vehicle: 'combine' }); h.step(2);
  assert.equal(h.state().vehicle, 'mower'); assert.equal(h.state().coins, 100);
});
