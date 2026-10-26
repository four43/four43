// R11: road bumps. Small, rideable, varied, sized for the 1 m heightfield, calmer on tarmac, ridge sets inside the whoops
// stretches, faded out at the shoulder, and stamped into the heightfield the wheels ride.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateTrack } from '../src/gen/track.js';
import { BUMPS, bumpsAt } from '../src/gen/bumps.js';
import { heightAt } from '../src/gen/terrain.js';
import { edgeAt } from '../src/gen/edges.js';
import { roadSurfaceAt } from '../src/gen/surfaces.js';

const tracks = ['b1', 'b2', 'b3', 'b4'].flatMap(seed => ['mild', 'wild'].map(obstacles => generateTrack(seed, { kind: 'loop', obstacles })));
const each = (b, f) => { for (let i = 0; i < b.n; i++) f(i); };

test('bumps: sorted, capped, every narrow axis ≥ 0.9 m, same seed same bumps', () => {
  for (const t of tracks) {
    const b = t.bumps, wild = t.obstacles === 'wild';
    assert.ok(b.n > 100, `${b.n} bumps on ${t.seed} ${t.obstacles}`);
    each(b, i => {
      if (i) assert.ok(b.s[i] >= b.s[i - 1]);
      assert.ok(b.lv[i] >= 0.9 - 1e-6 && b.lu[i] >= 0.9 - 1e-6, 'narrow axis representable at 1 m');
      assert.ok(b.h[i] > 0 && b.h[i] <= (wild ? BUMPS.ridges.maxH : BUMPS.ridges.height[1]) + 1e-6, `height ${b.h[i]}`);
    });
  }
  const again = generateTrack('b1', { kind: 'loop' });
  assert.deepEqual([...again.bumps.h], [...tracks[0].bumps.h]);
});

test('bumps: varied sizes, elongations and angles; rideable slopes', () => {
  const b = tracks[0].bumps, lu = [...b.lu], asp = [...b.lu].map((v, i) => v / b.lv[i]);
  assert.ok(Math.min(...lu) < 1.1 && Math.max(...lu) > 2.5, 'small humps and big ones');
  assert.ok(asp.some(a => a < 1.3) && asp.some(a => a > 2.5), 'round humps and short ridges');
  const angles = new Set(); each(b, i => angles.add(Math.round(Math.atan2(b.sn[i], b.c[i]) / 0.3)));
  assert.ok(angles.size >= 8, `angles spread (${angles.size} bins)`);
  let steep = 0; // a raised cosine's steepest slope is h·π / (2·half-length)
  for (const t of tracks) each(t.bumps, i => { steep = Math.max(steep, t.bumps.h[i] * Math.PI / (2 * Math.min(t.bumps.lu[i], t.bumps.lv[i]))); });
  assert.ok(Math.atan(steep) * 180 / Math.PI < 20, `steepest face ${(Math.atan(steep) * 180 / Math.PI).toFixed(1)}°`);
});

test('bumps: tarmac stretches carry far fewer than loose ones', () => {
  const per = { tarmac: [0, 0], loose: [0, 0] }; // [bumps, metres]
  for (const t of ['t1', 't2', 't3', 't4', 't5', 't6'].map(s => generateTrack(s, { kind: 'loop' }))) {
    const L = t.layout;
    for (const sec of t.surfaces.sections) {
      const k = sec.road === 'tarmac' ? 'tarmac' : 'loose';
      per[k][1] += sec.s1 - sec.s0;
      each(t.bumps, i => { if (t.bumps.s[i] >= sec.s0 && t.bumps.s[i] < sec.s1) per[k][0]++; });
    }
    assert.ok(L.n > 0);
  }
  assert.ok(per.tarmac[1] > 300, 'some tarmac sampled');
  assert.ok(per.tarmac[0] / per.tarmac[1] < 0.4 * per.loose[0] / per.loose[1], `tarmac ${(per.tarmac[0] / per.tarmac[1]).toFixed(2)}/m vs loose ${(per.loose[0] / per.loose[1]).toFixed(2)}/m`);
});

test('ridge sets: whoops stretches hold angled ridges across the road, inside the stretch', () => {
  let sets = 0;
  for (const t of tracks) for (const f of t.features.filter(f => f.type === 'whoops')) {
    sets++;
    let ridges = 0;
    each(t.bumps, i => {
      if (t.bumps.s[i] < f.s0 || t.bumps.s[i] > f.s1) return;
      const across = Math.abs(t.bumps.sn[i]) > Math.sin(50 * Math.PI / 180), wide = t.bumps.lu[i] >= BUMPS.ridges.halfWidth[0] - 1e-6;
      if (across && wide && t.bumps.lv[i] <= BUMPS.ridges.thick[1] + 1e-6) ridges++;
    });
    assert.ok(ridges >= 3, `${ridges} ridges in a ${f.count}-count stretch`);
  }
  assert.ok(sets > 0, 'some whoops stretches');
});

test('bumpsAt: a bump peaks at its height at its centre, nothing past the shoulder; the heightfield carries it', () => {
  const t = tracks[0], b = t.bumps, L = t.layout;
  let checked = 0;
  for (let i = 0; i < b.n && checked < 20; i += 37) {
    if (Math.abs(b.d[i]) > 2.5) continue;
    const at = bumpsAt(b, b.s[i], b.d[i], L.n * L.ds, edgeAt(t.edges, L, b.s[i], b.d[i]));
    assert.ok(at >= b.h[i] - 1e-6, `at least its own height at its centre (${at} vs ${b.h[i]})`);
    // on the heightfield: road + bank + bumps at the centre, within the 1 m grid's interpolation
    const k = Math.round(b.s[i] / L.ds) % L.n, h = L.heading[k];
    const x = L.x[k] + b.d[i] * Math.cos(h), z = L.z[k] - b.d[i] * Math.sin(h);
    const plain = t.terrain.road[k] + Math.tan(t.terrain.bank[k]) * b.d[i];
    const expect = plain + bumpsAt(b, k * L.ds, b.d[i], L.n * L.ds, edgeAt(t.edges, L, k * L.ds, b.d[i]));
    assert.ok(Math.abs(heightAt(t.terrain, x, z) - expect) < 0.06, `heightfield ${heightAt(t.terrain, x, z).toFixed(3)} vs ${expect.toFixed(3)}`);
    checked++;
  }
  assert.ok(checked > 5);
  assert.equal(bumpsAt(b, b.s[0], 5.6), 0);
  assert.ok(roadSurfaceAt(t.surfaces, 0));
});
