// Road edges (rally spec R10-1, R12, R18-2): the half-width of the road on each side, per layout sample. A base width
// that drifts between ~5 and ~7 m of road (three to four car widths) over a couple of hundred metres, squeezed to a
// single lane through a `narrow` obstacle (eased in and out over its ramps), the inside of bends widened where cars cut
// them, then a slow wobble shared by both sides (~25 m) and a ragged per-side wander (~5 m), both scaled by the section's
// surface (tarmac keeps a near-laid edge, gravel frays). Tight bends are at least two car widths wide. Around the start / finish gates (on loops that spans the seam)
// it eases back to the standard width, so the gates frame the road and a loop closes without a step. The wheels
// (TrackWorld), the terrain's flat shoulder, the markers and the road shader all read these arrays. Finer raggedness
// than the 1 m samples carry is the shader's alone (a few cm). Pure.
import { noise2 } from './noise.js';
import { roadSurfaceAt } from './surfaces.js';
import { ROADSIDE } from './roadside.js';

export const EDGE = {
  half: 3, min: 1.3, max: 5,         // m: the standard half-width (gates), and the clamp (1.5 car widths … 10 m of road)
  shoulder: 2,                        // m of flat shoulder past the edge (terrain, ribbon); markers stand 1 m past it
  base: [2.6, 3.6], baseScale: 220,   // m: a 5.2 … 7.2 m road, log-interpolated, drifting over ~baseScale m
  corner: { gain: 30, max: 1.2, smooth: 15 }, // the inside of a bend widens |κ| (smoothed over ±smooth samples) × gain m, ≤ max
  tight: { width: 3.5, k: [1 / 80, 1 / 40] }, // m of road (2 car widths) at least in a bend, ramped in as |κ| goes radius 80 → 40 m
  gate: { reach: 35, blend: 70 },     // m: standard width within reach of a gate, eased back over blend
  widthScale: 25, ragScale: 5,        // m, feature size of each wobble
  // per road surface: width = shared wobble amplitude, rag = per-side wander amplitude (m)
  surface: {
    tarmac: { width: 0.15, rag: 0.04 }, hardpack: { width: 0.45, rag: 0.2 }, gravel: { width: 0.45, rag: 0.25 },
    packed: { width: 0.4, rag: 0.2 }, snow: { width: 0.4, rag: 0.2 }, ice: { width: 0.3, rag: 0.12 },
  },
};
const FALLBACK = EDGE.surface.gravel;
const smooth = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };

// Moving average over ±rad samples (loops wrap).
export function average(a, rad, closed) {
  const n = a.length, out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0, c = 0;
    for (let k = -rad; k <= rad; k++) {
      const j = closed ? (((i + k) % n) + n) % n : i + k;
      if (j < 0 || j >= n) continue;
      s += a[j]; c++;
    }
    out[i] = s / c;
  }
  return out;
}

// → { left: Float32Array(n), right: Float32Array(n) }, half-widths in m (positive), one per layout sample. features:
// the narrows among them squeeze the road.
export function generateEdges(layout, surfaces, r, features = []) {
  const n = layout.n, L = n * layout.ds, left = new Float32Array(n), right = new Float32Array(n);
  const wide = noise2(r.fork('width').int(0, 0x7fffffff)), rag = noise2(r.fork('rag').int(0, 0x7fffffff));
  const base = noise2(r.fork('base').int(0, 0x7fffffff));
  const bend = average(layout.curvature, EDGE.corner.smooth, layout.closed);
  const narrows = features.filter(f => f.type === 'narrow');
  const gates = layout.closed ? [ROADSIDE.gateS, ROADSIDE.gateS + L, ROADSIDE.gateS - L] : [ROADSIDE.gateS, L - ROADSIDE.gateS];
  for (let i = 0; i < n; i++) {
    const s = i * layout.ds, at = roadSurfaceAt(surfaces, s);
    const a = EDGE.surface[at.road] ?? FALLBACK, b = at.next ? EDGE.surface[at.next.road] ?? FALLBACK : a;
    const width = a.width + (b.width - a.width) * at.t, rg = a.rag + (b.rag - a.rag) * at.t;
    const hw = EDGE.base[0] * (EDGE.base[1] / EDGE.base[0]) ** smooth(0.5 + 0.6 * base(s / EDGE.baseScale, 1.5)); // log scale
    const cut = Math.min(EDGE.corner.max, Math.abs(bend[i]) * EDGE.corner.gain), inLeft = bend[i] > 0; // + curvature = left bend
    const w = width * wide(s / EDGE.widthScale, 0.5);
    const g = smooth((Math.min(...gates.map(x => Math.abs(s - x))) - EDGE.gate.reach) / EDGE.gate.blend); // 0 at a gate, 1 away
    const l = hw + (inLeft ? cut : 0) + w + rg * rag(s / EDGE.ragScale, 3.5);
    const rt = hw + (inLeft ? 0 : cut) + w + rg * rag(s / EDGE.ragScale, 9.5);
    let le = EDGE.half + (l - EDGE.half) * g, ri = EDGE.half + (rt - EDGE.half) * g;
    const need = 2 * EDGE.min + (EDGE.tight.width - 2 * EDGE.min) * smooth((Math.abs(bend[i]) - EDGE.tight.k[0]) / (EDGE.tight.k[1] - EDGE.tight.k[0]));
    if (le + ri < need) { const k = need / (le + ri); le *= k; ri *= k; } // too narrow for the bend: widen both sides, centre kept
    for (const f of narrows) { // a narrow: the lane's half-width plus a little of the fray, eased in over its ramps
      const u = Math.min(s - f.s0, f.s1 - s) / f.ramp;
      if (u <= 0) continue;
      const k = smooth(u);
      le += (f.half + 0.3 * rg * rag(s / EDGE.ragScale, 3.5) - le) * k;
      ri += (f.half + 0.3 * rg * rag(s / EDGE.ragScale, 9.5) - ri) * k;
    }
    left[i] = clamp(le);
    right[i] = clamp(ri);
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
