// Phase 3k final pass: a Hand drag that became an orbit (the view's orbit rig) tells the sim once with an orbit `move`,
// so the Hand's target drops at once and the tap that ends the orbit selects nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { farmSim } from './farmSim.mjs';
import { tool } from './rays.mjs';

test('Hand down on a pig then an orbit move: the target drops and the closing tap selects nothing', () => {
  const sim = farmSim({ pigs: 24, seed: 3 }), h = sim.h, p = sim.pigs[0], at = [p.px, p.py, p.pz];
  tool(h, 'down', at); h.step(1); assert.ok(h.engine.scene.state.gesture.target, 'the Hand picked something at down');
  tool(h, 'move', at, { orbit: true }); h.step(1); assert.equal(h.engine.scene.state.gesture.target, null, 'an orbit clears the target');
  tool(h, 'up', at); tool(h, 'tap', at, { orbit: true }); h.step(1); assert.equal(h.state().selected, null);
});
