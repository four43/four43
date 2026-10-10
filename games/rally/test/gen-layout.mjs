// Layout generator + locator (spec tracks T-2, T-7). Run: node test/gen-layout.mjs [filter]
import { rng } from '../src/gen/rng.js';
import { generateLayout, LENGTHS } from '../src/gen/trackgen.js';
import { makeLocator } from '../src/gen/locate.js';
import { placeFeatures } from '../src/gen/features.js';

const only = process.argv[2];
const results = [];
function check(name, val, lo, hi, unit = '') {
  const ok = val >= lo && val <= hi;
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}: ${Number(val).toFixed(4)}${unit}  [${lo}..${hi}]`);
  return ok;
}
const test = (name, f) => { if (!only || name.includes(only)) { console.log(`\n# ${name}`); f(); } };
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// Left normal for heading h is (cos h, -sin h) in (x, z): direction is (sin h, cos h) and
// d/dh (sin h, cos h) = (cos h, -sin h), i.e. where + curvature (h increasing) bends.
// Numeric check: h = 0 (travel +z) -> (1, 0) = +x, which the spec names as the left turn.
const leftN = (h) => [Math.cos(h), -Math.sin(h)];
test('convention', () => {
  const [nx, nz] = leftN(0);
  check('left normal at heading 0 is +x', nx - Math.abs(nz), 1, 1);
});

// All-pairs clearance via a 16 m hash: samples > 120 m apart along the road stay >= 40 m apart.
function minClearance(L) {
  const C = 16, cells = new Map(), key = (cx, cz) => cx * 73856093 ^ cz * 19349663;
  for (let i = 0; i < L.n; i++) {
    const k = key(Math.floor(L.x[i] / C), Math.floor(L.z[i] / C));
    (cells.get(k) || cells.set(k, []).get(k)).push(i);
  }
  let worst = Infinity;
  for (let i = 0; i < L.n; i++) {
    const cx = Math.floor(L.x[i] / C), cz = Math.floor(L.z[i] / C);
    for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) {
      const list = cells.get(key(cx + a, cz + b)); if (!list) continue;
      for (const j of list) {
        let sep = Math.abs(i - j) * L.ds;
        if (L.closed) sep = Math.min(sep, L.length - sep);
        if (sep <= 120) continue;
        worst = Math.min(worst, Math.hypot(L.x[i] - L.x[j], L.z[i] - L.z[j]));
      }
    }
  }
  return worst;
}

// Hairpins: maximal same-sign runs of |κ| > 1/60 whose tightest radius is < 30 m and whose
// sweep (Σκ over the run) is >= 120°. Loops start counting at a sample outside any corner.
function hairpins(L) {
  const K = L.curvature, n = L.n, at = (q) => K[(st + q) % n];
  let st = 0, count = 0;
  if (L.closed) while (st < n && Math.abs(K[st]) > 1 / 60) st++;
  for (let q = 0; q < n;) {
    if (Math.abs(at(q)) <= 1 / 60) { q++; continue; }
    const sg = Math.sign(at(q));
    let sweep = 0, kmax = 0;
    for (; q < n && Math.abs(at(q)) > 1 / 60 && Math.sign(at(q)) === sg; q++) { sweep += at(q); kmax = Math.max(kmax, Math.abs(at(q))); }
    if (kmax > 1 / 30 && Math.abs(sweep) >= 120 * Math.PI / 180) count++;
  }
  return count;
}
const turnPerKm = (L) => { let t = 0; for (let i = 0; i < L.n; i++) t += Math.abs(L.curvature[i]); return t * 180 / Math.PI / L.length * 1000; };

