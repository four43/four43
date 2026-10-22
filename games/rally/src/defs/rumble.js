// Controller rumble patterns (rally-spec R7): the candidates for each scenario and the picks the game plays. Pure data; the
// mixer (src/rumble.js) plays them and the ?rumble lab (src/rumbleLab.js) is where they're chosen. An Xbox pad has two
// motors: `strong` (left, low and heavy) and `weak` (right, high and buzzy); there's no trigger rumble on Linux.
//
// A pattern is any of these layers, each scaled by the scenario's level x (0..1: speed for a surface, depth for an event):
//   hum:   [strong, weak]                    a steady level on each motor, × x
//   wave:  { motor, hz, amp, duty?, speedHz? } a rectified sine (or a square with `duty`), amp × x; speedHz: hz × (0.5 + x)
//   grain: { motor, rate, amp, len }         random taps, rate × x per second, each amp × (0.5..1) for len seconds
//   hit:   { motor, amp, len, count?, gap?, delay?, scale?, lenK? } a one-shot when the event starts; not scaled by x
//          unless `scale` (amp × (floor + (1 − floor)·x), floor 0.4 by default; len × (1 + lenK·x)). A list of hits plays them together (delay: s after the start).
// motor is 'strong', 'weak' or 'both'. Every sample is re-sent each frame (~60 Hz), so keep hz ≤ 15 and len ≥ 0.03.

