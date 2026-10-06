// Predefined launch path (B-5): a cubic Bezier up and over the cab to a point above the slot,
// then an eased drop into the slot. All points are in the tractor frame, so the path rides with the tractor;
// the slot point is re-read every frame, so the end bends to follow a swinging trailer.
export const FLIGHT = {
  pig: { dur: 1.2, flourish: 'flip' }, cow: { dur: 1.4, flourish: 'none' }, chicken: { dur: 1.3, flourish: 'flap' }, sheep: { dur: 1.2, flourish: 'spin' },
  duck: { dur: 1.2, flourish: 'drip' }, bunny: { dur: 1.0, flourish: 'ears' }, dog: { dur: 1.1, flourish: 'none' }, chick: { dur: 1.0, flourish: 'flap' },
};
const SPLIT = 0.75, PEAK = { x: -0.6, y: 7.2 };
const bez = (a, b, c, d, t) => { const s = 1 - t; return s * s * s * a + 3 * s * s * t * b + 3 * s * t * t * c + t * t * t * d; };
export function launchLocal(u, start, slot, out) {
  const ax = slot.x, ay = slot.y + 3.2, az = slot.z;
  if (u < SPLIT) {
    const t = u / SPLIT;
    out.x = bez(start.x, start.x + 0.8, PEAK.x, ax, t);
    out.y = bez(start.y, start.y + 5.5, PEAK.y, ay, t);
    out.z = bez(start.z, start.z * 0.5, 0, az, t);
  } else {
    const w = (u - SPLIT) / (1 - SPLIT);
    out.x = ax; out.z = az; out.y = ay - (ay - slot.y) * w * w;
  }
  return out;
}
const smooth = u => u * u * (3 - 2 * u);
// flip and spin make one full turn during the arc and end upright; other flourishes are drawn in animals3d.js
export const flourishAngle = (kind, u) => (kind === 'flip' || kind === 'spin') ? Math.PI * 2 * smooth(Math.min(1, u / SPLIT)) : 0;
