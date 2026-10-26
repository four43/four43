// Road layouts (spec tracks T-2) in two styles. Flowing: a closed loop from a Catmull-Rom ring, or
// a point-to-point stage from a curvature program. Twisty (rallycross-like): a loop from a
// curvature program of hairpins, switchbacks and S-bends closed by solving its straight lengths,
// or a stage from the same program builder with tighter corners and switchback climbs. Output is
// the spec's Layout: 1 m samples of x/z/heading/curvature, plus its style.
//
// Conventions: heading 0 = +z, heading = atan2(dx, dz), + curvature = left. Travel direction is
// (sin h, cos h); its derivative d/dh is (cos h, -sin h), so that is the left normal (where a
// + curvature turn bends). Check: h = 0 (travel +z) gives (1, 0) = +x, the spec's left.

const KMAX = 1 / 15;       // minimum radius 15 m
const CLEAR = 40;          // no road within 40 m ...
const SEP = 120;           // ... of road more than 120 m away along it
const BOX = 1400;          // fits in a 1400 m square
const TRIES = 50;

const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// Length bands (m) per style and kind.
export const LENGTHS = {
  flowing: { loop: [1500, 3000], stage: [3000, 6000] },
  twisty: { loop: [1000, 2000], stage: [2500, 5000] },
};

// style 'flowing': open, fast roads; 'twisty': rallycross-like, hairpins and tight S-bends.
export function generateLayout(r, { kind = 'loop', style = 'twisty' } = {}) {
  if (!LENGTHS[style]) throw new Error(`generateLayout: unknown style ${style}`);
  const tw = style === 'twisty';
  const make = kind === 'stage' ? (q) => stageAttempt(q, tw) : tw ? twistyLoopAttempt : loopAttempt;
  for (let k = 0; k < TRIES; k++) {
    const L = make(r.fork('try' + k));
    if (L && valid(L, LENGTHS[style][kind === 'stage' ? 'stage' : 'loop'])) { L.style = style; return L; }
  }
  throw new Error(`generateLayout: no valid ${style} ${kind} after ${TRIES} tries (seed ${r.seed})`);
}

// --- validation ------------------------------------------------------------------------------

function valid(L, [lo, hi]) {
  if (L.length < lo || L.length > hi) return false;
  for (let i = 0; i < L.n; i++) if (Math.abs(L.curvature[i]) > KMAX) return false;
  const b = L.bounds;
  if (b.maxX - b.minX > BOX || b.maxZ - b.minZ > BOX) return false;
  return clearanceOk(L.x, L.z, L.n, L.closed);
}

// Spatial hash (cell = CLEAR / 2.5 = 16 m, so a 7x7 block covers the 40 m radius).
const CELL = 16, cellKey = (cx, cz) => cx * 65536 + cz;
function clearanceOk(x, z, n, closed) {
  const cells = new Map();
  for (let i = 0; i < n; i++) {
    const k = cellKey(Math.floor(x[i] / CELL), Math.floor(z[i] / CELL));
    const l = cells.get(k); l ? l.push(i) : cells.set(k, [i]);
  }
  const c2 = CLEAR * CLEAR, R = Math.ceil(CLEAR / CELL);
  for (let i = 0; i < n; i++) {
    const cx = Math.floor(x[i] / CELL), cz = Math.floor(z[i] / CELL);
    for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) {
      const l = cells.get(cellKey(cx + a, cz + b)); if (!l) continue;
      for (const j of l) {
        if (j <= i) continue;
        let sep = j - i; if (closed) sep = Math.min(sep, n - sep);
        if (sep <= SEP) continue;
        const dx = x[i] - x[j], dz = z[i] - z[j];
        if (dx * dx + dz * dz < c2) return false;
      }
    }
  }
  return true;
}

function finish(kind, closed, x, z, heading, curvature) {
  const n = x.length;
  const L = {
    kind, closed, ds: 1, n,
    x: Float32Array.from(x), z: Float32Array.from(z),
    heading: Float32Array.from(heading), curvature: Float32Array.from(curvature),
    length: closed ? n : n - 1,
    bounds: { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity },
  };
  const b = L.bounds;
  for (let i = 0; i < n; i++) {
    b.minX = Math.min(b.minX, L.x[i]); b.maxX = Math.max(b.maxX, L.x[i]);
    b.minZ = Math.min(b.minZ, L.z[i]); b.maxZ = Math.max(b.maxZ, L.z[i]);
  }
  return L;
}

