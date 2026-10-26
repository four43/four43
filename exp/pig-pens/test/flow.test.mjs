// Headless flows (lion-hawk 2e, [T-1]–[T-5], [T-9]): Pig Pens' farm scene, its controls, tools and drive mode.
import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { headless, canonical } from 'lion-hawk/test';
import { pigPensGame } from '../src/game.sim.js';
import { TOOLS, START_HINT, TOOL_HINT } from '../src/game/farm.js';
import { ST } from '../src/sim.js';
import { classify } from '../src/game/pick.js';
import { tool, tapAt, rayTo, findPig, emptyAt, waitFor } from './rays.mjs';
import { replay } from 'lion-hawk/test';
await R.init();

const ARGS = { pigs: 24 };
const hints = (h, m) => h.events.since(m).of('hint').map(e => e.text);

test('the farm starts with the Hand and the start hint; the picker and keys 1–5 switch tools', () => {
  const h = headless(pigPensGame(), { seed: 3, args: ARGS });
  assert.equal(h.scene.name, 'farm'); assert.deepEqual(h.scene.overlays, []);
  assert.equal(h.state().tool, 'hand'); assert.equal(h.state().driving, false); assert.equal(h.state().selected, null);
  h.step(1); assert.deepEqual(hints(h, 0), [START_HINT]);
  let m = h.mark(); h.tap('farm.tool.hose'); h.step(1);
  assert.equal(h.state().tool, 'hose'); assert.deepEqual(hints(h, m), [TOOL_HINT.hose]);
  m = h.mark(); h.step(1, { grab: true }); h.step(1);
  assert.equal(h.state().tool, 'grab'); assert.deepEqual(hints(h, m), [TOOL_HINT.grab]);
  assert.deepEqual(h.engine.ui.tree().filter(c => c.group === 'farm.tool').map(c => [c.id, c.pressed]), TOOLS.map(t => [`farm.tool.${t}`, t === 'grab']));
});

test('the bell fills the troughs; the day/night switch; state is JSON-safe', () => {
  const h = headless(pigPensGame(), { seed: 3, args: ARGS }); h.step(60);
  const sim = h.engine.scene.state.sim;
  let m = h.mark(); h.tap('farm.bell'); h.step(1);
  assert.ok(sim.troughs.every(t => t.level > 0.99)); assert.equal(h.events.since(m).count('bell'), 1);
  assert.deepEqual(hints(h, m), ['Dinner time. Every trough is full.']);
  m = h.mark(); h.step(1, { bell: true }); assert.equal(h.events.since(m).count('bell'), 1); // the B key
  m = h.mark(); h.tap('farm.night'); h.step(1);
  assert.equal(h.state().night, true); assert.equal(h.events.since(m).first('daynight').night, true); assert.match(hints(h, m)[0], /^Night time/);
  m = h.mark(); h.tap('farm.night'); h.step(1); assert.equal(h.state().night, false); assert.match(hints(h, m)[0], /^Good morning!/);
  assert.equal(h.enabled('farm.close'), false); assert.equal(h.enabled('farm.exit'), false);
  assert.deepEqual(JSON.parse(JSON.stringify(h.state())), h.state());
});

test('the engine path is deterministic: same seed and commands, bit-identical state', () => {
  const run = () => { const h = headless(pigPensGame(), { seed: 9, args: ARGS }); h.step(120); h.tap('farm.bell'); h.step(240); return canonical(h.state(), { digits: 15 }); };
  assert.equal(run(), run());
});

const farm = (seed = 3, args = ARGS) => { const h = headless(pigPensGame(), { seed, args }); h.step(30); return { h, s: h.engine.scene.state, sim: h.engine.scene.state.sim }; };
const pen = (sim, i) => [sim.lay.pens[i].cx, 0, sim.lay.pens[i].cz];

test('Hand: a tap on a pig opens its card; empty ground and Escape close it (#55)', () => {
  const { h, sim } = farm(), p = findPig(sim), at = [p.px, p.py, p.pz];
  let m = h.mark(); tapAt(h, at);
  assert.deepEqual(h.state().selected, { kind: 'pig', i: p.i }); assert.equal(h.events.since(m).count('select'), 1);
  assert.equal(h.enabled('farm.close'), true);
  tapAt(h, emptyAt(sim)); assert.equal(h.state().selected, null);
  tapAt(h, at); h.step(1, { back: true }); assert.equal(h.state().selected, null);
  tapAt(h, at); h.tap('farm.close'); assert.equal(h.state().selected, null);
});

