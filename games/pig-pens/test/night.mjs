import RAPIER from '@dimforge/rapier3d-compat';
import { createSim } from '../src/sim.js';
import { CST_NAME, FST } from '../src/chickens.js';
await RAPIER.init();
const count = (F) => { const st = {}; for (const b of F.birds) st[CST_NAME[b.state]] = (st[CST_NAME[b.state]] || 0) + 1; return JSON.stringify(st); };
// day: eggs get laid
{
  const sim = createSim(RAPIER, { pigs: 30, seed: 2 });
  for (let s = 0; s < 60 * 140; s++) sim.step();
  console.log('[day] after 140 s eggs', sim.flock.eggs.length, 'laid', sim.flock.birds.reduce((a, b) => a + b.eggsTotal, 0), count(sim.flock));
}
// night with the door open: fox gulps, then hiccups the chicken back out; nobody is lost
for (const tap of [false, true]) {
  const sim = createSim(RAPIER, { pigs: 30, seed: 9 });
  for (let s = 0; s < 60 * 5; s++) sim.step();
  sim.setNight(true);
  const ev = {}; let gulpAt = -1, spitAt = -1, spitReason = '', bedT = -1;
  for (let s = 0; s < 60 * 120; s++) {
    sim.step();
    for (const e of sim.events.splice(0)) { ev[e.type] = (ev[e.type] || 0) + (e.n || 1); if (e.type === 'gulp' && gulpAt < 0) gulpAt = s / 60; if (e.type === 'spit' && spitAt < 0) { spitAt = s / 60; spitReason = e.reason; } }
    if (bedT < 0 && sim.flock.birds.every(b => b.state === 10)) bedT = s / 60;
    if (tap && sim.flock.fox.carrying && s / 60 > gulpAt + 2) sim.flock.tapFox();
  }
  const F = sim.flock;
  console.log(`[night${tap ? ', tap the fox' : ''}] all in bed at ${bedT.toFixed(1)} s; gulp ${gulpAt.toFixed(1)} s, spit ${spitAt.toFixed(1)} s (${spitReason}); feathers ${ev.feathers || 0}; birds ${F.birds.length} hidden-in-fox ${F.birds.filter(b => b.state === 12).length}`, count(F));
  sim.setNight(false);
  for (let s = 0; s < 60 * 20; s++) sim.step();
  console.log('   morning:', count(F), 'fox', Object.keys(FST)[F.fox.state]);
}
// fox has a chicken when morning comes: it must spit it out
{
  const sim = createSim(RAPIER, { pigs: 30, seed: 9 }); sim.setNight(true);
  let s = 0; while (!sim.flock.fox.carrying && s < 60 * 120) { sim.step(); s++; }
  const had = !!sim.flock.fox.carrying; sim.setNight(false);
  for (let k = 0; k < 120; k++) sim.step();
  console.log('[morning with a mouthful] had chicken', had, 'still carrying', !!sim.flock.fox.carrying, 'events', sim.events.filter(e => e.type === 'spit').map(e => e.reason).join(','));
}
