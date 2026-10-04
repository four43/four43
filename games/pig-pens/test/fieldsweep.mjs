import RAPIER from '@dimforge/rapier3d-compat';
import { createSim } from '../src/sim.js';
await RAPIER.init();
const sim = createSim(RAPIER, { pigs: 8, seed: 1 }); const F = sim.lay.field;
let worst = 0, n = 0;
for (let x = F.x0 + 1; x < F.x1; x += 1.7) for (let z = F.z0 + 1; z < F.z1; z += 1.7) { const t = performance.now(); sim.grid.field(x, z, 0.9); worst = Math.max(worst, performance.now() - t); n++; }
console.log('flow fields computed', n, 'worst ms', worst.toFixed(1));
