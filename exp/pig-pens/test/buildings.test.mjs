// v3 R1 (2.6.0): the coop, barn and clinic on the north row; tapping a roof goes in; the barn doors; Dr. Maple's day.
import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { headless } from 'lion-hawk/test';
import { pigPensGame } from '../src/game.sim.js';
import { FOCUS_HINT } from '../src/game/farm.js';
import { buildLayout, REGION } from '../src/layout.js';
import { ST } from '../src/sim.js';
import { classify, rayBuilding } from '../src/game/pick.js';
import { BARN, CLINIC, COOP } from '../src/defs/buildings.js';
import { VET_STOPS, PROPS } from '../src/clinic.js';
import { farmSim } from './farmSim.mjs';
import { rayTo, tapAt, tool, arrive } from './rays.mjs';
await R.init();

const lay = buildLayout();
const overlap = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;
const farm = (seed = 3) => { const h = headless(pigPensGame(), { seed, args: { pigs: 24 } }); h.step(30); return { h, s: h.engine.scene.state, sim: h.engine.scene.state.sim }; };
const hints = (h, m) => h.events.since(m).of('hint').map(e => e.text);

test('layout: the coop at the run’s east end, the barn and the clinic beside it, nothing on top of anything', () => {
  const [coop, barn, clinic] = lay.buildings;
  assert.deepEqual(lay.buildings.map(b => b.id), ['coop', 'barn', 'clinic']);
  assert.ok(coop.x1 < lay.run.x1 && coop.x1 > lay.run.x1 - 0.4, 'the coop stands against the run’s east fence');
  assert.ok(barn.x0 >= lay.run.x1 && barn.x0 - lay.run.x1 < 0.3, 'the barn butts up to the run');
  assert.ok(Math.abs(clinic.x0 - barn.x1) < 1e-9, 'the clinic butts up to the barn');
  const f = lay.field;
  for (const b of [barn, clinic]) {
    assert.ok(b.x0 > f.x0 && b.x1 < f.x1 && b.z0 > f.z0 && b.z1 < f.z1, `${b.id} is on the farm`);
    assert.ok(!overlap(b, lay.complex) && !overlap(b, lay.run), `${b.id} keeps off the pens and the run`);
    assert.ok(lay.complex.z0 - b.z1 > 3, `${b.id}'s front has field in front of it`);
  }
  for (const n of lay.nests) assert.ok(n.x + 0.4 < coop.x0 && n.x - 0.4 > lay.run.x0, `nest ${n.id} in the run, clear of the coop`);
  for (const d of lay.decor.filter(d => ['hayB', 'treeFat', 'oak', 'tree', 'barrel', 'hay', 'dogHouse'].includes(d.m)))
    for (const b of lay.buildings) assert.ok(!(d.x > b.x0 - 1 && d.x < b.x1 + 1 && d.z > b.z0 - 1 && d.z < b.z1 + 1), `${d.m} at ${d.x},${d.z} clear of the ${b.id}`);
});

test('the barn: 16 stalls inside its walls, none overlapping, the doors a gate of their own, its own region', () => {
  assert.equal(BARN.stalls.length, 16);
  const S = BARN.stalls.map(s => ({ x0: s.x0 + 1e-6, x1: s.x1 - 1e-6, z0: s.z0, z1: s.z1 }));
  for (let i = 0; i < 16; i++) for (let j = i + 1; j < 16; j++) assert.ok(!overlap(S[i], S[j]), `stalls ${i} and ${j}`);
  for (const s of BARN.stalls) assert.ok(s.x0 >= BARN.inner.x0 - 1e-9 && s.x1 <= BARN.inner.x1 + 1e-9 && s.x1 - s.x0 > 1.4, `stall ${s.id} fits`);
  const door = lay.gates.find(g => g.kind === 'barn');
  assert.ok(door && door.open && Math.abs(door.width - BARN.door.w) < 1e-9 && door.leaves.length === 2);
  assert.equal(lay.obstacles.filter(o => o.divider !== undefined).length, 15, 'a divider between every pair of neighbours and at each side of the doorway');
  assert.equal(lay.region(BARN.x, BARN.z), REGION.barn); assert.equal(lay.region(BARN.x + 6, BARN.z + BARN.d / 2 + 1), REGION.field);
});

