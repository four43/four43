// v3 R2 (2.7.0): a herd of 22, a named stall each (piglets in mum's), bedtime in the barn, perches in the coop.
import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { headless } from 'lion-hawk/test';
import { pigPensGame } from '../src/game.sim.js';
import { REGION } from '../src/layout.js';
import { ST } from '../src/sim.js';
import { BED, assignStalls, stallAt } from '../src/barn.js';
import { BARN, COOP } from '../src/defs/buildings.js';
import { classify } from '../src/game/pick.js';
import { CST } from '../src/chickens.js';
import { farmSim } from './farmSim.mjs';
import { rayTo, tapAt } from './rays.mjs';
await R.init();

const adultsOf = sim => sim.pigs.filter(p => !p.piglet);
const inStall = p => p.bed?.phase === 'sleep';
const night = (sim, seconds) => { sim.setNight(true); for (let s = 0; s < 60 * seconds; s++) sim.step(); };
const hints = (h, m) => h.events.since(m).of('hint').map(e => e.text);

test('the herd is 22: 16 adults with a stall each (a seeded shuffle, always the same), 6 piglets in their mums’', () => {
  const h = headless(pigPensGame(), { seed: 4 }), sim = h.engine.scene.state.sim;
  assert.equal(sim.pigs.length, 22); assert.equal(adultsOf(sim).length, 16);
  assert.deepEqual(adultsOf(sim).map(p => p.stall).sort((a, b) => a - b), [...Array(16).keys()], 'every stall taken once');
  for (const p of sim.pigs.filter(p => p.piglet)) assert.equal(p.stall, sim.pigs[p.mom].stall, `${p.name} sleeps in mum's stall`);
  assert.deepEqual(assignStalls(16, 4), assignStalls(16, 4)); assert.notDeepEqual(assignStalls(16, 4), assignStalls(16, 5));
  for (let k = 0; k < 16; k++) assert.equal(sim.pigs[sim.stallOwner[k]].stall, k);
});

test('night: every pig that can get to the barn walks into its own stall (piglets by mum) within a minute and lies down', () => {
  for (const seed of [1, 3]) {
    const sim = farmSim({ pigs: 22, seed }); sim.step(300); night(sim, 70);
    for (const p of sim.pigs) {
      assert.ok(inStall(p), `seed ${seed}: ${p.name} in bed (${p.bed?.phase ?? p.state})`);
      const [x, z] = stallAt(p.stall); assert.ok(Math.hypot(p.px - x, p.pz - z) < 0.9, `seed ${seed}: ${p.name} in stall ${p.stall}`);
      assert.equal(p.state, ST.REST);
    }
    assert.equal(sim.counts[REGION.barn], 22);
  }
});

test('a pig shut in its pen sleeps there; shut barn doors: they wait outside, then go in when the doors open', () => {
  const sim = farmSim({ pigs: 22, seed: 3 }); sim.step(120);
  const pen = sim.lay.pens[3], penGates = sim.lay.gates.filter(g => g.kind !== 'barn' && g.x >= pen.x0 - 0.1 && g.x <= pen.x1 + 0.1 && g.z >= pen.z0 - 0.1 && g.z <= pen.z1 + 0.1);
  for (const g of penGates) sim.setGate(g.id, false);
  const shutIn = adultsOf(sim).filter(p => p.px > pen.x0 && p.px < pen.x1 && p.pz > pen.z0 && p.pz < pen.z1);
  assert.ok(shutIn.length > 0, 'some adults in that pen');
  assert.equal(sim.bedtime().stuck, shutIn.length, 'the bedtime report counts them');
  sim.setGate(sim.barnGate.id, false); night(sim, 60);
  for (const p of shutIn) assert.ok(!inStall(p) && p.px > pen.x0 && p.px < pen.x1, `${p.name} stays in its pen`);
  const waiting = adultsOf(sim).filter(p => p.bed?.phase === 'wait');
  assert.ok(waiting.length >= 8, `most wait at the shut doors (${waiting.length})`);
  assert.equal(sim.counts[REGION.barn], 0, 'nobody gets in');
  sim.setGate(sim.barnGate.id, true); for (let s = 0; s < 60 * 50; s++) sim.step();
  for (const p of waiting) assert.ok(inStall(p), `${p.name} goes in once the doors open`);
});

test('morning: doors open, they get up in ones and twos and go home; doors shut, they stay in (and the hint says so)', () => {
  const h = headless(pigPensGame(), { seed: 3, args: { night: true } }), s = h.engine.scene.state, sim = s.sim;
  assert.ok(sim.pigs.every(inStall), 'a night farm starts with everyone in bed');
  sim.setGate(sim.barnGate.id, false);
  let m = h.mark(); h.tap('farm.night'); h.step(60 * 20);
  assert.match(hints(h, m)[0], /Open .*the barn doors/); assert.equal(sim.counts[REGION.barn], 22, 'shut in');
  sim.setGate(sim.barnGate.id, true);
  const left = [];
  h.until(() => { for (const p of sim.pigs) if (!left.includes(p) && !inStall(p)) left.push(p); return sim.counts[REGION.barn] === 0; }, { maxSteps: 60 * 60, message: 'the barn empties' });
  h.step(60 * 40);
  const out = adultsOf(sim).filter(p => p.state === ST.TRAVEL || sim.lay.region(p.px, p.pz) < sim.lay.pens.length);
  assert.ok(out.length >= 12, `most are back out in the pens or on their way (${out.length})`);
  assert.ok(left.length === 22, 'everyone got up');
});

