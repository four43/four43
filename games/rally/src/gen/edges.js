// Road edges (rally spec R10-1): the half-width of the road on each side, per layout sample. A slow wobble shared by both
// sides (~25 m) plus a ragged per-side wander (~5 m), both scaled by the section's surface, so tarmac keeps a near-laid
// edge and gravel frays. The wheels (TrackWorld) and the road shader read the same arrays, so a wheel on visible grass is
// on grass. Finer raggedness than the 1 m samples carry is the shader's alone (a few cm). Pure.
import { noise2 } from './noise.js';
import { roadSurfaceAt } from './surfaces.js';

export const EDGE = {
  half: 3.5, min: 2.9, max: 4.0,      // m; markers stand at 4.5 (roadside.js), the flat shoulder ends at 5.5 (terrain.js)
  widthScale: 25, ragScale: 5,        // m, feature size of each wobble
  // per road surface: width = shared wobble amplitude, rag = per-side wander amplitude (m)
  surface: {
    tarmac: { width: 0.15, rag: 0.04 }, hardpack: { width: 0.45, rag: 0.2 }, gravel: { width: 0.45, rag: 0.25 },
    packed: { width: 0.4, rag: 0.2 }, snow: { width: 0.4, rag: 0.2 }, ice: { width: 0.3, rag: 0.12 },
  },
};
const FALLBACK = EDGE.surface.gravel;

// → { left: Float32Array(n), right: Float32Array(n) }, half-widths in m (positive), one per layout sample.
export function generateEdges(layout, surfaces, r) {
  const n = layout.n, left = new Float32Array(n), right = new Float32Array(n);
  const wide = noise2(r.fork('width').int(0, 0x7fffffff)), rag = noise2(r.fork('rag').int(0, 0x7fffffff));
  for (let i = 0; i < n; i++) {
    const s = i * layout.ds, at = roadSurfaceAt(surfaces, s);
    const a = EDGE.surface[at.road] ?? FALLBACK, b = at.next ? EDGE.surface[at.next.road] ?? FALLBACK : a;
    const width = a.width + (b.width - a.width) * at.t, rg = a.rag + (b.rag - a.rag) * at.t;
    const w = width * wide(s / EDGE.widthScale, 0.5);
    left[i] = clamp(EDGE.half + w + rg * rag(s / EDGE.ragScale, 3.5));
    right[i] = clamp(EDGE.half + w + rg * rag(s / EDGE.ragScale, 9.5));
  }
  return { left, right };
}
const clamp = (v) => Math.min(EDGE.max, Math.max(EDGE.min, v));

// Half-width on the side of signed offset d (+ = left, the locator's sign) at distance s, linear between samples (as the
// ribbon's attribute interpolates). Loops wrap; stages clamp to their ends.
export function edgeAt(edges, layout, s, d) {
  const a = d >= 0 ? edges.left : edges.right, n = a.length, f = s / layout.ds;
  if (layout.closed) {
    const i = ((Math.floor(f) % n) + n) % n, t = f - Math.floor(f);
    return a[i] + (a[(i + 1) % n] - a[i]) * t;
  }
  if (f <= 0) return a[0];
  if (f >= n - 1) return a[n - 1];
  const i = Math.floor(f), t = f - i;
  return a[i] + (a[i + 1] - a[i]) * t;
}

// On the road (inside the edge on its side)?
export const onRoad = (edges, layout, s, d) => Math.abs(d) <= edgeAt(edges, layout, s, d);