// --- loop ------------------------------------------------------------------------------------

function loopAttempt(r) {
  const target = r.range(1700, 2800);
  const m = r.int(10, 16), step = 2 * Math.PI / m, rot = r.range(0, 2 * Math.PI);
  const cp = [];
  for (let k = 0; k < m; k++) {
    const a = rot + step * k + r.range(-0.3, 0.3) * step, rad = r.range(0.55, 1);
    cp.push([rad * Math.sin(a), rad * Math.cos(a)]);
  }
  // Clockwise vs counter-clockwise: randomise the direction of travel.
  if (r.next() < 0.5) cp.reverse();
  return ringLoop(cp, target);
}

// Twisty loop (rallycross): a curvature program like a stage's — hairpins, switchbacks (two
// opposite hairpins on a 50–75 m straight), tight S-bends and corners, each after a straight. It
// is laid as pure pursuit of a guide circle (each corner turns towards a point 120 m further round
// it, each straight's length is the one that lands its piece nearest the circle) with an occupancy
// check, so it winds round once without crowding itself; a last corner squares the net turn to
// exactly ±2π and the straight lengths are then solved (least change, 25–200 m) to close the
// ring exactly. Pieces are integrated as on a stage, so curvature is continuous throughout.
// HAIRPINS_KM: hairpins per km the picker aims for; fewer than HAIRPINS_MIN and the attempt is
// dropped. GUIDE: guide circle length / target length. SLACK: m of road beyond target·progress
// before only plain corners (the cheapest progress) are drawn.
const DEG = Math.PI / 180, HAIRPINS_KM = 4, HAIRPINS_MIN = 2.5, GUIDE = 0.5, SLACK = 150, LONG_P = 0.3;
function twistyLoopAttempt(r) {
  const target = r.range(1150, 1850), D = r.next() < 0.5 ? 1 : -1, h0 = r.range(0, 2 * Math.PI);
  const side = () => (r.next() < 0.5 ? 1 : -1);
  const hairpin = (sd) => { const R = r.range(17, 28); return corner(sd, R, r.range(150, hairpinMax(R) / DEG) * DEG); };
  // Guide circle through the start, tangent to h0; hairpins and S-bends make the road ~2× longer
  // than the progress it makes round the guide, so the guide is about half the target length.
  const per = target * GUIDE, kc = D * 2 * Math.PI / per;
  const guide = (s) => [(Math.cos(h0) - Math.cos(h0 + kc * s)) / kc, (Math.sin(h0 + kc * s) - Math.sin(h0)) / kc];
  // Progress round the guide: the arc length of (x, z)'s projection, kept continuous.
  const ox = Math.cos(h0) / kc, oz = -Math.sin(h0) / kc;
  const along = (x, z, prev) => {
    const th = Math.atan2((z - oz) * kc, -(x - ox) * kc), a = (th - h0) / kc;
    return a + per * Math.round((prev - a) / per);
  };
  const pieces = [], ux = [], uz = [], L0 = [];
  let x = 0, z = 0, h = h0, s = 0, g = 0, hp = 0; // s: laid length, g: progress round the guide
  // Occupancy of the road laid so far (straights at their first-guess lengths): a piece that
  // comes within CLEAR of road more than SEP back is redrawn. Coming home, the first 150 m (which
  // the end of the loop is meant to meet) is exempt; the final layout is validated anyway.
  const PX = [0], PZ = [0], cells = new Map(), C = 20, CR = Math.ceil(CLEAR / C);
  const cell = (x, z) => cellKey(Math.floor(x / C), Math.floor(z / C));
  const clash = (xs, zs) => {
    const home = g > per * 0.6;
    for (let k = 0; k < xs.length; k++) {
      const i = PX.length + k, cx = Math.floor(xs[k] / C), cz = Math.floor(zs[k] / C);
      for (let a = -CR; a <= CR; a++) for (let b = -CR; b <= CR; b++) {
        const l = cells.get(cellKey(cx + a, cz + b)); if (!l) continue;
        for (const j of l) if (i - j > SEP && !(home && j < 150) && (xs[k] - PX[j]) ** 2 + (zs[k] - PZ[j]) ** 2 < CLEAR * CLEAR) return true;
      }
    }
    return false;
  };
  // Straight (length chosen to land near the circle; one in LONG_P is a long one, room for a
  // jump), then the piece.
  const place = (p, check = true) => {
    const pc = integrate(p), c = Math.cos(h), sn = Math.sin(h), long = r.next() < LONG_P;
    const wx = pc.dx * c + pc.dz * sn, wz = -pc.dx * sn + pc.dz * c, [gx, gz] = guide(g + 60 + progLength(p) / 2);
    const L = Math.min(long ? 160 : 110, Math.max(long ? 100 : 25, (gx - x - wx) * sn + (gz - z - wz) * c));
    const xs = [], zs = [], m = Math.round(L);
    for (let q = 1; q <= m; q++) { xs.push(x + sn * L * q / m); zs.push(z + c * L * q / m); }
    const bx = x + L * sn, bz = z + L * c;
    for (let q = 1; q < pc.x.length; q++) { xs.push(bx + pc.x[q] * c + pc.z[q] * sn); zs.push(bz - pc.x[q] * sn + pc.z[q] * c); }
    if (check && clash(xs, zs)) return false;
    for (let k = 0; k < xs.length; k++) {
      const i = PX.length, key = cell(xs[k], zs[k]); PX.push(xs[k]); PZ.push(zs[k]);
      const l = cells.get(key); l ? l.push(i) : cells.set(key, [i]);
    }
    pieces.push(pc); ux.push(sn); uz.push(c); L0.push(L);
    x = bx + wx; z = bz + wz; h += pc.dh; s += L + pc.x.length - 1; g = along(x, z, g);
    return true;
  };
  // Next piece and its hairpin count. Behind on hairpins (HAIRPINS_KM, counted to 200 m ahead)?
  // Then it is one. Over the length budget for this much progress, or boxed in (4 draws
  // clashed)? Then a plain corner.
  const pick = (boxed) => {
    const [gx, gz] = guide(g + 120), e = wrapA(Math.atan2(gx - x, gz - z) - h), se = Math.sign(e) || D;
    const q = r.next(), over = boxed || s - target * g / per > SLACK;
    const u = over ? 0.8 + 0.2 * q : hp < HAIRPINS_KM * (s + 200) / 1000 ? 0.6 * q : q, sd = side();
    if (u < 0.35 || (u < 0.6 && Math.abs(e) <= 60 * DEG)) return [[...hairpin(sd), [Math.round(r.range(50, 75)), 0, 0], ...hairpin(-sd)], 2];
    if (u < 0.6) return [hairpin(se), 1];
    if (u < 0.8) return [[...corner(sd, r.range(16, 40), r.range(40, 90) * DEG), [r.int(0, 12), 0, 0], ...corner(-sd, r.range(16, 40), r.range(40, 90) * DEG)], 0];
    return [corner(se, r.next() < 0.75 ? r.range(18, 60) : r.range(60, 120), Math.min(110, Math.max(30, Math.abs(e) / DEG)) * DEG), 0];
  };
  while (g < per - 120) {
    if (s > 2 * target) return null;
    let ok = false;
    for (let t = 0; t < 12 && !ok; t++) { const [p, n] = pick(t >= 4); if ((ok = place(p))) hp += n; }
    if (!ok) return null;
  }
  if (hp * 1000 / s < HAIRPINS_MIN) return null;
  const res = h0 + D * 2 * Math.PI - h; // the last corner turns the rest of the way round
  if (Math.abs(res) > 150 * DEG) return null;
  place(corner(Math.sign(res) || 1, r.range(20, 60), Math.abs(res)), false);
  // Piece displacements alone (x, z less the straights so far); then add the closing straight.
  const cx = x - L0.reduce((a, L, j) => a + L * ux[j], 0), cz = z - L0.reduce((a, L, j) => a + L * uz[j], 0);
  ux.push(Math.sin(h)); uz.push(Math.cos(h)); L0.push(25);
  const L = solveStraights(L0, ux, uz, -cx, -cz, 25, 200);
  if (!L) return null;
  // Lay it out: straight j, then piece j, ...; the closing straight ends back at the start.
  const X = [0], Z = [0];
  h = h0;
  for (let j = 0; j < L.length; j++) {
    const x0 = X[X.length - 1], z0 = Z[Z.length - 1], m = Math.max(1, Math.round(L[j]));
    for (let q = 1; q <= m; q++) { X.push(x0 + ux[j] * L[j] * q / m); Z.push(z0 + uz[j] * L[j] * q / m); }
    const pc = pieces[j]; if (!pc) break;
    const xs = X[X.length - 1], zs = Z[Z.length - 1], c = Math.cos(h), sn = Math.sin(h);
    for (let q = 1; q < pc.x.length; q++) { X.push(xs + pc.x[q] * c + pc.z[q] * sn); Z.push(zs - pc.x[q] * sn + pc.z[q] * c); }
    h += pc.dh;
  }
  X.pop(); Z.pop(); // == the start
  // Start mid-way along the closing + first straight (a clean run to the line).
  const n = X.length, k0 = (n + Math.floor((L[0] - L[L.length - 1]) / 2)) % n;
  const px = [...X.slice(k0), ...X.slice(0, k0)], pz = [...Z.slice(k0), ...Z.slice(0, k0)];
  return exactLoop(px, pz);
}

