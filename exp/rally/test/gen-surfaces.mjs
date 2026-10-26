// Surface sections and roadside placement (spec tracks T-5, T-6). Run: node test/gen-surfaces.mjs [filter]
import { rng } from '../src/gen/rng.js';
import { generateSurfaces, roadSurfaceAt, TRANSITIONS, VERGE } from '../src/gen/surfaces.js';
import { placeRoadside } from '../src/gen/roadside.js';

const only = process.argv[2];
const results = [];
function check(name, val, lo, hi, unit = '') {
  const ok = val >= lo && val <= hi;
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${Number(val).toFixed(3)}${unit}  [${lo}..${hi}]`);
  return ok;
}
const test = (name, f) => { if (!only || name.includes(only)) { console.log(`\n# ${name}`); f(); } };

// Synthetic layout from a curvature function, integrated at ds = 1 (heading 0 = +z, + = left).
function mkLayout(kind, n, kappa, closed = kind === 'loop') {
  const x = new Float32Array(n), z = new Float32Array(n), heading = new Float32Array(n), curvature = new Float32Array(n);
  let px = 0, pz = 0, h = 0;
  for (let i = 0; i < n; i++) {
    const k = kappa(i);
    x[i] = px; z[i] = pz; heading[i] = h; curvature[i] = k;
    px += Math.sin(h + k / 2); pz += Math.cos(h + k / 2); h += k; // midpoint: samples lie on the arc
  }
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < n; i++) {
    minX = Math.min(minX, x[i]); maxX = Math.max(maxX, x[i]); minZ = Math.min(minZ, z[i]); maxZ = Math.max(maxZ, z[i]);
  }
  return { kind, closed, ds: 1, n, x, z, heading, curvature, length: closed ? n : n - 1, bounds: { minX, maxX, minZ, maxZ } };
}
const straight = (len = 2000) => mkLayout('stage', len + 1, () => 0);
const circle = (R = 400) => mkLayout('loop', Math.round(2 * Math.PI * R), () => 1 / R);
// S-bend: 200 straight, left R60 for 90°, 100 straight, right R25 for 120°, 200 straight.
const SB = { a0: 200, a1: 200 + Math.round(60 * Math.PI / 2), b0: 0, b1: 0 };
SB.b0 = SB.a1 + 100; SB.b1 = SB.b0 + Math.round(25 * 2 * Math.PI / 3);
const sbend = () => mkLayout('stage', SB.b1 + 201, (i) => (i >= SB.a0 && i < SB.a1 ? 1 / 60 : i >= SB.b0 && i < SB.b1 ? -1 / 25 : 0));
// Section generation only looks at length / closed: cheap fakes for many lengths.
const fake = (kind, length) => ({ kind, closed: kind === 'loop', ds: 1, n: kind === 'loop' ? length : length + 1, length });

const THEME_ROADS = { summer: ['gravel', 'hardpack', 'tarmac'], winter: ['packed', 'ice', 'gravel'] };
const allowed = (theme, a, b) => (TRANSITIONS[theme][a] || {})[b] > 0;

// ---------------------------------------------------------------- surfaces
test('surfaces determinism', () => {
  for (const theme of ['summer', 'winter']) {
    const a = JSON.stringify(generateSurfaces(circle(), rng('det').fork('s'), { theme }));
    const b = JSON.stringify(generateSurfaces(circle(), rng('det').fork('s'), { theme }));
    check(`${theme}: same seed identical`, a === b ? 1 : 0, 1, 1);
    const c = JSON.stringify(generateSurfaces(circle(), rng('other').fork('s'), { theme }));
    check(`${theme}: other seed differs`, a !== c ? 1 : 0, 1, 1);
  }
});

