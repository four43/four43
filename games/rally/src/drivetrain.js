// Drivetrain: engine inertia, slipping clutch, gearbox, and plate/viscous diffs.
// Runs inside the wheel substep loop. Pure JS.

const RPM = 60 / (2 * Math.PI);

export function torqueCurve(cfg, rpm) {
  // Piecewise-linear full-throttle torque curve from cfg.curve [[rpm, Nm], ...].
  const c = cfg.curve;
  if (rpm <= c[0][0]) return c[0][1];
  for (let i = 1; i < c.length; i++) {
    if (rpm <= c[i][0]) {
      const t = (rpm - c[i - 1][0]) / (c[i][0] - c[i - 1][0]);
      return c[i - 1][1] + t * (c[i][1] - c[i - 1][1]);
    }
  }
  return c[c.length - 1][1];
}

export function makeDrivetrain(cfg, wheelInertia = 1.2) {
  return {
    cfg, wheelInertia,
    we: cfg.idle / RPM,  // engine speed rad/s
    gear: 1,             // -1 reverse, 0 neutral, 1..n
    shiftT: 0,           // remaining shift cut time
    clutchT: 0,          // last clutch torque (engine side)
    engT: 0,
    limiter: false,
  };
}

export function rpmOf(dt) { return dt.we * RPM; }

export function gearRatio(dt) {
  const c = dt.cfg;
  if (dt.gear === 0) return 0;
  // Reverse is a negative ratio: the wheels turn against the engine.
  const g = dt.gear < 0 ? -c.reverse : c.gears[dt.gear - 1];
  return g * c.final;
}

// Request a shift (+1 / -1). Returns true if the shift starts.
export function shift(dt, dir) {
  const n = dt.cfg.gears.length;
  let g = dt.gear + dir;
  if (g === 0) g = dir > 0 ? 1 : -1;
  if (g < -1 || g > n) return false;
  dt.gear = g;
  dt.shiftT = dt.cfg.shiftTime;
  return true;
}

// One drivetrain substep. w: array of 4 wheel objects (FL, FR, RL, RR) with .omega.
// Returns the drive torque on each wheel [FL, FR, RL, RR] (N·m, forward positive).
export function driveStep(dt, w, throttle, autoClutch, h, out) {
  const c = dt.cfg;
  const G = gearRatio(dt);
  if (dt.shiftT > 0) dt.shiftT -= h;
  const shifting = dt.shiftT > 0;

  // Input shaft speed seen by the clutch, from the driven wheels.
  let wIn = 0;
  if (c.layout === 'awd') wIn = (w[0].omega + w[1].omega + w[2].omega + w[3].omega) / 4;
  else wIn = (w[2].omega + w[3].omega) / 2;
  wIn *= G;

  // Engine torque: throttle blend between full curve and engine braking, rev limiter.
  const rpm = dt.we * RPM;
  let thr = shifting ? 0 : throttle;
  // Idle governor holds idle rpm.
  if (rpm < c.idle) thr = Math.max(thr, Math.min(1, (c.idle - rpm) / 200));
  dt.limiter = rpm > c.redline;
  if (dt.limiter) thr = 0;
  const full = torqueCurve(c, rpm);
  const brake = c.engineBrake * (0.3 + rpm / c.redline);
  const Te = thr * full - (1 - thr) * brake;
  dt.engT = Te;

  // Clutch engagement: auto-clutch slips below the bite rpm and during shifts.
  let engage = 1;
  if (G === 0 || shifting) engage = 0;
  else if (autoClutch) {
    const r = Math.abs(wIn) * RPM; // what engine rpm would be if locked
    const bite = Math.min(1, Math.max(0, (rpm - c.idle * 1.05) / 900));
    engage = r > c.idle * 1.3 ? 1 : bite;
  }
  // Slipping clutch: viscous-like torque capped by capacity.
  // Implicit (backward-Euler) clutch: solves for the torque that the slip speed
  // will see at the end of the substep, so it is stable at any stiffness even with
  // only two driven wheels behind a short first gear.
  const cap = c.clutchCap * engage;
  const nI = (c.layout === 'awd' ? 4 : 2) * dt.wheelInertia;
  const slip = dt.we - wIn;
  let Tc = engage > 0
    ? c.clutchVisc * (slip + h * Te / c.engineInertia) / (1 + c.clutchVisc * h * (1 / c.engineInertia + G * G / nI))
    : 0;
  if (Tc > cap) Tc = cap; else if (Tc < -cap) Tc = -cap;
  dt.clutchT = Tc;

  dt.we += (Te - Tc) / c.engineInertia * h;
  if (dt.we < 50 / RPM) dt.we = 50 / RPM; // never stall in v1

  const Tshaft = Tc * G; // torque at the diff input
  out[0] = out[1] = out[2] = out[3] = 0;
  if (c.layout === 'awd') {
    // Centre viscous diff, 50:50 base split.
    const wf = (w[0].omega + w[1].omega) / 2, wr = (w[2].omega + w[3].omega) / 2;
    const tv = clamp(c.centreVisc * (wf - wr), -c.centreCap, c.centreCap);
    const Tf = Tshaft * c.frontSplit - tv, Tr = Tshaft * (1 - c.frontSplit) + tv;
    lsd(Tf, w[0], w[1], c.frontLsd, out, 0);
    lsd(Tr, w[2], w[3], c.rearLsd, out, 2);
  } else {
    lsd(Tshaft, w[2], w[3], c.rearLsd, out, 2);
  }
  return out;
}

// Plate LSD: open split plus a locking torque that moves torque from the faster
// wheel to the slower one, capped by preload + ramp * |input|.
function lsd(Tin, wl, wr, p, out, i) {
  const capS = p.preload + (Tin >= 0 ? p.rampPower : p.rampCoast) * Math.abs(Tin);
  const tl = clamp(p.visc * (wl.omega - wr.omega), -capS, capS);
  out[i] = Tin / 2 - tl;
  out[i + 1] = Tin / 2 + tl;
}

function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
