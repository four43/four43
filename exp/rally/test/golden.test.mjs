// Characterisation golden (lion-hawk phase 1): the autopilot's 20 s stage drive on seed 'golden' must keep
// producing the same car. A deliberate behaviour change re-blesses it: LH_BLESS=1 npm test.
import test from 'node:test';
import assert from 'node:assert/strict';
import R from '@dimforge/rapier3d-compat';
import { benchSim } from './helpers/bench.mjs';
import { golden, assertFinite, canonical, checksum } from 'lion-hawk/test';
import { DT } from '../src/sim.js';
import { generateTrack } from '../src/gen/track.js';
import { TrackWorld } from '../src/world/trackWorld.js';
import { makeProgress } from '../src/game/progress.js';
import { autopilot } from './autopilot.js';
await R.init();

const STEPS = Math.round(20 / DT);                                      // 4800 at 240 Hz
const EVERY = 240;
const snapshot = (sim, P) => {
  const c = sim.car, b = c.body;
  return { p: b.translation(), q: b.rotation(), v: b.linvel(), speed: c.speed, gear: c.gear, rpm: c.rpm,
    progress: { p: P.p, s: P.s, next: P.next, started: P.started } };
};
function run(seed = 'golden') {
  const track = generateTrack(seed, { kind: 'stage', theme: 'summer' });
  const sim = benchSim({ world: new TrackWorld(track), car: 'impreza-555', assist: true });
  const P = makeProgress(track); P.reset(0);
  const events = [], trail = [], inp = sim.car.input;
  let ctl = null;
  for (let i = 0; i < STEPS; i++) {
    if (i % 4 === 0) {                                                  // the autopilot runs at 60 Hz, as in the game tests
      ctl = autopilot(sim, track);
      inp.steer = ctl.steer; inp.throttle = ctl.throttle; inp.brake = ctl.brake; inp.handbrake = ctl.handbrake;
    }
    sim.step();
    const p = sim.car.body.translation();
    for (const e of P.update(p.x, p.z)) events.push(`${i}:${e.type}`);
    if (i % EVERY === EVERY - 1) { const s = snapshot(sim, P); assertFinite(s, `step${i}`); trail.push(checksum(s)); }
  }
  return { state: snapshot(sim, P), events, trail };
}

test('golden: autopilot stage drive, 20 s at 240 Hz', () => {
  const r = run();
  assert.ok(r.state.speed > 5 && r.state.progress.p > 50, 'the car has driven');
  golden(new URL('./goldens/stage-autopilot.json', import.meta.url), r);
});
test('determinism: two runs in one process give the same state, bit-exactly', () => {
  assert.equal(canonical(run(), { digits: 15 }), canonical(run(), { digits: 15 }));
});
