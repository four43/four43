import RAPIER from '@dimforge/rapier3d-compat';
import { createSim } from '../src/sim.js';
import { CST_NAME } from '../src/chickens.js';
await RAPIER.init();
const sim = createSim(RAPIER, { pigs: 30, seed: 4 });
const F = sim.flock, r = sim.lay.run;
let bad = null;
const check = (tag, s) => { for (const b of F.birds) for (const k of ['px', 'py', 'pz', 'yaw', 'speed', 'scale']) if (!Number.isFinite(b[k])) { if (!bad) bad = `${tag} t=${(s/60).toFixed(2)} bird ${b.i} ${b.kind} state ${CST_NAME[b.state]} ${k}=${b[k]}`; } };
for (let s = 0; s < 60 * 60; s++) { const a = s / 60; sim.setDog((r.x0 + r.x1) / 2 + Math.sin(a) * 5, (r.z0 + r.z1) / 2 + Math.cos(a * 1.3) * 2, true); sim.step(); check('dog', s); }
sim.setDog(null, null, false);
sim.setNight(true);
for (let s = 0; s < 60 * 60; s++) { sim.step(); check('night', s); }
for (const b of F.birds.slice(0, 3)) { F.grab(b.i); for (let s = 0; s < 30; s++) { F.moveGrab(b.px + 0.2, 1.4, b.pz); sim.step(); } F.release(); for (let s = 0; s < 60; s++) { sim.step(); check('grab', s); } }
console.log(bad || 'no NaN in birds');
// what states/speeds happen while fleeing
const sim2 = createSim(RAPIER, { pigs: 10, seed: 4 }); const F2 = sim2.flock; let maxV = 0, maxY = 0, minY = 9;
for (let s = 0; s < 60 * 20; s++) { sim2.setDog((r.x0 + r.x1) / 2 + Math.sin(s / 60) * 5, (r.z0 + r.z1) / 2, true); sim2.step(); for (const b of F2.birds) if (b.state === 7) { maxV = Math.max(maxV, b.speed); maxY = Math.max(maxY, b.py); minY = Math.min(minY, b.py); } }
console.log('fleeing speed max', maxV.toFixed(2), 'y range', minY.toFixed(2), maxY.toFixed(2));