test('surfaces tiling, lengths and transitions', () => {
  for (const theme of ['summer', 'winter']) {
    const bad = { tile: 0, len: 0, last: 0, key: 0, verge: 0, trans: 0, close: 0, ice: 0, gravel: 0 };
    let runs = 0, worstGravel = 0, longestIce = 0, sections = 0;
    const used = new Set();
    for (const [kind, lens] of [['loop', [1500, 1800, 2200, 2513, 3000]], ['stage', [2000, 3000, 4100, 5000, 6000]]]) {
      for (const L of lens) {
        for (let seed = 0; seed < 60; seed++) {
          const lay = fake(kind, L);
          const S = generateSurfaces(lay, rng(seed).fork('surfaces'), { theme });
          const sec = S.sections;
          runs++; sections += sec.length;
          if (S.theme !== theme) bad.key++;
          if (sec[0].s0 !== 0 || Math.abs(sec[sec.length - 1].s1 - L) > 1e-9) bad.tile++;
          let gravel = 0;
          sec.forEach((q, i) => {
            const len = q.s1 - q.s0;
            if (i > 0 && q.s0 !== sec[i - 1].s1) bad.tile++;
            if (i < sec.length - 1 ? len < 200 - 1e-9 || len > 700 + 1e-9 : len < 100 - 1e-9 || len > 700 + 1e-9) {
              if (i === sec.length - 1) bad.last++; else bad.len++;
            }
            if (!THEME_ROADS[theme].includes(q.road)) bad.key++;
            used.add(q.road);
            if (q.verge !== (theme === 'summer' ? 'grass' : 'snowbank')) bad.verge++;
            if (i > 0 && !allowed(theme, sec[i - 1].road, q.road)) bad.trans++;
            if (q.road === 'ice') { longestIce = Math.max(longestIce, len); if (len > 400 + 1e-9) bad.ice++; }
            if (q.road === 'gravel') gravel += len;
          });
          if (lay.closed && !allowed(theme, sec[sec.length - 1].road, sec[0].road)) bad.close++;
          if (theme === 'winter') { worstGravel = Math.max(worstGravel, gravel / L); if (gravel > 0.15 * L + 1e-9) bad.gravel++; }
        }
      }
    }
    check(`${theme}: tiling gaps/overlaps (${runs} runs, ${sections} sections)`, bad.tile, 0, 0);
    check(`${theme}: sections outside 200–700 m`, bad.len, 0, 0);
    check(`${theme}: last section outside 100–700 m`, bad.last, 0, 0);
    check(`${theme}: non-theme road keys`, bad.key, 0, 0);
    check(`${theme}: wrong verge`, bad.verge, 0, 0);
    check(`${theme}: disallowed transitions`, bad.trans, 0, 0);
    check(`${theme}: loop closure disallowed`, bad.close, 0, 0);
    check(`${theme}: every theme road surface appears`, used.size, 3, 3);
    if (theme === 'winter') {
      check('winter: ice sections > 400 m', bad.ice, 0, 0);
      check('winter: longest ice (m)', longestIce, 200, 400);
      check('winter: runs with gravel > 15 %', bad.gravel, 0, 0);
      check('winter: worst gravel share', worstGravel, 0, 0.15);
    }
  }
  check('summer: gravel–gravel not allowed', allowed('summer', 'gravel', 'gravel') ? 1 : 0, 0, 0);
  check('summer: gravel–tarmac not allowed', allowed('summer', 'gravel', 'tarmac') ? 1 : 0, 0, 0);
  check('winter: ice–gravel not allowed', allowed('winter', 'ice', 'gravel') ? 1 : 0, 0, 0);
  check('verge table', VERGE.summer === 'grass' && VERGE.winter === 'snowbank' ? 1 : 0, 1, 1);
});

test('roadSurfaceAt blends', () => {
  for (const lay of [straight(3000), circle()]) {
    const S = generateSurfaces(lay, rng('blend').fork('surfaces'), { theme: 'summer' });
    const sec = S.sections, a = sec[0], b = sec[1];
    const mid = roadSurfaceAt(S, (a.s0 + a.s1) / 2);
    check(`${lay.kind}: mid-section road`, mid.road === a.road && mid.verge === a.verge ? 1 : 0, 1, 1);
    check(`${lay.kind}: mid-section t`, mid.t, 0, 0);
    check(`${lay.kind}: t at s1 − 10`, roadSurfaceAt(S, a.s1 - 10).t, 0, 1e-6);
    check(`${lay.kind}: t at s1 − 5`, roadSurfaceAt(S, a.s1 - 5).t, 0.499, 0.501);
    const late = roadSurfaceAt(S, a.s1 - 0.01);
    check(`${lay.kind}: t at s1 − 0.01`, late.t, 0.998, 1);
    check(`${lay.kind}: next is the following section`, late.road === a.road && late.next && late.next.road === b.road ? 1 : 0, 1, 1);
    const at = roadSurfaceAt(S, a.s1);
    check(`${lay.kind}: at s1 we are in the next section`, at.road === b.road && at.t === 0 ? 1 : 0, 1, 1);
    // monotone ramp
    let mono = 1, prev = -1;
    for (let s = a.s1 - 10; s < a.s1; s += 0.25) { const t = roadSurfaceAt(S, s).t; if (t < prev) mono = 0; prev = t; }
    check(`${lay.kind}: ramp monotone`, mono, 1, 1);
    const z = sec[sec.length - 1];
    const end = roadSurfaceAt(S, z.s1 - 2);
    if (lay.closed) {
      check('loop: last section blends into the first', end.next && end.next.road === sec[0].road ? end.t : -1, 0.79, 0.81);
      check('loop: s wraps', roadSurfaceAt(S, lay.length + 5).road === roadSurfaceAt(S, 5).road ? 1 : 0, 1, 1);
      check('loop: negative s wraps', roadSurfaceAt(S, -3).road === z.road ? 1 : 0, 1, 1);
    } else {
      check('stage: last section has no blend', end.t, 0, 0);
      check('stage: s beyond the end clamps', roadSurfaceAt(S, lay.length + 50).road === z.road ? 1 : 0, 1, 1);
    }
  }
});