test('picks: a roof from above goes in, an animal or the coop door in front wins, the focused building is not a target', () => {
  const sim = farmSim({ pigs: 4, seed: 3 });
  assert.deepEqual(classify(sim, rayTo([BARN.x + 3, BARN.ridge, BARN.z], 30, 12)), { kind: 'building', id: 'barn' });
  assert.deepEqual(classify(sim, rayTo([CLINIC.x, CLINIC.ridge, CLINIC.z - 1], 30, 12)), { kind: 'building', id: 'clinic' });
  assert.deepEqual(classify(sim, rayTo([COOP.x - 0.6, COOP.ridge - 0.2, COOP.z], 25, 10)), { kind: 'building', id: 'coop' });
  // the coop's front wall is still its door; the barn's doorway is its gate
  assert.deepEqual(classify(sim, rayTo([sim.lay.coop.doorX, 0.6, sim.lay.coop.doorZ + 0.05], 3, 8)), { kind: 'door' });
  const door = sim.lay.gates.find(g => g.kind === 'barn');
  assert.deepEqual(classify(sim, rayTo([door.x, 1.2, door.z + 0.1], 2, 10)), { kind: 'gate', id: door.id });
  // a pig standing in front of the barn wins over the barn behind it
  const p = sim.pigs[0]; sim.world.place(p, { at: [BARN.x + 4, p.r, BARN.z + BARN.d / 2 + 1.2] }); sim.step();
  assert.equal(classify(sim, rayTo([p.px, p.py, p.pz], 6, 10)).kind, 'pig');
  // in focus: the barn's own roof is no target, a ground tap well outside it is "outside"
  assert.equal(rayBuilding(sim.lay, rayTo([BARN.x + 3, BARN.ridge, BARN.z], 30, 12), 'barn')?.b.id ?? null, null);
  assert.deepEqual(classify(sim, rayTo([BARN.x, 0, BARN.z + BARN.d / 2 + 6], 20, 4), 'barn'), { kind: 'outside' });
  assert.equal(classify(sim, rayTo([BARN.x + 2, 0, BARN.z], 20, 0.5), 'barn'), null, 'the barn floor is no target');
});

const flights = (h, m) => h.events.since(m).of('fly').map(e => e.to);
test('focus (2.10.0): a roof tap, Outside, Escape and the grass only fly the camera; the camera arriving goes in and out', () => {
  const { h, s } = farm();
  let m = h.mark(); tapAt(h, [BARN.x + 3, BARN.ridge, BARN.z]);
  assert.deepEqual(flights(h, m), ['barn']); assert.equal(s.focus, null, 'a tap alone does not go in');
  m = h.mark(); arrive(h, 'barn');
  assert.equal(s.focus, 'barn'); assert.equal(h.state().focus, 'barn');
  assert.deepEqual(h.events.since(m).of('focus').map(e => e.focus), ['barn']); assert.deepEqual(hints(h, m), [FOCUS_HINT.barn]);
  assert.equal(h.enabled('farm.back'), true);
  m = h.mark(); tapAt(h, [CLINIC.x, CLINIC.ridge, CLINIC.z - 1]); assert.deepEqual(flights(h, m), ['clinic']); arrive(h, 'clinic'); assert.equal(s.focus, 'clinic', 'another roof switches buildings');
  m = h.mark(); h.tap('farm.back'); h.step(1); assert.deepEqual(flights(h, m), [null]); assert.equal(s.focus, 'clinic', 'Outside flies out…');
  arrive(h, null); assert.equal(s.focus, null, '…and the camera pulling away leaves'); assert.equal(h.enabled('farm.back'), false);
  tapAt(h, [COOP.x - 0.6, COOP.ridge - 0.2, COOP.z]); arrive(h, 'coop'); assert.equal(s.focus, 'coop');
  s.selected = { kind: 'dog' };
  m = h.mark(); h.step(1, { back: true }); h.step(1); assert.equal(s.selected, null); assert.deepEqual(flights(h, m), [], 'Escape closes the card first');
  m = h.mark(); h.step(1, { back: true }); h.step(1); assert.deepEqual(flights(h, m), [null]);
  m = h.mark(); tapAt(h, [BARN.x, 0, BARN.z + BARN.d / 2 + 6]); assert.deepEqual(flights(h, m), [null], 'a ground tap outside flies out');
  assert.throws(() => arrive(h, 'moon'), /no building 'moon'/);
});

