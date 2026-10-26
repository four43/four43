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
test('tractor: 0 to 5.2–5.6 m/s in 4 s; full steer turns 1.8–2.0 rad in 2 s; stops in 1.2–1.4 s', () => {
  const sim = farmSim({ pigs: 48, seed: 2 }), T = sim.tractor; steps(sim, 120);
  T.driven = true; T.setInput(1, 0); steps(sim, 240);
  assert.ok(T.speed > 5.2 && T.speed < 5.6, `${T.speed}`);
  T.setInput(1, 1); const y0 = T.yaw; steps(sim, 120);
  let dy = T.yaw - y0; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); assert.ok(dy > 1.8 && dy < 2.0, `${dy}`);
  T.setInput(-1, 0); let stop = 0; steps(sim, 240, s => { if (!stop && T.fwd < 0.1) stop = s / 60; });
  assert.ok(stop > 1.2 && stop < 1.4, `${stop}`);
});
test('night (seed 9): all in bed at 10–13 s (measured 11.7), a gulp at 20–24 s, a tap makes the fox spit, nobody is lost by morning', () => {
  const sim = farmSim({ pigs: 30, seed: 9 }), F = sim.flock; steps(sim, 300); sim.setNight(true);
  let bed = -1, gulp = -1, spit = null;
  steps(sim, 60 * 40, s => {
    for (const e of sim.log.splice(0)) { if (e.type === 'gulp' && gulp < 0) gulp = s / 60; if (e.type === 'spit' && !spit) spit = { t: s / 60, reason: e.reason }; }
    if (bed < 0 && F.birds.every(b => b.state === 10)) bed = s / 60;
    if (gulp >= 0 && !spit && s / 60 > gulp + 2 && F.fox.carrying) F.tapFox();
  });
  assert.ok(bed > 10 && bed < 13, `${bed}`); assert.ok(gulp > 20 && gulp < 24, `${gulp}`);
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
