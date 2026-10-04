import RAPIER from '@dimforge/rapier3d-compat';
import { createSim, ST, ST_NAME } from '../src/sim.js';
import { hit } from '../src/flow.js';
await RAPIER.init();
const run = (sim, sec, f) => { for (let s = 0; s < sec * 60; s++) { f && f(s / 60); sim.step(); } };

// 1. Dog sweeps through pen 1 (top middle) from the north wall toward the lane gate
{
  const sim = createSim(RAPIER, { pigs: 48, seed: 5 });
  run(sim, 5);
  const pen = sim.lay.pens[1];
  const before = sim.counts[1];
  run(sim, 12, t => { const u = Math.min(1, t / 10); sim.setDog(pen.cx + Math.sin(t * 2) * 3, pen.z0 + 1 + u * 8, true); });
  sim.setDog(null, null, false);
  const fleeing = sim.pigs.filter(p => p.state === ST.FLEE).length;
  console.log('[dog sweep] pen1 before', before, 'after', sim.counts[1], 'lane', sim.counts[6], 'fleeing', fleeing, 'max panic', Math.max(...sim.pigs.map(p => p.panic)).toFixed(2));
  run(sim, 15);
  console.log('[dog sweep] 15s later fleeing', sim.pigs.filter(p => p.state === ST.FLEE).length);
}
// 2. Food tossed into pen 5 — how many pigs come and how quickly it's eaten
{
  const sim = createSim(RAPIER, { pigs: 48, seed: 6 });
  run(sim, 5);
  const pen = sim.lay.pens[5];
  const foods = [];
  for (let k = 0; k < 4; k++) foods.push(sim.tossFood(pen.cx, 6, pen.cz + 14, pen.cx + (k - 1.5), pen.cz));
  const ids = foods.map(f => f.id); let eatenAt = -1, peak = 0;
  run(sim, 40, t => { const n = sim.pigs.filter(p => p.state === ST.SNACK).length; peak = Math.max(peak, n); if (eatenAt < 0 && !sim.foods.some(f => ids.includes(f.id))) eatenAt = t; });
  console.log('[food] peak snackers', peak, 'all eaten at', eatenAt.toFixed(1), 's');
}
// 3. Grab a pig and throw it over the fence into the neighbouring pen
{
  const sim = createSim(RAPIER, { pigs: 48, seed: 7 });
  run(sim, 2);
  const p = sim.pigs.find(p => p.region === 0 && !p.piglet);
  sim.grab(p.i);
  const x0 = p.px, z0 = p.pz;
  run(sim, 1.5, t => sim.moveGrab(x0, 1.8, z0));
  console.log('[grab] lifted to y', p.py.toFixed(2), 'state', ST_NAME[p.state]);
  // swing toward pen 1 (east), then let go
  const pen1 = sim.lay.pens[1];
  run(sim, 0.35, t => sim.moveGrab(x0 + t * 30, 2.4 + t * 6, z0));
  sim.release();
  let maxY = 0; run(sim, 6, () => { maxY = Math.max(maxY, p.py); });
  console.log('[grab] thrown: maxY', maxY.toFixed(2), 'landed region', p.region, 'state', ST_NAME[p.state], 'pos', p.px.toFixed(1), p.pz.toFixed(1), 'rot locked again', p.rot.map(v => v.toFixed(2)).join(','));
}
// 4. Bell: everyone rushes to troughs
{
  const sim = createSim(RAPIER, { pigs: 48, seed: 8 });
  run(sim, 5); sim.bell();
  let peakEat = 0; run(sim, 40, () => { peakEat = Math.max(peakEat, sim.pigs.filter(p => p.state === ST.EAT).length); });
  console.log('[bell] peak eating', peakEat, 'of', sim.pigs.length, 'troughs', sim.troughs.map(t => t.level.toFixed(2)).join(' '));
}
