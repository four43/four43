// v3 R3 (2.8.0): sickness with causes you can see, the clinic's waiting room, Dr. Emmy's exam with the pegboard tools.
import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { headless } from 'lion-hawk/test';
import { pigPensGame } from '../src/game.sim.js';
import { ST } from '../src/sim.js';
import { CST } from '../src/chickens.js';
import { SICK, AILMENTS } from '../src/sickness.js';
import { CLINIC, BARN } from '../src/defs/buildings.js';
import { EXAM_DRAG } from '../src/game/farm.js';
import { farmSim } from './farmSim.mjs';
import { rayTo, tapAt } from './rays.mjs';
import { grabTarget } from '../src/game/pick.js';
await R.init();

const farm = (args = {}, seed = 3) => { const h = headless(pigPensGame(), { seed, args }); h.step(30); return { h, s: h.engine.scene.state, sim: h.engine.scene.state.sim, dbg: h.engine.game.debug(h.engine) }; };
const hints = (h, m) => h.events.since(m).of('hint').map(e => e.text);
const adults = sim => sim.pigs.filter(p => !p.piglet);
// a ray from `east` m east of a point (the exam close-up's camera stands east of the table), aimed at it
const fromEast = ([x, y, z], east = 3, up = 0.8) => { const o = [x + east, y + up, z], d = [x - o[0], y - o[1], z - o[2]], l = Math.hypot(...d); return [...o, d[0] / l, d[1] / l, d[2] / l]; };
const cmd = (h, phase, ray) => h.command('tool', { phase, pointer: 1, button: 0, kind: 'touch', ray });
// carry a pegboard tool onto the patient (the exam's drag gesture, as the view sends it)
function useTool(h, sim, tool) {
  const peg = CLINIC.pegs.find(p => p.tool === tool), at = [CLINIC.x + peg.at[0] + 0.05, peg.at[1] - 0.2, CLINIC.z + peg.at[2]];
  const p = sim.clinic.patient(), onto = [p.px, p.py + EXAM_DRAG.lift, p.pz];
  cmd(h, 'down', fromEast(at)); h.step(1);
  cmd(h, 'move', fromEast(onto, 2.5, 1.5)); h.step(1);
  cmd(h, 'up', fromEast(onto, 2.5, 1.5)); h.step(1);
}
function intoExam(h, s) {
  tapAt(h, [CLINIC.x, CLINIC.ridge, CLINIC.z - 1]); assert.equal(s.focus, 'clinic');
  // a bit of the exam room's floor away from Dr. Emmy (a tap on her opens her card)
  const R0 = CLINIC.examRoom, v = s.sim.vet, spots = [[R0.x0 + 0.6, R0.z0 + 0.6], [R0.x1 - 0.6, R0.z0 + 0.6], [R0.x0 + 0.6, R0.z1 - 0.6]].map(([x, z]) => [CLINIC.x + x, 0, CLINIC.z + z]);
  const at = spots.find(p => Math.hypot(p[0] - v.x, p[2] - v.z) > 1.4);
  tapAt(h, at, { ray: rayTo(at, 10, 4) }); assert.equal(s.focus, 'clinic.exam');
}

test('the four ailments: a check-up clue for each, the treatments in order; chickens never get ear aches', () => {
  assert.deepEqual(Object.keys(AILMENTS), ['cold', 'tummy', 'splinter', 'ear']);
  assert.deepEqual(AILMENTS.splinter.cure, ['tweezers', 'bandage']);
  for (const a of Object.values(AILMENTS)) assert.ok(Object.keys(a.clue).length > 0);
  const { sim } = farm(); sim.sickness.tune('maxSick', 5);
  assert.equal(sim.sickness.sicken('bird', sim.flock.birds[1], 'ear'), false);
  assert.equal(sim.sickness.sicken('bird', sim.flock.birds[1], 'cold'), true);
});

