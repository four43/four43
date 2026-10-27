// The car body's contacts (rally-spec R9-3), read only by the controller rumble's body channel: the engine's `contact` events
// for the car's entity. Driving never touches the body (the wheels are raycasts); a roll onto the roof does, hard.
import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { benchSim } from './helpers/bench.mjs';

// Steps the sim and sums the car's contact impulses as Δv (impulse / mass, m/s): the largest single step, and the total.
function watch(sim, steps, each = () => {}) {
  const id = sim.car.e.id, mass = sim.car.cfg.mass;
  let peak = 0, total = 0, step = 0;
  const off = sim.engine.events.on(e => { if (e.type === 'contact' && (e.a === id || e.b === id)) { step += e.impulse / mass; } });
  for (let i = 0; i < steps; i++) { step = 0; each(i); sim.step(); peak = Math.max(peak, step); total += step; }
  off();
  return { peak, total };
}

test('driving on the flat pad: the body reports no contact', async () => {
  await R.init();
  const sim = benchSim({ car: 'impreza-555', surface: 'tarmac' });
  for (let i = 0; i < 240; i++) sim.step(); // settle
  sim.car.input.throttle = 0.6;
  const { total } = watch(sim, 720);
  sim.dispose();
  assert.equal(total, 0);
});

test('upside down from 1.5 m: the roof lands as a contact of a few m/s', async () => {
  await R.init();
  const sim = benchSim({ car: 'impreza-555', surface: 'tarmac', pos: { x: 0, y: 2, z: 0 } });
  sim.car.body.setRotation({ x: 0, y: 0, z: 1, w: 0 }, true); // rolled over: the roof down
  const { peak } = watch(sim, 480);
  sim.dispose();
  assert.ok(peak > 1.5 && peak < 15, `Δv ${peak.toFixed(2)} m/s`);
});