// Largest hairpin sweep at radius R whose legs are still CLEAR (+4 m) apart 30 m out from the
// arc (where they are SEP apart along the road): they start 2R apart and open up by
// 2·30·sin((π − sweep)/2).
const hairpinMax = (R) => Math.PI - 2 * Math.asin(Math.min(1, Math.max(0, (CLEAR + 4 - 2 * R) / 60)));

// A corner as [length, k0, k1] pieces: linear ramps in and out (≥ 15 m) around a constant arc.
function corner(side, radius, sweep) {
  const ramp = Math.round(Math.min(60, Math.max(15, radius * 0.3)));
  const hold = Math.max(0, Math.ceil(sweep * radius - ramp));
  const kp = side * sweep / (ramp + hold); // exact sweep; |kp| <= 1/radius
  const p = [[ramp, 0, kp]]; if (hold) p.push([hold, kp, kp]); p.push([ramp, kp, 0]);
  return p;
}
const progLength = (p) => p.reduce((a, [len]) => a + len, 0);
// A program laid from the origin at heading 0 with the stage's integrator: samples and net change.
function integrate(p) {
  const x = [0], z = [0];
  let h = 0, kp = 0;
  for (const [len, k0, k1] of p) for (let q = 1; q <= len; q++) {
    const k = k0 + (k1 - k0) * q / len, hn = h + 0.5 * (kp + k), hm = 0.5 * (h + hn);
    x.push(x[x.length - 1] + Math.sin(hm)); z.push(z[z.length - 1] + Math.cos(hm)); h = hn; kp = k;
  }
  return { x, z, dx: x[x.length - 1], dz: z[z.length - 1], dh: h };
}
// Straight lengths L (start L0) with Σ L_j·u_j = (bx, bz), lo ≤ L ≤ hi, near L0: least-norm
// corrections over the free lengths, clamping any that leave the bounds and re-solving.
function solveStraights(L0, ux, uz, bx, bz, lo, hi) {
  const L = L0.slice(), free = L.map(() => true);
  for (let it = 0; it < L.length; it++) {
    let rx = bx, rz = bz, a = 0, b = 0, c = 0;
    for (let j = 0; j < L.length; j++) {
      rx -= L[j] * ux[j]; rz -= L[j] * uz[j];
      if (free[j]) { a += ux[j] * ux[j]; b += ux[j] * uz[j]; c += uz[j] * uz[j]; }
    }
    if (Math.hypot(rx, rz) < 1e-6) return L;
    const det = a * c - b * b; if (det < 1e-6) return null;
    const lx = (c * rx - b * rz) / det, lz = (a * rz - b * rx) / det;
    let clamped = false;
    for (let j = 0; j < L.length; j++) {
      if (!free[j]) continue;
      const v = L[j] + ux[j] * lx + uz[j] * lz;
      if (v < lo || v > hi) { L[j] = Math.min(hi, Math.max(lo, v)); free[j] = false; clamped = true; } else L[j] = v;
    }
    if (!clamped) return L;
  }
  return null;
}

