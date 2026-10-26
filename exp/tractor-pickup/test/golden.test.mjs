// Characterisation goldens (lion-hawk phase 0, on the engine path since 3l): a scripted 15 s drive on seed 14, and a pickup of three
// animals then a 10 s drive, through headless(tractorGame) and the raw input seam (state.raw). A deliberate behaviour change re-blesses
// them: LH_BLESS=1 npm test (re-blessed for the World in 3l, notes "Re-bless 1").
import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { headless, golden, assertFinite, checksum, canonical } from 'lion-hawk/test';
import { tractorGame, FARM_EVENTS } from '../src/game.sim.js';
await R.init();

const ARGS = { seed: 14, power: 'medium', started: true, trip: false }; // the trip off: no intro, help or bedtime cue can touch the run
const STILL = { thr: 0, steer: 0, horn: false };
const inputAt = i => i < 120 ? STILL : i < 600 ? { thr: 1, steer: Math.sin(i / 60) * 0.6, horn: i % 240 === 0 } : { thr: -0.5, steer: 0.3, horn: false };
const body = b => ({ p: b.translation(), q: b.rotation(), v: b.linvel() });
const snapshot = g => ({ mode: g.mode, landed: g.load.landed(), tractor: body(g.tractor.body), cars: g.train.cars.map(c => body(c.body)),
  animals: g.herd.animals.map(a => ({ id: a.id, type: a.type, state: a.state, x: a.x, z: a.z })) });
const gameEvents = h => h.events.filter(e => !FARM_EVENTS.has(e.type) && e.type !== 'scene' && e.type !== 'overlay' && !e.type.startsWith('controller.')).map(e => `${e.step}:${e.type}`);

function drive() {
  const h = headless(tractorGame(), { args: ARGS }), s = h.engine.scene.state, trail = [];
  for (let i = 0; i < 900; i++) { s.raw = inputAt(i); h.step(1); if (i % 60 === 59) { assertFinite(snapshot(s.game), `step${i}`); trail.push(checksum(snapshot(s.game))); } }
  return { state: snapshot(s.game), events: gameEvents(h), trail };
}
// The drive never picks anything up; this one boops three animals into the trailer and drives on (pickup → flight → land → ride)
function pickup() {
  const h = headless(tractorGame(), { args: ARGS }), s = h.engine.scene.state, g = s.game, trail = []; let n = 0;
  const step = input => { s.raw = input; h.step(1); if (n % 60 === 59) trail.push(checksum(snapshot(g))); n++; };
  g.herd.animals.filter(a => a.home === 'yard').forEach(a => { a.state = 'gone'; }); // only placed animals get booped
  for (let i = 0; i < 60; i++) step(STILL);
  const single = g.herd.free().filter(x => !x.hidden && x.type !== 'chick' && !g.herd.animals.some(c => c.leader === x.id));
  for (const a of single.slice(0, 3)) { const p = g.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); a.x = p.x; a.z = p.z; a.state = 'idle'; a.timer = 99; for (let i = 0; i < 90; i++) step(STILL); }
  for (let i = 0; i < 600; i++) step({ thr: 1, steer: Math.sin(i / 50) * 0.5, horn: false });
  return { state: { ...snapshot(g), slots: g.load.slots.map(x => ({ car: x.car, animal: x.animal?.id ?? null })) }, events: gameEvents(h), trail };
}

test('golden: seed 14 scripted drive, 900 steps', () => { golden(new URL('./goldens/drive-seed14.json', import.meta.url), drive()); });
test('determinism: two runs in one process give the same state, bit-exactly (T-10)', () => {
  assert.equal(canonical(drive(), { digits: 15 }), canonical(drive(), { digits: 15 }));
});
test('determinism: pickup twice is bit-identical', () => { assert.equal(canonical(pickup(), { digits: 15 }), canonical(pickup(), { digits: 15 })); });
test('golden: seed 14 pickup of three animals, then a 10 s drive', () => {
  const r = pickup();
  assert.equal(r.state.landed, 3, 'three animals ride');
  assert.ok(r.events.some(e => e.endsWith(':land')));
  golden(new URL('./goldens/pickup-seed14.json', import.meta.url), r);
});
test('the sim rate is the physics step', () => { assert.equal(tractorGame().sim.hz, 60); });