test('night: the hint counts the pigs shut in their pens and says when the barn doors are shut', () => {
  const h = headless(pigPensGame(), { seed: 3 }), sim = h.engine.scene.state.sim; h.step(60);
  const pen = sim.lay.pens[0];
  for (const g of sim.lay.gates.filter(g => g.kind !== 'barn' && g.x >= pen.x0 - 0.1 && g.x <= pen.x1 + 0.1 && g.z >= pen.z0 - 0.1 && g.z <= pen.z1 + 0.1)) sim.setGate(g.id, false);
  sim.setGate(sim.barnGate.id, false);
  const n = sim.bedtime().stuck, m = h.mark(); h.tap('farm.night'); h.step(1);
  assert.ok(n > 0); assert.match(hints(h, m)[0], new RegExp(`${n === 1 ? '1 pig is' : `${n} pigs are`} shut in their pens.*barn doors are shut`));
});

test('day naps: a few pigs wander in for a nap and come out again; never more than napMax at once', () => {
  const sim = farmSim({ pigs: 22, seed: 5 }); let most = 0, napped = new Set(), back = 0;
  for (let s = 0; s < 60 * 300; s++) {
    sim.step(); const naps = sim.pigs.filter(p => p.bed?.nap); most = Math.max(most, naps.length);
    for (const p of naps) napped.add(p.i);
    if (s % 60 === 0) for (const i of napped) if (!sim.pigs[i].bed) back++;
  }
  assert.ok(napped.size > 0, 'someone napped'); assert.ok(most <= BED.napMax, `${most} at once`); assert.ok(back > 0, 'and came out again');
});

test('a pig set down in the barn by day walks to its own stall and naps there', () => {
  const sim = farmSim({ pigs: 22, seed: 3 }); sim.step(60);
  const p = adultsOf(sim)[2], [x, z] = stallAt(p.stall);
  sim.world.place(p, { at: [BARN.x - 2, p.r, BARN.z] }); sim.step(2);
  for (let s = 0; s < 60 * 25 && !inStall(p); s++) sim.step();
  assert.ok(inStall(p) && p.bed.nap, `${p.name} naps (${p.bed?.phase})`); assert.ok(Math.hypot(p.px - x, p.pz - z) < 0.5);
});

test('the coop: every grown bird roosts on its own perch at night, chicks beside their mum; out again in the morning', () => {
  const sim = farmSim({ pigs: 4, seed: 9 }), F = sim.flock; sim.step(120); night(sim, 18); // in bed by 11 s, before the fox
  const grown = F.birds.filter(b => b.kind !== 'chick');
  assert.ok(grown.every(b => b.state === CST.INSIDE), 'all in');
  assert.equal(new Set(grown.map(b => b.perch)).size, grown.length, 'a perch each');
  for (const b of grown) { const [x, y, z] = COOP.perchAt(b.perch); assert.ok(Math.hypot(b.px - (COOP.x + x), b.pz - (COOP.z + z)) < 1e-6 && Math.abs(b.py - y - b.r) < 1e-6, `${b.name} on perch ${b.perch}`); }
  sim.setNight(false); for (let s = 0; s < 60 * 30; s++) sim.step();
  assert.ok(F.birds.filter(b => b.state === CST.INSIDE).length < grown.length / 2, 'out for the day');
});

test('inside the barn a tap on a plaque opens that stall’s pig; in the coop, that perch’s bird', () => {
  const h = headless(pigPensGame(), { seed: 3, args: { night: true } }), s = h.engine.scene.state, sim = s.sim; h.step(30);
  tapAt(h, [BARN.x + 3, BARN.ridge, BARN.z]); assert.equal(s.focus, 'barn');
  const st = BARN.stalls[5], at = [BARN.x + st.plaque[0], st.plaque[1], BARN.z + st.plaque[2]];
  const ray = rayTo(at, 4, 6 * st.out);
  assert.deepEqual(classify(sim, ray, 'barn'), { kind: 'pig', i: sim.stallOwner[5] });
  h.tap('farm.back'); h.step(1);
  const [x, y, z] = COOP.plaqueAt(3), cat = [COOP.x + x, y, COOP.z + z];
  const bird = sim.flock.birds.find(b => b.perch === 3);
  assert.deepEqual(classify(sim, rayTo(cat, 1.5, 4), 'coop'), { kind: 'bird', i: bird.i });
});
