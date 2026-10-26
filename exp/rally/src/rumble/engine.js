// The engine channel (rally-spec R9-1): a light hum on the weak motor that follows the revs and the throttle, and pulses on
// the rev limiter. p is PARAMS.engine, read every frame (the tuning panel edits it live).
const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);

export function createEngine(p) {
  const out = { strong: 0, weak: 0 };
  let t = 0;
  return {
    update(car, dt) {
      t += dt;
      const e = car.pt.spec, r = clamp01((car.rpm - e.idle) / (e.redline - e.idle));
      const thr = clamp01(car.out?.throttle ?? 0);
      out.weak = (p.idle + (p.redline - p.idle) * r) * (p.load + (1 - p.load) * thr);
      if (car.pt.state.limiter) out.weak += (t * p.limiterHz) % 1 < 0.5 ? p.limiterAmp : 0;
      return out;
    },
  };
}
