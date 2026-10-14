// ?tune through the sim (lion-hawk 2g G4b): the `tune` command writes the same feel constants the sim reads (sim/tune.js's table),
// clamps to the row's range, drops unknown keys with a warning, emits `tune { key, value }`, and replays from a tape.
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { headless, replay, mp } from 'lion-hawk/test';
import { tractorGame } from '../src/game.sim.js';
import { POWER, TP } from '../src/sim/tractor.js';
import { PILOT } from '../src/sim/pilot.js';
import { TR } from '../src/sim/hitch.js';
import { TREE } from '../src/sim/trees.js';
import { TUNE, tuneGet } from '../src/sim/tune.js';
await R.init();

// the feel constants are module-level (one copy per process): every test puts them back
const ORIGINAL = structuredClone({ POWER, TP, PILOT, TR, TREE });
const restore = () => {
  for (const k of Object.keys(POWER)) Object.assign(POWER[k], ORIGINAL.POWER[k]);
  Object.assign(TP, ORIGINAL.TP); Object.assign(PILOT, ORIGINAL.PILOT); Object.assign(TR, ORIGINAL.TR); Object.assign(TREE, ORIGINAL.TREE);
};
afterEach(restore);

const ARGS = { seed: 14, started: true, trip: false };
const tunes = h => h.events.filter(e => e.type === 'tune').map(e => ({ key: e.key, value: e.value }));

test('the table addresses the sim\'s own objects: one row per panel slider, no DOM or camera rows', () => {
  const ids = TUNE.map(r => r.id);
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');
  assert.ok(!ids.some(id => /cam/i.test(id)), 'the camera rows are the view\'s');
  for (const id of ['P.vmax', 'P.force', 'TP.slip', 'TP.steerMax', 'PILOT.revCone', 'TR.limitBeta', 'TREE.breakSpeed']) assert.ok(ids.includes(id), id);
  const h = headless(tractorGame(), { args: ARGS }); h.step(1);
  const g = h.engine.scene.state.game;
  assert.equal(tuneGet(g, 'P.vmax'), POWER[g.tractor.power].vmax);
  assert.ok(Math.abs(tuneGet(g, 'PILOT.revCone') - 35) < 1e-9, 'degree rows read in degrees');
});

test('tune { key, value } writes the constant the sim reads, and the next steps drive with it', () => {
  const drive = tune => {
    const h = headless(tractorGame(), { args: ARGS }); h.step(1);
    if (tune) h.command('tune', tune);
    h.step(240, { goZ: 1 }); return h;
  };
  const base = drive(null).engine.scene.state.game.tractor.speed; restore();
  const h = drive({ key: 'P.vmax', value: 3 }), t = h.engine.scene.state.game.tractor;
  assert.equal(POWER[t.power].vmax, 3); assert.equal(t.P.vmax, 3, 'the tractor\'s preset is that same object');
  assert.ok(base > 5, `untuned speed ${base}`);
  assert.ok(Math.abs(t.speed) < 3.5 && Math.abs(t.speed) < base - 1, `tuned speed ${t.speed} vs ${base}`);
  assert.deepEqual(tunes(h), [{ key: 'P.vmax', value: 3 }]);
});

test('out-of-range values clamp to the row; a degree row converts; the event carries the clamped value', () => {
  const h = headless(tractorGame(), { args: ARGS }); h.step(1);
  h.command('tune', { key: 'TP.slip', value: 99 }); h.command('tune', { key: 'TR.limitBeta', value: -4 });
  h.command('tune', { key: 'PILOT.revCone', value: 40 }); h.command('tune', { key: 'TREE.breakSpeed', value: 7 }); h.step(1);
  assert.equal(TP.slip, 6); assert.equal(TR.limitBeta, 0.1); assert.equal(TREE.breakSpeed, 7);
  assert.ok(Math.abs(PILOT.revCone - 40 * Math.PI / 180) < 1e-12);
  assert.deepEqual(tunes(h), [{ key: 'TP.slip', value: 6 }, { key: 'TR.limitBeta', value: 0.1 }, { key: 'PILOT.revCone', value: 40 }, { key: 'TREE.breakSpeed', value: 7 }]);
});

