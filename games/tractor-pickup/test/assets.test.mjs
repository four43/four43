import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const A = JSON.parse(fs.readFileSync(new URL('../src/assets.json', import.meta.url)));

// src/assets.json is baked from the model files in assets/models/ (spec X-8)
test('statics are present and non-empty', () => {
  for (const k of ['tractor', 'oak', 'tree', 'treeFat', 'bush', 'bushS', 'fence', 'rock', 'pumpkin', 'corn', 'grass', 'flowerY', 'flowerR', 'log', 'stump', 'hay', 'rockA', 'rockB', 'rockC',
    'trailer', 'barn', 'hat-straw', 'hat-cowboy', 'hat-party', 'bale', 'cone', 'barrel', 'stump-cut', 'sprinkler', 'gate', 'shrub']) {
    assert.ok(A[k], k); const parts = Object.values(A[k]); assert.ok(parts.length > 0, k);
    for (const p of parts) assert.ok(p.idx.length > 0 && p.pos.length === p.col.length, k);
  }
});
test('tractor has body and four named wheels, with both paint areas (W-3)', () => {
  for (const n of ['body', 'wheel-front-left', 'wheel-front-right', 'wheel-back-left', 'wheel-back-right']) assert.ok(A.tractor[n], n);
  const b = A.tractor.body.area; assert.ok(b && b.includes(1) && b.includes(2) && b.includes(0), 'body: paint-body, paint-trim and unpainted parts');
  for (const n of ['wheel-front-left', 'wheel-back-right']) assert.ok(A.tractor[n].area?.includes(2) && !A.tractor[n].area.includes(1), `${n}: trim rims only`);
});
test('the parts the code uses by name are in the model files', () => {
  for (const [k, names] of Object.entries({ trailer: ['bed', 'wheel'], barn: ['walls', 'trim', 'roof-shingles', 'roof-gables', 'roof-trim'], sprinkler: ['arch'], gate: ['arch'] })) for (const n of names) assert.ok(A[k][n], `${k}.${n}`);
  for (const n of ['walls', 'roof-gables']) { assert.equal(A.barn[n].mat, 'planks'); assert.equal(A.barn[n].uv.length, A.barn[n].pos.length / 3 * 2); }
  assert.equal(A.barn['roof-shingles'].mat, 'shingles');
});
test('every pet has parts and idle/walk/run anims with one matrix per part', () => {
  for (const pet of ['pig', 'cow', 'chick', 'bunny', 'dog', 'sheep', 'duck', 'chicken']) {
    const P = A[pet]; assert.ok(P && P.parts.length >= 5, pet);
    for (const a of ['idle', 'walk', 'run']) {
      assert.ok(P.anims[a], `${pet}.${a}`);
      for (const f of P.anims[a].frames) assert.equal(f.length, P.parts.length);
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
  assert.ok(!A.sheep.parts.some(p => p.name === 'Group'), 'still has the pig snout');
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