test('Hand: the tap acts on what was under the finger at pointer down; an orbit drag does not tap (#55)', () => {
  const { h, sim } = farm(), p = findPig(sim), at = [p.px, p.py, p.pz], empty = emptyAt(sim);
  tool(h, 'down', at); h.step(1); tool(h, 'up', empty); tool(h, 'tap', empty); h.step(1);
  assert.deepEqual(h.state().selected, { kind: 'pig', i: p.i });
  h.tap('farm.close'); tool(h, 'down', at); tool(h, 'up', at); tool(h, 'tap', at, { orbit: true }); h.step(1);
  assert.equal(h.state().selected, null);
});

test('Hand: gates, the coop door and an egg', () => {
  const { h, sim } = farm(), lay = sim.lay, g = lay.gates[1], G = [g.x, 0, g.z];
  waitFor(h, G, 'gate'); const was = g.open; let m = h.mark(); tapAt(h, G, { ray: rayTo(G, 20, 0.01) });
  assert.equal(g.open, !was); assert.equal(h.events.since(m).first('gate').id, g.id); assert.deepEqual(hints(h, m), [g.open ? 'Gate open.' : 'Gate shut.']);
  const c = lay.coop, D = [c.doorX, 0, c.z + c.hz + 0.5];
  waitFor(h, D, 'door'); m = h.mark(); tapAt(h, D, { ray: rayTo(D, 20, 0.01) });
  assert.equal(h.state().door, false); assert.equal(h.events.since(m).first('door').open, false); assert.match(hints(h, m)[0], /^Coop door shut/);
  const n = lay.nests[1], E = [n.x, 0.12, n.z]; sim.flock.eggs.push({ id: 999, nest: 1, x: n.x, y: 0.06, z: n.z, age: 0, layer: 1, hatch: 0, brooder: -1 });
  m = h.mark(); tapAt(h, E, { ray: rayTo(E, 20, 0.01) });
  assert.equal(h.state().basket, 1); assert.equal(h.events.since(m).count('egg'), 1);
});

test('Hand: holding the tractor shows the ring, then drives; the lift after the press does nothing', () => {
  const { h, sim } = farm(), t = sim.tractor, T = [t.x, 1.2, t.z];
  waitFor(h, T, 'tractor');
  tool(h, 'down', T, { ray: rayTo(T, 20, 0.01) }); h.step(1); assert.equal(h.state().pressing, true);
  tool(h, 'press', T, { ray: rayTo(T, 20, 0.01) }); h.step(1);
  assert.equal(h.state().driving, true); assert.equal(t.driven, true); assert.equal(h.state().pressing, false);
  tool(h, 'up', T); tool(h, 'tap', T); h.step(1); assert.equal(h.state().driving, true); assert.equal(h.state().selected, null);
  assert.equal(h.enabled('farm.tool.feed'), false); assert.equal(h.enabled('farm.exit'), true);
});

test('entering drive ends the tool gesture in progress: a held pig drops, the hose stops, a press ring goes', () => {
  const { h, s, sim } = farm(); h.tap('farm.tool.grab'); const p = findPig(sim), at = [p.px, p.py, p.pz];
  tool(h, 'down', at); h.step(1); assert.equal(sim.grabbed, p.i);
  h.engine.game.debug(h.engine).drive(); assert.equal(s.gesture, null); assert.equal(s.grab, null); assert.equal(sim.grabbed, -1);
  tool(h, 'move', [p.px + 2, 2, p.pz]); tool(h, 'up', at); h.step(1); assert.equal(sim.grabbed, -1);
  h.tap('farm.exit'); h.tap('farm.tool.hose'); const P = pen(sim, 2); let m = h.mark();
  tool(h, 'down', P); h.step(1); assert.equal(sim.hose.active, true);
  h.engine.game.debug(h.engine).drive(); h.step(1); assert.equal(sim.hose.active, false); assert.deepEqual(h.events.since(m).of('hose').map(e => e.on), [true, false]);
  h.tap('farm.exit'); h.tap('farm.tool.hand'); const t = sim.tractor, T = [t.x, 1.2, t.z]; waitFor(h, T, 'tractor');
  tool(h, 'down', T, { ray: rayTo(T, 20, 0.01) }); h.step(1); assert.equal(h.state().pressing, true);
  h.engine.game.debug(h.engine).drive(); assert.equal(h.state().pressing, false); assert.equal(s.gesture, null);
  tool(h, 'down', T); h.step(1); assert.equal(s.gesture, null); // ignored while driving
});

