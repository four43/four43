// Controller rumble mixer (rally-spec R7): the car's wheels → two motor levels, once per rendered frame. Pure: no DOM, no
// gamepad; the stage view sends the result (src/rumbleOut.js) and the ?rumble lab feeds it made-up wheels. Three layers,
// summed per motor and clamped: the surface under the wheels (by speed), a slide (rear slip angle past the tyre's peak),
// and traction loss (driven wheels spinning, or any wheel locked under braking).
import { SCENARIOS, PICKS } from './defs/rumble.js';

// Tyre material → rumble surface. Blends (a track's surface hand-over, snow wearing to ice) carry `ids` and `w`.
export const SURFACE_OF = {
  'rally-tarmac': 'tarmac', 'rally-hardpack': 'dirt', 'rally-gravel': 'gravel', 'rally-grass': 'grass', 'rally-sand': 'sand',
  'rally-mud': 'mud', 'rally-packed': 'snow', 'rally-snowbank': 'snow', 'rally-ice': 'ice',
};

// Detection, as multiples of the surface's peak slip (ap for the slip angle, kp for the slip ratio). An event starts at
// `on`, ends below `off` (hysteresis, so a held drift doesn't re-fire the hit) and is at full depth by `full`.
export const DETECT = {
  vFull: 25,                 // m/s (90 km/h) at which the speed ramp is full (before planing)
  vMin: 1,                   // m/s below which the surface is still
  // Speed shaping for surfaces, from s = (v − vMin) / (vFull − vMin) in 0..1: hum and wave levels follow s^level, grain
  // taps come s^sparse as often (so slow is occasional, not bumpy), and below s = dull the taps lengthen up to
  // 1 + dullLen times and move onto the strong motor: a dull thud when slow, the picked texture at speed.
  level: 1.6, sparse: 2, dull: 0.5, dullLen: 2,
  // Planing (playtest 2026-10-19: "the faster you go you almost plane out over the little bumps"): from `from` m/s
  // (50 km/h) the surface fades, its level and its tap rate, linearly to `floor` by `to` (120 km/h); with the ramp rising to
  // vFull, the texture peaks around 70 km/h. The slow end is untouched. Impacts and landings don't fade.
  plane: { from: 14, to: 33, floor: 0.35 },
  slide: { on: 1.15, off: 0.85, full: 2.5, v: 4 },   // rear axle; not below v m/s (slip angles are huge when crawling)
  spin: { on: 1.3, off: 1.0, full: 3, pedal: 0.05 },  // driven wheels with drive torque on, throttle above pedal
  // Braking (foot brake above pedal, above v m/s): `brake` warns as the most-slipping wheel nears its peak slip (−κ/kp
  // 0.75 → 1), `lock` takes over just past it and ends the frame the wheel rolls back under the peak. With the
  // handbrake on, only the fronts count: a handbrake turn locks the rears on purpose.
  brake: { on: 0.75, off: 0.7, full: 1, pedal: 0.05, v: 1 },
  lock: { on: 1.1, off: 1.0, full: 2.5, pedal: 0.05, v: 1 },
  // Suspension impacts (rally-spec R7-6), from the wheels' jolt (compression speed, m/s; vehicle.js JOLT): a hit from `on`,
  // full by `full`, at most one per `cool` s, and only on a rising jolt (by `rise` m/s since the last frame): the jolt is
  // a decaying peak, and a big landing stays over `on` for longer than the cooldown. A car settling after a respawn
  // peaks ~1.1; a ~1 m drop ~4.4.
  impact: { on: 1.3, full: 5, cool: 0.15, rise: 0.2 },
  // Jump landings: the first touchdown after at least `air` s with every wheel off the ground replaces that impact with
  // a landing, sized by the flight (`air` → `airFull` s) or the jolt (on → `full` m/s), whichever is bigger. Lumpy grass
  // has no flight, so it stays an impact.
  landing: { air: 0.2, airFull: 0.7, full: 3.5 },
};

const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);

// One pattern's player state; seeded so tests (and the lab) are repeatable.
function voice(seed) { return { t: 0, grain: 0, grainOn: 0, grainAmp: 0, hit: -1, s: seed >>> 0 || 1 }; }
const rand = v => ((v.s = (Math.imul(v.s, 1664525) + 1013904223) >>> 0) / 2 ** 32);

function add(out, motor, a) {
  if (motor !== 'weak') out.strong += a;
  if (motor !== 'strong') out.weak += a;
}