test('inside, Shoo, Feed and Hose stay outside (a hint, nothing happens); the Hand and Grab still work', () => {
  const { h, s, sim } = farm();
  tapAt(h, [BARN.x + 3, BARN.ridge, BARN.z]); arrive(h, 'barn'); assert.equal(s.focus, 'barn');
  for (const t of ['shoo', 'feed', 'hose']) {
    h.tap(`farm.tool.${t}`); h.step(1);
    const m = h.mark(); const foods = sim.foods.length;
    tool(h, 'down', [BARN.x, 0, BARN.z]); h.step(5); assert.equal(sim.dog.active, false); assert.equal(sim.hose.active, false);
    tool(h, 'up', [BARN.x, 0, BARN.z]); tool(h, 'tap', [BARN.x, 0, BARN.z]); h.step(1);
    assert.equal(sim.foods.length, foods); assert.deepEqual(hints(h, m).filter(x => /^Step outside/.test(x)).length, 1, t);
  }
});

test('the barn doors open and shut from a tap on the doorway, like a gate; shut, they are a barrier', () => {
  const { h, sim } = farm();
  const door = sim.lay.gates.find(g => g.kind === 'barn');
  tapAt(h, [door.x, 1.2, door.z + 0.1], { ray: rayTo([door.x, 1.2, door.z + 0.1], 2, 10) });
  assert.equal(door.open, false); assert.equal(door.barrier.active, true); assert.equal(h.state().gates[door.id], false);
  tapAt(h, [door.x, 1.2, door.z + 0.1], { ray: rayTo([door.x, 1.2, door.z + 0.1], 2, 10) }); assert.equal(door.open, true);
});

test('Dr. Emmy: about her clinic and her rounds by day, off to bed at night, up again in the morning', () => {
  const { h, sim } = farm(), v = sim.vet, C = sim.lay.clinic, seen = new Set();
  // in the clinic, or out on the strip of field between the buildings and the pens (her rounds, 2.9.0)
  const inside = () => (v.x > C.x0 && v.x < C.x1 && v.z > C.z0 && v.z < C.z1) || (v.z > C.z1 - 0.1 && v.z < lay.complex.z0 - 0.5) || (v.x < lay.buildings[1].x0 && v.z > lay.run.z1);
  h.until(() => { if (v.state === 'idle') seen.add(v.node); assert.ok(inside(), `in the clinic or on her rounds (${v.x.toFixed(1)}, ${v.z.toFixed(1)})`); return seen.size >= 3; }, { maxSteps: 60 * 240, message: 'three stops' });
  assert.ok([...seen].every(k => k in VET_STOPS), [...seen].join());
  h.tap('farm.night'); h.until(() => v.state === 'sleep', { maxSteps: 60 * 60, message: 'bed' });
  const bed = CLINIC.spots.bed.at; assert.ok(Math.hypot(v.x - (CLINIC.x + bed[0]), v.z - (CLINIC.z + bed[2])) < 1e-6, 'in her bed');
  h.step(600); assert.equal(v.state, 'sleep', 'asleep all night');
  h.tap('farm.night'); h.until(() => v.state === 'walk', { maxSteps: 60 * 10, message: 'up in the morning' });
  h.until(() => v.state === 'idle', { maxSteps: 60 * 60 }); assert.ok(inside());
  assert.deepEqual(h.state().vet.state, 'idle');
});

