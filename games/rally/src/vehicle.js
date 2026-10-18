// Raycast rally car on a single Rapier rigid body. Each wheel casts its own ray,
// runs its own suspension and tire model, and integrates its own spin.
// Pure JS (no three.js) so it runs headless in Node.
import { tireStep } from './tire.js';
import { surfaceOfKey } from './surface.js';
import { makeDrivetrain, driveStep, shift, rpmOf, roadRpm } from './drivetrain.js';
import { SNOW } from './snow.js';

export const DT = 1 / 240;     // chassis step
export const SUB = 8;          // wheel/tire/drivetrain substeps per chassis step
const G = 9.81;
// Assisted slide control: rear slip angle, as a multiple of the surface's peak slip angle,
// where throttle trimming starts and where it reaches the floor.
export const SLIDE = { from: 1.2, to: 2.5, floor: 0.15 };
// Surface drag (tall grass etc.): drag·fz at walking pace, faded in over ~2 m/s, growing with
// (v / DRAG.v)² like pushing through more grass per second; caps a car flat out on grass ~85 km/h.
export const DRAG = { fade: 2, v: 18 };
// Self-aligning steering (caster): with a light hand on the wheel the fronts turn toward where the
// front axle is travelling, which is how a slide gets caught. Only the countersteer direction (the
// front axle's velocity pointing against the yaw) is followed, faded in from vFrom to vTo m/s and
// over rFull rad/s of yaw, and the driver's own input takes over as it grows: at full input the
// driver gets exactly the lock asked for.
export const ALIGN = { vFrom: 3, vTo: 8, rFull: 0.15 };

// --- small vector helpers on {x,y,z} ---
const v3 = (x = 0, y = 0, z = 0) => ({ x, y, z });
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a, b) => v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
const add = (a, b) => v3(a.x + b.x, a.y + b.y, a.z + b.z);
const sub = (a, b) => v3(a.x - b.x, a.y - b.y, a.z - b.z);
const mul = (a, s) => v3(a.x * s, a.y * s, a.z * s);
const norm = (a) => { const l = Math.hypot(a.x, a.y, a.z) || 1; return v3(a.x / l, a.y / l, a.z / l); };
export function qrot(q, v) { // rotate v by unit quaternion q
  const ix = q.w * v.x + q.y * v.z - q.z * v.y, iy = q.w * v.y + q.z * v.x - q.x * v.z;
  const iz = q.w * v.z + q.x * v.y - q.y * v.x, iw = -q.x * v.x - q.y * v.y - q.z * v.z;
  return v3(ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y,
            iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z,
            iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x);
}
const rotAbout = (v, axis, ang) => { // Rodrigues
  const c = Math.cos(ang), s = Math.sin(ang);
  return add(add(mul(v, c), mul(cross(axis, v), s)), mul(axis, dot(axis, v) * (1 - c)));
};
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const WHEEL_NAMES = ['FL', 'FR', 'RL', 'RR'];
// The baked car models' wheel nodes, in wheel order (front pair, then rear; left first: Rally's left is +x, as the nodes).
export const WHEEL_PARTS = ['wheel-front-left', 'wheel-front-right', 'wheel-back-left', 'wheel-back-right'];