// ---------------------------------------------------------------- roadside
const nearest = (lay, x, z) => {
  let bi = 0, bd = Infinity;
  for (let i = 0; i < lay.n; i++) { const d = (lay.x[i] - x) ** 2 + (lay.z[i] - z) ** 2; if (d < bd) { bd = d; bi = i; } }
  return bi;
};
const lateral = (lay, i, x, z) => (x - lay.x[i]) * Math.cos(lay.heading[i]) - (z - lay.z[i]) * Math.sin(lay.heading[i]);
const angDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

// Common marker checks; returns markers annotated with s (nearest sample) and d.
function markerChecks(label, lay, rs, heightFn) {
  let offBad = 0, yawBad = 0, yBad = 0, worstOff = 0;
  const ms = rs.markers.map((m) => {
    const i = nearest(lay, m.x, m.z), d = lateral(lay, i, m.x, m.z);
    const off = Math.abs(d - m.side * 4.5);
    worstOff = Math.max(worstOff, off);
    if (off > 0.05) offBad++;
    if (angDiff(m.yaw, lay.heading[i]) > 1e-3) yawBad++;
    if (Math.abs(m.y - heightFn(m.x, m.z)) > 1e-4) yBad++;
    return { ...m, s: i * lay.ds, d };
  });
  check(`${label}: markers not 4.5 m out on their side`, offBad, 0, 0);
  check(`${label}: worst lateral error (m)`, worstOff, 0, 0.05);
  check(`${label}: marker yaw ≠ road heading`, yawBad, 0, 0);
  check(`${label}: marker y ≠ heightFn`, yBad, 0, 0);
  return ms;
}
const gaps = (ms, side) => { const s = ms.filter((m) => m.side === side).map((m) => m.s).sort((a, b) => a - b); return s.slice(1).map((v, i) => v - s[i]); };

test('roadside determinism', () => {
  const lay = sbend(), f = [{ type: 'kicker', s0: 100, s1: 150 }];
  const a = JSON.stringify(placeRoadside(lay, () => 0, f, rng('rs').fork('roadside')));
  const b = JSON.stringify(placeRoadside(lay, () => 0, f, rng('rs').fork('roadside')));
  check('same seed identical', a === b ? 1 : 0, 1, 1);
});

test('roadside on a 2 km straight stage', () => {
  const lay = straight(2000);
  const features = [{ type: 'kicker', s0: 500, s1: 560 }, { type: 'crest', s0: 1000, s1: 1040 }, { type: 'tabletop', s0: 1400, s1: 1450 }];
  const hf = (x, z) => 2 + 0.01 * x + 0.02 * z;
  const rs = placeRoadside(lay, hf, features, rng('st').fork('roadside'));
  const ms = markerChecks('straight', lay, rs, hf);
  for (const side of [-1, 1]) {
    const n = ms.filter((m) => m.side === side).length;
    check(`side ${side} marker count`, n, 74, 78);
    const g = gaps(ms, side).filter((v) => v < 30);
    check(`side ${side} spacing min (m)`, Math.min(...g), 25, 25);
    check(`side ${side} spacing max (m)`, Math.max(...g), 25, 25);
  }
  const inJump = ms.filter((m) => features.some((f) => f.type !== 'crest' && m.s >= f.s0 && m.s <= f.s1)).length;
  check('markers inside kicker/tabletop', inJump, 0, 0);
  check('markers along the crest', ms.filter((m) => m.s >= 1000 && m.s <= 1040).length, 2, 6);
  check('gate count', rs.gates.length, 2, 2);
  const start = rs.gates.find((g) => g.kind === 'start'), fin = rs.gates.find((g) => g.kind === 'finish');
  check('start gate s', start.s, 40, 40);
  check('start gate z (on centreline)', start.z, 39.9, 40.1);
  check('start gate y', start.y, hf(start.x, start.z) - 1e-4, hf(start.x, start.z) + 1e-4);
  check('finish gate s', fin.s, 1960, 1960);
  check('finish gate yaw', fin.yaw, 0, 0);
  const cs = rs.checkpoints.map((c) => c.s);
  check('checkpoint count', cs.length, 7, 7);
  check('first checkpoint s', cs[0], 290, 290);
  check('checkpoint spacing', Math.max(...cs.slice(1).map((v, i) => Math.abs(v - cs[i] - 250))), 0, 1e-9);
  check('last checkpoint before finish', cs[cs.length - 1], 0, 1960 - 50);
});