test('a farm that starts at night has the vet asleep in bed', () => {
  const sim = farmSim({ pigs: 4, seed: 3, night: true }); assert.equal(sim.vet.state, 'sleep');
});

test('in the clinic, a tap on Dr. Emmy opens her card; outside it, her roof hides her', () => {
  const { h, s, sim } = farm(), v = sim.vet;
  h.until(() => v.state === 'idle', { maxSteps: 60 * 30 });
  const at = [v.x, 0.9, v.z];
  assert.notEqual(classify(sim, rayTo(at, 30, 12))?.kind, 'vet', 'outside: the roof');
  tapAt(h, [CLINIC.x, CLINIC.ridge, CLINIC.z - 1]); arrive(h, 'clinic'); assert.equal(s.focus, 'clinic');
  tapAt(h, at, { ray: rayTo(at, 12, 6) }); assert.deepEqual(s.selected, { kind: 'vet' });
});

test('inside the coop: the grass in front of it goes back out; only the pop door itself opens and shuts it', () => {
  const { h, s, sim } = farm(), c = sim.lay.coop;
  tapAt(h, [COOP.x - 0.6, COOP.ridge - 0.2, COOP.z]); arrive(h, 'coop'); assert.equal(s.focus, 'coop');
  const door = [c.doorX, COOP.floor + 0.3, c.doorZ];
  tapAt(h, door, { ray: rayTo(door, 6, 5) }); assert.equal(c.open, false, 'the pop door shuts'); assert.equal(s.focus, 'coop');
  tapAt(h, door, { ray: rayTo(door, 6, 5) }); assert.equal(c.open, true);
  for (const g of [[c.doorX, 0, c.rampZ + 0.9], [c.x - c.hx - 1, 0, c.doorZ + 0.6], [c.x, 0, c.rampZ + 2]]) {
    tapAt(h, [COOP.x - 0.6, COOP.ridge - 0.2, COOP.z]); arrive(h, 'coop'); assert.equal(s.focus, 'coop');
    const m = h.mark(); tapAt(h, g, { ray: rayTo(g, 6, 5) }); assert.deepEqual(flights(h, m), [null], `grass at ${g} flies out`); assert.equal(c.open, true, 'and leaves the door alone');
    arrive(h, null);
  }
});

test('Dr. Emmy walks round the reception desk, never through it', () => {
  const { h, sim } = farm(7), v = sim.vet, d = CLINIC.spots.desk.at;
  const desk = { x0: CLINIC.x + d[0] - 0.42, x1: CLINIC.x + d[0] + 0.42, z0: CLINIC.z + d[2] - 0.78, z1: CLINIC.z + d[2] + 0.78 };
  let visits = 0;
  h.until(() => {
    assert.ok(!(v.x > desk.x0 && v.x < desk.x1 && v.z > desk.z0 && v.z < desk.z1), `in the desk at ${v.x.toFixed(2)}, ${v.z.toFixed(2)}`);
    if (v.state === 'idle' && v.node === 'deskVet') visits++;
    return visits > 0 && v.state === 'walk' && v.node !== 'deskVet';
  }, { maxSteps: 60 * 600, message: 'to the desk and away again' });
  assert.equal(v.name, 'Dr. Emmy');
});

test('the fox comes out of the woods well beyond the boundary, and runs round the buildings, never through them', () => {
  for (const seed of [9, 4, 11]) {
    const sim = farmSim({ pigs: 12, seed }), f = sim.flock.fox, fl = sim.lay.field; sim.step(120); sim.setNight(true);
    let spawned = false;
    for (let s = 0; s < 60 * 90; s++) {
      sim.step();
      for (const e of sim.log.splice(0)) if (e.type === 'fox') { spawned = true; assert.ok(e.x < fl.x0 - 10 || e.z < fl.z0 - 10, `seed ${seed}: spawned out in the woods (${e.x}, ${e.z})`); }
      if (f.state === 0) continue;
      // through a wall = its middle more than its own radius (0.3 m) inside; catching a hen against a wall may touch it
      const r = 0.3;
      for (const b of sim.lay.buildings) assert.ok(!(f.x > b.x0 + r && f.x < b.x1 - r && f.z > b.z0 + r && f.z < b.z1 - r), `seed ${seed}: the fox in the ${b.id} at ${f.x.toFixed(2)}, ${f.z.toFixed(2)}`);
    }
    assert.ok(spawned, `seed ${seed}: a fox came`);
  }
});

