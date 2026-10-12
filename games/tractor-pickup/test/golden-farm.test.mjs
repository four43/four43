// The engine path (lion-hawk 2f T3): headless(tractorGame) with the raw input seam reproduces the phase-0 goldens exactly. Never blessed here.
import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { headless, golden, assertFinite, checksum, canonical } from 'lion-hawk/test';
import { tractorGame, FARM_EVENTS } from '../src/game.sim.js';
import { createGame } from '../src/sim/game.js';
await R.init();

const ARGS = { seed: 14, power: 'medium', started: true };
const STILL = { thr: 0, steer: 0, horn: false };
const inputAt = i => i < 120 ? STILL : i < 600 ? { thr: 1, steer: Math.sin(i / 60) * 0.6, horn: i % 240 === 0 } : { thr: -0.5, steer: 0.3, horn: false };
const body = b => ({ p: b.translation(), q: b.rotation(), v: b.linvel() });
const snapshot = g => ({ mode: g.mode, landed: g.load.landed(), tractor: body(g.tractor.body), cars: g.train.cars.map(c => body(c.body)),
  animals: g.herd.animals.map(a => ({ id: a.id, type: a.type, state: a.state, x: a.x, z: a.z })) });
const gameEvents = h => h.events.filter(e => !FARM_EVENTS.has(e.type) && e.type !== 'scene' && e.type !== 'overlay').map(e => `${e.step}:${e.type}`);

function drive() {
  const h = headless(tractorGame(), { args: ARGS }), s = h.engine.scene.state, trail = [];
  for (let i = 0; i < 900; i++) { s.raw = inputAt(i); h.step(1); if (i % 60 === 59) { assertFinite(snapshot(s.game), `step${i}`); trail.push(checksum(snapshot(s.game))); } }
  return { state: snapshot(s.game), events: gameEvents(h), trail };
}
function pickup() {
  const h = headless(tractorGame(), { args: ARGS }), s = h.engine.scene.state, g = s.game, trail = []; let n = 0;
  const step = input => { s.raw = input; h.step(1); if (n % 60 === 59) trail.push(checksum(snapshot(g))); n++; };
  g.herd.animals.filter(a => a.home === 'yard').forEach(a => { a.state = 'gone'; });
  for (let i = 0; i < 60; i++) step(STILL);
  const single = g.herd.free().filter(x => !x.hidden && x.type !== 'chick' && !g.herd.animals.some(c => c.leader === x.id));
  for (const a of single.slice(0, 3)) { const p = g.tractorWorld({ x: 2.5, y: 0, z: 0 }, {}); a.x = p.x; a.z = p.z; a.state = 'idle'; a.timer = 99; for (let i = 0; i < 90; i++) step(STILL); }
  for (let i = 0; i < 600; i++) step({ thr: 1, steer: Math.sin(i / 50) * 0.5, horn: false });
  return { state: { ...snapshot(g), slots: g.load.slots.map(x => ({ car: x.car, animal: x.animal?.id ?? null })) }, events: gameEvents(h), trail };
}
function direct() { // the phase-0 run itself, for a bit-exact comparison (#68)
  const g = createGame(R, { seed: 14, power: 'medium' }), events = [], trail = [];
  for (let i = 0; i < 900; i++) { for (const e of g.step(inputAt(i))) events.push(`${i}:${e.type}`); if (i % 60 === 59) trail.push(checksum(snapshot(g))); }
  return { state: snapshot(g), events, trail };
}

test('the farm scene reproduces drive-seed14.json', () => { golden(new URL('./goldens/drive-seed14.json', import.meta.url), drive(), { bless: false }); });
test('the farm scene reproduces pickup-seed14.json', () => { golden(new URL('./goldens/pickup-seed14.json', import.meta.url), pickup(), { bless: false }); });
test('and bit for bit: the engine path equals a direct createGame run', () => { assert.equal(canonical(drive(), { digits: 17 }), canonical(direct(), { digits: 17 })); });
test('the sim rate is the physics step', () => { assert.equal(tractorGame().sim.hz, 60); });
