import RAPIER from '@dimforge/rapier3d-compat';
import { createSim, ST } from '../src/sim.js';
await RAPIER.init();
const sim = createSim(RAPIER, { pigs: 48, seed: 6 });
for (let s = 0; s < 300; s++) sim.step();
const pen = sim.lay.pens[5];
// spam 10 taps: only 5 should land
let accepted = 0;
for (let k = 0; k < 10; k++) if (sim.tossFood(pen.cx, 4, pen.cz + 6, pen.cx + (k % 5) - 2, pen.cz)) accepted++;
console.log('accepted', accepted, 'of 10; foods live', sim.foods.length);
// one snack far out in an empty field corner (nobody nearby)
const life = {}; for (const f of sim.foods) life[f.id] = { born: sim.time, reached: null };
let maxLive = 0, peakPursuers = 0;
for (let s = 0; s < 60 * 40; s++) {
  sim.step(); maxLive = Math.max(maxLive, sim.foods.length);
  for (const f of sim.foods) { if (life[f.id] && life[f.id].reached === null && f.bites > 0) life[f.id].reached = sim.time; peakPursuers = Math.max(peakPursuers, f.claims); }
  for (const id in life) if (!life[id].gone && !sim.foods.some(f => f.id === +id)) life[id].gone = sim.time;
  if (s === 60 * 3) { const r = sim.tossFood(26, 4, 22, 27, 23); console.log('6th toss while full ->', r ? 'accepted' : 'rejected'); }
}
for (const [id, l] of Object.entries(life)) console.log('snack', id, 'first bite', l.reached ? (l.reached - l.born).toFixed(1) + 's' : '-', 'gone', l.gone ? (l.gone - l.born).toFixed(1) + 's' : 'still there', l.reached && l.gone ? '(chewing ' + (l.gone - l.reached).toFixed(1) + 's)' : '');
console.log('max live', maxLive, 'peak pursuers on one snack', peakPursuers);
// lonely snack in the far corner: should be trampled after ~20 s on the ground
const lone = sim.tossFood(26, 4, 22, 27, 23); const t0 = sim.time;
while (sim.foods.includes(lone) && sim.time - t0 < 40) sim.step();
console.log('lonely snack removed after', (sim.time - t0).toFixed(1), 's, bites', lone.bites.toFixed(1));