test('Shoo: down and moves steer the dog and the ring; up, a cancel and a mid-drag tool switch stop it', () => {
  const { h, sim } = farm(), P = pen(sim, 1);
  h.tap('farm.tool.shoo'); let m = h.mark(); tool(h, 'down', P); h.step(1);
  assert.equal(sim.dog.active, true); assert.ok(Math.abs(h.state().ring[0] - P[0]) < 1e-9); assert.equal(h.events.since(m).count('bark'), 1);
  tool(h, 'move', [P[0] + 1, 0, P[2]]); h.step(1); assert.ok(Math.abs(sim.dog.tx - (P[0] + 1)) < 1e-9);
  tool(h, 'up', P); h.step(1); assert.equal(sim.dog.active, false); assert.equal(h.state().ring, null);
  tool(h, 'down', P); tool(h, 'cancel', P); h.step(1); assert.equal(sim.dog.active, false); // a second finger
  tool(h, 'down', P); h.step(1); h.tap('farm.tool.feed'); tool(h, 'up', P); tool(h, 'tap', P); h.step(1);
  assert.equal(sim.dog.active, false); assert.equal(sim.foods.length, 0); // the gesture ends as a Shoo
});

test('Feed: a tap tosses (five at most, then a hint), 0.18 s apart; grain in the run; no tap, no toss', () => {
  const { h, sim } = farm(); h.tap('farm.tool.feed'); const P = pen(sim, 4);
  tapAt(h, P); assert.equal(sim.foods.length, 1); assert.equal(h.events.count('toss'), 1);
  tapAt(h, P); assert.equal(sim.foods.length, 1); // inside TOSS_GAP
  for (let k = 0; k < 4; k++) { h.step(11); tapAt(h, [P[0] + k - 1.5, 0, P[2]]); }
  assert.equal(sim.foods.length, 5); assert.equal(h.state().foodLeft, 0);
  h.step(11); let m = h.mark(); tapAt(h, P);
  assert.equal(sim.foods.length, 5); assert.match(hints(h, m)[0], /^That’s all the snacks/);
  const r = sim.lay.run; h.step(11); m = h.mark(); tapAt(h, [(r.x0 + r.x1) / 2, 0, (r.z0 + r.z1) / 2]);
  assert.equal(sim.flock.handfuls.length, 1); assert.equal(h.events.since(m).count('scatter'), 1);
  h.step(11); tool(h, 'down', P); tool(h, 'up', P); h.step(1); assert.equal(sim.flock.handfuls.length, 1); assert.equal(sim.foods.length, 5);
});

test('Feed: a cancelled touch never tosses (#61)', () => {
  const { h, sim } = farm(); h.tap('farm.tool.feed'); const P = pen(sim, 4);
  tool(h, 'down', P); tool(h, 'cancel', P); h.step(1); assert.equal(sim.foods.length, 0);
});

test('Hose: aims at the lifted point; the nozzle snaps on the first aim, then eases; up stops', () => {
  const { h, s, sim } = farm(); h.tap('farm.tool.hose'); const P = pen(sim, 2), A = [P[0], 0, P[2] - 1];
  let m = h.mark(); tool(h, 'down', P, { aim: rayTo(A) }); h.step(1);
  assert.equal(sim.hose.active, true); assert.ok(Math.abs(sim.hose.x - A[0]) < 1e-9 && Math.abs(sim.hose.z - A[2]) < 1e-9);
  const H = s.hose; assert.ok(Math.abs(Math.hypot(H.nx - A[0], H.nz - A[2]) - Math.hypot(5.2, 1.2)) < 1e-9);
  tool(h, 'move', P, { aim: rayTo([P[0] + 3, 0, P[2] - 1]) }); h.step(1);
  assert.ok(Math.abs(H.nx - H.gx) > 0.1, 'eases, does not snap'); h.step(60); assert.ok(Math.abs(H.nx - H.gx) < 0.01);
  tool(h, 'up', P); h.step(1); assert.equal(sim.hose.active, false);
  assert.deepEqual(h.events.since(m).of('hose').map(e => e.on), [true, false]);
});