const seeds = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const STYLES = ['flowing', 'twisty'];
const stats = {};
for (const style of STYLES) for (const kind of ['loop', 'stage']) {
  stats[`${style} ${kind}`] = [];
  for (const seed of seeds) {
    test(`${style} ${kind} ${seed}`, () => {
      const t0 = performance.now();
      const L = generateLayout(rng(seed), { kind, style });
      const ms = performance.now() - t0;
      const L2 = generateLayout(rng(seed), { kind, style });
      let same = L.n === L2.n;
      for (let i = 0; same && i < L.n; i++) {
        same = L.x[i] === L2.x[i] && L.z[i] === L2.z[i] && L.heading[i] === L2.heading[i] && L.curvature[i] === L2.curvature[i];
      }
      check('deterministic', same ? 1 : 0, 1, 1);
      check('style', L.style === style ? 1 : 0, 1, 1);
      check('generation time', ms, 0, 50, ' ms');
      check('closed flag', L.closed === (kind === 'loop') ? 1 : 0, 1, 1);
      check('ds', L.ds, 1, 1);
      check('length = n·ds (stage: (n-1)·ds)', L.length - (L.closed ? L.n : L.n - 1) * L.ds, -1e-6, 1e-6);
      check('length (m)', L.length, ...LENGTHS[style][kind]);
      let kmax = 0; for (let i = 0; i < L.n; i++) kmax = Math.max(kmax, Math.abs(L.curvature[i]));
      check('max |curvature| (1/m)', kmax, 0, 1 / 15);
      const b = L.bounds;
      let bx0 = Infinity, bx1 = -Infinity, bz0 = Infinity, bz1 = -Infinity;
      for (let i = 0; i < L.n; i++) {
        bx0 = Math.min(bx0, L.x[i]); bx1 = Math.max(bx1, L.x[i]); bz0 = Math.min(bz0, L.z[i]); bz1 = Math.max(bz1, L.z[i]);
      }
      check('bounds match samples', Math.max(Math.abs(b.minX - bx0), Math.abs(b.maxX - bx1), Math.abs(b.minZ - bz0), Math.abs(b.maxZ - bz1)), 0, 1e-3);
      check('fits 1400 m square', Math.max(b.maxX - b.minX, b.maxZ - b.minZ), 0, 1400, ' m');
      check('min clearance (>120 m along)', minClearance(L), 40, Infinity, ' m');

      // Spacing, heading and curvature against finite differences.
      const N = L.n, idx = (i) => (i + N) % N;
      let gapErr = 0, hErr = 0, kErr = 0;
      for (let i = 0; i < N; i++) {
        if (!L.closed && i === N - 1) break;
        const j = idx(i + 1);
        gapErr = Math.max(gapErr, Math.abs(Math.hypot(L.x[j] - L.x[i], L.z[j] - L.z[i]) - L.ds));
      }
      for (let i = 1; i < N - 1 || (L.closed && i < N + 1); i++) {
        const a = idx(i - 1), c = idx(i), e = idx(i + 1);
        const hFd = Math.atan2(L.x[e] - L.x[a], L.z[e] - L.z[a]);
        hErr = Math.max(hErr, Math.abs(wrapA(hFd - L.heading[c])));
        const h0 = Math.atan2(L.x[c] - L.x[a], L.z[c] - L.z[a]), h1 = Math.atan2(L.x[e] - L.x[c], L.z[e] - L.z[c]);
        kErr = Math.max(kErr, Math.abs(wrapA(h1 - h0) / L.ds - L.curvature[c]));
        if (i >= N) break;
      }
      check('sample spacing error (m)', gapErr, 0, 0.02);
      check('heading vs finite diff (rad)', hErr, 0, 0.01);
      check('curvature vs finite diff (1/m)', kErr, 0, 0.003);
      if (L.closed) {
        check('closure gap last->first (m)', Math.hypot(L.x[0] - L.x[N - 1], L.z[0] - L.z[N - 1]), L.ds - 0.02, L.ds + 0.02);
        check('closure heading jump (rad)', Math.abs(wrapA(L.heading[0] - L.heading[N - 1])), 0, 0.1);
      }

      // Locator: points within 6 m of the road, built from sample headings (independent of the
      // locator's segment projection).
      const loc = makeLocator(L), q = rng(`loc:${seed}:${kind}`);
      let sErr = 0, dErr = 0, sRange = 1;
      const lt0 = performance.now();
      for (let k = 0; k < 2000; k++) {
        const i = q.int(0, N - 1), d = q.range(-6, 6), [nx, nz] = leftN(L.heading[i]);
        const r = loc.locate(L.x[i] + d * nx, L.z[i] + d * nz);
        let ds = r.s - i * L.ds;
        if (L.closed) { ds = ((ds % L.length) + 1.5 * L.length) % L.length - 0.5 * L.length; if (!(r.s >= 0 && r.s < L.length)) sRange = 0; }
        sErr = Math.max(sErr, Math.abs(ds)); dErr = Math.max(dErr, Math.abs(r.d - d));
      }
      const lms = performance.now() - lt0;
      check('locate s error (m)', sErr, 0, 0.5);
      check('locate d error (m)', dErr, 0, 0.05);
      if (L.closed) check('locate s in [0, length)', sRange, 1, 1);
      if (L.closed) { // wrap: a point just behind the start reports s near length
        const [nx, nz] = leftN(L.heading[N - 1]);
        const r = loc.locate(L.x[N - 1] + 0.3 * Math.sin(L.heading[N - 1]) + 2 * nx, L.z[N - 1] + 0.3 * Math.cos(L.heading[N - 1]) + 2 * nz);
        check('locate wraps near the line (s)', r.s, L.length - 1, L.length);
      }
      // Far away still answers (ring growth) with a sensible nearest sample.
      const far = loc.locate(L.bounds.maxX + 300, L.bounds.maxZ + 300);
      check('far query returns a sample', Number.isInteger(far.i) && far.i >= 0 && far.i < N ? 1 : 0, 1, 1);
      check('locate 2000 queries (ms)', lms, 0, 50, ' ms');
      stats[`${style} ${kind}`].push({ seed, ms, length: L.length, minR: 1 / kmax, hpKm: hairpins(L) / L.length * 1000, turnKm: turnPerKm(L) });
    });
  }
}