test('a cold: wet or muddy and asleep out in the open at night (not in the barn)', () => {
  const { sim } = (farm.last = farm());
  sim.sickness.tune('coldChance', 1); sim.sickness.tune('coldCheck', 3); sim.sickness.tune('maxSick', 30);
  const pen = sim.lay.pens[2], gates = sim.lay.gates.filter(g => g.kind !== 'barn' && g.x >= pen.x0 - 0.1 && g.x <= pen.x1 + 0.1 && g.z >= pen.z0 - 0.1 && g.z <= pen.z1 + 0.1);
  for (const g of gates) sim.setGate(g.id, false); // these pigs sleep out tonight
  const out = sim.pigs.filter(p => p.px > pen.x0 && p.px < pen.x1 && p.pz > pen.z0 && p.pz < pen.z1);
  for (const p of sim.pigs) p.wet = 1; // everyone has just been hosed
  const { h } = farm.last; sim.setNight(true); h.step(60 * 4);
  for (const p of out) assert.equal(p.sick?.ailment, 'cold', `${p.name} slept out wet`);
  assert.ok(sim.pigs.filter(p => p.sick).every(p => out.includes(p) || !(p.bed?.phase === 'sleep')), 'nobody in bed in the barn catches cold');
});

test('a tummy ache from too many snacks; a splinter from a hard knock; the odd ear ache; at most maxSick, a cooldown after', () => {
  const { h, sim } = farm(); const S = sim.sickness;
  S.tune('tummyChance', 1); S.tune('tummySnacks', 2); S.tune('splinterChance', 1); S.tune('earInterval', 2); S.tune('maxSick', 3);
  const [a, b, c, d] = adults(sim);
  S.onEat('pig', a); assert.equal(a.sick, undefined); S.onEat('pig', a); assert.equal(a.sick.ailment, 'tummy');
  S.onImpact('pig', b, SICK.splinterImpact - 1); assert.ok(!b.sick, 'a bump is nothing'); S.onImpact('pig', b, SICK.splinterImpact + 1); assert.equal(b.sick.ailment, 'splinter');
  S.onEat('pig', c); S.onEat('pig', c); assert.equal(c.sick.ailment, 'tummy');
  S.onEat('pig', d); S.onEat('pig', d); assert.ok(!d.sick, 'three poorly already: maxSick');
  for (const x of [a, b, c]) S.cure('pig', x);
  S.onEat('pig', a); S.onEat('pig', a); assert.ok(!a.sick, 'just cured: cooldown');
  h.step(60 * 3); assert.equal(sim.pigs.filter(p => p.sick?.ailment === 'ear').length, 1, 'an ear ache out of the blue when nobody is poorly');
});

test('a poorly pig goes green, slows down, and leaves the snacks and troughs alone', () => {
  const { h, sim, dbg } = farm(); const p = adults(sim)[0];
  dbg.sicken('pig', p.i, 'tummy'); h.step(60 * SICK.greenEase + 10);
  assert.ok(p.green > 0.99, 'green');
  p.hunger = 1; h.step(60 * 10);
  assert.equal(p.state === ST.EAT || p.state === ST.SNACK || p.trough >= 0, false, 'off its food');
  sim.tossFood(p.px, 3, p.pz + 3, p.px, p.pz + 0.6); h.step(60 * 4); assert.notEqual(p.state, ST.SNACK);
  let top = 0; for (let k = 0; k < 60 * 20; k++) { h.step(1); top = Math.max(top, p.speed); }
  assert.ok(top < 1.25 * 0.65 + 0.3, `slow (${top.toFixed(2)})`);
  dbg.cure('pig', p.i); h.step(60 * SICK.greenEase + 10); assert.ok(p.green < 0.01, 'pink again');
});

