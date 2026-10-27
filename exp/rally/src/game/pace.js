// How fast the road allows (spec tracks T-23): corner speed from curvature and grip, capped for
// obstacles. Shared by the test autopilot and the time-attack run-up. Pure: no Rapier, no DOM.
import { surfaceOfKey } from '../surface.js';
import { roadSurfaceAt } from '../gen/surfaces.js';
import { pointAt } from '../world/trackWorld.js';

const G = 9.81;
// Speed caps (m/s) from OBSTACLE_LEAD m before an obstacle to its end, swept per feature on the
// test seeds: whoops launch and flip from ~16 (and the tallest can't be crawled either: the hull
// grounds on the ridges). The jumps' caps date from the old steep kickers; the R17 shapes fly cleanly
// at 79-100 km/h (test/jumps.mjs), but the autopilot's drives and goldens keep these.
export const OBSTACLE_V = 16, OBSTACLE_LEAD = 15;
export const V_MAX = 38;
export const CAPS = { kicker: 12, whoops: 12, crest: 16, tabletop: 16 };

export const muAt = (track, s) => surfaceOfKey(roadSurfaceAt(track.surfaces, s).road).mu;

// Allowed speed at s: min(V_MAX, sqrt(lat·μ·g/|κ|), obstacle cap). lat is the share of μ·g used.
export function allowedSpeed(track, s, { lat = 0.55, caps = CAPS } = {}) {
  const L = track.layout, pk = pointAt(L, s);
  const kk = Math.max(Math.abs(L.curvature[pk.i]), Math.abs(L.curvature[pk.j]), 1e-4);
  return Math.min(V_MAX, Math.sqrt(lat * muAt(track, pk.s) * G / kk), obstacleCap(track, pk.s, caps));
}

export function obstacleCap(track, s, caps = CAPS) {
  const len = track.layout.length;
  for (const f of track.features) {
    if (f.type === 'berm') continue;
    let ds = s - (f.s0 - OBSTACLE_LEAD);
    if (track.layout.closed) ds = ((ds % len) + len) % len;
    if (ds >= 0 && ds <= f.s1 - f.s0 + OBSTACLE_LEAD) return caps[f.type] ?? OBSTACLE_V;
  }
  return V_MAX;
}

// Time-attack run-up: how far before the line the car starts so it reaches the line after about
// `time` s from rest, driving the pace profile (accelerating at accel·μ·g, braking at brake·μ·g
// for corners ahead). The start depends on the distance, so iterate a few times; clamp [lo, hi].
export function runUpDistance(track, lineS, { time = 10, accel = 0.45, brake = 0.4, lo = 150, hi = 400 } = {}) {
  let D = 250;
  for (let it = 0; it < 3; it++) {
    const n = Math.ceil(D);
    const env = new Float64Array(n + 1);
    for (let k = 0; k <= n; k++) env[k] = allowedSpeed(track, lineS - D + k);
    for (let k = n - 1; k >= 0; k--) { // brake for what's ahead
      const a = brake * muAt(track, lineS - D + k) * G;
      env[k] = Math.min(env[k], Math.sqrt(env[k + 1] ** 2 + 2 * a));
    }
    // Forward from rest, 1 m at a time; the distance at which the clock passes `time`.
    let v = 0, t = 0, d = n;
    for (let k = 0; k < n; k++) {
      const a = accel * muAt(track, lineS - D + k) * G;
      const v1 = Math.min(env[k + 1], Math.sqrt(v * v + 2 * a));
      t += 2 / (v + v1);
      v = v1;
      if (t >= time) { d = k + 1; break; }
    }
    // Ran out of road before `time`: extend by the distance the last speed would cover.
    D = Math.min(hi, Math.max(lo, t >= time ? d : n + v * (time - t)));
  }
  return D;
}