export const SCENARIOS = {
  tarmac: { label: 'Tarmac', kind: 'surface', options: {
    A: { desc: 'Smooth hum', hum: [0, 0.06] },
    B: { desc: 'Silent' },
    C: { desc: 'Road seams', hum: [0, 0.04], grain: { motor: 'weak', rate: 3, amp: 0.25, len: 0.04 } },
  } },
  dirt: { label: 'Dirt', kind: 'surface', options: {
    A: { desc: 'Light patter', hum: [0.05, 0], grain: { motor: 'weak', rate: 18, amp: 0.3, len: 0.03 } },
    B: { desc: 'Washboard', wave: { motor: 'strong', hz: 7, amp: 0.25, speedHz: true } },
    C: { desc: 'Soft hum', hum: [0.08, 0.1] },
  } },
  gravel: { label: 'Gravel', kind: 'surface', options: {
    A: { desc: 'Crackle', hum: [0.08, 0], grain: { motor: 'weak', rate: 40, amp: 0.55, len: 0.03 } },
    B: { desc: 'Crunch', grain: { motor: 'both', rate: 25, amp: 0.45, len: 0.04 } },
    C: { desc: 'Heavy rattle', hum: [0, 0.15], grain: { motor: 'strong', rate: 30, amp: 0.5, len: 0.03 } },
  } },
  grass: { label: 'Grass', kind: 'surface', options: {
    A: { desc: 'Soft wallow', hum: [0, 0.05], wave: { motor: 'strong', hz: 2.5, amp: 0.25 } },
    B: { desc: 'Brush', hum: [0.1, 0], grain: { motor: 'weak', rate: 12, amp: 0.2, len: 0.06 } },
    C: { desc: 'Quiet thrum', hum: [0.06, 0] },
  } },
  sand: { label: 'Sand', kind: 'surface', options: {
    A: { desc: 'Heavy drag', hum: [0.3, 0], grain: { motor: 'weak', rate: 10, amp: 0.2, len: 0.05 } },
    B: { desc: 'Sinking wallow', wave: { motor: 'strong', hz: 1.5, amp: 0.4 } },
    C: { desc: 'Hiss', hum: [0, 0.25], grain: { motor: 'weak', rate: 30, amp: 0.15, len: 0.03 } },
  } },
  mud: { label: 'Mud', kind: 'surface', options: {
    A: { desc: 'Squelch', wave: { motor: 'strong', hz: 3, amp: 0.35 }, grain: { motor: 'strong', rate: 6, amp: 0.3, len: 0.08 } },
    B: { desc: 'Thick drag', hum: [0.35, 0] },
    C: { desc: 'Slop', grain: { motor: 'both', rate: 8, amp: 0.35, len: 0.1 } },
  } },
  snow: { label: 'Snow', kind: 'surface', options: {
    A: { desc: 'Muffled hum', hum: [0.12, 0.04] },
    B: { desc: 'Crunchy', hum: [0.08, 0], grain: { motor: 'weak', rate: 15, amp: 0.25, len: 0.05 } },
    C: { desc: 'Pillow', wave: { motor: 'strong', hz: 1.2, amp: 0.2 } },
  } },
  ice: { label: 'Ice', kind: 'surface', options: {
    A: { desc: 'Silent (the cue is the missing texture)' },
    B: { desc: 'Glassy whisper', hum: [0, 0.03] },
    C: { desc: 'Hairline taps', grain: { motor: 'weak', rate: 4, amp: 0.1, len: 0.03 } },
  } },
  slide: { label: 'Slide onset', kind: 'event', options: {
    A: { desc: 'Thump, then a buzz', hit: { motor: 'strong', amp: 0.8, len: 0.12 }, hum: [0.1, 0], wave: { motor: 'weak', hz: 12, amp: 0.35 } },
    B: { desc: 'Double tap, then a hum', hit: { motor: 'both', amp: 0.6, len: 0.06, count: 2, gap: 0.07 }, hum: [0, 0.3] },
    C: { desc: 'Swell, no tap', hum: [0.45, 0], wave: { motor: 'weak', hz: 10, amp: 0.2 } },
  } },
  spin: { label: 'Wheelspin', kind: 'event', options: {
    A: { desc: 'Fast stutter', wave: { motor: 'weak', hz: 12, amp: 0.6, duty: 0.5 } },
    B: { desc: 'Grind', hum: [0, 0.5], grain: { motor: 'strong', rate: 10, amp: 0.3, len: 0.04 } },
    C: { desc: 'Steady buzz', hum: [0, 0.45] },
  } },
  // The warning before a lock (playtest 2026-10-19, after Forza's and F1's trigger rumble): the foot brake taking the
  // tyres towards their peak slip. Felt here = you're at maximum braking; past it the lock-up takes over.
  brake: { label: 'Brake limit (before a lock)', kind: 'event', options: {
    A: { desc: 'Light ticks that quicken', wave: { motor: 'weak', hz: 8, amp: 0.45, duty: 0.35, speedHz: true } },
    B: { desc: 'Rising buzz', hum: [0.05, 0.35] },
    C: { desc: 'Soft heavy pulses that quicken', wave: { motor: 'strong', hz: 6, amp: 0.35, duty: 0.4, speedHz: true } },
  } },
  // Real ABS pulses at ~5–20 Hz; an Xbox pad's motors blur much above 10, so these stay at 7–10.
  lock: { label: 'Brake lock-up', kind: 'event', options: {
    A: { desc: 'ABS pulses, 10 Hz', wave: { motor: 'strong', hz: 10, amp: 0.8, duty: 0.5 } },
    B: { desc: 'ABS pulses, 7 Hz, both motors', wave: { motor: 'both', hz: 7, amp: 0.65, duty: 0.45 } },
    C: { desc: 'Chatter', grain: { motor: 'strong', rate: 14, amp: 0.6, len: 0.04 } },
  } },
  // Suspension impacts (R7-6): landings, potholes, lumpy grass. The level is how hard the suspension was hit; small chatter
  // stays with the surfaces.
  impact: { label: 'Suspension impact', kind: 'event', options: {
    A: { desc: 'Heavy thud, longer when bigger', hit: { motor: 'strong', amp: 1, len: 0.08, scale: true, lenK: 1.5 } },
    B: { desc: 'Thud, then a short rattle', hit: [{ motor: 'strong', amp: 0.9, len: 0.07, scale: true, lenK: 1 },
      { motor: 'weak', amp: 0.5, len: 0.03, count: 3, gap: 0.03, delay: 0.06, scale: true }] },
    C: { desc: 'Slam, both motors', hit: { motor: 'both', amp: 1, len: 0.1, scale: true, lenK: 1.2 } },
  } },
  // Jump landings (playtest 2026-10-19: landings must pound, "basically max out the controller"): a touchdown after
  // time in the air. Both motors flat out, longer and harder the longer the flight; never small (floor 0.75).
  landing: { label: 'Jump landing', kind: 'event', options: {
    A: { desc: 'Full pound, both motors, then a heavy tail', hit: [{ motor: 'both', amp: 1, len: 0.3, scale: true, floor: 0.75, lenK: 0.6 },
      { motor: 'strong', amp: 0.7, len: 0.25, delay: 0.3, scale: true, floor: 0.75, lenK: 0.6 }] },
    B: { desc: 'Full pound, then a rattle', hit: [{ motor: 'both', amp: 1, len: 0.28, scale: true, floor: 0.75, lenK: 0.6 },
      { motor: 'weak', amp: 0.7, len: 0.04, count: 4, gap: 0.04, delay: 0.32, scale: true, floor: 0.75 }] },
    C: { desc: 'Double pound (compress, rebound)', hit: [{ motor: 'both', amp: 1, len: 0.2, scale: true, floor: 0.75, lenK: 0.4 },
      { motor: 'both', amp: 0.8, len: 0.14, delay: 0.32, scale: true, floor: 0.75, lenK: 0.4 }] },
  } },
};

// What the game plays: an option and a gain per scenario, picked in the ?rumble lab on an Xbox pad (2026-10-19, second round). Export
// from the lab to change these.
// `road` is a master gain over every surface (playtest 2026-10-19: road noise was annoying and drowned the brake pulses).
export const PICKS = {
  road: { gain: 0.4 },
  tarmac: { option: 'A', gain: 0.4 },
  dirt: { option: 'A', gain: 1.15 },
  gravel: { option: 'C', gain: 0.5 },
  grass: { option: 'A', gain: 0.3 },
  sand: { option: 'A', gain: 1 },
  mud: { option: 'C', gain: 0.55 },
  snow: { option: 'B', gain: 0.65 },
  ice: { option: 'C', gain: 1 },
  slide: { option: 'A', gain: 0.35 },
  spin: { option: 'C', gain: 0.1 },
  brake: { option: 'B', gain: 1 },
  lock: { option: 'B', gain: 1 },
  impact: { option: 'C', gain: 1.5 },
  landing: { option: 'A', gain: 1 },
};

// The Rumble setting's master gain.
export const STRENGTH = { off: 0, light: 0.5, full: 1 };
