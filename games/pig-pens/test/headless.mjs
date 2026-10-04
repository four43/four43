import RAPIER from '@dimforge/rapier3d-compat';
import { createSim, ST, ST_NAME } from '../src/sim.js';
import { hit } from '../src/flow.js';
await RAPIER.init();
const t0 = performance.now();
const sim = createSim(RAPIER, { pigs: +(process.argv[2] || 48), seed: 3 });
console.log('init ms', (performance.now() - t0).toFixed(0));
const fence = sim.lay.obstacles.filter(o => o.fence);
let pen = 0, maxSpeed = 0, minSep = 9, stepMs = 0;
const T = +(process.argv[3] || 600);
const hist = new Array(11).fill(0);
for (let s = 0; s < T * 60; s++) {
  const a = performance.now(); sim.step(); stepMs += performance.now() - a;
  for (const p of sim.pigs) {
    for (const o of fence) if (hit(o, p.px, p.pz, p.r * 0.5)) { pen++; break; }
    maxSpeed = Math.max(maxSpeed, p.speed); hist[p.state]++;
  }
  if (s % 30 === 0) for (let i = 0; i < sim.pigs.length; i++) for (let j = i + 1; j < sim.pigs.length; j++) {
    const p = sim.pigs[i], q = sim.pigs[j]; minSep = Math.min(minSep, Math.hypot(p.px - q.px, p.pz - q.pz) / (p.r + q.r)); }
  if (s % (60 * 60) === 0) console.log(`t=${(s / 60).toFixed(0)}s regions`, sim.counts.join(' '), 'troughs', sim.troughs.map(t => t.level.toFixed(2)).join(' '), 'transitions', sim.transitions);
}
console.log('step ms avg', (stepMs / (T * 60)).toFixed(2));
console.log('fence penetrations (pig-steps)', pen, 'max speed', maxSpeed.toFixed(2), 'min sep ratio', minSep.toFixed(2));
console.log('states', ST_NAME.map((n, i) => n + ':' + (hist[i] / (T * 60 * sim.pigs.length) * 100).toFixed(1) + '%').join(' '));
console.log('respawns', sim.pigs.reduce((a, p) => a + (p.respawns || 0), 0), 'mean hunger', (sim.pigs.reduce((a, p) => a + p.hunger, 0) / sim.pigs.length).toFixed(2), 'starving(>0.95)', sim.pigs.filter(p => p.hunger > 0.95).length);
