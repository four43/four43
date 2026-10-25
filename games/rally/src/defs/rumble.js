// Controller rumble parameters (rally-spec R9-2): one object per channel, physical units, tuned in the ?rumble panel
// (src/rumbleTune.js) and exported back here. Pure data; the channels live in src/rumble/. An Xbox pad has two body motors,
// `strong` (left, low and heavy) and `weak` (right, high and buzzy), and on some pads (Bluetooth in Chromium) a motor in
// each trigger: `left` (brake) and `right` (throttle). Every level is 0..1 before the mix.
export const PARAMS = {
  // The engine (R9-1): weak motor only, a light constant presence that follows the revs.
  engine: {
    idle: 0.03,      // level at idle rpm
    redline: 0.12,   // level at the redline
    load: 0.4,       // share felt off the throttle (1: throttle makes no difference)
    limiterHz: 9,    // pulse rate on the rev limiter
    limiterAmp: 0.15, // pulse level on the rev limiter
  },
  // Suspension (R9-1): a synthetic road under each tyre through a spring-damper, plus the real jolts from the sim.
  suspension: {
    hz: 18,          // natural frequency of the tyre-and-wheel spring; bumps shorter than its period are soaked up (planing)
    zeta: 0.35,      // its damping ratio
    full: 0.03,      // m: a bump this high at its loudest speed gives level 1
    splitHz: 9,      // below this the motion goes to the strong motor, above it to the weak one
    release: 0.05,   // s: how fast a motor level falls back after a bump
    gain: 0.8,       // master gain over the road texture (not the jolts)
    joltOn: 1.3,     // m/s of wheel compression speed where a real hit starts (a respawn settle peaks ~1.1)
    joltFull: 4,     // m/s where it is full (a 1 m drop ~4.4)
    joltWeak: 0.6,   // the weak motor's share of a real hit (landings pound both motors)
    // Per rumble surface: bump height (m), mean distance between bumps (m), bump width along the road (m).
    // Ice is near smooth; gravel is many small sharp bumps; sand and mud are long and soft.
    surfaces: {
      tarmac: { rough: 0.002, spacing: 3, width: 0.5 },
      dirt: { rough: 0.008, spacing: 1.2, width: 0.8 },
      gravel: { rough: 0.012, spacing: 0.5, width: 0.6 },
      grass: { rough: 0.015, spacing: 1.5, width: 1.2 },
      sand: { rough: 0.02, spacing: 2.5, width: 2 },
      mud: { rough: 0.025, spacing: 2, width: 1.6 },
      snow: { rough: 0.006, spacing: 1, width: 1 },
      ice: { rough: 0.0005, spacing: 4, width: 0.4 },
    },
  },
  // Body impacts (R9-1): car contacts as a velocity change (impulse / mass), on both motors.
  body: {
    dvOn: 0.4,       // m/s where a hit starts (a marker clipped at speed is ~0.5–1)
    dvFull: 5,       // m/s where it is full (a wall head-on, a roll onto the roof)
    weakShare: 0.6,  // the weak motor's share
    decay: 0.12,     // s: half-life of a small hit; a full one lasts 1.5× as long
  },
  // The driving aid (R9-1): slip near and past the tyre's peak, in the triggers. x = slip / peak slip of the worst wheel:
  // a kick on crossing `near` (again only after falling under `rearm`), a level rising to the peak, and past `lock` pulses
  // at pulseHz (≤ 10: the motors blur above) until x is back under `unlock`.
  aid: {
    pedal: 0.05,     // pedal travel before the aid listens
    fold: 0.6,       // pads without trigger motors: the aid's share added onto the weak motor
    brake: { near: 0.75, rearm: 0.65, lock: 1.1, unlock: 1.0, kickAmp: 0.8, kickLen: 0.08, nearAmp: 0.35, pulseHz: 8, amp: 0.9 },
    traction: { near: 1.0, rearm: 0.85, lock: 1.3, unlock: 1.1, kickAmp: 0.6, kickLen: 0.06, nearAmp: 0.25, pulseHz: 10, amp: 0.6 },
  },
  mix: {
    drive: 1.5,      // soft clip: tanh(x · drive) / tanh(drive)
  },
  // Sending (R9-4). Every effect is a write to the pad, and a Bluetooth pad drains them slower than 60 a second: one per
  // frame queued up below the page, so it kept rumbling through a pause and after the window closed (playtest 2026-10-25).
  send: {
    minMs: 50,       // ms: at most one write this often (a level change waits for it)
    keepMs: 150,     // ms: a steady level is re-sent this often
    durMs: 250,      // ms: each effect's length: outlasts keepMs, and a lost stop ends by itself
    delta: 0.04,     // a motor must move by this much to count as a change
  },
};

// Slider ranges for the tuning panel: [min, max, step] per parameter name (surfaces share theirs).
export const RANGES = {
  idle: [0, 0.3, 0.005], redline: [0, 0.5, 0.005], load: [0, 1, 0.05], limiterHz: [2, 15, 0.5], limiterAmp: [0, 1, 0.05],
  hz: [3, 30, 0.5], zeta: [0.05, 1, 0.05], full: [0.005, 0.1, 0.005], splitHz: [2, 20, 0.5], release: [0.01, 0.3, 0.01],
  gain: [0, 2, 0.05], joltOn: [0.5, 4, 0.1], joltFull: [1, 10, 0.1], joltWeak: [0, 1, 0.05],
  rough: [0, 0.06, 0.0005], spacing: [0.1, 6, 0.05], width: [0.05, 3, 0.05],
  dvOn: [0, 3, 0.05], dvFull: [0.5, 15, 0.1], weakShare: [0, 1, 0.05], decay: [0.02, 0.5, 0.01],
  pedal: [0, 0.5, 0.01], fold: [0, 1, 0.05],
  near: [0.3, 1.5, 0.05], rearm: [0.2, 1.5, 0.05], lock: [0.8, 3, 0.05], unlock: [0.5, 3, 0.05],
  kickAmp: [0, 1, 0.05], kickLen: [0.02, 0.3, 0.01], nearAmp: [0, 1, 0.05], pulseHz: [3, 15, 0.5], amp: [0, 1, 0.05],
  drive: [0.5, 4, 0.1],
  minMs: [16, 200, 1], keepMs: [50, 500, 10], durMs: [100, 1000, 10], delta: [0, 0.2, 0.01],
};

// The Rumble setting's master gain.
export const STRENGTH = { off: 0, light: 0.5, full: 1 };

// A fresh copy of the defaults with saved overrides laid over them; unknown keys and non-numbers are dropped, so an old
// or hand-edited save can't break the mixer.
export function tuneParams(saved) {
  const fill = (def, over) => {
    const out = {};
    for (const k in def) {
      const v = over?.[k];
      out[k] = typeof def[k] === 'object' ? fill(def[k], v) : Number.isFinite(v) ? v : def[k];
    }
    return out;
  };
  return fill(PARAMS, saved);
}
