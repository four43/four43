// Wear lines (rally spec R10-8): where cars have worn the road, per layout sample. The road shader scatters short tyre
// marks around these lines (it never draws them as continuous lines). A pair of wheel lines `track` m apart follows a
// driven line: it cuts to the inside of corners (curvature, smoothed over the approach), wanders, and fades in
// and out along the road; in places a second, fainter pair runs beside it (another line through the same stretch). The
// pebbles thin out over the band the marks fall in (groove() with a wide width). Pure.
import { noise2 } from './noise.js';
import { roadSurfaceAt } from './surfaces.js';
import { average } from './edges.js';

export const WEAR = {
  track: 1.5, width: 0.28,          // m between the wheel lines; half-width of one line
  apex: 30, max: 1.4, smooth: 18,   // offset per unit curvature (m²), cap (m), moving-average radius (samples)
  wander: 0.45, wanderScale: 45,    // m, feature size (m)
  fadeScale: 90, otherScale: 120,   // presence of the main pair, and of the second pair
  margin: 0.6,                      // m kept between the outer wheel line and the edge
  surface: { tarmac: 0.7, hardpack: 1, gravel: 1, packed: 1, ice: 0.8 }, // overall strength
};

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// → { c1, a1, c2, a2 }: Float32Array(n) each; c = the pair's centre offset (m, + = left), a = its strength 0..1.
export function generateWear(layout, surfaces, edges, r) {
  const n = layout.n, c1 = new Float32Array(n), a1 = new Float32Array(n), c2 = new Float32Array(n), a2 = new Float32Array(n);
  const wander = noise2(r.fork('wander').int(0, 0x7fffffff)), fade = noise2(r.fork('fade').int(0, 0x7fffffff));
  const other = noise2(r.fork('other').int(0, 0x7fffffff));
  const bend = average(layout.curvature, WEAR.smooth, layout.closed);
  for (let i = 0; i < n; i++) {
    const s = i * layout.ds, at = roadSurfaceAt(surfaces, s);
    const k = WEAR.surface[at.road] ?? 1, kn = at.next ? WEAR.surface[at.next.road] ?? 1 : k, str = k + (kn - k) * at.t;
    const reach = (side) => side - WEAR.margin - WEAR.track / 2 - WEAR.width; // furthest the centre may sit towards a side
    const lo = -reach(edges.right[i]), hi = reach(edges.left[i]);
    const inside = Math.max(-WEAR.max, Math.min(WEAR.max, bend[i] * WEAR.apex)); // + curvature = left bend = inside is +
    const c = inside + WEAR.wander * wander(s / WEAR.wanderScale, 0.5);
    const fit = (v) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v))); // a lane too narrow for the pair: centred
    c1[i] = fit(c);
    a1[i] = str * (0.35 + 0.65 * smooth(-0.4, 0.4, fade(s / WEAR.fadeScale, 2.5)));
    const o = other(s / WEAR.otherScale, 6.5), off = (o > 0 ? 1 : -1) * (0.55 + 0.4 * Math.abs(wander(s / 20, 8.5)));
    c2[i] = fit(c1[i] + off);
    a2[i] = str * 0.6 * smooth(0.15, 0.45, Math.abs(o));
  }
  return { c1, a1, c2, a2 };
}

// One pair's [groove, berm] at offset d: groove 1 in a wheel line, berm the ridge just beside it; with a wide width, the
// band the shader's marks fall in.
export function groove(d, c, a, width = WEAR.width) {
  const u = Math.abs(Math.abs(d - c) - WEAR.track / 2) / width;
  return [a * (1 - smooth(0, 1, u)), a * smooth(0.8, 1.3, u) * (1 - smooth(1.3, 2.2, u))];
}
