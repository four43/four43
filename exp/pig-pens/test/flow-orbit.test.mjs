// Phase 3k final pass: a Hand drag that became an orbit (the view's orbit rig) tells the sim once with an orbit `move`,
// so `pressing` turns off at once and a later press cannot drive (2e carry-over: pressing stayed true during an orbit).
import test from 'node:test';
import assert from 'node:assert/strict';
import { farmSim } from './farmSim.mjs';
import { tool } from './rays.mjs';

test('Hand down on the tractor presses; an orbit move clears it; the press that follows does not drive', () => {
  const sim = farmSim({ pigs: 24, seed: 3 }), h = sim.h, at = [sim.tractor.x, 1.2, sim.tractor.z];
  tool(h, 'down', at); h.step(1); assert.equal(h.state().pressing, true);
  tool(h, 'move', at, { orbit: true }); h.step(1); assert.equal(h.state().pressing, false, 'pressing during an orbit');
  tool(h, 'press', at); h.step(1); assert.equal(h.state().driving, false);
  tool(h, 'up', at); tool(h, 'tap', at, { orbit: true }); h.step(1); assert.equal(h.state().selected, null);
});