// Advance a voice by dt and add pattern p at level x × gain into out. Grains tap rate × x per second at full character;
// a surface passes its speed shaping instead (rate: the tap-rate scale, dull: 0..1 how thud-like).
function play(p, v, x, dt, gain, out, rate = x, dull = 0) {
  v.t += dt;
  if (p.hum) { out.strong += p.hum[0] * x * gain; out.weak += p.hum[1] * x * gain; }
  if (p.wave) {
    const w = p.wave, hz = w.speedHz ? w.hz * (0.5 + x) : w.hz, ph = (v.t * hz) % 1;
    add(out, w.motor, w.amp * x * gain * (w.duty != null ? (ph < w.duty ? 1 : 0) : 0.5 + 0.5 * Math.sin(2 * Math.PI * ph)));
  }
  if (p.grain) {
    const g = p.grain;
    v.grainOn -= dt;
    v.grain -= dt * g.rate * rate;
    if (v.grain <= 0) { v.grain += -Math.log(1 - rand(v) * 0.999); v.grainOn = g.len * (1 + DETECT.dullLen * dull); v.grainAmp = g.amp * (0.5 + 0.5 * rand(v)); }
    if (v.grainOn > 0 && rate > 0) {
      const a = v.grainAmp * gain * (0.5 + 0.5 * x);
      if (dull > 0) { add(out, 'strong', a * dull); add(out, g.motor, a * (1 - dull)); } else add(out, g.motor, a);
    }
  }
  if (p.hit && v.hit >= 0) {
    let end = 0;
    for (const h of Array.isArray(p.hit) ? p.hit : [p.hit]) {
      const len = h.scale ? h.len * (1 + (h.lenK ?? 0) * x) : h.len, n = h.count ?? 1, period = len + (h.gap ?? 0);
      const t = v.hit - (h.delay ?? 0), k = Math.floor(t / period);
      const fl = h.floor ?? 0.4;
      if (t >= 0 && k < n && t - k * period < len) add(out, h.motor, h.amp * gain * (h.scale ? fl + (1 - fl) * x : 1));
      end = Math.max(end, (h.delay ?? 0) + n * period);
    }
    v.hit += dt;
    if (v.hit >= end) v.hit = -1;
  } else v.hit = -1; // the picks changed mid-hit to a pattern without one
}

// An event latch: on above `on`, off below `off`; returns the depth (0..1) while on, -1 while off.
function latch(st, r, d, allowed) {
  if (!allowed) r = 0;
  st.started = false;
  if (!st.on && r >= d.on) { st.on = true; st.started = true; }
  else if (st.on && r < d.off) st.on = false;
  return st.on ? clamp01((r - d.on) / (d.full - d.on)) : -1;
}