// Style: the default is twisty; a twisty layout differs from a flowing one from the same rng.
test('style default and difference', () => {
  const d = generateLayout(rng('a'), { kind: 'loop' }), f = generateLayout(rng('a'), { kind: 'loop', style: 'flowing' });
  check('default style is twisty', d.style === 'twisty' ? 1 : 0, 1, 1);
  check('twisty != flowing (same rng)', d.n !== f.n || d.x[100] !== f.x[100] ? 1 : 0, 1, 1);
  let threw = 0; try { generateLayout(rng('a'), { style: 'wiggly' }); } catch { threw = 1; }
  check('unknown style throws', threw, 1, 1);
});

// Twistiness over the seeds: hairpins per km and total |heading change| per km, twisty vs flowing.
const avg = (a, k) => a.reduce((t, s) => t + s[k], 0) / a.length;
for (const kind of ['loop', 'stage']) {
  const f = stats[`flowing ${kind}`], t = stats[`twisty ${kind}`];
  if (!f.length || !t.length) continue;
  test(`twistiness ${kind}`, () => {
    const fh = avg(f, 'hpKm'), th = avg(t, 'hpKm'), ft = avg(f, 'turnKm'), tt = avg(t, 'turnKm');
    console.log(`  flowing: ${fh.toFixed(2)} hairpins/km, ${ft.toFixed(0)}°/km; twisty: ${th.toFixed(2)} hairpins/km, ${tt.toFixed(0)}°/km`);
    check('flowing hairpins/km (avg)', fh, 0, 0.5);
    check('twisty hairpins/km (avg)', th, kind === 'loop' ? 3 : 1.5, Infinity);
    if (kind === 'loop') check('twisty hairpins/km (each seed)', Math.min(...t.map((s) => s.hpKm)), 2, Infinity);
    check('twisty / flowing |heading change| per km', tt / ft, 2, Infinity);
  });
}

// Obstacles on twisty layouts (spec T-4): 40 m run-up and 30 m run-out at |κ| <= 1/60, kickers
// and crests at |κ| <= 1/120 from the run-up to their end; enough of them per km.
test('twisty obstacles', () => {
  const per = {};
  for (const style of STYLES) for (const kind of ['loop', 'stage']) {
    let n = 0, km = 0, bad = 0, badLaunch = 0;
    for (const seed of seeds) {
      const L = generateLayout(rng(seed), { kind, style }), fs = placeFeatures(L, rng(seed).fork('features'), { density: 'mild' });
      const kAt = (s) => Math.abs(L.curvature[L.closed ? ((Math.round(s) % L.n) + L.n) % L.n : Math.max(0, Math.min(L.n - 1, Math.round(s)))]);
      for (const f of fs) {
        if (f.type === 'berm') continue;
        n++;
        if (style !== 'twisty') continue;
        for (let s = f.s0 - 40; s <= f.s1 + 30; s++) if (kAt(s) > 1 / 60 + 1e-6) { bad++; break; }
        if (f.type === 'kicker' || f.type === 'crest') for (let s = f.s0 - 40; s <= f.s1; s++) if (kAt(s) > 1 / 120 + 1e-6) { badLaunch++; break; }
      }
      km += L.length / 1000;
    }
    per[`${style} ${kind}`] = n / km;
    if (style === 'twisty') {
      check(`twisty ${kind}: obstacles with a curvy run-up/out (1/60 over [s0-40, s1+30])`, bad, 0, 0);
      check(`twisty ${kind}: kickers/crests on a bend (1/120 over [s0-40, s1])`, badLaunch, 0, 0);
    }
  }
  console.log('  obstacles/km (mild): ' + Object.entries(per).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(', '));
  check('twisty loop obstacles/km (mild)', per['twisty loop'], 2, Infinity);
  check('twisty stage obstacles/km (mild)', per['twisty stage'], 2, Infinity);
});

for (const [k, a] of Object.entries(stats)) {
  if (!a.length) continue;
  console.log(`\n${k}: ` + a.map((s) => `${s.seed} ${s.length.toFixed(0)} m, Rmin ${s.minR.toFixed(1)} m, ${s.hpKm.toFixed(1)} hp/km, ${s.ms.toFixed(1)} ms`).join(' | '));
}
const fails = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - fails}/${results.length} passed`);
process.exit(fails ? 1 : 0);