test('unknown keys and bad values are warned and dropped: nothing changes, no event', t => {
  const warn = t.mock.method(console, 'warn', () => {});
  const h = headless(tractorGame(), { args: ARGS }); h.step(1);
  const before = structuredClone({ POWER, TP, PILOT, TR, TREE });
  h.command('tune', { key: 'TP.mass', value: 1 }); h.command('tune', { key: 'nope', value: 1 }); h.command('tune', { key: 'TP.slip', value: 'fast' });
  h.command('tune', { key: 'power', value: 'turbo' }); h.command('tune', {}); h.step(1);
  assert.deepEqual(structuredClone({ POWER, TP, PILOT, TR, TREE }), before);
  assert.deepEqual(tunes(h), []);
  assert.ok(warn.mock.callCount() >= 4, `warned ${warn.mock.callCount()} times`);
  assert.ok(warn.mock.calls.some(c => String(c.arguments[0]).includes('nope')));
});

test('tune { key: power } switches the tractor\'s preset (not the saved settings); tune.reset regrows the trees', () => {
  const h = headless(tractorGame(), { args: { ...ARGS, power: 'medium' } }); h.step(1);
  const s = h.engine.scene.state, g = s.game;
  h.command('tune', { key: 'power', value: 'high' }); h.step(1);
  assert.equal(g.tractor.power, 'high'); assert.equal(g.tractor.P, POWER.high);
  assert.equal(s.settings.power, 'medium', 'a debug tweak never reaches the parent\'s settings');
  assert.deepEqual(tunes(h), [{ key: 'power', value: 'high' }]);
  const tree = g.trees.list[0]; tree.state = 'broken';
  h.command('tune.reset', {}); h.step(1);
  assert.equal(tree.state, 'growing');
  assert.equal(h.events.filter(e => e.type === 'tune.reset').length, 1);
});

test('tune works on the sandbox pad too', () => {
  const h = headless(tractorGame(), { scene: 'sandbox', args: {} }); h.step(1);
  assert.equal(h.scene.name, 'sandbox');
  h.command('tune', { key: 'TP.steerMax', value: 0.5 }); h.step(1);
  assert.equal(TP.steerMax, 0.5);
});

test('in a room only the host tunes: a guest\'s tune is dropped', t => {
  t.mock.method(console, 'warn', () => {});
  const w = mp(tractorGame(), { peers: 2, argsOf: i => ({ seed: i ? 1001 : 21, started: true, trip: false }) });
  w.seconds(1);
  const guest = w.guests[0], host = w.host;
  assert.equal(guest.engine.scene.state.net.role, 'guest');
  guest.h.command('tune', { key: 'TP.slip', value: 5 }); w.step(2);
  assert.equal(TP.slip, ORIGINAL.TP.slip, 'the guest\'s tune changed nothing');
  assert.deepEqual(tunes(guest.h), []);
  host.h.command('tune', { key: 'TP.slip', value: 5 }); w.step(2);
  assert.equal(TP.slip, 5); assert.deepEqual(tunes(host.h), [{ key: 'TP.slip', value: 5 }]);
});

test('a recorded tape with a tune command replays to the same state', () => {
  const g = tractorGame(), h = headless(g, { record: true, args: ARGS });
  h.step(60, { goZ: 1 }); h.command('tune', { key: 'P.vmax', value: 4 }); h.command('tune', { key: 'TP.slip', value: 1 }); h.step(200, { goZ: 1, goX: 0.3 });
  const tape = h.tape(), sum = h.checksum();
  assert.deepEqual(JSON.parse(JSON.stringify(tape)), tape);
  restore(); // a replay starts from the shipped constants, as the recording did
  assert.equal(replay(g, tape).checksum(), sum);
  restore();
  const bare = { ...tape, sums: [], log: tape.log.map(x => ({ ...x, ops: x.ops?.filter(o => !(o[0] === 'command' && o[1] === 'tune')) })) };
  assert.notEqual(replay(g, bare).checksum(), sum, 'the tune is what the checksum saw');
});