// Closed Catmull-Rom through unit-scale control points, scaled to about `target` m, relaxed to the
// minimum radius and resampled at exactly 1 m.
function ringLoop(cp, target) {
  let [px, pz] = catmullRomClosed(cp);
  const s = target / polyLength(px, pz, true);
  for (let i = 0; i < px.length; i++) { px[i] *= s; pz[i] *= s; }
  [px, pz] = resampleClosed(px, pz, Math.round(polyLength(px, pz, true)));
  const relaxed = relax(px, pz); if (!relaxed) return null;
  return exactLoop(...relaxed);
}

// Exact 1 m spacing: resample to n points, then scale about the centroid by n / length.
function exactLoop(px, pz) {
  const n = Math.round(polyLength(px, pz, true));
  [px, pz] = resampleClosed(px, pz, n);
  const f = n / polyLength(px, pz, true);
  let cx = 0, cz = 0; for (let i = 0; i < n; i++) { cx += px[i] / n; cz += pz[i] / n; }
  for (let i = 0; i < n; i++) { px[i] = (px[i] - cx) * f; pz[i] = (pz[i] - cz) * f; }
  const [h, k] = headingCurvature(px, pz, true);
  return finish('loop', true, px, pz, h, k);
}

// Centripetal (alpha 0.5) closed Catmull-Rom through unit-scale cp, densely sampled (2000 per unit
// chord, so ~0.2 m apart once scaled to the target length).
function catmullRomClosed(cp) {
  const m = cp.length, px = [], pz = [];
  for (let k = 0; k < m; k++) {
    const P = [cp[(k - 1 + m) % m], cp[k], cp[(k + 1) % m], cp[(k + 2) % m]];
    const t = [0]; for (let j = 1; j < 4; j++) t.push(t[j - 1] + (Math.sqrt(Math.hypot(P[j][0] - P[j - 1][0], P[j][1] - P[j - 1][1])) || 1e-6));
    const steps = Math.max(8, Math.ceil(Math.hypot(P[2][0] - P[1][0], P[2][1] - P[1][1]) * 2000));
    for (let q = 0; q < steps; q++) {
      const u = t[1] + (t[2] - t[1]) * q / steps, p = [0, 1].map((c) => {
        const A1 = lerpT(P[0][c], P[1][c], t[0], t[1], u), A2 = lerpT(P[1][c], P[2][c], t[1], t[2], u);
        const A3 = lerpT(P[2][c], P[3][c], t[2], t[3], u);
        const B1 = lerpT(A1, A2, t[0], t[2], u), B2 = lerpT(A2, A3, t[1], t[3], u);
        return lerpT(B1, B2, t[1], t[2], u);
      });
      px.push(p[0]); pz.push(p[1]);
    }
  }
  return [px, pz];
}
const lerpT = (a, b, t0, t1, u) => a + (b - a) * (u - t0) / (t1 - t0);

