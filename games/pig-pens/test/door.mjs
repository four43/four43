import { farmSim } from './farmSim.mjs';
for (const shut of [false, true]) {
  const sim = farmSim({ pigs: 30, seed: 9 }); sim.setNight(true);
  let gulps = 0, shutAt = -1;
  for (let s = 0; s < 60 * 150; s++) {
    sim.step();
    for (const e of sim.log.splice(0)) if (e.type === 'gulp') gulps++;
    if (shut && shutAt < 0 && sim.flock.birds.every(b => b.state === 10)) { sim.lay.coop.open = false; shutAt = s / 60; }
  }
  console.log(`[night 150 s, door ${shut ? 'shut at ' + shutAt.toFixed(1) + ' s' : 'left open'}] fox visits ${sim.flock.fox.raids}, gulps ${gulps}`);
}
