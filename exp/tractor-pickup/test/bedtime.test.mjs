import test from 'node:test';
import assert from 'node:assert/strict';
import { clampBedtime, setBedtime, stepBedtime, sleepNow, wakeUp, minutesLeft } from '../src/sim/bedtime.js';

test('bedtime: set, time up gives one "last" cue, then sleep and wake (E-5)', () => {
  const b = clampBedtime(null); assert.deepEqual(b, { phase: 'awake', at: null, choice: null });
  setBedtime(b, 3, 1000); assert.equal(b.choice, 3); assert.equal(minutesLeft(b, 1000), 3);
  assert.equal(stepBedtime(b, 1000 + 179999), null);
  assert.equal(stepBedtime(b, 1000 + 180000), 'last'); assert.equal(b.phase, 'last');
  assert.equal(stepBedtime(b, 1e9), null, 'only once');
  setBedtime(b, 5, 0); assert.equal(b.phase, 'last', 'the menu cannot undo the last drive');
  sleepNow(b); assert.equal(b.phase, 'asleep'); wakeUp(b); assert.deepEqual(b, { phase: 'awake', at: null, choice: null });
});
test('bedtime: "Now" is due at once; cancel clears it', () => {
  const b = clampBedtime(null); setBedtime(b, 0, 50); assert.equal(stepBedtime(b, 50), 'last');
  const c = clampBedtime(null); setBedtime(c, 10, 0); setBedtime(c, null, 0); assert.equal(c.at, null); assert.equal(stepBedtime(c, 1e12), null);
});
test('bedtime: a damaged save is safe; asleep survives a reload', () => {
  assert.deepEqual(clampBedtime({ phase: 'party', at: 'x', choice: 7 }), { phase: 'awake', at: null, choice: null });
  assert.equal(clampBedtime({ phase: 'asleep', at: 5 }).phase, 'asleep');
  assert.deepEqual(clampBedtime({ phase: 'awake', at: 900, choice: 5 }), { phase: 'awake', at: 900, choice: 5 });
});
