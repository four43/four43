import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const A = JSON.parse(fs.readFileSync(new URL('../src/assets.json', import.meta.url)));

test('statics are present and non-empty', () => {
  for (const k of ['tractor', 'oak', 'tree', 'treeFat', 'bush', 'bushS', 'fence', 'rock', 'pumpkin', 'corn', 'grass', 'flowerY', 'flowerR', 'log', 'stump', 'hay']) {
    assert.ok(A[k], k); const parts = Object.values(A[k]); assert.ok(parts.length > 0, k);
    for (const p of parts) assert.ok(p.idx.length > 0 && p.pos.length === p.col.length, k);
  }
});
test('tractor has body and four named wheels', () => {
  for (const n of ['body', 'wheel-front-left', 'wheel-front-right', 'wheel-back-left', 'wheel-back-right']) assert.ok(A.tractor[n], n);
});
test('every pet has parts and idle/walk/run anims with one matrix per part', () => {
  for (const pet of ['pig', 'cow', 'chick', 'bunny', 'dog', 'sheep', 'duck']) {
    const P = A[pet]; assert.ok(P && P.parts.length >= 5, pet);
    for (const a of ['idle', 'walk', 'run']) {
      assert.ok(P.anims[a], `${pet}.${a}`);
      for (const f of P.anims[a].frames) assert.equal(f.length, P.parts.length);
    }
  }
});
test('sheep is not pink and duck is not yellow', () => {
  const avg = parts => { let r = 0, g = 0, b = 0, n = 0; for (const p of parts) for (let i = 0; i < p.col.length; i += 3) { r += p.col[i]; g += p.col[i + 1]; b += p.col[i + 2]; n++; } return [r / n, g / n, b / n]; };
  const [sr, sg] = avg(A.sheep.parts); assert.ok(sr - sg < 25, 'sheep still pink');
  const [dr, dg, db] = avg(A.duck.parts); assert.ok(db > 150, 'duck still yellow (blue channel low)');
});