export class Vehicle {
  // lh: the scene's World (the car is one of its entities; the wheel rays query its Rapier world).
  constructor(lh, cfg, opts = {}) {
    this.lh = lh; this.R = lh.R; this.cfg = cfg;
    this.surfaceAt = opts.surfaceAt || (() => surfaceOfKey('gravel'));
    this.snow = opts.snow || (() => null);   // current SnowField, if the pad is snow-covered
    this.assist = opts.assist ?? true;     // Assisted mode (ABS, TCS, slide control)
    this.autoShift = opts.autoShift ?? true;
    this.rayGroups = opts.rayGroups;
    const c = cfg;
    const a = (1 - c.frontWeight) * c.wheelbase;   // CoM to front axle
    const zF = a, zR = -(c.wheelbase - a);
    this.zMid = (zF + zR) / 2;
    const xs = G / (2 * Math.PI * c.fn) ** 2;       // static compression
    this.wheels = [];
    for (let i = 0; i < 4; i++) {
      const front = i < 2, left = i % 2 === 0;
      const mC = c.mass * (front ? c.frontWeight : 1 - c.frontWeight) / 2;
      const k = mC * (2 * Math.PI * c.fn) ** 2;
      const cc = 2 * Math.sqrt(k * mC);
      this.wheels.push({
        name: WHEEL_NAMES[i], front, left, mC, k,
        cBump: c.zetaBump * cc, cReb: c.zetaReb * cc,
        local: v3(left ? c.track / 2 : -c.track / 2,
                  -c.comHeight + c.radius + (c.travel - xs), front ? zF : zR),
        rc: front ? c.rcF : c.rcR,
        omega: 0, st: { dx: 0, dy: 0 }, x: 0, xPrev: 0, contact: false, wasContact: false,
        fz: 0, fs: 0, fx: 0, fy: 0, kappa: 0, alpha: 0, rho: 0, steer: 0, spin: 0,
        surf: surfaceOfKey('gravel'), center: v3(), point: v3(), normal: v3(0, 1, 0), drive: 0,
      });
    }
    this.staticComp = xs;
    this.dt = makeDrivetrain(c.drive, c.wheelInertia);
    this.input = { steer: 0, throttle: 0, brake: 0, handbrake: 0 };
    this.out = { throttle: 0, brake: 0 };
    this.reverseHold = 0;
    this.hold = false;            // held on the start line (game)
    this.absF = [1, 1, 1, 1]; this.tcsF = 1; this.slideF = 1;
    this.tq = [0, 0, 0, 0];
    this.createBody(opts.pos || v3(0, 1, 0), opts.yaw || 0);
  }

  createBody(pos, yaw) {
    const c = this.cfg, len = c.wheelbase / 2 + 0.85;
    // Rounded edges (0.2 m) so a nose that meets an upslope or a bump rides up it instead of digging in like a box corner
    // (which stopped the car at 20+ g); low friction so it skids. Mass and inertia are the playtested cars.js values.
    const round = 0.2;
    this.e = this.lh.spawn({
      // Drawn by view sync (the model, shaped by render.js carView), wheels from the part poses. They start at the static
      // compression (seeded curr and prev), so a render before the first step has the wheels on their hubs.
      tags: ['car'], at: [pos.x, pos.y, pos.z], yaw, model: c.model,
      partXf: Object.fromEntries(this.wheels.map((w, i) => [WHEEL_PARTS[i], { p: [w.local.x, w.local.y - Math.max(0, c.travel - this.staticComp), w.local.z], q: [0, 0, 0, 1] }])),
      body: { type: 'dynamic', ccd: true, canSleep: false, massProps: { mass: c.mass, com: [0, 0, 0], inertia: [c.inertia.x, c.inertia.y, c.inertia.z] } }, // lh-allow: massProps (D3): cars.js mass and inertia were tuned by playtest, not the colliders' volume
      colliders: [
        { shape: 'box', half: [0.86 - round, 0.24 - round, len - round], round, p: [0, -c.comHeight + 0.20 + 0.24, this.zMid], q: [0, 0, 0, 1], material: 'car-hull' },
        { shape: 'box', half: [0.72, 0.27, len * 0.5], p: [0, -c.comHeight + 0.68 + 0.27, this.zMid - 0.2], q: [0, 0, 0, 1], material: 'car-cabin' },
      ],
      groups: { member: ['car'] },
    });
    this.body = this.e.body;
    this.colliders = this.e.colliders.map((x) => x.collider);
  }

