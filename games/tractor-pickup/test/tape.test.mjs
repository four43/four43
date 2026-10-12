// Record and replay on the engine path (lion-hawk 2f T8, [T-9], #78).
import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { headless, replay, mp } from 'lion-hawk/test';
import { tractorGame } from '../src/game.sim.js';
await R.init();

test('a solo trip with the stick, the horn, a show ack and the card replays to the same checksums', () => {
  const g = tractorGame(), h = headless(g, { record: true, args: { seed: 14, started: true } });
  h.step(120, { goZ: 1 }); h.step(1, { horn: true }); h.step(200, (hh, i) => ({ goX: Math.sin(i / 40), goZ: Math.cos(i / 40) }));
  h.command('clock', { date: 1_000_000 }); h.tap('farm.paint'); h.step(30); h.tap('paint.close'); h.step(30);
  const tape = h.tape(); assert.deepEqual(JSON.parse(JSON.stringify(tape)), tape);
  assert.equal(replay(g, tape).checksum(), h.checksum());
});
test('a guest\'s tape replays without its host: welcome, decoded frames and claims are in it', () => {
  const g = tractorGame();
  const w = mp(g, { peers: 2, record: true, argsOf: i => ({ seed: i ? 1001 : 21, started: true, trip: false }) });
  w.seconds(3, (p, i) => i === 1 ? { goZ: 0.6 } : {});
  const guest = w.guests[0], tape = guest.h.tape();
  const r = replay(g, tape); assert.equal(r.checksum(), guest.h.checksum());
  assert.equal(r.engine.scene.state.game.farm.seed, 21, 'the host\'s farm, built from the tape alone');
});

// The two above never reach a show or a claim; these do, and prove the checksum ([T-7] over game.state) sees the herd.
const ARGS = { seed: 14, started: true };
const ops = tape => tape.log.flatMap(x => (x.ops ?? []).map(o => o[0] === 'command' ? o[1] : o[0]));
test('a solo show: the barn preset, the stick, the show.done ack, the card and the 2 s wall hold replay alone', () => {
  const g = tractorGame(), h = headless(g, { record: true, args: ARGS });
  h.step(1); h.jump('farm', 'barn', { n: 3 }, ARGS); h.seconds(3.1); // the intro is over (flow.test.mjs)
  const yaw = h.engine.scene.state.game.tractor.yaw, sh = h.untilEvent('show', { maxSeconds: 15, input: { goX: Math.sin(yaw), goZ: Math.cos(yaw) } });
  h.seconds(2); h.command('show.done', { spots: sh.riders.map((r, i) => [r.id, 3 + i, 0, 4, 1]) }); h.untilEvent('reward', { maxSteps: 5 });
  h.seconds(1); h.tap('reward.go'); h.step(30);
  h.press('farm.parent'); h.seconds(2.1); h.unpress('farm.parent'); assert.deepEqual(h.scene.overlays, ['parent'], 'the wall hold fired on the virtual wall');
  h.tap('parent.close'); h.step(10);
  const s = h.engine.scene.state; assert.equal(s.progress.shows, 1); assert.equal(s.game.mode, 'drive');
  const tape = h.tape(); assert.deepEqual(JSON.parse(JSON.stringify(tape)), tape);
  assert.deepEqual(ops(tape), ['jump', 'show.done', 'tap', 'press', 'release', 'tap']);
  assert.equal(replay(g, tape).checksum(), h.checksum());
});
test('a guest that boops: its claim, the host\'s yes in a frame and the landing replay without the host (M-14)', () => {
  const g = tractorGame();
  const w = mp(g, { peers: 2, record: true, argsOf: i => ({ seed: i ? 1001 : 21, started: true, trip: false }) });
  const toward = p => { // the stick at the nearest free animal: input changes, so they are on the tape
    const gm = p.engine.scene.state.game; if (!gm?.herd) return {};
    const q = gm.tractor.body.translation(); let b = null, bd = Infinity;
    for (const a of gm.herd.free()) { const d = Math.hypot(a.x - q.x, a.z - q.z); if (!a.hidden && a.state !== 'fly' && d < bd) { bd = d; b = a; } }
    return b ? { goX: (b.x - q.x) / bd, goZ: (b.z - q.z) / bd } : {};
  };
  w.seconds(10, (p, i) => i === 1 ? toward(p) : {});
  const guest = w.guests[0], tape = guest.h.tape();
  assert.ok(guest.engine.scene.state.game.load.landed() >= 1, 'the guest booped and its claim was answered');
  const r = replay(g, tape); assert.equal(r.checksum(), guest.h.checksum());
  assert.equal(r.engine.scene.state.game.load.landed(), guest.engine.scene.state.game.load.landed());
});
test('the checksum catches a herd change made off the tape (solo and guest)', () => {
  const g = tractorGame(), h = headless(g, { record: true, args: ARGS });
  h.step(200, { goZ: 1 }); const tape = h.tape();
  const far = hh => { const gm = hh.engine.scene.state.game, p = gm.tractor.body.translation(); // the animal farthest from the tractor
    return gm.herd.animals.reduce((b, a) => Math.hypot(a.x - p.x, a.z - p.z) > Math.hypot(b.x - p.x, b.z - p.z) ? a : b); };
  const nudge = at => hh => { if (hh.time.step === at) far(hh).x += 0.5; }; // [T-9] invariants run after each step, before the checkpoint
  assert.throws(() => replay(g, tape, { invariants: [nudge(130)] }), /checksum differs at step 180/);
  const w = mp(g, { peers: 2, record: true, argsOf: i => ({ seed: i ? 1001 : 21, started: true, trip: false }) });
  w.seconds(3); const gt = w.guests[0].h.tape();
  // a guest's herd follows the host's frames, so a nudge there heals within a few steps: nudge it at the checkpoint itself
  assert.throws(() => replay(g, gt, { invariants: [nudge(120)] }), /checksum differs at step 120/);
});
test('the checksum catches a dirt change, a car move and a broken tree made off the tape (the T8 probe table)', () => {
  const g = tractorGame(), h = headless(g, { record: true, args: ARGS });
  h.step(200, { goZ: 1 }); const tape = h.tape();
  assert.equal(replay(g, tape).checksum(), h.checksum(), 'an untouched replay matches');
  const at = (n, fn) => hh => { if (hh.time.step === n) fn(hh.engine.scene.state.game); };
  const farTree = gm => { const p = gm.tractor.body.translation(); // the standing tree farthest from the tractor, so nothing else touches it
    return gm.trees.list.filter(t => t.state === 'standing').reduce((b, t) => Math.hypot(t.x - p.x, t.z - p.z) > Math.hypot(b.x - p.x, b.z - p.z) ? t : b); };
  const probes = {
    'car dirt': gm => { gm.train.cars[0].dirt = 0.5; },
    'car move': gm => { const c = gm.train.cars.at(-1), q = c.body.translation(); c.body.setTranslation({ x: q.x + 1, y: q.y, z: q.z }, true); },
    'broken tree': gm => { assert.ok(gm.trees.breakById(farTree(gm).id)); },
  };
  for (const [name, fn] of Object.entries(probes))
    assert.throws(() => replay(g, tape, { invariants: [at(130, fn)] }), /checksum differs at step 180/, name);
});
