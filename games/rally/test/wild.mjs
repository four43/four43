// Wild obstacles on twisty tracks (default style): the autopilot gets round 6 seeds' loops and
// stages without rolling or leaving the road (spec tracks T-4, R3). Run: node test/wild.mjs
import R from '@dimforge/rapier3d-compat';
import { Sim, DT } from '../src/sim.js';
import { generateTrack } from '../src/gen/track.js';
import { TrackWorld } from '../src/world/trackWorld.js';
import { runUntil } from './autopilot.js';
import { qrot } from '../src/vehicle.js';
await R.init();
let fails = 0;
for (const seed of ['t1', 't2', 't3', 't4', 't5', 't6']) for (const kind of ['loop', 'stage']) {
  const track = generateTrack(seed, { kind, density: 'wild' });
  const sim = new Sim(R, { world: new TrackWorld(track), car: 'awd', assist: true });
  const L = track.layout; let sMax = 0, prevS = 0, lapped = false, fail = '';
  runUntil(sim, track, { maxTime: L.length / 6, onStep: (s) => {
    const p = s.car.body.translation(), loc = track.locator.locate(p.x, p.z), up = qrot(s.car.body.rotation(), { x: 0, y: 1, z: 0 });
    if (kind === 'loop' && prevS > L.length - 50 && loc.s < 50) lapped = true;
    prevS = loc.s; if (!lapped) sMax = Math.max(sMax, loc.s);
    if (up.y < 0.3 || Math.abs(loc.d) > 6) {
      const f = track.features.find((f) => loc.s >= f.s0 - 20 && loc.s <= f.s1 + 30);
      fail = `${up.y < 0.3 ? 'rolled' : 'off'} at s=${loc.s.toFixed(0)} v=${(s.car.speed * 3.6).toFixed(0)}km/h ${f ? `${f.type} h=${f.height?.toFixed(2)} pitch=${f.pitch?.toFixed(1)} count=${f.count}` : ''}`;
      return true;
    }
    return lapped || (kind === 'stage' && loc.s > L.length - 45);
  } });
  console.log(`${fail ? 'FAIL' : 'PASS'}  ${seed} ${kind} wild: ${fail || 'finished'}`);
  if (fail) fails++;
}
console.log(`\n${12 - fails}/12 passed`);
process.exit(fails ? 1 : 0);
