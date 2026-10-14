// W-4: every hat sits on every animal's head: no part of the head cube pokes through a hat, in any frame of any animation, and no hat
// floats above the head. Ears, tufts, combs and wool (above HEAD_TOP) may poke through. On the baked models and anim tables (3l).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Matrix4, Vector3 } from 'three';
import { HEAD_TOP } from '../src/render/petScale.js';
import { fakeAssets } from './helpers/assets.mjs';
import { petKind, posePart } from '../src/view/pets.js';
import { modelGeometry } from '../src/view/geom.js';
const PETS = ['pig', 'cow', 'chicken', 'sheep', 'duck', 'bunny', 'dog', 'chick'], HATS = ['straw', 'cowboy', 'party'];
const A = await fakeAssets([...PETS, ...HATS.map(h => 'hat-' + h)]);

test('no head pokes through a hat, and no hat floats, on any animal in any animation frame (W-4)', () => {
  // The head cube's top is flat and only has vertices at its corners, often outside a narrow hat (the party cone): so the hat's base is
  // compared with the highest point of the whole head cube, not only with the head points under the hat.
  const m = new Matrix4(), h = new Matrix4(), v = new Vector3(), problems = [];
  for (const pet of PETS) {
    const k = petKind(A, pet), body = k.parts.find(p => p.name === 'body'), pos = body.geometry.attributes.position, head = [];
    for (let i = 0; i < pos.count; i++) if (pos.getY(i) <= HEAD_TOP) head.push(new Vector3().fromBufferAttribute(pos, i));
    for (const [clip, c] of Object.entries(k.table.clips)) for (let fi = 0; fi < c.frames; fi++) {
      const t = fi / c.frames * c.dur; posePart(k, clip, t, body.index, m); k.hat(clip, t, h); h.invert();
      let top = -Infinity; for (const p of head) top = Math.max(top, v.copy(p).applyMatrix4(m).applyMatrix4(h).y); // in hat space: the base is y = 0
      if (top > 0.005) problems.push(`${pet} ${clip}[${fi}]: head ${(top * 100).toFixed(1)} cm into the hat`);
      if (top < -0.05) problems.push(`${pet} ${clip}[${fi}]: hat floats ${(-top * 100).toFixed(1)} cm above the head`);
    }
  }
  const uniq = [...new Set(problems.map(p => p.replace(/ [\w-]+\[\d+\]: ([^0-9]+)[0-9.]+ cm/, ': $1')))];
  assert.deepEqual(uniq, [], uniq.join('\n'));
});
test('every hat is wider than nothing and stands on its base (y = 0), so the check above holds for all of them', () => {
  for (const hat of HATS) { const g = modelGeometry(A, 'hat-' + hat); g.computeBoundingBox(); const b = g.boundingBox;
    assert.ok(Math.abs(b.min.y) < 1e-3, `${hat} base at ${b.min.y}`); assert.ok(Math.max(b.max.x, -b.min.x, b.max.z, -b.min.z) > 0.2); }
});
