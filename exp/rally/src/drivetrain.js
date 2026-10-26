// Drivetrain: lion-hawk's powertrain (engine, clutch and gearbox: kit-vehicle H-6) feeding Rally's plate/viscous diffs.
// The powertrain steps once per chassis step and holds its drive torque for the step; the diffs split it per wheel
// substep. Pure JS (sim-pure: the kit's sim half).
import { createPowertrain, ENGINE_PRESETS } from 'lion-hawk/kits/vehicle';

const RPM = 60 / (2 * Math.PI);

// cfg.engine: { preset, ...overrides }: a kit preset's firing layout (the sound) with this car's numbers on top.
export function engineOf(cfg) {
  const { preset, ...own } = cfg.engine;
  return { ...ENGINE_PRESETS[preset], ...own };
}

// wheelInertia: one wheel's spin inertia; the powertrain wants the driven wheels' together.
export function makeDrivetrain(cfg, wheelInertia = 1.2) {
  const pt = createPowertrain({
    engine: engineOf(cfg), turbo: cfg.turbo ?? null, gears: cfg.gears, reverse: cfg.reverse, final: cfg.final,
    shiftTime: cfg.shiftTime, wheelInertia: (cfg.layout === 'awd' ? 4 : 2) * wheelInertia,
    // a sequential box: the shift blips the engine to the new gear's road rpm, so a downshift re-engages without dragging
    // the driven wheels (R5-1); the auto-clutch bites at 2.5 x idle, so an idling car in gear doesn't creep and a launch
    // revs into the torque instead of bogging
    blip: true, bite: 2.5,
  });
  return engage(pt, 1);
}

// Put the box straight into a gear with the clutch closed and the engine running at rpm (default idle): a reset, or a
// test's matched gear. Not a shift: no throttle cut.
export function engage(pt, gear, rpm = pt.spec.idle) {
  const s = pt.state;
  s.gear = gear; s.shiftT = 0; s.rpm = rpm; s.running = true; s.stalled = false; s.starter = false;
  return pt;
}

// Driven-wheel speed (rad/s, signed) and the engine rpm it implies in a given gear: the rpm the
// clutch will lock at, which is what shift decisions work from.
export function drivenOmega(c, w) {
  return c.layout === 'awd' ? (w[0].omega + w[1].omega + w[2].omega + w[3].omega) / 4 : (w[2].omega + w[3].omega) / 2;
}
export function roadRpm(pt, c, w, gear = pt.state.gear) {
  return Math.abs(drivenOmega(c, w) * gearRatio(c, gear)) * RPM;
}

export function gearRatio(c, gear) {
  if (gear === 0) return 0;
  // Reverse is a negative ratio: the wheels turn against the engine.
  const g = gear < 0 ? -c.reverse : c.gears[gear - 1];
  return g * c.final;
}

// Request a shift (+1 / -1), skipping neutral. Returns true if the shift starts.
export function shift(pt, dir) {
  let g = pt.state.gear + dir;
  if (g === 0) g = dir > 0 ? 1 : -1;
  if (g < -1 || g > pt.gears) return false;
  pt.shift(g);
  return true;
}

// The road's torque back on the driven wheels last step (N·m, + against drive), which lets the powertrain's clutch close.
export function roadTorque(c, w, r) {
  return (c.layout === 'awd' ? w[0].fx + w[1].fx + w[2].fx + w[3].fx : w[2].fx + w[3].fx) * r;
}

// Split the powertrain's drive torque (the driven wheels' together) through the diffs, from this substep's wheel spin.
// Writes out[FL, FR, RL, RR] (N·m, forward positive).
export function splitDrive(c, Tshaft, w, out) {
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
