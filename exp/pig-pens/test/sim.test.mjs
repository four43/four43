// Facts the v2 spec's §13.1 reports, asserted (lion-hawk 2e P5, #62): on the engine path (farmSim) since phase 3k.
import test from 'node:test';
import assert from 'node:assert/strict';
import { farmSim } from './farmSim.mjs';
const steps = (sim, n, f) => { for (let s = 0; s < n; s++) { f?.(s); sim.step(); } };

test('snacks: ten quick tosses land five; none while five are out', () => {
  const sim = farmSim({ pigs: 48, seed: 6 }); steps(sim, 300);
  const pen = sim.lay.pens[5]; let ok = 0;
  for (let k = 0; k < 10; k++) if (sim.tossFood(pen.cx, 4, pen.cz + 6, pen.cx + (k % 5) - 2, pen.cz)) ok++;
  assert.equal(ok, 5); assert.equal(sim.foods.length, 5); assert.equal(sim.tossFood(26, 4, 22, 27, 23), null);
});
test('night (seed 9): all in bed at 10–13 s (measured 11.7), a gulp at 18–22 s (20.0 since 2.6.0: the run and coop moved), a tap makes the fox spit, nobody is lost by morning', () => {
  const sim = farmSim({ pigs: 30, seed: 9 }), F = sim.flock; steps(sim, 300); sim.setNight(true);
  let bed = -1, gulp = -1, spit = null;
  steps(sim, 60 * 40, s => {
    for (const e of sim.log.splice(0)) { if (e.type === 'gulp' && gulp < 0) gulp = s / 60; if (e.type === 'spit' && !spit) spit = { t: s / 60, reason: e.reason }; }
    if (bed < 0 && F.birds.every(b => b.state === 10)) bed = s / 60;
    if (gulp >= 0 && !spit && s / 60 > gulp + 2 && F.fox.carrying) F.tapFox();
  });
  assert.ok(bed > 10 && bed < 13, `${bed}`); assert.ok(gulp > 18 && gulp < 22, `${gulp}`);
  assert.equal(spit?.reason, 'tap'); assert.ok(spit.t - gulp > 1.9 && spit.t - gulp < 2.4, `${spit.t - gulp}`);
  sim.setNight(false); steps(sim, 60 * 20);
  assert.equal(F.birds.length, 11); assert.equal(F.birds.filter(b => b.state === 12).length, 0); assert.equal(F.fox.carrying, null);
});
test('gates: with every gate shut for 120 s no pig changes area', () => {
  const sim = farmSim({ pigs: 48, seed: 3 }); steps(sim, 120);
  for (const g of sim.lay.gates) sim.setGate(g.id, false);
  const start = sim.pigs.map(p => p.region); steps(sim, 60 * 120);
  assert.equal(sim.pigs.filter((p, i) => p.region !== start[i]).length, 0);
});
test('hose: a pig in the spray soaks to wet 1 within a second; out of it, it dries over dryTime (45 s), then its coat fluffs up', () => {
  const sim = farmSim({ pigs: 24, seed: 4 }); steps(sim, 60);
  const p = sim.pigs[0], far = sim.pigs.filter(q => Math.hypot(q.px - p.px, q.pz - p.pz) > 6);
  assert.ok(sim.pigs.every(q => q.wet === 0), 'everyone starts dry');
  steps(sim, 60, () => sim.setHose(p.px, p.pz, true, p.px, p.pz + 5));
  assert.equal(p.wet, 1); assert.ok(far.every(q => q.wet === 0), 'only pigs in the spray get wet');
  sim.setHose(null, null, false); steps(sim, 60 * 20);
  assert.ok(p.wet > 0.5 && p.wet < 0.6, `still wet after 20 s: ${p.wet}`);
  steps(sim, 60 * 26); assert.equal(p.wet, 0);
});
test('Biscuit: after dogBored seconds with no job he trots home, in through the door, and lies facing out; a job gets him up', () => {
  const sim = farmSim({ pigs: 24, seed: 4 }), d = sim.dog, H = sim.lay.dogHouse, fx = Math.sin(H.rot), fz = Math.cos(H.rot);
  steps(sim, 60 * 20); assert.equal(d.home, 0, 'still waiting for a job at 20 s');
  let porch = false; steps(sim, 60 * 30, () => { if (d.home === 2) porch = true; });
  assert.equal(d.home, 3); assert.ok(porch, 'he came in by the porch');
  const along = (d.x - H.x) * fx + (d.z - H.z) * fz, across = (d.x - H.x) * fz - (d.z - H.z) * fx;
  assert.ok(Math.abs(along - 0.96) < 0.2 && Math.abs(across) < 0.2, `lying in the doorway: ${along}, ${across}`);
  assert.ok(d.lie > 0.95, `down on his belly: ${d.lie}`);
  const turn = Math.atan2(Math.sin(d.yaw - H.rot), Math.cos(d.yaw - H.rot)); assert.ok(Math.abs(turn) < 0.1, `looking out of the door: ${turn}`);
  sim.setDog(0, 0, true); steps(sim, 90); assert.equal(d.home, 0); assert.ok(d.lie < 0.1 && Math.hypot(d.x - H.x, d.z - H.z) > 3, 'up and off to work');
});
