// W-4: every hat sits on every animal's head: no part of the head cube pokes through a hat, in any frame of any animation, and no hat
// floats above the head. Ears, tufts, combs and wool (above HEAD_TOP) may poke through.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Matrix4, Vector3 } from 'three';
import { HAT_SCALE, HEAD_TOP } from '../src/render/petScale.js';
const A = JSON.parse(fs.readFileSync(new URL('../src/assets.json', import.meta.url)));
const PETS = ['pig', 'cow', 'chicken', 'sheep', 'duck', 'bunny', 'dog', 'chick'], HATS = ['straw', 'cowboy', 'party'];
const hatRadius = h => Math.max(...Object.values(A['hat-' + h]).flatMap(p => p.pos.filter((_, i) => i % 3 === 0).map((x, k) => Math.hypot(x, p.pos[k * 3 + 2]))));

test('no head pokes through a hat, and no hat floats, on any animal in any animation frame (W-4)', () => {
  // The head cube's top is flat and only has vertices at its corners, often outside a narrow hat (the party cone): so the hat's base is
  // compared with the highest point of the whole head cube, not only with the head points under the hat.
  const m = new Matrix4(), inv = new Matrix4(), v = new Vector3(), problems = [];
  for (const pet of PETS) {
    const P = A[pet], bi = P.parts.findIndex(p => p.name === 'body'), hi = P.parts.length + P.mounts.indexOf('hat'), body = P.parts[bi];
    const head = []; for (let i = 0; i < body.pos.length; i += 3) if (body.pos[i + 1] <= HEAD_TOP) head.push(body.pos.slice(i, i + 3));
    for (const [anim, { frames }] of Object.entries(P.anims)) frames.forEach((f, fi) => {
      inv.fromArray(f[hi]).invert(); m.fromArray(f[bi]);
      let top = -Infinity; for (const p of head) top = Math.max(top, v.set(...p).applyMatrix4(m).applyMatrix4(inv).y); // in hat space: the base is y = 0
      if (top > 0.005) problems.push(`${pet} ${anim}[${fi}]: head ${(top * 100).toFixed(1)} cm into the hat`);
      if (top < -0.05) problems.push(`${pet} ${anim}[${fi}]: hat floats ${(-top * 100).toFixed(1)} cm above the head`);
    });
  }
  const uniq = [...new Set(problems.map(p => p.replace(/ [\w-]+\[\d+\]: ([^0-9]+)[0-9.]+ cm/, ': $1')))];
  assert.deepEqual(uniq, [], uniq.join('\n'));
});
test('every hat is wider than nothing and stands on its base (y = 0), so the check above holds for all of them', () => {
  for (const h of HATS) { const ys = Object.values(A['hat-' + h]).flatMap(p => p.pos.filter((_, i) => i % 3 === 1)); assert.ok(Math.abs(Math.min(...ys)) < 1e-3, `${h} base at ${Math.min(...ys)}`); assert.ok(hatRadius(h) > 0.2); }
});