test('the aisles are an upside-down T: the stem runs from the barn doors down to the lane, two wide pens either side of it', () => {
  assert.equal(lay.pens.length, 5);
  const [a, b] = lay.pens; assert.ok(a.x1 <= lay.stem.x0 + 1e-9 && b.x0 >= lay.stem.x1 - 1e-9 && a.x1 - a.x0 > 14, 'the north pens flank the stem, wider than before');
  assert.ok(Math.abs(lay.stem.z1 - lay.lane.z0) < 1e-9, 'the stem meets the lane');
  const door = lay.gates.find(g => g.kind === 'barn');
  assert.ok(door.x0 >= lay.stem.x0 && door.x1 <= lay.stem.x1, 'the barn doors open over the stem');
  assert.equal(lay.region((lay.stem.x0 + lay.stem.x1) / 2, (lay.stem.z0 + lay.stem.z1) / 2), REGION.aisle);
  assert.equal(lay.region((lay.lane.x0 + lay.lane.x1) / 2, (lay.lane.z0 + lay.lane.z1) / 2), REGION.aisle);
  // nothing fences the stem off from the barn or the lane
  for (const e of lay.edges) if (e.dir === 'x' && e.x > lay.stem.x0 && e.x < lay.stem.x1) assert.ok(!(Math.abs(e.z - lay.stem.z0) < 1e-9 || Math.abs(e.z - lay.stem.z1) < 1e-9), `a fence across the stem at z ${e.z}`);
  // east-side gates mirror their western twins
  for (const g of lay.gates.filter(g => g.dir === 'z' && g.kind !== 'barn')) {
    const twin = lay.gates.find(o => o.dir === 'z' && Math.abs(o.x + g.x) < 1e-9 && Math.abs(o.z - g.z) < 1e-9);
    if (twin && twin !== g) assert.equal(g.swing, -twin.swing, `gate ${g.id} swings opposite its twin ${twin.id}`);
  }
});

test('in the clinic, the flat’s things work from a tap: shower, sinks, toilet, laptop, fridge (2.9.0)', () => {
  const { h, s, sim } = farm(), P = sim.clinic.props;
  const mid = id => { const [[x0, x1], [y0, y1], [z0, z1]] = CLINIC.props[id].box; return [CLINIC.x + (x0 + x1) / 2, (y0 + y1) / 2, CLINIC.z + (z0 + z1) / 2]; };
  const tap = id => tapAt(h, mid(id), { ray: rayTo(mid(id), 10, 1) });
  for (const id of Object.keys(CLINIC.props)) assert.notEqual(classify(sim, rayTo(mid(id), 10, 1))?.kind, 'prop', `outside, the roof hides the ${id}`);
  tapAt(h, [CLINIC.x, CLINIC.ridge, CLINIC.z - 1]); arrive(h, 'clinic'); assert.equal(s.focus, 'clinic');
  for (const id of Object.keys(CLINIC.props)) assert.deepEqual(classify(sim, rayTo(mid(id), 10, 1), 'clinic'), { kind: 'prop', id }, id);
  const secs = t => h.step(Math.ceil(t * 60) + 2);
  // the shower runs a while, or until tapped again
  tap('shower'); assert.equal(P.shower.state, 'on'); secs(PROPS.shower); assert.equal(P.shower.state, 'off');
  tap('shower'); tap('shower'); assert.equal(P.shower.state, 'off');
  // the bathroom basin: the tap runs while it fills, it stands full, it drains; a tap meanwhile changes nothing
  tap('bathSink'); assert.equal(P.bathSink.state, 'run'); tap('bathSink'); assert.equal(P.bathSink.state, 'run');
  secs(PROPS.bathSink.run); assert.equal(P.bathSink.state, 'full');
  secs(PROPS.bathSink.full); assert.equal(P.bathSink.state, 'drain');
  secs(PROPS.bathSink.drain); assert.equal(P.bathSink.state, 'off');
  // the other taps: a little splash
  for (const id of ['kitchenSink', 'examSink']) { tap(id); assert.equal(P[id].state, 'on', id); secs(PROPS.sink); assert.equal(P[id].state, 'off', id); }
  // the toilet: the lid up, then a flush, and the lid comes down
  assert.equal(P.toilet.state, 'shut'); tap('toilet'); assert.equal(P.toilet.state, 'open');
  tap('toilet'); assert.equal(P.toilet.state, 'flush'); secs(PROPS.flush); assert.equal(P.toilet.state, 'shut');
  // the laptop (open to start with) and the fridge (shut) open and shut
  tap('laptop'); assert.equal(P.laptop.state, 'shut'); tap('laptop'); assert.equal(P.laptop.state, 'open');
  tap('fridge'); assert.equal(P.fridge.state, 'open'); tap('fridge'); assert.equal(P.fridge.state, 'shut');
  assert.equal(s.focus, 'clinic', 'and none of it leaves the clinic');
  assert.deepEqual(h.state().clinic.props, Object.fromEntries(Object.keys(CLINIC.props).map(id => [id, P[id].state])));
});