test('drop-off: a healthy one is turned away; a poorly one sits in the waiting room in drop-off order; six places', () => {
  const { h, sim, dbg } = farm(); sim.sickness.tune('maxSick', 20);
  const A = adults(sim);
  assert.equal(sim.clinic.admit('pig', A[0].i), 'healthy'); h.step(1);
  assert.equal(A[0].state, ST.ZOOM, 'a happy hop out of the door'); assert.ok(Math.abs(A[0].pz - (CLINIC.z + CLINIC.spots.frontDoor[2])) < 1);
  for (let k = 1; k <= 7; k++) dbg.sicken('pig', A[k].i, 'cold');
  for (let k = 1; k <= 6; k++) assert.equal(sim.clinic.admit('pig', A[k].i), 'in');
  assert.equal(sim.clinic.admit('pig', A[7].i), 'full');
  assert.deepEqual(sim.clinic.queue.map(q => q.i), A.slice(1, 7).map(p => p.i));
  for (let k = 1; k <= 6; k++) {
    const p = A[k], [x, y, z] = CLINIC.spots.benches[k - 1];
    assert.equal(p.state, ST.CLINIC); assert.ok(Math.hypot(p.px - CLINIC.x - x, p.pz - CLINIC.z - z) < 1e-6 && Math.abs(p.py - y - p.r) < 1e-6, `${p.name} on its bench`);
  }
  h.step(60 * 10); assert.ok(A.slice(1, 7).every(p => p.state === ST.CLINIC && p.sick), 'they wait (and stay poorly)');
});

test('Grab: a poorly pig let go over the clinic is checked in; a chicken too', () => {
  const { h, s, sim, dbg } = farm(); const p = adults(sim)[3];
  const b = sim.flock.birds.find(o => grabTarget(sim, rayTo([o.px, o.py, o.pz], 20, 0.01))?.i === o.i); // one the press picks (none stood on it)
  dbg.sicken('pig', p.i, 'cold'); dbg.sicken('bird', b.i, 'tummy');
  h.tap('farm.tool.grab'); h.step(1);
  for (const [a, kind] of [[p, 'pig'], [b, 'bird']]) {
    const at = [a.px, a.py, a.pz], over = [CLINIC.x, 0, CLINIC.z + 1];
    h.command('tool', { phase: 'down', pointer: 1, button: 0, kind: 'touch', ray: rayTo(at, 20, 0.01) }); h.step(2);
    assert.ok(kind === 'pig' ? sim.grabbed === a.i : sim.flock.grabbed === a.i, `holding ${a.name}`);
    h.command('tool', { phase: 'move', pointer: 1, button: 0, kind: 'touch', ray: rayTo(over, 20, 0.01) }); h.step(20);
    h.command('tool', { phase: 'up', pointer: 1, button: 0, kind: 'touch', ray: rayTo(over, 20, 0.01) }); h.step(2);
    assert.ok(a.clinic, `${a.name} is in the waiting room`);
  }
  assert.equal(b.state, CST.CLINIC); assert.equal(sim.clinic.queue.length, 2);
});

test('a visit: into the exam room, “Next please!”, a check-up clue, a wrong tool, the cure, a lollipop, and out home', () => {
  const { h, s, sim, dbg } = farm(); const p = adults(sim)[4];
  dbg.sicken('pig', p.i, 'cold'); sim.clinic.admit('pig', p.i);
  intoExam(h, s);
  h.until(() => sim.clinic.exam.state === 'patient', { maxSteps: 60 * 30, message: 'the patient on the table' });
  const T = CLINIC.spots.examTable.at;
  assert.ok(Math.hypot(p.px - CLINIC.x - T[0], p.pz - CLINIC.z - T[2]) < 1e-6 && p.py > CLINIC.spots.tableTop, 'up on the table');
  assert.equal(sim.vet.node, 'examVet');
  let m = h.mark(); useTool(h, sim, 'stethoscope');
  assert.equal(h.events.since(m).first('exam')?.text, AILMENTS.cold.clue.stethoscope);
  m = h.mark(); useTool(h, sim, 'spoon');
  assert.equal(h.events.since(m).first('exam')?.what, 'oops'); assert.ok(p.sick, 'still poorly');
  m = h.mark(); useTool(h, sim, 'shot');
  assert.equal(h.events.since(m).first('exam')?.what, 'cured'); assert.equal(p.sick, null); assert.equal(sim.clinic.exam.state, 'cured');
  h.until(() => !p.clinic, { maxSteps: 60 * 5 });
  assert.equal(p.state, ST.ZOOM); assert.ok(p.pz > sim.lay.clinic.z1, 'out of the front door');
  assert.equal(sim.clinic.queue.length, 0); assert.equal(sim.clinic.exam.state, 'empty');
});