function polyLength(px, pz, closed) {
  let L = 0; const n = px.length;
  for (let i = 1; i < n; i++) L += Math.hypot(px[i] - px[i - 1], pz[i] - pz[i - 1]);
  if (closed) L += Math.hypot(px[0] - px[n - 1], pz[0] - pz[n - 1]);
  return L;
}

// count points uniformly spaced by arc length around a closed polyline, starting at its first point.
function resampleClosed(px, pz, count) {
  const n = px.length, total = polyLength(px, pz, true), sp = total / count;
  const ox = new Array(count), oz = new Array(count);
  let seg = 0, segStart = 0, segLen = Math.hypot(px[1 % n] - px[0], pz[1 % n] - pz[0]);
  for (let k = 0; k < count; k++) {
    const s = k * sp;
    while (segStart + segLen < s && seg < n - 1) {
      segStart += segLen; seg++;
      const a = (seg + 1) % n; segLen = Math.hypot(px[a] - px[seg], pz[a] - pz[seg]);
    }
    const a = (seg + 1) % n, t = segLen > 0 ? Math.min(1, (s - segStart) / segLen) : 0;
    ox[k] = px[seg] + (px[a] - px[seg]) * t; oz[k] = pz[seg] + (pz[a] - pz[seg]) * t;
  }
  return [ox, oz];
}