test('Dr. Emmy’s rounds: out of the front door to the pens; pigs come to their fence for a scratch, and keep out of her way', () => {
  const { h, sim } = farm(), v = sim.vet, dbg = h.engine.game.debug(h.engine);
  dbg.vetTo('penEast'); h.until(() => v.node === 'penEast' && v.state === 'idle', { maxSteps: 60 * 60, message: 'at the pens' });
  assert.ok(v.outside); assert.equal(v.doing, VET_STOPS.penEast);
  let m = h.mark(), close = Infinity;
  h.until(() => {
    for (const p of sim.pigs) close = Math.min(close, Math.hypot(p.px - v.x, p.pz - v.z) - p.r);
    return h.events.since(m).first('pet');
  }, { maxSteps: 60 * 60, message: 'a scratch' });
  const pet = h.events.since(m).first('pet'), p = sim.pigs[pet.i];
  assert.equal(pet.kind, 'pig'); assert.ok(lay.region(p.px, p.pz) < lay.pens.length || Math.hypot(p.px - v.x, p.pz - v.z) < 1.4, `${p.name} at the fence of its pen, or by her`);
  assert.ok(Math.hypot(p.px - v.x, p.pz - v.z) < 3, `${p.name} came over`);
  assert.ok(close > 0.2, `nobody walked through her (${close.toFixed(2)} m)`);
  assert.notEqual(p.state, ST.VISIT, 'and off it goes');
});

test('Dr. Emmy’s rounds: at the chicken run, the hens come to the fence; and she hurries back for a patient', () => {
  const { h, sim } = farm(), v = sim.vet, dbg = h.engine.game.debug(h.engine);
  dbg.vetTo('run'); h.until(() => v.node === 'run' && v.state === 'idle', { maxSteps: 60 * 90, message: 'at the run' });
  const m = h.mark(); h.until(() => h.events.since(m).first('pet'), { maxSteps: 60 * 60, message: 'a scratch' });
  const pet = h.events.since(m).first('pet'), b = sim.flock.birds[pet.i], r = lay.run;
  assert.equal(pet.kind, 'bird'); assert.ok(b.px > r.x0 && b.px < r.x1 && b.pz > r.z0 && b.pz < r.z1, `${b.name} stayed in the run`);
  // a patient waiting and you in the exam room: back she comes, quick
  const p = sim.pigs.find(q => !q.piglet); dbg.sicken('pig', p.i, 'cold'); sim.clinic.admit('pig', p.i); sim.clinic.open = true;
  h.until(() => v.node === 'examVet' && v.state === 'idle', { maxSteps: 60 * 45, message: 'back in the exam room' });
});
