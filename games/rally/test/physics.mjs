// Headless validation of the vehicle core (Milestone 1). Run: node test/physics.mjs [filter]
import R from '@dimforge/rapier3d-compat';
import { Sim, DT } from '../src/sim.js';
import { shift } from '../src/drivetrain.js';
await R.init();

const only = process.argv[2];
const results = [];
function check(name, val, lo, hi, unit = '') {
  const ok = val >= lo && val <= hi;
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${val.toFixed(3)}${unit}  [${lo}..${hi}]`);
  return ok;
}
const mk = (car, surface, extra = {}) => new Sim(R, { car, surface, cones: false, assist: false, ...extra });
const run = (sim, secs, fn) => { const n = Math.round(secs / DT); for (let i = 0; i < n; i++) { fn && fn(sim, i * DT); sim.step(); } };
const test = (name, f) => { if (!only || name.includes(only)) { console.log(`\n# ${name}`); f(); } };
const latAcc = (sim) => { // lateral acceleration from velocity x yaw rate (steady state)
  const v = sim.car.body.linvel(), w = sim.car.body.angvel();
  return Math.hypot(v.x, v.z) * Math.abs(w.y);
};

for (const car of ['awd', 'rwd']) {
  test(`${car} static settle`, () => {
    const sim = mk(car, 'tarmac');
    run(sim, 3);
    const c = sim.car, m = c.cfg.mass;
    const fz = c.wheels.map((w) => w.fz), sum = fz.reduce((a, b) => a + b, 0);
    check('sum Fz / m g', sum / (m * 9.81), 0.995, 1.005);
    check('front share', (fz[0] + fz[1]) / sum, c.cfg.frontWeight - 0.01, c.cfg.frontWeight + 0.01);
    const sag = c.wheels.map((w) => w.x);
    check('static compression (m)', sag[0], c.staticComp * 0.95, c.staticComp * 1.05);
    check('CoM height (m)', c.body.translation().y, c.cfg.comHeight - 0.01, c.cfg.comHeight + 0.01);
    check('creep speed at rest (m/s)', Math.hypot(c.body.linvel().x, c.body.linvel().z), 0, 0.002);
  });

  test(`${car} drop test`, () => {
    const sim = mk(car, 'tarmac');
    run(sim, 2);
    const b = sim.car.body, y0 = b.translation().y;
    b.setTranslation({ ...b.translation(), y: y0 + 0.06 }, true);
    const ys = []; run(sim, 3, (s) => ys.push(s.car.body.translation().y - y0));
    // Frequency from zero crossings of the heave; damping from successive peaks.
    const cross = []; for (let i = 1; i < ys.length; i++) if (ys[i - 1] > 0 && ys[i] <= 0) cross.push(i * DT);
    const f = cross.length >= 2 ? 1 / (cross[1] - cross[0]) : 0;
    let peaks = []; for (let i = 1; i < ys.length - 1; i++) if (ys[i] < ys[i - 1] && ys[i] <= ys[i + 1]) peaks.push(Math.abs(ys[i]));
    check('heave frequency (Hz, damped)', f || 0, 1.2, 1.7, ' Hz');
    const T = f ? 1 / f : 1, after = ys.slice(Math.round(1.5 * T / DT)).map(Math.abs);
    check('residual after 1.5 cycles / drop', Math.max(...after) / 0.06, 0, 0.08);
  });

  for (const [surf, lo, hi] of car === 'awd'
    ? [['tarmac', 0.95, 1.05], ['hardpack', 0.75, 0.90], ['gravel', 0.68, 0.80], ['packed', 0.64, 0.76], ['ice', 0.44, 0.56]]
    : [['tarmac', 0.95, 1.05], ['gravel', 0.66, 0.80]]) {
    test(`${car} skidpad ${surf}`, () => {
      // Closed-loop driver on a 40 m circle: throttle holds a target speed, steer holds the radius.
      // Sweep target speed upward and record the best steady lateral g.
      const sim = mk(car, surf, { pos: { x: -40, y: 0.6, z: 0 }, yaw: 0 });
      const Rr = 40;
      const vLim = Math.sqrt(hi * 9.81 * Rr);
      let vT = 0.6 * vLim, best = 0, hist = [], steer = 0.05;
      run(sim, 90, (s, t) => {
        const c = s.car, p = c.body.translation(), v = c.body.linvel();
        const r = Math.hypot(p.x, p.z), sp = Math.hypot(v.x, v.z);
        const err = r - Rr;                       // + = running wide
        const wd = sp / Rr * (1 + 0.04 * Math.max(-5, Math.min(5, err)));
        const wy = c.body.angvel().y;
        steer += (wd - wy) * DT * 3.0;
        steer = Math.max(-1, Math.min(1, steer));
        c.input.steer = steer + 0.8 * (wd - wy);
        c.input.throttle = Math.max(0, Math.min(1, 0.2 + 0.5 * (vT - sp)));
        c.input.brake = 0;
        vT += DT * (0.6 * vLim) / 80;
        if (t > 4 && Math.abs(err) < 1.5 && Math.abs(wy - sp / r) < 0.15 * sp / r) {
          hist.push(sp * sp / r / 9.81); if (hist.length > 360) hist.shift();
          if (hist.length === 360) best = Math.max(best, hist.reduce((a, b) => a + b, 0) / 360);
        } else hist = [];
      });
      check('peak steady lateral g', best, lo, hi, ' g');
    });
  }

  test(`${car} acceleration`, () => {
    for (const [surf, lo, hi] of car === 'awd' ? [['tarmac', 4.2, 5.0], ['gravel', 4.3, 5.5]] : [['gravel', 6.5, 8.5]]) {
      const sim = mk(car, surf, { assist: true, pos: { x: 0, y: 0.6, z: -250 } });
      run(sim, 1.5);
      let t100 = 0;
      run(sim, 15, (s, t) => { s.car.input.throttle = 1; if (!t100 && s.car.speed >= 100 / 3.6) t100 = t; });
      check(`0-100 km/h ${surf} (s)`, t100 || 99, lo, hi, ' s');
    }
  });

  test(`${car} braking`, () => {
    for (const [surf, lo, hi] of car === 'awd' ? [['tarmac', 35, 40], ['gravel', 44, 56]] : [['tarmac', 35, 42], ['gravel', 44, 56]]) {
      const sim = mk(car, surf, { assist: true, pos: { x: 0, y: 0.5, z: -140 } });
      run(sim, 1);
      sim.car.body.setLinvel({ x: 0, y: 0, z: 100 / 3.6 }, true);
      for (const w of sim.car.wheels) w.omega = 100 / 3.6 / sim.car.cfg.radius;
      run(sim, 0.3, (s) => { s.car.input.throttle = 0; });
      // restore exact 100 km/h after settling
      const v = sim.car.body.linvel(); sim.car.body.setLinvel({ x: v.x, y: v.y, z: 100 / 3.6 }, true);
      for (const w of sim.car.wheels) w.omega = 100 / 3.6 / sim.car.cfg.radius;
      const z0 = sim.car.body.translation().z; let dist = 0, frontShare = 0;
      run(sim, 8, (s) => {
        s.car.input.brake = 1; s.car.input.throttle = 0;
        if (!dist && s.car.speed < 0.1) dist = s.car.body.translation().z - z0;
        if (!frontShare && s.car.speed < 20 && s.car.speed > 18) { const f = s.car.wheels.map((w) => w.fz); frontShare = (f[0] + f[1]) / f.reduce((a, b) => a + b); }
      });
      check(`100-0 ${surf} (m)`, dist || 999, lo, hi, ' m');
      check(`front load share under braking ${surf}`, frontShare, sim.car.cfg.frontWeight + 0.05, 0.95);
    }
  });

  test(`${car} slope hold`, () => {
    // Car parked on the 10 % slope with handbrake + brake.
    const sim = mk(car, 'tarmac', { pos: { x: 120, y: 3, z: 60 }, yaw: Math.PI / 2 });
    run(sim, 2.5, (s) => { s.car.input.brake = 1; s.car.input.handbrake = 1; });
    const p0 = { ...sim.car.body.translation() };
    run(sim, 10, (s) => { s.car.input.brake = 1; s.car.input.handbrake = 1; });
    const p1 = sim.car.body.translation();
    check('drift on 10 % grade in 10 s (m)', Math.hypot(p1.x - p0.x, p1.z - p0.z), 0, 0.01, ' m');
  });

  test(`${car} handbrake turn`, () => {
    const sim = mk(car, 'gravel', { assist: false });
    run(sim, 1);
    sim.car.body.setLinvel({ x: 0, y: 0, z: 14 }, true);
    for (const w of sim.car.wheels) w.omega = 14 / sim.car.cfg.radius;
    let maxSlip = 0, yaw0 = 0, yaw1 = 0;
    run(sim, 3, (s, t) => {
      const c = s.car;
      c.input.steer = t < 1.6 ? 1 : 0; c.input.handbrake = t > 0.15 && t < 1.0 ? 1 : 0; c.input.throttle = 0.3;
      for (const w of c.wheels.slice(2)) if (w.contact) maxSlip = Math.max(maxSlip, Math.abs(w.alpha));
    });
    const q = sim.car.body.rotation();
    const yaw = 2 * Math.atan2(q.y, q.w);
    check('rear slip angle peak (deg)', maxSlip * 180 / Math.PI, 30, 90, '°');
    check('yaw change (deg)', Math.abs(yaw) * 180 / Math.PI, 90, 270, '°');
  });
}

// --- Round 2 ---

for (const car of ['awd', 'rwd']) {
  test(`${car} reverse (auto: hold brake)`, () => {
    const sim = mk(car, 'gravel', { assist: true });
    run(sim, 1);
    run(sim, 4, (s) => { s.car.input.brake = 1; });
    check('gear', sim.car.gear, -1, -1);
    check('speed after holding brake (m/s)', sim.car.speed, -20, -1.5, ' m/s');
  });

  test(`${car} reverse (manual: shift down, throttle)`, () => {
    const sim = mk(car, 'gravel');
    sim.car.autoShift = false;
    run(sim, 1);
    shift(sim.car.dt, -1);
    run(sim, 3, (s) => { s.car.input.throttle = 1; });
    check('speed on throttle in R (m/s)', sim.car.speed, -20, -1.5, ' m/s');
  });

  test(`${car} assisted steering gives full lock`, () => {
    const sim = mk(car, 'gravel', { assist: true });
    run(sim, 1);
    sim.car.body.setLinvel({ x: 0, y: 0, z: 20 }, true);
    for (const w of sim.car.wheels) w.omega = 20 / sim.car.cfg.radius;
    run(sim, 0.05, (s) => { s.car.input.steer = 1; });
    const lock = Math.max(...sim.car.wheels.slice(0, 2).map((w) => Math.abs(w.steer)));
    check('front wheel angle / maxLock', lock / sim.car.cfg.maxLock, 0.95, 1.5);
  });
}

test('rwd slide control on a power-oversteer exit', () => {
  // Full throttle, 0.8 steer for 1.2 s from 54 km/h, then straighten up with no countersteer.
  // Sim mode spins; Assisted trims power and catches it.
  const maxBodySlip = (assist, surf) => {
    const sim = mk('rwd', surf, { assist, pos: { x: 0, y: 0.6, z: -250 } });
    run(sim, 1);
    sim.car.body.setLinvel({ x: 0, y: 0, z: 15 }, true);
    for (const w of sim.car.wheels) w.omega = 15 / sim.car.cfg.radius;
    let worst = 0;
    run(sim, 3, (s, t) => {
      const c = s.car; c.input.steer = t < 1.2 ? 0.8 : 0; c.input.throttle = 1;
      const v = c.body.linvel(), q = c.body.rotation();
      if (Math.hypot(v.x, v.z) < 3) return;
      const d = 2 * Math.atan2(q.y, q.w) - Math.atan2(v.x, v.z);
      worst = Math.max(worst, Math.abs(Math.atan2(Math.sin(d), Math.cos(d))));
    });
    return worst * 180 / Math.PI;
  };
  for (const surf of ['hardpack', 'gravel']) {
    check(`sim body slip ${surf} (spins)`, maxBodySlip(false, surf), 90, 180, '°');
    check(`assisted body slip ${surf}`, maxBodySlip(true, surf), 10, 60, '°');
  }
});

const fails = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - fails}/${results.length} passed`);
process.exit(fails ? 1 : 0);