test('Grab: lifts a pig, eases to the lifted point over 0.18 s, throws on release; nothing under the finger hints (#54)', () => {
  const { h, s, sim } = farm(); h.tap('farm.tool.grab'); const p = findPig(sim), at = [p.px, p.py, p.pz];
  tool(h, 'down', at, { aim: rayTo([p.px, p.py, p.pz - 1.5]) }); h.step(1);
  assert.equal(sim.grabbed, p.i); assert.equal(s.grab.u, 0); // the first step holds the finger point
  h.step(5); assert.ok(s.grab.u > 0.4 && s.grab.u < 0.6, `${s.grab.u}`);
  h.step(6); assert.equal(s.grab.u, 1);
  h.step(60); assert.ok(p.py > 1.2, `lifted to ${p.py}`);
  tool(h, 'up', at); h.step(1); assert.equal(sim.grabbed, -1); assert.equal(p.state, ST.AIR); assert.equal(s.grab, null);
  const m = h.mark(); tool(h, 'down', emptyAt(sim)); h.step(1); assert.deepEqual(hints(h, m), ['Touch a pig or a chicken to pick it up.']);
});

test('Hand: a tap on the fox with a chicken in its cheeks makes it spit', () => {
  const h = headless(pigPensGame(), { seed: 9, args: { pigs: 30 } }), sim = h.engine.scene.state.sim;
  h.step(300); h.tap('farm.night'); h.untilEvent('gulp', { maxSeconds: 40 }); h.step(60);
  const f = sim.flock.fox, F = () => [f.x, 0.4, f.z];
  h.until(() => classify(sim, rayTo(F()))?.kind === 'fox', { maxSteps: 600, message: 'the fox is pickable' });
  const m = h.mark(); tapAt(h, F());
  assert.equal(h.events.since(m).first('spit')?.reason, 'tap'); assert.equal(f.carrying, null);
});

test('a session of taps and drags records and replays to the same checksums (T-9)', () => {
  const h = headless(pigPensGame(), { seed: 5, args: ARGS, record: true }), sim = h.engine.scene.state.sim, P = pen(sim, 1);
  h.step(60); h.tap('farm.tool.shoo'); tool(h, 'down', P);
  for (let k = 0; k < 30; k++) { tool(h, 'move', [P[0] + k * 0.1, 0, P[2]]); h.step(1); }
  tool(h, 'up', P); h.tap('farm.tool.feed'); tapAt(h, pen(sim, 4)); h.step(120);
  // a Hose drag with aim, and a Grab (pick, lift, drop), recorded too
  h.tap('farm.tool.hose'); const Q = pen(sim, 2); tool(h, 'down', Q, { aim: rayTo([Q[0], 0, Q[2] - 1]) }); h.step(1);
  let hosed = 0;
  for (let k = 0; k < 20; k++) { tool(h, 'move', [Q[0] + k * 0.1, 0, Q[2]], { aim: rayTo([Q[0] + k * 0.1, 0, Q[2] - 1]) }); h.step(1); if (sim.hose?.active) hosed++; }
  assert.ok(hosed > 0, 'the hose was active during the drag');
  tool(h, 'up', Q); h.step(10);
  h.tap('farm.tool.grab'); const p = findPig(sim), at = [p.px, p.py, p.pz];
  tool(h, 'down', at, { aim: rayTo([p.px, p.py, p.pz - 1.5]) }); h.step(20);
  assert.equal(sim.grabbed, p.i, 'the grab took effect');
  tool(h, 'move', [p.px + 1, 1.7, p.pz], { aim: rayTo([p.px + 1, 1.7, p.pz - 1]) }); h.step(20);
  tool(h, 'up', at); h.step(120);
  const r = replay(pigPensGame(), h.tape());
  assert.equal(r.checksum(), h.checksum());
});

