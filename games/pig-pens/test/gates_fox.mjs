import RAPIER from '@dimforge/rapier3d-compat';
import { createSim } from '../src/sim.js';
import { hit } from '../src/flow.js';
await RAPIER.init();
// 1) close every gate: no pig may change area, and none may sit inside a closed gate
{
  const sim = createSim(RAPIER, { pigs: 48, seed: 3 });
  for (let s = 0; s < 120; s++) sim.step();
  let t = performance.now(); for (const g of sim.lay.gates) sim.setGate(g.id, false);
  console.log('closing 15 gates took', (performance.now() - t).toFixed(0), 'ms total');
  const before = sim.transitions, start = sim.pigs.map(p => p.region);
  for (let s = 0; s < 60 * 120; s++) sim.step();
  const moved = sim.pigs.filter((p, i) => p.region !== start[i]).length;
  console.log('all gates closed 120 s: pigs that changed area', moved, '(should be 0 unless thrown)');
  t = performance.now(); sim.setGate(1, true); console.log('opening one gate', (performance.now() - t).toFixed(0), 'ms');
  for (let s = 0; s < 60 * 120; s++) sim.step();
  console.log('one lane gate re-opened: transitions since', sim.transitions - before);
}
// 2) coop door shut at dusk: the fox gets nobody
for (const shut of [false, true]) {
  const sim = createSim(RAPIER, { pigs: 30, seed: 9, hour: 17.5 });
  let shutDone = false;
  for (let s = 0; s < 60 * 160; s++) {
    sim.step();
    if (shut && !shutDone && sim.flock.birds.every(b => b.state === 10 || b.state === 13)) { sim.lay.coop.open = false; shutDone = true; }
  }
  const b = sim.flock.birds; console.log(`[door ${shut ? 'shut once all inside' : 'left open'}] raids ${sim.flock.fox.raids} steals ${sim.flock.fox.steals} inside ${b.filter(b => b.state === 10).length}/${b.length} at hour ${sim.clock.hour.toFixed(1)}`);
}
// 3) dog chases the fox off
{
  const sim = createSim(RAPIER, { pigs: 30, seed: 9, hour: 19.9 });
  sim.lay.coop.open = false;
  let spawned = false, fled = false, tFlee = 0;
  for (let s = 0; s < 60 * 120 && !fled; s++) {
    const f = sim.flock.fox;
    if (f.state === 1 || f.state === 2) { spawned = true; sim.setDog(f.x, f.z, true); }
    if (spawned && f.state === 4) { fled = true; tFlee = s / 60; }
    sim.step();
  }
  console.log('[dog vs fox] fox appeared', spawned, 'fox fled', fled, 'at', tFlee.toFixed(1), 's');
}
