// The feel samples for golden re-blessing (overview §5.5): pigs penned after 120 s on the golden seed, snacks eaten,
// chickens caught at night and bedtime. `node test/feel.mjs` prints them.
import { farmSim } from './farmSim.mjs';

export function samples(make = farmSim) {
  const a = make({ pigs: 48, seed: 3 }); a.step(600);
  const pen = a.lay.pens[4];
  for (let k = 0; k < 5; k++) a.tossFood(pen.cx, 4, pen.cz + 6, pen.cx + k - 2, pen.cz);
  let munched = 0;
  for (let s = 600; s < 7200; s++) { a.step(); munched += a.log.splice(0).filter(e => e.type === 'munch').length; }
  const penned = a.counts.slice(0, 6).reduce((x, y) => x + y, 0);

  const n = make({ pigs: 30, seed: 9 }); n.step(300); n.setNight(true);
  let gulps = 0, bedSec = -1;
  for (let s = 0; s < 60 * 40; s++) {
    n.step(); gulps += n.log.splice(0).filter(e => e.type === 'gulp').length;
    if (bedSec < 0 && n.flock.birds.every(b => b.state === 10)) bedSec = (s + 1) / 60;
  }

  return { penned, munched, gulps, bedSec };
}
if (import.meta.url === `file://${process.argv[1]}`) console.log(JSON.stringify(samples(), null, 1));