test('roadside on a 400 m circle loop', () => {
  const lay = circle(400);
  const rs = placeRoadside(lay, () => 0, [], rng('loop').fork('roadside'));
  const ms = markerChecks('circle', lay, rs, () => 0);
  for (const side of [-1, 1]) {
    const n = ms.filter((m) => m.side === side).length;
    check(`side ${side} marker count (R400: 25 m both sides)`, n, Math.floor(lay.length / 25) - 1, Math.ceil(lay.length / 25));
    const g = gaps(ms, side);
    check(`side ${side} spacing max (m)`, Math.max(...g), 25, 25);
  }
  // left turn (κ > 0): the left markers are inside the circle
  const cx = 400, cz = 0; // centre of a left circle starting at the origin heading +z
  const rIn = Math.max(...ms.filter((m) => m.side === 1).map((m) => Math.hypot(m.x - cx, m.z - cz)));
  const rOut = Math.min(...ms.filter((m) => m.side === -1).map((m) => Math.hypot(m.x - cx, m.z - cz)));
  check('left markers inside (radius)', rIn, 395.4, 395.6);
  check('right markers outside (radius)', rOut, 404.4, 404.6);
  check('one gate', rs.gates.length, 1, 1);
  check('gate is start at s=40', rs.gates[0].kind === 'start' ? rs.gates[0].s : -1, 40, 40);
  const cs = rs.checkpoints.map((c) => c.s);
  check('loop checkpoints', cs.length, 9, 9);
  check('loop checkpoints within [0, length)', cs.every((s) => s >= 0 && s < lay.length) ? 1 : 0, 1, 1);
});

test('roadside on an S-bend', () => {
  const lay = sbend();
  const rs = placeRoadside(lay, () => 0, [], rng('sb').fork('roadside'));
  const ms = markerChecks('sbend', lay, rs, () => 0);
  const inRange = (side, a, b) => ms.filter((m) => m.side === side && m.s >= a && m.s < b);
  const gapsIn = (side, a, b) => { const s = inRange(side, a, b).map((m) => m.s).sort((p, q) => p - q); return s.slice(1).map((v, i) => v - s[i]); };
  // left R60 corner: outside = right (-1) gets 12 m, inside (left) 25 m
  check('R60 left: outside (right) count', inRange(-1, SB.a0, SB.a1).length, 7, 9);
  check('R60 left: outside spacing max', Math.max(...gapsIn(-1, SB.a0, SB.a1)), 12, 12);
  check('R60 left: inside (left) count', inRange(1, SB.a0, SB.a1).length, 3, 5);
  // right R25 corner: outside = left (+1)
  check('R25 right: outside (left) count', inRange(1, SB.b0, SB.b1).length, 4, 5);
  check('R25 right: outside spacing max', Math.max(...gapsIn(1, SB.b0, SB.b1)), 12, 12);
  check('R25 right: inside (right) count', inRange(-1, SB.b0, SB.b1).length, 1, 3);
  check('straights keep 25 m', Math.min(...gapsIn(1, 0, SB.a0 - 1)), 25, 25);
  // geometry: outside markers of the left bend sit further from its centre than the inside ones
  const i0 = SB.a0, cx = lay.x[i0] + 60 * Math.cos(lay.heading[i0]), cz = lay.z[i0] - 60 * Math.sin(lay.heading[i0]);
  const rOut = inRange(-1, SB.a0, SB.a1).map((m) => Math.hypot(m.x - cx, m.z - cz));
  const rIn = inRange(1, SB.a0, SB.a1).map((m) => Math.hypot(m.x - cx, m.z - cz));
  check('R60 outside markers radius', Math.min(...rOut), 64.4, 64.6);
  check('R60 inside markers radius', Math.max(...rIn), 55.4, 55.6);
  check('stage gates', rs.gates.length, 2, 2);
  console.log(`  sbend: ${rs.markers.length} markers, ${rs.checkpoints.length} checkpoints, length ${lay.length} m`);
});

const fails = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - fails}/${results.length} passed`);
process.exit(fails ? 1 : 0);
