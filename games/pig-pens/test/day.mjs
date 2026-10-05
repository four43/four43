import RAPIER from '@dimforge/rapier3d-compat';
import { createSim } from '../src/sim.js';
import { CST_NAME, FST } from '../src/chickens.js';
await RAPIER.init();
const sim = createSim(RAPIER, { pigs: 48, seed: 2, hour: 7 });
const F = sim.flock; const ev = {};
let t0 = performance.now(), lastH = -1;
for (let s = 0; s < 60 * 300; s++) {
  sim.step();
  for (const e of sim.events.splice(0)) ev[e.type] = (ev[e.type] || 0) + 1;
  const h = Math.floor(sim.clock.hour);
  if (h !== lastH && h % 2 === 0) {
    lastH = h; const st = {}; for (const b of F.birds) st[CST_NAME[b.state]] = (st[CST_NAME[b.state]] || 0) + 1;
    console.log(`${String(h).padStart(2)}:00 birds ${F.birds.length}`, JSON.stringify(st), 'eggs', F.eggs.length, 'fox', Object.keys(FST)[F.fox.state], 'pigs resting', sim.pigs.filter(p => p.state === 5).length);
  }
}
console.log('events', JSON.stringify(ev));
console.log('step ms', ((performance.now() - t0) / (60 * 300)).toFixed(2), 'fox raids', F.fox.raids, 'steals', F.fox.steals);
