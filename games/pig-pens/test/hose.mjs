import RAPIER from '@dimforge/rapier3d-compat';
import { createSim, ST } from '../src/sim.js';
await RAPIER.init();
const sim = createSim(RAPIER, { pigs: 48, seed: 4 });
const muddy = () => sim.pigs.filter(p => p.mud > 0.3).length;
console.log('muddy at start', muddy());
for (let s = 0; s < 60 * 240; s++) { sim.step(); if (s % (60 * 60) === 0 && s) console.log(`t=${s / 60}s muddy ${muddy()} resting ${sim.pigs.filter(p => p.state === ST.REST).length}`); }
console.log('muddy after 4 min (no hose)', muddy(), 'mean mud', (sim.pigs.reduce((a, p) => a + p.mud, 0) / 48).toFixed(2));
// hose aimed in the most muddy-populated pen
const byPen = [0, 1, 2, 3, 4, 5].map(i => sim.pigs.filter(p => p.region === i && p.mud > 0.3).length);
const pen = sim.lay.pens[byPen.indexOf(Math.max(...byPen))];
console.log('muddy per pen', byPen.join(' '), '-> spraying pen', pen.id);
const zoomed = new Set(), came = new Set(); let maxZoomSpd = 0, cleaned = 0;
const mud0 = sim.pigs.map(p => p.mud);
for (let s = 0; s < 60 * 25; s++) {
  // sweep the spray slowly back and forth, source 5 m south
  const x = pen.cx + Math.sin(s / 60 * 0.7) * 2.5, z = pen.cz;
  sim.setHose(x, z, true, x, z + 5);
  sim.step();
  if (s % 120 === 0) { const p = sim.pigs[7]; console.log('   p7', p.px.toFixed(1), p.pz.toFixed(1), 'st', p.state, 'spd', p.speed.toFixed(2), 'dv', Math.hypot(p.dvx, p.dvz).toFixed(2), 'fd', sim.hose.field ? sim.grid.dist(sim.hose.field, p.px, p.pz).toFixed(1) : '-'); }
  for (const p of sim.pigs) { if (p.state === ST.SHOWER) came.add(p.i); if (p.state === ST.ZOOM) { zoomed.add(p.i); maxZoomSpd = Math.max(maxZoomSpd, p.speed); } }
}
for (const i of came) { const p = sim.pigs[i]; if (p.mud > 0.03) console.log('  unwashed bather', i, 'mud', p.mud.toFixed(2), 'state', p.state, 'dist', Math.hypot(p.px - sim.hose.x, p.pz - sim.hose.z).toFixed(1), 'region', p.region, 'piglet', p.piglet); }
sim.setHose(null, null, false);
for (const p of sim.pigs) if (mud0[p.i] > 0.3 && p.mud < 0.03) cleaned++;
console.log('came for a bath', came.size, 'cleaned', cleaned, 'zoomed off', zoomed.size, 'max zoom speed', maxZoomSpd.toFixed(2));
const cleanZoomers = [...zoomed].filter(i => sim.pigs[i].mud < 0.03).length;
console.log('zoomers that are clean', cleanZoomers, '/', zoomed.size);
// after the hose stops, nobody should still be in SHOWER after 4 s
for (let s = 0; s < 240; s++) sim.step();
console.log('still waiting at shower 4 s later', sim.pigs.filter(p => p.state === ST.SHOWER).length, 'zooming', sim.pigs.filter(p => p.state === ST.ZOOM).length);
