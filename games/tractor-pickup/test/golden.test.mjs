// Characterisation golden (lion-hawk phase 0): a scripted 15 s drive on seed 14 must keep producing the same
// world. A deliberate behaviour change re-blesses it: LH_BLESS=1 npm test.
import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { golden, assertFinite, canonical, checksum } from 'lion-hawk/test';
import { createGame } from '../src/sim/game.js';
await RAPIER.init();

const STEPS = 900;
const inputAt = i => i < 120 ? { thr: 0, steer: 0, horn: false }
  : i < 600 ? { thr: 1, steer: Math.sin(i / 60) * 0.6, horn: i % 240 === 0 }
  : { thr: -0.5, steer: 0.3, horn: false };
const body = b => ({ p: b.translation(), q: b.rotation(), v: b.linvel() });
const snapshot = g => ({
  mode: g.mode, landed: g.load.landed(),
  tractor: body(g.tractor.body), cars: g.train.cars.map(c => body(c.body)),
  animals: g.herd.animals.map(a => ({ id: a.id, type: a.type, state: a.state, x: a.x, z: a.z })),
});
function run() {
  const g = createGame(RAPIER, { seed: 14, power: 'medium' }), events = [], trail = [];
  for (let i = 0; i < STEPS; i++) {
    for (const e of g.step(inputAt(i))) events.push(`${i}:${e.type}`);
    if (i % 60 === 59) { assertFinite(snapshot(g), `step${i}`); trail.push(checksum(snapshot(g))); }
  }
  return { state: snapshot(g), events, trail };
}

test('golden: seed 14 scripted drive, 900 steps', () => {
  golden(new URL('./goldens/drive-seed14.json', import.meta.url), run());
});
test('determinism: two runs in one process give the same state, bit-exactly (T-10)', () => {
  assert.equal(canonical(run(), { digits: 15 }), canonical(run(), { digits: 15 }));
});

// The drive above never picks anything up; this one boops three animals into the trailer and drives on, so the
// pickup → flight → land → ride loop is covered (phase 1 carry-over).
const STILL = { thr: 0, steer: 0, horn: false };
function pickup() {
  const g = createGame(RAPIER, { seed: 14, power: 'medium' }), events = [], trail = [];
  const step = input => { for (const e of g.step(input)) events.push(`${trail.length}:${e.type}`); };
  g.herd.animals.filter(a => a.home === 'yard').forEach(a => { a.state = 'gone'; });          // only placed animals get booped
  for (let i = 0; i < 60; i++) step(STILL);
  const single = g.herd.free().filter(x => !x.hidden && x.type !== 'chick' && !g.herd.animals.some(c => c.leader === x.id));
  for (const a of single.slice(0, 3)) {
    const p = g.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); a.x = p.x; a.z = p.z; a.state = 'idle'; a.timer = 99;
    for (let i = 0; i < 90; i++) step(STILL);
  }
  for (let i = 0; i < 600; i++) { step({ thr: 1, steer: Math.sin(i / 50) * 0.5, horn: false }); if (i % 60 === 59) trail.push(checksum(snapshot(g))); }
  return { state: { ...snapshot(g), slots: g.load.slots.map(s => ({ car: s.car, animal: s.animal?.id ?? null })) }, events, trail };
}
test('golden: seed 14 pickup of three animals, then a 10 s drive', () => {
  const r = pickup();
  assert.equal(r.state.landed, 3, 'three animals ride');
  assert.ok(r.events.some(e => e.endsWith(':land')));
  golden(new URL('./goldens/pickup-seed14.json', import.meta.url), r);
});
