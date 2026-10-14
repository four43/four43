// Rally on the scene-owned World (lion-hawk §4.4, §4.5): the engine owns the Rapier world; Rally's vehicle runs before
// lh.physics.step; collision groups keep today's bits.
import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { benchSim, game } from './helpers/bench.mjs';
import { headless } from 'lion-hawk/test';
import { DT, HZ } from '../src/sim.js';
await R.init();

test('rallyGame needs the initialised Rapier module (D9)', () => {
  assert.throws(() => game({ rapier: undefined }), /rallyGame: pass \{ rapier \}/);
  assert.equal(game().sim.hz, HZ); assert.equal(1 / HZ, DT);
});
test('a raw body on the World\'s Rapier world falls under the engine step (Review Focus 1)', () => {
  const sim = benchSim({ car: 'awd', cones: false, assist: true });
  const b = sim.phys.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(500, 50, 500));
  sim.phys.createCollider(R.ColliderDesc.ball(0.5), b); // a body without mass never falls
  for (let i = 0; i < HZ; i++) sim.step();
  assert.ok(b.translation().y < 50 - 4, `fell ${50 - b.translation().y} m in 1 s`);
});
test('groups keep today\'s bits: ground 1, prop 2, car 4, ray 8 (Review Focus 2)', () => {
  const sim = benchSim({ car: 'awd', cones: false });
  const g = sim.lh.groups;
  assert.deepEqual([g.ground, g.prop, g.car, g.ray], [1, 2, 4, 8]);
  assert.equal(g.mask(['ray'], ['ground']), (0x0008 << 16) | 0x0001);
});
test('the stage builds its Sim on the engine\'s World and steps it from the schedule', () => {
  const h = headless(game(), { args: { pad: true } });
  const s = h.engine.scene.state;
  assert.equal(s.sim.lh, h.engine.world);
  assert.equal(s.sim.phys, h.engine.world.rapier);
  const text = JSON.stringify(h.engine.schedule());
  assert.ok(text.indexOf('rally.vehicle') < text.indexOf('lh.physics.step'), text);
  assert.ok(text.indexOf('lh.physics.step') < text.indexOf('rally.after'), text);
});
test('during a track rebuild neither Rapier nor Rally\'s systems step (3c CI-16)', () => {
  const h = headless(game(), { args: { settings: { mode: 'freeDrive', world: 'loop', seed: 'ld1', theme: 'summer', assist: true } } });
  const e = h.engine, S = () => e.scene.state;
  h.until(x => !x.engine.loading.active && x.state().phase === 'title', { maxSeconds: 10, message: 'first build' });
  h.fill('title.seed', 'ld2');
  for (let n = 0; !e.loading.active && n < 60; n++) h.step(1);
  assert.ok(e.loading.active, 'a load started');
  const t0 = S().sim.time;
  for (let k = 0; e.loading.active && k < 2400; k++) {
    const car = S().sim.car, p = car.body.translation(), w = car.wheels.map(x => x.omega);
    h.step(1);
    if (!e.loading.active) break; // the step that ends the load runs physics after the build, as any step does
    assert.equal(S().sim.time, t0, 'the sim clock does not run during a load');
    if (S().sim.car !== car) continue; // the load's build placed a new car
    const q = car.body.translation();
    assert.deepEqual([q.x, q.y, q.z], [p.x, p.y, p.z]); assert.deepEqual(car.wheels.map(x => x.omega), w);
  }
  assert.equal(e.loading.active, false, 'the load finished');
});