// Heading = direction of the central difference; curvature = turn between the two adjacent
// segments per metre (ds = 1). Closed wraps; open ends use one-sided values.
function headingCurvature(px, pz, closed) {
  const n = px.length, h = new Array(n), k = new Array(n);
  const P = (i) => closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i));
  for (let i = 0; i < n; i++) {
    const a = P(i - 1), c = P(i + 1);
    h[i] = Math.atan2(px[c] - px[a], pz[c] - pz[a]);
    if (!closed && (i === 0 || i === n - 1)) { k[i] = 0; continue; }
    const h0 = Math.atan2(px[i] - px[a], pz[i] - pz[a]), h1 = Math.atan2(px[c] - px[i], pz[c] - pz[i]);
    k[i] = wrapA(h1 - h0);
  }
  return [h, k];
}

// Laplacian-smooth the neighbourhood of every sample tighter than the target radius, re-resample,
// repeat. Aims a little under KMAX so the final rescale/Float32 rounding can't push it over.
// Returns null if it hasn't converged in 80 rounds.
function relax(px, pz) {
  const KT = 1 / 16.5, W = 20;
  for (let it = 0; it < 80; it++) {
    const n = px.length, [, k] = headingCurvature(px, pz, true);
    const mark = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (Math.abs(k[i]) > KT) for (let j = -W; j <= W; j++) mark[(i + j + n) % n] = 1;
    const idx = []; for (let i = 0; i < n; i++) if (mark[i]) idx.push(i);
    if (!idx.length) return [px, pz];
    const tx = new Float64Array(idx.length), tz = new Float64Array(idx.length);
    for (let pass = 0; pass < 24; pass++) { // Jacobi over the marked samples only
      for (let q = 0; q < idx.length; q++) {
        const i = idx[q], a = (i - 1 + n) % n, c = (i + 1) % n;
        tx[q] = 0.5 * px[i] + 0.25 * (px[a] + px[c]); tz[q] = 0.5 * pz[i] + 0.25 * (pz[a] + pz[c]);
      }
      for (let q = 0; q < idx.length; q++) { px[idx[q]] = tx[q]; pz[idx[q]] = tz[q]; }
    }
    [px, pz] = resampleClosed(px, pz, Math.round(polyLength(px, pz, true)));
  }
  return null; // a near-cusp that won't relax quickly: cheaper to draw a fresh ring
}

// --- stage -----------------------------------------------------------------------------------

