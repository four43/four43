// Generated tracks as Worlds (spec tracks T-8, T-12): heightfield orientation, spawn, and an
// autopilot driving each layout end to end. Run: node test/track.mjs [filter]
import R from '@dimforge/rapier3d-compat';
import { Sim, DT } from '../src/sim.js';
import { qrot } from '../src/vehicle.js';
import { generateTrack } from '../src/gen/track.js';
import { heightAt } from '../src/gen/terrain.js';
import { rng } from '../src/gen/rng.js';
import { TrackWorld, pointAt } from '../src/world/trackWorld.js';
import { SURFACES } from '../src/tire.js';
import { runUntil } from './autopilot.js';
await R.init();

const only = process.argv[2];
const results = [], rows = [];
function check(name, val, lo, hi, unit = '') {
  const ok = val >= lo && val <= hi;
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${val.toFixed(3)}${unit}  [${lo}..${hi}]`);
  return ok;
}
const test = (name, f) => { if (!only || name.includes(only)) { console.log(`\n# ${name}`); f(); } };
const T0 = performance.now();

const CASES = [];
for (const seed of ['t1', 't2', 't3']) {
  for (const [kind, theme] of [['loop', 'summer'], ['loop', 'winter'], ['stage', 'summer']]) CASES.push({ seed, kind, theme });
}

for (const { seed, kind, theme } of CASES) {
  test(`${seed} ${kind} ${theme}`, () => {
    const track = generateTrack(seed, { kind, theme });
    const world = new TrackWorld(track);
    const sim = new Sim(R, { world, car: 'awd', assist: true });
    const L = track.layout, loc = track.locator, t = track.terrain;

    // Spawn: settles on the road.
    for (let i = 0; i < 2 / DT; i++) sim.step();
    const p0 = sim.car.body.translation();
    check('spawn settle |d| (m)', Math.abs(loc.locate(p0.x, p0.z).d), 0, 1);

    // Heightfield orientation/scale (after a step, so the query pipeline is built): raycast down
    // at 200 random points. Rapier splits each 1 m cell along its (x+1, z)–(x, z+1) diagonal, so
    // the hit must match that triangle exactly; vs the bilinear heightAt it differs by up to
    // |twist|/4 per cell, which only matters on whoops crossing the grid at an angle (~3 cm).
    const r = rng(`hf|${seed}|${kind}`), H = (ix, iz) => t.heights[iz * t.nx + ix];
    let worstTri = 0, worstBil = 0;
    for (let k = 0; k < 200; k++) {
      // Half near the road (where it matters), half anywhere on the grid.
      let x, z;
      if (k % 2) { const i = r.int(0, L.n - 1); x = L.x[i] + r.range(-20, 20); z = L.z[i] + r.range(-20, 20); }
      else { x = t.x0 + r.range(1, t.nx - 2); z = t.z0 + r.range(1, t.nz - 2); }
      // Rapier's heightfield raycast can miss exactly on a cell edge; keep probes ≥ 1 mm off them.
      const off = (q, o) => { const f = ((q - o) % 1 + 1) % 1; return f < 1e-3 || f > 1 - 1e-3 ? q + 0.01 : q; };
      x = off(x, t.x0); z = off(z, t.z0);
      const hit = sim.phys.castRay(new R.Ray({ x, y: 1000, z }, { x: 0, y: -1, z: 0 }), 2000, true,
        undefined, undefined, undefined, undefined, (c) => world.ground.has(c.handle));
      const y = hit ? 1000 - hit.timeOfImpact : Infinity;
      const fx = x - t.x0, fz = z - t.z0, ix = Math.floor(fx), iz = Math.floor(fz), u = fx - ix, v = fz - iz;
      const a = H(ix, iz), b = H(ix + 1, iz), c = H(ix, iz + 1), d = H(ix + 1, iz + 1);
      const tri = u + v < 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
      worstTri = Math.max(worstTri, Math.abs(y - tri));
      worstBil = Math.max(worstBil, Math.abs(y - heightAt(t, x, z)));
    }
    check('heightfield vs grid triangles, worst (m)', worstTri, 0, 0.002);
    check('heightfield vs heightAt (bilinear), worst (m)', worstBil, 0, 0.05);

    // Autopilot: one lap (loops, by unwrapped s progress) or past the finish gate (stages).
    const finishS = kind === 'stage' ? track.roadside.gates.find((g) => g.kind === 'finish').s : null;
    const limit = L.length / 8;
    let slow = 0, stuckAt = null, sPrev = loc.locate(p0.x, p0.z).s, prog = 0, maxD = 0, minUp = 1, worstAt = 0, flipAt = null, dist = 0;
    const t0 = sim.time, wall = performance.now();
    let xPrev = p0.x, zPrev = p0.z;
    const done = runUntil(sim, track, {
      maxTime: limit,
      onStep(s) {
        const b = s.car.body, p = b.translation();
        const l = loc.locate(p.x, p.z);
        let dS = l.s - sPrev;
        if (L.closed) { if (dS > L.length / 2) dS -= L.length; else if (dS < -L.length / 2) dS += L.length; }
        prog += dS; sPrev = l.s;
        dist += Math.hypot(p.x - xPrev, p.z - zPrev); xPrev = p.x; zPrev = p.z;
        if (Math.abs(l.d) > maxD) { maxD = Math.abs(l.d); worstAt = l.s; }
        const up = qrot(b.rotation(), { x: 0, y: 1, z: 0 }).y;
        if (up < minUp) { minUp = up; if (up <= 0.3 && flipAt === null) flipAt = l.s; }
        slow = Math.abs(s.car.speed) < 0.5 ? slow + DT : 0;
        if (slow > 10) { stuckAt = l.s; return true; }
        if (maxD > 6 || up <= 0.3) return true; // fail fast
        return L.closed ? prog >= L.length : l.s >= finishS;
      },
    });
    const simT = sim.time - t0, realT = (performance.now() - wall) / 1000;
    const finished = done && stuckAt === null && maxD <= 6 && minUp > 0.3;
    check('finished within length / 8 m/s', finished ? simT : Infinity, 0, limit, ' s');
    check('worst |d| (m)', maxD, 0, 6);
    check('min body up.y', minUp, 0.3, 1);
    const avg = dist / simT;
    console.log(`      length ${L.length.toFixed(0)} m, sim ${simT.toFixed(1)} s, avg ${avg.toFixed(1)} m/s, worst |d| ${maxD.toFixed(2)} m at s=${worstAt.toFixed(0)}`
      + `${flipAt !== null ? `, rolled at s=${flipAt.toFixed(0)}` : ''}${stuckAt !== null ? `, stuck at s=${stuckAt.toFixed(0)}` : ''}, real ${realT.toFixed(1)} s (×${(simT / realT).toFixed(1)})`);
    rows.push({ name: `${seed} ${kind} ${theme}`, len: L.length, simT, avg, maxD, ok: finished });
  });
}

// World API: surface blending, recover (wrap / clamp), resetProps.
for (const kind of ['loop', 'stage']) test(`t1 ${kind} world api`, () => {
  const track = generateTrack('t1', { kind, theme: 'summer' }), L = track.layout, loc = track.locator;
  const world = new TrackWorld(track);
  const sim = new Sim(R, { world, car: 'awd', assist: true });
  const sec = track.surfaces.sections[0], nxt = track.surfaces.sections[1];
  const p = pointAt(L, sec.s1 - 5), a = SURFACES[sec.road], b = SURFACES[nxt.road];
  const m = world.surfaceAt(p.x, p.z);
  check(`blend mu mid-way ${a.name}→${b.name}`, m.mu, (a.mu + b.mu) / 2 - 0.01, (a.mu + b.mu) / 2 + 0.01);
  check('blend B = tan(pi / 2C)', Math.abs(m.B - Math.tan(Math.PI / (2 * m.C))), 0, 1e-9);
  check('blend cached (same object)', world.surfaceAt(p.x, p.z) === m ? 1 : 0, 1, 1);
  const off = pointAt(L, 300), h = off.yaw;
  check('verge 5 m off the road', world.surfaceAt(off.x + 5 * Math.cos(h), off.z - 5 * Math.sin(h)) === SURFACES.grass ? 1 : 0, 1, 1);
  let calls = 0; const t0 = performance.now();
  for (let k = 0; k < 20000; k++) { const q = pointAt(L, k % L.length); world.surfaceAt(q.x + 2, q.z); calls++; }
  check('surfaceAt cost (µs/call)', (performance.now() - t0) * 1000 / calls, 0, 5);

  // Recover from 9 m off the road at s = 500: centreline 5 m back, road height + 0.6, heading.
  const q = pointAt(L, 500), rc = world.recover(q.x + 9 * Math.cos(q.yaw), q.z - 9 * Math.sin(q.yaw));
  const lr = loc.locate(rc.x, rc.z);
  check('recover s (m)', lr.s, 494.5, 495.5);
  check('recover |d| (m)', Math.abs(lr.d), 0, 0.01);
  check('recover y - road (m)', rc.y - heightAt(track.terrain, rc.x, rc.z), 0.55, 0.65);
  check('recover yaw error (rad)', Math.abs(Math.atan2(Math.sin(rc.yaw - L.heading[495]), Math.cos(rc.yaw - L.heading[495]))), 0, 0.02);
  const r0 = world.recover(L.x[2], L.z[2]), s0 = loc.locate(r0.x, r0.z).s;
  if (kind === 'loop') check('recover wraps at the seam (s)', s0, L.length - 3.5, L.length - 2.5);
  else check('recover clamps at the stage start (s)', s0, 0, 0.5);
  sim.car.reset(rc, rc.yaw);
  for (let i = 0; i < 1 / DT; i++) sim.step();
  const pc = sim.car.body.translation();
  check('after recover, settled |d| (m)', Math.abs(loc.locate(pc.x, pc.z).d), 0, 0.5);
  check('after recover, up.y', qrot(sim.car.body.rotation(), { x: 0, y: 1, z: 0 }).y, 0.9, 1);

  // Knock a marker away, then resetProps puts it home and asleep.
  const pr = world.props[0];
  pr.body.setTranslation({ x: pr.home.x + 3, y: pr.home.y + 1, z: pr.home.z }, true);
  pr.body.setLinvel({ x: 5, y: 0, z: 0 }, true);
  for (let i = 0; i < 60; i++) sim.step();
  world.resetProps();
  const tp = pr.body.translation();
  check('resetProps: marker home (m)', Math.hypot(tp.x - pr.home.x, tp.y - pr.home.y, tp.z - pr.home.z), 0, 1e-4);
  for (let i = 0; i < 240; i++) sim.step();
  const tp2 = pr.body.translation();
  check('marker stays put after reset (m)', Math.hypot(tp2.x - pr.home.x, tp2.y - pr.home.y, tp2.z - pr.home.z), 0, 0.05);
  check('marker count', world.props.length, 100, 2000);
});

console.log('\ncase                 length  sim s  avg m/s  worst|d|  result');
for (const r of rows) console.log(`${r.name.padEnd(20)} ${String(Math.round(r.len)).padStart(6)} ${r.simT.toFixed(1).padStart(6)} ${r.avg.toFixed(1).padStart(8)} ${r.maxD.toFixed(2).padStart(9)}  ${r.ok ? 'ok' : 'FAIL'}`);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed in ${((performance.now() - T0) / 1000).toFixed(1)} s`);
process.exit(failed.length ? 1 : 0);