// createRumble(picks): update(car, dt, gain) → { strong, weak } in 0..1. car is a Vehicle, or anything with its shape:
// { speed, out: { throttle }, input: { brake, handbrake }, wheels: [{ contact, front, surf: { id | ids+w, kp, ap }, kappa, alpha, drive }] }.
export function createRumble(picks = PICKS) {
  const voices = {}, ev = { slide: {}, spin: {}, brake: {}, lock: {}, impact: { cool: 0, sev: 0, prev: 0, air: 0 }, landing: { sev: 0 } }, out = { strong: 0, weak: 0 }, weights = {};
  let seed = 1;
  const voiceOf = k => (voices[k] ??= voice(seed++ * 2654435761));
  const pattern = k => { const p = picks[k] ?? PICKS[k]; return [SCENARIOS[k].options[p.option] ?? SCENARIOS[k].options.A, p.gain ?? 1]; };

  function event(k, depth, dt, gain) {
    const v = voiceOf(k), [p, g] = pattern(k);
    if (ev[k].started && p.hit) v.hit = 0;
    if (depth < 0 && v.hit < 0) return; // off, and the onset hit (if any) has finished
    play(p, v, depth < 0 ? 0 : 0.3 + 0.7 * depth, dt, g * gain, out); // a sustain is felt from the start, and grows
  }

  // A suspension impact: a hit sized by the jolt; it grows if the jolt is still rising in its first frames (the view
  // reads a landing mid-rise), and the cooldown keeps one landing from firing several.
  // A landing (touchdown after a flight) is the same, sized by the flight too, and replaces that touchdown's impact.
  function impact(jolt, airborne, dt, gain) {
    const st = ev.impact, D = DETECT.impact, L = DETECT.landing, lst = ev.landing;
    const vi = voiceOf('impact'), vl = voiceOf('landing');
    const flight = st.air;
    st.air = airborne ? st.air + dt : 0;
    const rising = jolt > st.prev + D.rise; st.prev = jolt;
    st.cool -= dt;
    const landSev = () => Math.max(clamp01((flight - L.air) / (L.airFull - L.air)), clamp01((jolt - D.on) / (L.full - D.on)));
    if (!airborne && flight >= L.air) { st.cool = D.cool; lst.flight = flight; lst.sev = landSev(); vl.hit = 0; vi.hit = -1; } // touchdown
    else if (vl.hit >= 0) lst.sev = Math.max(lst.sev, clamp01((jolt - D.on) / (L.full - D.on))); // still compressing
    else if (jolt >= D.on && rising && st.cool <= 0) { st.cool = D.cool; st.sev = clamp01((jolt - D.on) / (D.full - D.on)); vi.hit = 0; }
    else if (vi.hit >= 0) st.sev = Math.max(st.sev, clamp01((jolt - D.on) / (D.full - D.on)));
    for (const [k, v, s] of [['impact', vi, st], ['landing', vl, lst]]) {
      s.on = v.hit >= 0;
      if (!s.on) continue;
      const [p, g] = pattern(k);
      play(p, v, s.sev, dt, g * gain, out);
    }
  }

  function update(car, dt, gain = 1) {
    out.strong = 0; out.weak = 0;
    if (gain <= 0 || !car) return out;
    const speed = Math.abs(car.speed);
    // Surfaces: each touching wheel is a quarter, split across a blend.
    for (const k in weights) weights[k] = 0;
    let slide = 0, spin = 0, lock = 0, jolt = 0;
    const throttle = car.out?.throttle ?? 0, brake = car.input?.brake ?? 0, hand = (car.input?.handbrake ?? 0) > DETECT.lock.pedal;
    for (const w of car.wheels) {
      if (w.jolt > jolt) jolt = w.jolt; // read airborne too: it's a decaying peak, and a landing may have bounced off
      if (!w.contact) continue;
      const s = w.surf;
      if (s.ids) {
        const a = SURFACE_OF[s.ids[0]], b = SURFACE_OF[s.ids[1]];
        if (a) weights[a] = (weights[a] ?? 0) + 0.25 * (1 - s.w);
        if (b) weights[b] = (weights[b] ?? 0) + 0.25 * s.w;
      } else if (SURFACE_OF[s.id]) weights[SURFACE_OF[s.id]] = (weights[SURFACE_OF[s.id]] ?? 0) + 0.25;
      if (!w.front) slide = Math.max(slide, Math.abs(w.alpha) / s.ap);
      if (w.drive > 0) spin = Math.max(spin, w.kappa / s.kp);
      if (w.front || !hand) lock = Math.max(lock, -w.kappa / s.kp);
    }
    const D = DETECT, sp = clamp01((speed - D.vMin) / (D.vFull - D.vMin));
    const level = sp ** D.level, rate = sp ** D.sparse, dull = 1 - clamp01(sp / D.dull);
    const plane = 1 - (1 - D.plane.floor) * clamp01((speed - D.plane.from) / (D.plane.to - D.plane.from));
    const road = Number.isFinite(picks.road?.gain) ? picks.road.gain : PICKS.road.gain; // the master gain over every surface
    for (const k in weights) {
      if (!weights[k]) continue;
      const [p, g] = pattern(k);
      play(p, voiceOf(k), level, dt, g * road * plane * weights[k] * gain, out, rate * plane, dull); // planing: softer and fewer
    }
    event('slide', latch(ev.slide, slide, D.slide, speed >= D.slide.v), dt, gain);
    event('spin', latch(ev.spin, spin, D.spin, throttle > D.spin.pedal), dt, gain);
    const braking = brake > D.lock.pedal && speed >= D.lock.v, locked = latch(ev.lock, lock, D.lock, braking);
    event('brake', latch(ev.brake, lock, D.brake, braking && locked < 0), dt, gain); // the warning gives way to the lock
    event('lock', locked, dt, gain);
    impact(jolt, !car.wheels.some(w => w.contact), dt, gain);
    out.strong = clamp01(out.strong); out.weak = clamp01(out.weak);
    return out;
  }

  // Which events are on, for the lab's readout and the tests.
  const active = () => ({ slide: !!ev.slide.on, spin: !!ev.spin.on, brake: !!ev.brake.on, lock: !!ev.lock.on, impact: !!ev.impact.on, landing: !!ev.landing.on });
  return { update, active, setPicks(p) { picks = p; } };
}