test('a held grab keeps copies of the command arrays (#72)', () => {
  const { h, s, sim } = farm(); h.tap('farm.tool.grab'); const p = findPig(sim), at = [p.px, p.py, p.pz];
  const ray = rayTo(at), aim = rayTo([p.px, p.py, p.pz - 1.5]), r0 = [...ray], a0 = [...aim];
  h.command('tool', { phase: 'down', pointer: 1, button: 0, kind: 'touch', ray, aim }); h.step(1);
  assert.equal(sim.grabbed, p.i); assert.notEqual(s.grab.ray, ray); assert.notEqual(s.grab.aim, aim);
  ray.fill(0); aim.fill(0); assert.deepEqual(s.grab.ray, r0); assert.deepEqual(s.grab.aim, a0);
  const r1 = rayTo([p.px + 1, 1.7, p.pz]); h.command('tool', { phase: 'move', pointer: 1, button: 0, kind: 'touch', ray: r1 }); h.step(1);
  const keep = [...r1]; r1.fill(0); assert.deepEqual(s.grab.ray, keep);
});

test('Drive: throttle and steering (power 1.4) reach the tractor; H honks only while driving; E, Escape and Get out leave', () => {
  const h = headless(pigPensGame(), { seed: 2, args: ARGS }), t = () => h.engine.scene.state.sim.tractor;
  let m = h.mark(); h.step(1, { horn: true }); assert.equal(h.events.since(m).count('horn'), 0);
  h.jump('farm', 'driving', {}, ARGS); assert.equal(h.state().driving, true);
  h.step(1, { throttle: 1, steer: 0.5 }); assert.equal(t().inThr, 1); assert.ok(Math.abs(t().inSteer - 0.5 ** 1.4) < 1e-12);
  h.step(1, { steer: -0.5 }); assert.ok(Math.abs(t().inSteer + 0.5 ** 1.4) < 1e-12);
  h.seconds(4, { throttle: 1 }); assert.ok(t().speed > 4 && t().speed < 6.5, `${t().speed}`);
  m = h.mark(); h.step(1, { horn: true }); assert.equal(h.events.since(m).count('horn'), 1);
  h.step(1, { getOut: true }); assert.equal(h.state().driving, false); assert.equal(t().driven, false); assert.equal(t().inThr, 0);
  h.jump('farm', 'driving', {}, ARGS); h.step(1, { back: true }); assert.equal(h.state().driving, false);
  h.jump('farm', 'driving', {}, ARGS); h.tap('farm.exit'); assert.equal(h.state().driving, false);
  h.step(1); // a tap between steps: its event flushes with the next step
  assert.deepEqual(h.events.of('drive').map(e => e.on).slice(-2), [true, false]);
});

test('Drive: a tipped tractor is put back on its wheels with a hint', () => {
  const h = headless(pigPensGame(), { seed: 2, args: ARGS }); h.jump('farm', 'driving', {}, ARGS);
  const b = h.engine.scene.state.sim.tractor.body, k = Math.SQRT1_2;
  b.setRotation({ x: k, y: 0, z: 0, w: k }, true); b.setLinvel({ x: 0, y: 0, z: 0 }, true);
  const m = h.mark(); h.step(1); assert.deepEqual(hints(h, m), ['Back on four wheels.']);
});

test('presets put the farm in a known state without stepping (S-5)', () => {
  const h = headless(pigPensGame(), { args: ARGS });
  h.jump('farm', 'night', {}, ARGS); assert.equal(h.state().night, true);
  h.jump('farm', 'tool', { name: 'hose' }, ARGS); assert.equal(h.state().tool, 'hose');
  h.jump('farm', 'selected', { kind: 'pig', i: 3 }, ARGS); assert.deepEqual(h.state().selected, { kind: 'pig', i: 3 });
  h.jump('farm', 'driving', {}, ARGS); assert.equal(h.state().driving, true); assert.equal(h.state().selected, null);
  assert.ok(h.engine.game.debug(h.engine).sim === h.engine.scene.state.sim, 'debug sim is the scene sim');
});

test('Drive: Get out wins over the stick in the same step; horn and E do nothing on foot', () => {
  const h = headless(pigPensGame(), { seed: 2, args: ARGS }), t = () => h.engine.scene.state.sim.tractor;
  h.jump('farm', 'driving', {}, ARGS); h.step(1, { getOut: true, throttle: 1 }); assert.equal(h.state().driving, false); assert.equal(t().inThr, 0); // exit wins over input
  const m = h.mark(); h.step(1, { getOut: true, horn: true }); assert.equal(h.events.since(m).count('horn'), 0); assert.equal(h.state().driving, false);
});
