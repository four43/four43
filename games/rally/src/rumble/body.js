// The body channel (rally-spec R9-1, R9-3): the car's contacts (marker, wall, a roll onto the roof, the floor bottoming
// out) as a velocity change Δv = impulse / mass. A hit starts at its size and decays (bigger hits last longer); the level
// is the largest live hit, on the strong motor and a share of it on the weak one. p is PARAMS.body.
const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
const MAX_HITS = 8;

export function createBody(p) {
  const out = { strong: 0, weak: 0 };
  const hits = []; // { size, age }
  return {
    // impulse: the summed contact impulse (N·s) on the car since the last frame; mass: the car's (kg)
    update(impulse, mass, dt) {
      for (const h of hits) h.age += dt;
      const size = clamp01((impulse / mass - p.dvOn) / (p.dvFull - p.dvOn));
      if (impulse > 0 && size > 0) { if (hits.length >= MAX_HITS) hits.shift(); hits.push({ size, age: 0 }); }
      let level = 0;
      for (let i = hits.length - 1; i >= 0; i--) {
        const h = hits[i], v = h.size * 0.5 ** (h.age / (p.decay * (1 + 0.5 * h.size)));
        if (v < 0.005) hits.splice(i, 1); else if (v > level) level = v;
      }
      out.strong = level; out.weak = level * p.weakShare;
      return out;
    },
  };
}
