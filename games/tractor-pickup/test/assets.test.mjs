import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const A = JSON.parse(fs.readFileSync(new URL('../src/assets.json', import.meta.url)));

// src/assets.json is baked from the model files in assets/models/ (spec X-8)
test('statics are present and non-empty', () => {
  for (const k of ['tractor', 'oak', 'tree', 'treeFat', 'bush', 'bushS', 'fence', 'rock', 'pumpkin', 'corn', 'grass', 'flowerY', 'flowerR', 'log', 'stump', 'hay', 'rockA', 'rockB', 'rockC',
    'trailer', 'barn', 'wash', 'hat-straw', 'hat-cowboy', 'hat-party', 'bale', 'cone', 'barrel', 'stump-cut', 'sprinkler', 'gate', 'shrub']) {
    assert.ok(A[k], k); const parts = Object.values(A[k]); assert.ok(parts.length > 0, k);
    for (const p of parts) assert.ok(p.idx.length > 0 && p.pos.length === p.col.length, k);
  }
});
test('tractor parts: body is paint-body, fenders and roof are paint-trim, glass, details and wheels are never painted (W-3)', () => {
  const area = n => new Set(A.tractor[n].area || [0]);
  for (const n of ['body', 'fenders', 'roof', 'glass', 'details', 'wheel-front-left', 'wheel-front-right', 'wheel-back-left', 'wheel-back-right']) assert.ok(A.tractor[n], n);
  assert.deepEqual([...area('body')], [1]); assert.deepEqual([...area('fenders')], [2]); assert.deepEqual([...area('roof')], [2]);
  for (const n of ['glass', 'details', 'wheel-front-left', 'wheel-back-right']) assert.deepEqual([...area(n)], [0], `${n} is painted`);
  const top = Math.max(...A.tractor.body.pos.filter((_, i) => i % 3 === 1)), roofLow = Math.min(...A.tractor.roof.pos.filter((_, i) => i % 3 === 1));
  assert.ok(roofLow > top - 0.2, 'the roof is the top of the tractor');
  for (let i = 0; i < A.tractor.glass.col.length; i += 3) assert.ok(A.tractor.glass.col[i + 2] > 200, 'glass is light');
});
test('the parts the code uses by name are in the model files', () => {
  for (const [k, names] of Object.entries({ trailer: ['bed', 'wheel'], barn: ['walls', 'trim', 'roof-shingles', 'roof-gables', 'roof-trim'], sprinkler: ['arch'], gate: ['arch'], wash: ['frame', 'canopy', 'brush'] })) for (const n of names) assert.ok(A[k][n], `${k}.${n}`);
  for (const n of ['walls', 'roof-gables']) { assert.equal(A.barn[n].mat, 'planks'); assert.equal(A.barn[n].uv.length, A.barn[n].pos.length / 3 * 2); }
  assert.equal(A.barn['roof-shingles'].mat, 'shingles');
});
test('every pet has a hat mount that moves with the head (W-4)', () => {
  for (const pet of ['pig', 'cow', 'chick', 'bunny', 'dog', 'sheep', 'duck', 'chicken']) {
    const P = A[pet], row = P.parts.length + P.mounts.indexOf('hat'), body = P.parts.findIndex(p => p.name === 'body'); assert.ok(P.mounts.includes('hat'), pet);
    for (const f of P.anims.walk.frames) { const h = f[row], b = f[body]; assert.ok(h[13] > 1.1 && h[13] < 1.8, `${pet} hat at y ${h[13]}`); assert.ok(Math.abs(h[13] - b[13] - 1.26 /* on the head cube's top, see test/hats.test.mjs */) < 0.05, `${pet}: hat does not ride on the body`); }
  }
});
test('every pet has parts and idle/walk/run anims with one matrix per part and mount', () => {
  for (const pet of ['pig', 'cow', 'chick', 'bunny', 'dog', 'sheep', 'duck', 'chicken']) {
    const P = A[pet]; assert.ok(P && P.parts.length >= 5, pet);
    for (const a of ['idle', 'walk', 'run']) {
      assert.ok(P.anims[a], `${pet}.${a}`);
      for (const f of P.anims[a].frames) assert.equal(f.length, P.parts.length + P.mounts.length);
    }
  }
});
// colors weighted by the area of the triangles they paint: what the eye sees, not how many vertices a detail has
const cols = parts => parts.flatMap(p => { const out = [], P = i => p.pos.slice(i * 3, i * 3 + 3);
  for (let t = 0; t < p.idx.length; t += 3) { const [a, b, c] = [0, 1, 2].map(k => P(p.idx[t + k])), u = b.map((v, k) => v - a[k]), v = c.map((x, k) => x - a[k]);
    const area = Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2; out.push({ c: p.col.slice(p.idx[t] * 3, p.idx[t] * 3 + 3), area }); }
  return out; });
const share = (list, f) => list.reduce((s, x) => s + (f(x.c) ? x.area : 0), 0) / list.reduce((s, x) => s + x.area, 0);
test('the sheep is cream wool with round black ears, not a white pig (5.1)', () => {
  const c = cols(A.sheep.parts);
  assert.ok(share(c, ([r, g, b]) => r > 225 && g > 220 && b > 205) > 0.3, 'not mostly cream wool');
  assert.ok(share(c, ([r, g, b]) => r < 50 && g < 50 && b < 50) > 0.05, 'no black ears');
  assert.ok(share(c, ([r, g]) => r - g > 50) < 0.01, 'still pink');
  const snout = A.sheep.parts.find(p => p.name === 'Group'); assert.ok(snout, 'no snout');
  assert.ok(cols([snout]).every(({ c: [r, g, b] }) => r < 120 && Math.abs(r - g) < 20 && Math.abs(r - b) < 20), 'snout is not a dark muzzle');
});
test('the duck is a mallard: green head, yellow bill, orange feet (5.1)', () => {
  const c = cols(A.duck.parts);
  assert.ok(share(c, ([r, g, b]) => g > r + 40 && g > b + 30) > 0.15, 'no green head');
  assert.ok(share(c, ([r, g, b]) => r > 220 && g > 160 && b < 80) > 0.01, 'no yellow bill');
  assert.ok(cols(A.duck.parts.filter(p => p.name.startsWith('leg'))).every(({ c: [r, , b] }) => r > 220 && b < 80), 'feet not orange');
});
test('the chicken is white with a red comb and an orange beak (5.1)', () => {
  const c = cols(A.chicken.parts);
  assert.ok(share(c, ([r, g, b]) => r > 235 && g > 235 && b > 225) > 0.4, 'not white');
  assert.ok(share(c, ([r, g, b]) => r > 190 && g < 70 && b < 70) > 0.01, 'no red comb');
  assert.ok(share(c, ([r, g, b]) => r > 220 && g > 120 && g < 175 && b < 90) > 0.01, 'no orange beak');
});
test('edge rocks are grey, not orange or teal', () => {
  for (const k of ['rockA', 'rockB', 'rockC']) for (const p of Object.values(A[k])) for (let i = 0; i < p.col.length; i += 3) {
    const [r, g, b] = p.col.slice(i, i + 3); assert.ok(Math.max(r, g, b) - Math.min(r, g, b) < 40, `${k} colour ${r},${g},${b}`);
  }
});