// The road is integrated from a curvature program at 1 m steps; each piece (straight, or a corner
// with linear ramps in and out) is checked against an occupancy hash as it is laid, and a piece
// that leaves the box or comes within 40 m of earlier road is withdrawn and redrawn.
function stageAttempt(r, tw) {
  const target = tw ? r.range(2600, 4800) : r.range(3000, 5700), half = BOX / 2 - 1;
  const a0 = r.range(0, 2 * Math.PI);
  const X = [450 * Math.sin(a0)], Z = [450 * Math.cos(a0)];
  const H = [wrapA(Math.atan2(-X[0], -Z[0]) + r.range(-0.6, 0.6))], K = [0];
  const cells = new Map(), C = 20, c2 = CLEAR * CLEAR, CR = Math.ceil(CLEAR / C);
  const add = (i) => {
    const k = cellKey(Math.floor(X[i] / C), Math.floor(Z[i] / C));
    const l = cells.get(k); l ? l.push(i) : cells.set(k, [i]);
  };
  const free = (i) => {
    if (Math.abs(X[i]) > half || Math.abs(Z[i]) > half) return false;
    const cx = Math.floor(X[i] / C), cz = Math.floor(Z[i] / C);
    for (let a = -CR; a <= CR; a++) for (let b = -CR; b <= CR; b++) {
      const l = cells.get(cellKey(cx + a, cz + b)); if (!l) continue;
      for (let q = 0; q < l.length; q++) {
        const j = l[q]; if (i - j <= SEP) continue;
        const dx = X[i] - X[j], dz = Z[i] - Z[j];
        if (dx * dx + dz * dz < c2) return false;
      }
    }
    return true;
  };
  add(0);
  // Lay a program of [length, k0, k1] linear-curvature segments; roll back on failure.
  const lay = (prog) => {
    const start = X.length;
    for (const [len, k0, k1] of prog) {
      for (let q = 1; q <= len; q++) {
        const i = X.length, k = k0 + (k1 - k0) * q / len, hp = H[i - 1];
        const hn = hp + 0.5 * (K[i - 1] + k), hm = 0.5 * (hp + hn);
        X.push(X[i - 1] + Math.sin(hm)); Z.push(Z[i - 1] + Math.cos(hm)); H.push(hn); K.push(k);
        if (!free(i)) { unlay(start); return false; }
        add(i);
      }
    }
    return true;
  };
  const unlay = (start) => {
    for (let i = X.length - 1; i >= start; i--) {
      const l = cells.get(cellKey(Math.floor(X[i] / C), Math.floor(Z[i] / C)));
      if (l && l[l.length - 1] === i) l.pop();
    }
    X.length = Z.length = H.length = K.length = start;
  };
  const straight = (len) => [[Math.round(len), 0, 0]];
  const sides = [];
  const pickSide = () => {
    const i = X.length - 1, toC = wrapA(Math.atan2(-X[i], -Z[i]) - H[i]);
    if (Math.hypot(X[i], Z[i]) > 400 && Math.abs(toC) > Math.PI / 3 && r.next() < 0.8) return Math.sign(toC);
    const n = sides.length, run = n >= 2 && sides[n - 1] === sides[n - 2];
    if (run) return r.next() < 0.8 ? -sides[n - 1] : sides[n - 1];
    return r.next() < 0.5 ? 1 : -1;
  };
  // Twisty: mostly 15–60 m corners up to 180°, now and then a faster one, and one corner in six
  // is a switchback climb: 2–4 alternating hairpins on 35–70 m straights. Returns [program, last side].
  const twistyCorner = (side) => {
    if (r.next() < 1 / 6) {
      const n = r.int(2, 4), p = [];
      for (let k = 0; k < n; k++) {
        if (k) p.push([Math.round(r.range(35, 70)), 0, 0]);
        const R = r.range(17, 28);
        p.push(...corner(k % 2 ? -side : side, R, r.range(150, hairpinMax(R) / DEG) * DEG));
      }
      return [p, (n - 1) % 2 ? -side : side];
    }
    const fast = r.next() < 0.2;
    return [corner(side, fast ? r.range(60, 150) : r.range(15, 60), (fast ? r.range(30, 120) : r.range(30, 180)) * DEG), side];
  };
  // Dead end (12 draws fail) => withdraw the previous piece too and redraw it. A small budget
  // fails hopeless attempts fast; a fresh fork is cheaper than digging out of a packed box.
  let isCorner = false, backtracks = 0;
  const pieces = []; // start index of each laid piece
  while (X.length - 1 < target) {
    const remain = target - (X.length - 1), start = X.length;
    let ok = false;
    for (let t = 0; t < 12 && !ok; t++) {
      if (isCorner) {
        const side = pickSide(), [p, last] = tw ? twistyCorner(side) : [corner(side, r.range(15, 300), r.range(20, 170) * Math.PI / 180), side];
        ok = lay(p); if (ok) sides.push(last);
      } else {
        const sMax = tw ? 120 : 250;
        ok = lay(straight(remain < 300 ? Math.min(sMax, Math.max(40, remain)) : tw ? r.range(25, 120) : r.range(40, 250)));
      }
    }
    if (ok) { pieces.push(start); isCorner = !isCorner; continue; }
    if (!pieces.length || ++backtracks > 12) return null;
    unlay(pieces.pop()); isCorner = !isCorner;
    if (isCorner) sides.pop();
  }
  if (isCorner === false) lay(straight(r.range(40, 80))); // last piece was a corner: run out straight
  const nMax = (tw ? LENGTHS.twisty : LENGTHS.flowing).stage[1] + 1;
  if (X.length > nMax) unlay(nMax);
  return finish('stage', false, X, Z, H.map(wrapA), K);
}
