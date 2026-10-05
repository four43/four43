import RAPIER from '@dimforge/rapier3d-compat';
import { createSim } from '../src/sim.js';
await RAPIER.init();
const sim = createSim(RAPIER, { pigs: 30, seed: 4, hour: 9 });
for (let s = 0; s < 120; s++) sim.step();
const F = sim.flock, r = sim.lay.run;
F.scatterGrain(-5, 1.6, -18, -5, -21);
let peak = 0, displaced = 0; const eatenBy = {};
const before = F.handfuls[0].grains.length;
for (let s = 0; s < 60 * 40; s++) {
  sim.step(); peak = Math.max(peak, F.birds.filter(b => b.state === 2).length);
  for (const b of F.birds) if (b.displaced > 0.6) displaced++;
}
const left = F.grainLeft();
console.log('grain: peak birds pecking', peak, 'of', F.birds.length, 'grains eaten', before - left, 'of', before, 'in 40 s; handfuls left', F.handfuls.length);
// pecking order: over several handfuls, do higher-ranked hens eat more?
{
  const sim2 = createSim(RAPIER, { pigs: 10, seed: 5, hour: 8 });
  const F2 = sim2.flock;
  for (let k = 0; k < 6; k++) { F2.scatterGrain(-5, 1.6, -18, -5 + (k % 3) - 1, -21.5); for (let s = 0; s < 60 * 25; s++) sim2.step(); }
  const hens = F2.birds.filter(b => b.kind === 'hen').sort((a, b) => a.rank - b.rank);
  const top = hens.slice(0, 5).reduce((a, b) => a + (b.ate || 0), 0), bottom = hens.slice(5).reduce((a, b) => a + (b.ate || 0), 0);
  console.log('grain eaten by top-5 ranked hens', top, 'vs bottom-5', bottom, '| per hen by rank:', hens.map(b => b.ate || 0).join(' '));
}
