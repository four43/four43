import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrip, stepTrip } from '../src/sim/trip.js';
const tick = (r, o = {}) => stepTrip(r, { dt: 1 / 60, landed: 0, booped: false, barnPass: false, showDone: false, rewardDone: false, ...o });
const toDrive = r => { for (let i = 0; i < 180; i++) tick(r); };

test('intro says "Let\'s find animals!", then driving starts after 3 s', () => {
  const r = createTrip(); assert.deepEqual(tick(r), ['say-intro']);
  for (let i = 0; i < 178; i++) tick(r); assert.equal(r.state, 'intro'); assert.deepEqual(tick(r), ['drive']); assert.equal(r.state, 'drive');
});
test('"full" fires once when all 12 slots are full (F-2)', () => {
  const r = createTrip(); toDrive(r);
  assert.deepEqual(tick(r, { landed: 11 }), []); assert.deepEqual(tick(r, { landed: 12 }), ['full']); assert.deepEqual(tick(r, { landed: 12 }), []);
});
test('a barn pass starts the show; show -> reward -> drive (F-1, F-3, F-9)', () => {
  const r = createTrip(); toDrive(r);
  assert.deepEqual(tick(r, { landed: 3, barnPass: true }), ['show']); assert.equal(r.state, 'show');
  assert.deepEqual(tick(r, { showDone: true }), ['reward']); assert.equal(r.state, 'reward');
  assert.deepEqual(tick(r, { rewardDone: true }), ['drive']); assert.equal(r.state, 'drive');
  assert.deepEqual(tick(r, { landed: 12 }), ['full'], '"full" can fire again on the next trip');
});
test('help fires after 20 s without a boop, then every 20 s; a boop resets it; none while full (F-4)', () => {
  const r = createTrip(); toDrive(r);
  let helps = 0; for (let i = 0; i < 60 * 41; i++) helps += tick(r).filter(c => c === 'help').length; assert.equal(helps, 2);
  for (let i = 0; i < 60 * 15; i++) tick(r); tick(r, { booped: true }); helps = 0;
  for (let i = 0; i < 60 * 19; i++) helps += tick(r).filter(c => c === 'help').length; assert.equal(helps, 0);
  helps = 0; for (let i = 0; i < 60 * 30; i++) helps += tick(r, { landed: 12 }).filter(c => c === 'help').length; assert.equal(helps, 0);
});