test('a splinter: tweezers, then the bandage (the bandage first gets a “first things first”)', () => {
  const { h, s, sim, dbg } = farm(); const p = adults(sim)[5];
  dbg.sicken('pig', p.i, 'splinter'); sim.clinic.admit('pig', p.i); intoExam(h, s);
  h.until(() => sim.clinic.exam.state === 'patient', { maxSteps: 60 * 30 });
  let m = h.mark(); useTool(h, sim, 'bandage'); assert.match(h.events.since(m).first('exam').text, /splinter out first/);
  useTool(h, sim, 'tweezers'); assert.ok(p.sick, 'one step to go');
  m = h.mark(); useTool(h, sim, 'bandage'); assert.equal(h.events.since(m).first('exam')?.what, 'cured');
});

test('a tool let go away from the patient goes back on the board; nobody is called while you are outside the exam room', () => {
  const { h, s, sim, dbg } = farm(); const p = adults(sim)[6];
  dbg.sicken('pig', p.i, 'ear'); sim.clinic.admit('pig', p.i);
  h.step(60 * 10); assert.equal(sim.clinic.exam.state, 'empty', 'waiting until you look in');
  intoExam(h, s); h.until(() => sim.clinic.exam.state === 'patient', { maxSteps: 60 * 30 });
  const peg = CLINIC.pegs.find(q => q.tool === 'drops'), at = [CLINIC.x + peg.at[0] + 0.05, peg.at[1] - 0.2, CLINIC.z + peg.at[2]];
  cmd(h, 'down', fromEast(at)); h.step(1); assert.equal(s.exam.drag.tool, 'drops');
  const away = [p.px, p.py + 1.0, p.pz + 1.4];
  cmd(h, 'move', fromEast(away, 2.5, 1.5)); cmd(h, 'up', fromEast(away, 2.5, 1.5)); h.step(1);
  assert.equal(s.exam.drag, null); assert.ok(p.sick, 'not used');
  h.step(1, { back: true }); h.step(1); assert.equal(s.focus, 'clinic', 'Back: out to the clinic'); h.step(1, { back: true }); h.step(1); assert.equal(s.focus, null);
});

test('night: the vet is asleep, the exam room shut (a hint), but drop-offs still wait on the benches', () => {
  const { h, s, sim, dbg } = farm(); const p = adults(sim)[7];
  h.tap('farm.night'); h.until(() => sim.vet.state === 'sleep', { maxSteps: 60 * 60 });
  dbg.sicken('pig', p.i, 'cold'); assert.equal(sim.clinic.admit('pig', p.i), 'in');
  tapAt(h, [CLINIC.x, CLINIC.ridge, CLINIC.z - 1]);
  const R0 = CLINIC.examRoom, at = [CLINIC.x + (R0.x0 + R0.x1) / 2, 0, CLINIC.z + (R0.z0 + R0.z1) / 2];
  const m = h.mark(); tapAt(h, at, { ray: rayTo(at, 10, 4) });
  assert.equal(s.focus, 'clinic'); assert.match(hints(h, m).join(), /vet’s asleep/);
  h.step(60 * 10); assert.equal(p.state, ST.CLINIC);
});

test('tune: the SICK values are this farm’s own, through the `tune` command; a bad key or value is an error', () => {
  const a = farm(), b = farm();
  a.h.command('tune', { key: 'coldChance', value: '1' }); a.h.step(1);
  assert.equal(a.sim.sickness.T.coldChance, 1); assert.equal(b.sim.sickness.T.coldChance, SICK.coldChance, 'not shared');
  assert.throws(() => a.sim.sickness.tune('nope', 1), /no SICK value 'nope'/);
  assert.throws(() => a.sim.sickness.tune('coldChance', 'lots'), /needs a number/);
});
