// How fast a player can be anywhere on a layout (rally spec R18-3, R18-5): the flat-out profile (corners at FLAT.lat
// of μ·g, full acceleration out of them, the fastest car's top speed; no braking for what is ahead, as at full
// throttle) and the brake envelope (the fastest you can be and still brake for everything ahead). The jumps are sized
// for the first; a loop's line goes where the first fits under the second. Pure.
import { roadSurfaceAt } from './surfaces.js';
import { surfaceOfKey } from '../surface.js';

const G = 9.81;
export const FLAT = {
  lat: 0.8,      // share of μ·g a player uses in a corner
  accel: 0.7,    // g of acceleration from rest, falling with (v / top)² (drag) to 0 at top
  top: 56,       // m/s: the fastest car's top speed (rally spec R16)
  brake: 0.6,    // share of μ·g a player brakes at after the line
  react: 0.5,    // s: crossing the line, no braking for this long
  spare: 0.1,    // and the brake envelope there at least this share above the crossing speed (braking in a bend)
};

// μ per layout sample: from the surfaces, or one μ for the whole road.
function muArray(layout, mu) {
  const out = new Float32Array(layout.n);
  for (let i = 0; i < layout.n; i++) out[i] = typeof mu === 'number' ? mu : surfaceOfKey(roadSurfaceAt(mu, i * layout.ds).road).mu;
  return out;
}

// Corner speed limit per sample: sqrt(lat·μ·g / |κ|), capped at top.
function cornerLimit(layout, mu) {
  const { n, curvature: K } = layout, out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.min(FLAT.top, Math.sqrt(FLAT.lat * mu[i] * G / Math.max(Math.abs(K[i]), 1e-6)));
  return out;
}

// Flat-out speed (m/s) per layout sample. mu: a surfaces object or a number. A stage starts from rest; a loop is run
// round twice so its start carries the speed of the lap's end.
export function flatOut(layout, mu = 1) {
  const m = muArray(layout, mu), lim = cornerLimit(layout, m), { n, ds, closed } = layout, out = new Float32Array(n);
  let v = 0;
  for (let k = 0; k < (closed ? 2 * n : n); k++) {
    const i = k % n, a = FLAT.accel * G * Math.max(0, 1 - (v / FLAT.top) ** 2);
    v = Math.min(lim[i], Math.sqrt(v * v + 2 * a * ds));
    out[i] = v;
  }
  return out;
}

// Brake envelope (m/s) per sample: the fastest you can be there and brake at FLAT.brake·μ·g for everything ahead.
export function brakeEnvelope(layout, mu = 1) {
  const m = muArray(layout, mu), lim = cornerLimit(layout, m), { n, ds, closed } = layout, out = new Float32Array(n);
  let v = closed ? FLAT.top : lim[n - 1];
  for (let k = (closed ? 2 * n : n) - 1; k >= 0; k--) {
    const i = k % n;
    v = Math.min(lim[i], Math.sqrt(v * v + 2 * FLAT.brake * m[i] * G * ds));
    out[i] = v;
  }
  return out;
}

// Where a loop's line goes: the sample where a car crossing flat out can still brake for what follows after
// FLAT.react s (flat-out × (1 + FLAT.spare) ≤ brake envelope there). Of those, the fastest crossing; with none, the
// most room.
// → { i, v, room } (room: brake envelope − flat-out, m/s).
export function lineSpot(layout, mu = 1) {
  const f = flatOut(layout, mu), b = brakeEnvelope(layout, mu), { n } = layout;
  let best = null, roomiest = null;
  for (let i = 0; i < n; i++) {
    const room = b[(i + Math.round(FLAT.react * f[i] / layout.ds)) % n] - f[i] * (1 + FLAT.spare);
    if (room >= 0 && (!best || f[i] > best.v)) best = { i, v: f[i], room };
    if (!roomiest || room > roomiest.room) roomiest = { i, v: f[i], room };
  }
  return best ?? roomiest;
}

// A loop turned so sample `i` comes `at` m after s = 0 (every per-sample array rotated; a stage is returned as is).
export function turnLoop(layout, i, at) {
  if (!layout.closed) return layout;
  const n = layout.n, k = ((i - Math.round(at / layout.ds)) % n + n) % n;
  if (k === 0) return layout;
  const rot = (a) => { const o = new a.constructor(n); for (let j = 0; j < n; j++) o[j] = a[(j + k) % n]; return o; };
  return { ...layout, x: rot(layout.x), z: rot(layout.z), heading: rot(layout.heading), curvature: rot(layout.curvature) };
}
