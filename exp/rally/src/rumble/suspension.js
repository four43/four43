// The suspension channel (rally-spec R9-1): what the road does to the car, by surface and speed.
// Texture: each touching wheel rolls over a synthetic road of its surface: half-cosine bumps `rough` m high and `width` m
// long, a random ~`spacing` m apart. The road height goes through a spring-damper (`hz`, `zeta`: the tyre and wheel) and
// the felt motion is the wheel's vertical speed. A bump much longer than the spring's period is followed (slow: a soft
// lift, growing with speed); around it, it hits hardest; much shorter is soaked up, as its area shrinks with speed (fast:
// the car planes over it). The wheel's acceleration would not do: the spring passes a bump's height on at once, however
// short the bump. Below `splitHz` the motion goes to the strong motor,
// above it to the weak one. Real hits: the wheels' jolt (rally-spec R7-6, vehicle.js JOLT) on top, both motors.
// p is PARAMS.suspension, read every frame (the tuning panel edits it live).
const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
const SUB = 0.001; // s: the filter's step (the spring rings at up to 30 Hz; a rendered frame is far too coarse)

// Tyre material → rumble surface. Blends (a track's surface hand-over, snow wearing to ice) carry `ids` and `w`.
export const SURFACE_OF = {
  'rally-tarmac': 'tarmac', 'rally-hardpack': 'dirt', 'rally-gravel': 'gravel', 'rally-grass': 'grass', 'rally-sand': 'sand',
  'rally-mud': 'mud', 'rally-packed': 'snow', 'rally-snowbank': 'snow', 'rally-ice': 'ice',
};

const FIELDS = ['rough', 'spacing', 'width'];
// The road under a wheel: its surface's numbers, a blend mixed by `w`; null for a material without a rumble surface.
function roadOf(surfs, surf, into) {
  if (surf.ids) {
    const a = surfs[SURFACE_OF[surf.ids[0]]], b = surfs[SURFACE_OF[surf.ids[1]]];
    if (!a || !b) return a || b || null;
    for (const f of FIELDS) into[f] = a[f] + (b[f] - a[f]) * surf.w;
    return into;
  }
  return surfs[SURFACE_OF[surf.id]] ?? null;
}

function wheel(seed) {
  return { s: seed >>> 0 || 1, next: 0, b0: -1, bh: 0, bw: 1, x: 0, v: 0, low: 0, envS: 0, envW: 0, mix: {} };
}
const rand = w => ((w.s = (Math.imul(w.s, 1664525) + 1013904223) >>> 0) / 2 ** 32);

export function createSuspension(p) {
  const out = { strong: 0, weak: 0 }, wheels = [0, 1, 2, 3].map(i => wheel((i + 1) * 2654435761));
  let dist = 0; // m rolled, shared: every wheel's own road is random anyway

  function roll(w, road, speed, dt) {
    const wn = 2 * Math.PI * p.hz, kLow = 1 - Math.exp(-2 * Math.PI * p.splitHz * SUB), fall = Math.exp(-SUB / p.release);
    const n = Math.max(1, Math.round(dt / SUB));
    let d = dist;
    for (let i = 0; i < n; i++) {
      let y = 0;
      if (road) {
        d += speed * SUB;
        if (w.next <= 0) w.next = d + road.spacing * -Math.log(1 - 0.999 * rand(w));
        if (d >= w.next) { // a new bump: ±50 % of rough, at least its own width before the next
          w.b0 = d; w.bh = road.rough * (0.5 + rand(w)); w.bw = road.width;
          w.next = d + Math.max(road.width, road.spacing * -Math.log(1 - 0.999 * rand(w)));
        }
        const u = (d - w.b0) / w.bw;
        if (w.b0 >= 0 && u < 1) y = w.bh * 0.5 * (1 - Math.cos(2 * Math.PI * u));
      }
      const acc = wn * wn * (y - w.x) - 2 * p.zeta * wn * w.v; // semi-implicit Euler: stable at wn·SUB ≪ 1
      w.v += acc * SUB; w.x += w.v * SUB;
      w.low += (w.v - w.low) * kLow;
      const hi = w.v - w.low;
      w.envS = Math.max(Math.abs(w.low), w.envS * fall); w.envW = Math.max(Math.abs(hi), w.envW * fall);
    }
  }

  return {
    update(car, dt) {
      const speed = Math.abs(car.speed);
      // A bump of `full` m at its loudest speed moves the wheel at about 1.26 · wn · full m/s (a half-cosine's response): level 1.
      const norm = 2 * Math.PI * p.hz * p.full * 1.26;
      let strong = 0, weak = 0, jolt = 0;
      for (let i = 0; i < 4; i++) {
        const cw = car.wheels[i], w = wheels[i];
        if (cw.jolt > jolt) jolt = cw.jolt; // read airborne too: a decaying peak, and a landing may have bounced off
        roll(w, cw.contact ? roadOf(p.surfaces, cw.surf, w.mix) : null, speed, dt);
        strong += w.envS; weak += w.envW;
      }
      dist += speed * dt;
      // two wheels over a full bump make 1 (the texture is under `gain`); a real hit is added on top
      const hit = clamp01((jolt - p.joltOn) / (p.joltFull - p.joltOn));
      out.strong = (strong / norm) * 0.5 * p.gain + hit;
      out.weak = (weak / norm) * 0.5 * p.gain + hit * p.joltWeak;
      return out;
    },
  };
}