  // The wheels' part poses for view sync (3c partXf, 3g Task 13b): the hub in the body frame and Ry(steer) Rx(spin),
  // interpolated with the body by the engine. Written only; nothing in the sim reads them. The spawn seeds them (createBody).
  writeParts() {
    const c = this.cfg;
    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i], P = this.e.partXf[WHEEL_PARTS[i]];
      P.p.x = w.local.x; P.p.y = w.local.y - Math.max(0, c.travel - w.x); P.p.z = w.local.z;
      const sy = Math.sin(w.steer / 2), cy = Math.cos(w.steer / 2), sx = Math.sin(w.spin / 2), cx = Math.cos(w.spin / 2);
      P.q.x = cy * sx; P.q.y = sy * cx; P.q.z = -sy * sx; P.q.w = cy * cx;
    }
  }

  reset(pos, yaw) {
    this.lh.place(this.e, { at: [pos.x, pos.y, pos.z] }, { yaw }); // wakes it and zeroes its velocities (E-8)
    for (const w of this.wheels) { w.omega = 0; w.st.dx = w.st.dy = 0; w.wasContact = false; }
    this.dt.we = this.cfg.drive.idle * 2 * Math.PI / 60; this.dt.gear = 1; this.dt.shiftT = 0;
  }

  // Forward speed (m/s) along the chassis.
  get speed() { const v = this.body.linvel(); return dot(v, qrot(this.body.rotation(), v3(0, 0, 1))); }
  get rpm() { return rpmOf(this.dt); }
  get gear() { return this.dt.gear; }

  // Driver logic: auto-shift, reverse, aids. Runs once per chassis step.
  control() {
    const inp = this.input, d = this.dt, c = this.cfg.drive;
    const vF = this.speed;
    let thr = inp.throttle, brk = inp.brake;
    // Held on the start line (spec tracks T-20): brakes full and the clutch open, so the engine
    // revs freely but the car can't creep or pick reverse; it drops into 1st when let go.
    if (this.hold) {
      d.gear = 0; this.reverseHold = 0;
      this.out.throttle = thr; this.out.brake = 1;
      return;
    }
    if (d.gear === 0) d.gear = 1;
    if (this.autoShift) {
      if (d.gear > 0 && vF < 0.5 && brk > 0.5 && thr < 0.05) {
        this.reverseHold += DT;
        if (this.reverseHold > 0.35) { d.gear = -1; this.reverseHold = 0; }
      } else this.reverseHold = 0;
      if (d.gear === -1) {
        if (thr > 0.3 && vF > -0.5) d.gear = 1;
        else { const t = thr; thr = brk; brk = t; }
      }
      if (d.gear > 0 && d.shiftT <= 0) {
        // Downshifts go by road speed, not engine rpm: the engine sags while the clutch is open,
        // which used to cascade 3-2-1 in a quarter second and lock the driven wheels.
        const rpm = rpmOf(d), road = roadRpm(d, this.wheels);
        if (rpm > c.redline * 0.94 && d.gear < c.gears.length && thr > 0.1) shift(d, +1);
        else if (d.gear > 1 && road < c.redline * 0.48 && roadRpm(d, this.wheels, d.gear - 1) < c.redline * 0.80) shift(d, -1);
      }
    }
    if (this.assist) {
      // ABS (per wheel) and traction control (driven wheels): proportional limiters on
      // slip ratio, low-passed so they modulate rather than chatter.
      let spinX = 0;
      for (let i = 0; i < 4; i++) {
        const w = this.wheels[i];
        const lockX = w.contact ? -w.kappa / w.surf.kp : 0;
        const t = Math.abs(vF) > 2 ? clamp01(1 - (lockX - 1.0) * 2.0) : 1;
        this.absF[i] += (Math.max(0.1, t) - this.absF[i]) * 0.3;
        if (w.contact && w.drive > 0) spinX = Math.max(spinX, w.kappa / w.surf.kp);
      }
      const tcsT = Math.abs(vF) > 0.5 ? clamp01(1 - (spinX - 1.2) * 1.2) : 1;
      this.tcsF += (Math.max(0.1, tcsT) - this.tcsF) * 0.25;
      // Slide control: the steering is left alone, so the driver can throw the car in;
      // power is trimmed once the rear axle slides well past its peak slip angle.
      let rearX = 0;
      for (const w of this.wheels.slice(2)) if (w.contact) rearX = Math.max(rearX, Math.abs(w.alpha) / w.surf.ap);
      const slideT = Math.abs(vF) > 3 ? clamp01(1 - (rearX - SLIDE.from) / (SLIDE.to - SLIDE.from)) : 1;
      this.slideF += (Math.max(SLIDE.floor, slideT) - this.slideF) * 0.25;
      thr *= this.tcsF * this.slideF;
    } else { this.absF.fill(1); this.slideF = 1; }
    this.out.throttle = thr; this.out.brake = brk;
  }

  // Front-wheel angle (rad, + = left): the driver's lock plus the self-aligning countersteer.
  // vF, vL: front-axle velocity along the body's forward / left axes; yawRate: rad/s, + = left.
  steerDelta(vF, vL, yawRate) {
    const c = this.cfg, s = this.input.steer;
    let delta = s * c.maxLock;
    const free = Math.atan2(vL, Math.max(vF, 1e-3));   // wheel angle for zero front slip
    if (vF > ALIGN.vFrom && free * yawRate < 0) {
      const w = clamp01((vF - ALIGN.vFrom) / (ALIGN.vTo - ALIGN.vFrom)) * clamp01(Math.abs(yawRate) / ALIGN.rFull);
      delta += (1 - Math.abs(s)) * w * Math.max(-c.maxLock, Math.min(c.maxLock, free));
    }
    return Math.max(-c.maxLock, Math.min(c.maxLock, delta));
  }

  steerAngles(delta) {
    const c = this.cfg;
    if (Math.abs(delta) < 1e-4) return [0, 0];
    const Rr = c.wheelbase / Math.tan(Math.abs(delta));
    const inner = Math.atan(c.wheelbase / (Rr - c.track / 2)), outer = Math.atan(c.wheelbase / (Rr + c.track / 2));
    const k = c.ackermann, sg = Math.sign(delta);
    const dIn = sg * (Math.abs(delta) * (1 - k) + inner * k), dOut = sg * (Math.abs(delta) * (1 - k) + outer * k);
    return delta > 0 ? [dIn, dOut] : [dOut, dIn]; // left turn: left wheel is inner
  }

  step() {
    const R = this.R, c = this.cfg, b = this.body;
    this.control();
    const p = b.translation(), q = b.rotation(), v = b.linvel(), av = b.angvel();
    const U = qrot(q, v3(0, 1, 0)), F = qrot(q, v3(0, 0, 1));
    const down = mul(U, -1);
    const pv = (pt) => add(v, cross(av, sub(pt, p)));
    const vFront = pv(add(p, qrot(q, v3(0, 0, this.wheels[0].local.z))));
    const steer = this.steerAngles(this.steerDelta(dot(vFront, F), dot(vFront, qrot(q, v3(1, 0, 0))), dot(av, U)));

    // Pass 1: rays and compressions.
    const snow = this.snow();
    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i];
      w.steer = i < 2 ? steer[i] : 0;
      const o = add(p, qrot(q, w.local));
      const maxT = c.travel + c.radius;
      const slant = Math.max(0.3, -down.y);
      const ray = new R.Ray(o, down);
      // On snow the ray reaches past travel to find the hard ground under the snow.
      const hit = this.lh.rapier.castRayAndGetNormal(ray, maxT + (snow ? SNOW.depth / slant : 0), true, undefined, this.rayGroups, undefined, b); // lh-allow: raw Rapier raycast (L-1): Rally's own ray-cast wheels (overview §1.2)
      w.wasContact = w.contact;
      let t = hit ? hit.timeOfImpact ?? hit.toi : Infinity;
      w.onSnow = !!(hit && snow && hit.collider.handle === snow.groundHandle);
      if (w.onSnow) t -= snow.height(o.x + down.x * t, o.z + down.z * t) / slant;
      if (t <= maxT) {
        w.contact = true;
        w.x = c.travel - (t - c.radius);
        w.point = add(o, mul(down, t));
        w.center = add(o, mul(down, Math.max(0, t - c.radius)));
        if (w.onSnow) {
          const h = rotAbout(F, U, w.steer);
          w.normal = snow.normal(w.point.x, w.point.z, h.x, h.z);
          w.surf = snow.surface(w.point.x, w.point.z);
        } else {
          w.normal = v3(hit.normal.x, hit.normal.y, hit.normal.z);
          w.surf = this.surfaceAt(w.point.x, w.point.z, hit.collider);
        }
      } else {
        w.contact = false; w.x = 0;
        w.center = add(o, mul(down, c.travel));
        w.point = add(w.center, mul(down, c.radius));
      }
    }
    // Pass 2: suspension forces with anti-roll bars.
    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i];
      if (!w.contact) { w.fs = 0; w.fz = 0; w.xPrev = 0; continue; }
      let xd;
      if (w.wasContact) xd = (w.x - w.xPrev) / DT;
      else { const vm = pv(w.point); xd = -dot(vm, U) / Math.max(0.3, dot(w.normal, U)); }
      w.xPrev = w.x;
      const x = Math.min(w.x, c.travel);
      let fs = w.k * x + (xd > 0 ? w.cBump : w.cReb) * xd;
      const bs = c.travel - 0.04;               // progressive bump stop, last 4 cm
      if (w.x > bs) fs += 2.0e6 * (w.x - bs) ** 2;
      if (w.x > c.travel) fs += 30 * w.k * (w.x - c.travel); // bottomed out
      const mate = this.wheels[i ^ 1];
      const arb = w.front ? c.arbF : c.arbR;
      fs += arb * (w.x - (mate.contact ? mate.x : 0));
      w.fs = Math.max(0, fs);
      w.fz = w.fs * Math.max(0, dot(w.normal, U));
    }

    // Contact frames and frozen chassis velocities for the substeps.
    const frames = this.wheels.map((w) => {
      const wf = rotAbout(F, U, w.steer);
      const n = w.normal;
      const cf = norm(sub(wf, mul(n, dot(wf, n))));
      const cl = cross(n, cf);
      const vc = pv(w.point);
      return { cf, cl, vx: dot(vc, cf), vy: dot(vc, cl) };
    });

    // Substeps: drivetrain + tires + wheel spin.
    const hs = DT / SUB, r = c.radius, I = c.wheelInertia;
    const sumFx = [0, 0, 0, 0], sumFy = [0, 0, 0, 0];
    const brk = this.out.brake, hb = this.input.handbrake;
    for (let s = 0; s < SUB; s++) {
      driveStep(this.dt, this.wheels, this.out.throttle, true, hs, this.tq);
      for (let i = 0; i < 4; i++) {
        const w = this.wheels[i], fr = frames[i];
        w.drive = this.tq[i];
        let fx = 0, fy = 0;
        if (w.contact && w.fz > 0) {
          const cy = 0.3 * w.mC / DT;
          const cx = Math.min(cy, 0.4 * I / (r * r * hs));
          const res = tireStep(w.st, w.omega * r - fr.vx, fr.vy, fr.vx, w.fz, w.surf, hs, cx, cy, w.front ? 1 : c.rearAp);
          fx = res.fx; fy = res.fy; w.kappa = res.kappa; w.alpha = res.alpha; w.rho = res.rho;
        } else { w.st.dx *= 0.9; w.st.dy *= 0.9; w.kappa = 0; w.alpha = 0; w.rho = 0; }
        const troll = w.contact ? w.surf.crr * w.fz * r * Math.tanh(w.omega * 2) : 0;
        let Tb = brk * this.absF[i] * c.brakeTorque * (w.front ? c.brakeBias : 1 - c.brakeBias) / 2;
        if (!w.front) Tb += hb * c.handbrakeTorque;
        const wFree = w.omega + (w.drive - fx * r - troll) * hs / I;
        const dB = Tb * hs / I;
        w.omega = Math.abs(wFree) <= dB ? 0 : wFree - Math.sign(wFree) * dB;
        sumFx[i] += fx; sumFy[i] += fy;
      }
    }

    // Apply suspension + tire forces as impulses.
    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i], fr = frames[i];
      w.fx = sumFx[i] / SUB; w.fy = sumFy[i] / SUB;
      w.spin += w.omega * DT;
      if (!w.contact) continue;
      // On snow the spring pushes along the snow's normal, so rut walls steer the tire back in.
      b.applyImpulseAtPoint(mul(w.onSnow ? w.normal : U, w.fs * DT), w.point, true);
      const tf = add(mul(fr.cf, w.fx), mul(fr.cl, w.fy));
      b.applyImpulseAtPoint(mul(tf, DT), add(w.point, mul(U, w.rc)), true);
    }
    if (snow) this.snowContact(snow, frames, pv);
    this.surfaceDrag(pv);
    // Aerodynamic drag at the CoM.
    const sp = Math.hypot(v.x, v.y, v.z);
    if (sp > 0.1) b.applyImpulse(mul(v, -0.5 * 1.2 * c.cda * sp * DT), true);
    this.writeParts();
  }

  // Tall grass, deep snow, sand and mud hold the car back: each wheel pays
  // drag · fz · tanh(v / 2) · (1 + (v / 18)²) against its contact point's ground-plane velocity v
  // (the tanh fade-in means no jitter or creep at rest).
  surfaceDrag(pv) {
    const b = this.body;
    for (const w of this.wheels) {
      const k = w.surf.drag;
      if (!k || !w.contact || w.fz <= 0) continue;
      const vc = pv(w.point), sp = Math.hypot(vc.x, vc.z);
      if (sp < 1e-3) continue;
      const f = k * w.fz * Math.tanh(sp / DRAG.fade) * (1 + (sp / DRAG.v) ** 2) * DT / sp;
      b.applyImpulseAtPoint(v3(-vc.x * f, 0, -vc.z * f), w.point, true);
    }
  }

  // Each tire on snow presses its footprint down (and polishes packed snow with its slip),
  // and pays a plow force for pushing into snow higher than its own track.
  snowContact(snow, frames, pv) {
    const S = SNOW, b = this.body, r = this.cfg.radius;
    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i], fr = frames[i];
      if (!w.contact || !w.onSnow) continue;
      const p = w.point, vc = pv(p), sp = Math.hypot(vc.x, vc.z);
      // Plow first, against the snow ahead as it stands before this step's footprint lands on it.
      if (sp > 0.02) {
        const ux = vc.x / sp, uz = vc.z / sp, reach = S.tireWidth / 2 + 2 * S.cell; // past the rut wall
        const cut = Math.max(0, snow.height(p.x + ux * reach, p.z + uz * reach) - snow.height(p.x, p.z));
        const f = S.tireWidth * cut * (S.plowPressure * Math.tanh(sp / S.plowFade) + S.plowDensity * sp * sp) * DT;
        if (f > 0) b.applyImpulseAtPoint(v3(-ux * f, 0, -uz * f), p, true);
      }
      snow.press(p.x, p.z, fr.cf.x, fr.cf.z, w.fz, Math.hypot(w.omega * r - fr.vx, fr.vy), DT, Math.max(0, fr.vx) * DT * 1.5);
    }
  }

  // Debug/telemetry snapshot.
  telemetry() {
    return {
      speed: this.speed, rpm: this.rpm, gear: this.gear,
      wheels: this.wheels.map((w) => ({ name: w.name, contact: w.contact, fz: w.fz, kappa: w.kappa,
        alpha: w.alpha, omega: w.omega, x: w.x, surf: w.surf.name })),
    };
  }
}
