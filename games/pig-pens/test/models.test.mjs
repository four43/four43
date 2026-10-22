// Phase 3k: the view's geometry from the baked models, loaded through the engine's createAssets and lambert compiler (as
// boot does), matches what assets.json gave the 2.1.0 view: triangles and colours per model, node-local pet parts where
// the eyelid mask expects them, the Nature Kit's factor colours from the registry looks, and the pig skin's program key.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAssets, createMaterialCompiler } from 'lion-hawk/view';
import { modelGeometry, partGeometry } from '../src/view/models.js';
import { pigSkin } from '../src/view/pigSkin.js';
import MATERIALS from '../src/defs/materials.js';

const root = new URL('../', import.meta.url), OLD = JSON.parse(readFileSync(new URL('test/fixtures/assets-v2.1.0.json', root), 'utf8'));
const MANIFEST = JSON.parse(readFileSync(new URL('baked/manifest.json', root), 'utf8'));
const fetch = async url => { const b = readFileSync(new URL(url.replace(/^\.\/assets\//, 'baked/'), root)); return { ok: true, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), json: async () => JSON.parse(b.toString('utf8')) }; };
const mc = createMaterialCompiler(MATERIALS, { shading: 'lambert' });
const assets = createAssets({ manifest: MANIFEST, base: './assets/', compiler: mc, fetch });
await assets.preload(Object.keys(MANIFEST.models));
const tris = g => g.index.count / 3;
const s2l = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };

test('modelGeometry: model space, the 2.1.0 triangle count, position + normal + color', () => {
  for (const k of ['fence', 'hay', 'tree', 'apple', 'barrel', 'egg']) {
    const g = modelGeometry(assets, k), old = Object.values(OLD[k]).reduce((s, p) => s + p.idx.length / 3, 0);
    assert.equal(tris(g), old, k); assert.deepEqual(Object.keys(g.attributes).sort(), ['color', 'normal', 'position'], k);
  }
  assert.equal(tris(modelGeometry(assets, 'fence', null, { parts: ['fence_simple'] })), OLD.fence.fence_simple.idx.length / 3);
  assert.equal(tris(modelGeometry(assets, 'tractor', null, { parts: ['body'] })), OLD.tractor.body.idx.length / 3);
});
test('factor-only Nature Kit materials draw in their 2.1.0 colours (baked COLOR_0)', () => {
  const g = modelGeometry(assets, 'fence'), c = g.attributes.color, want = new Set(), got = new Set();
  for (let i = 0; i < OLD.fence.fence_simple.col.length; i += 3) want.add(OLD.fence.fence_simple.col.slice(i, i + 3).map(s2l).map(v => v.toFixed(3)).join());
  for (let i = 0; i < c.count; i++) got.add([c.getX(i), c.getY(i), c.getZ(i)].map(v => v.toFixed(3)).join());
  assert.deepEqual([...got].sort(), [...want].sort());
});
test('partGeometry: pet parts are node-local, as 2.1.0 drew them (the anim tables pose them), and the eyelid face is there', () => {
  for (const key of ['pig', 'chick']) for (const p of OLD[key].parts) {
    const g = partGeometry(assets, key, p.name); g.computeBoundingBox();
    const lo = [0, 1, 2].map(k => Math.min(...p.pos.filter((_, i) => i % 3 === k))), hi = [0, 1, 2].map(k => Math.max(...p.pos.filter((_, i) => i % 3 === k)));
    assert.ok(['x', 'y', 'z'].every((a, k) => Math.abs(g.boundingBox.min[a] - lo[k]) < 2e-3 && Math.abs(g.boundingBox.max[a] - hi[k]) < 2e-3), `${key}/${p.name}`);
  }
  const g = partGeometry(assets, 'pig', 'body'), pos = g.attributes.position; let face = 0;
  for (let i = 0; i < pos.count; i++) if (Math.abs(pos.getZ(i) - 0.64) < 0.02 && pos.getY(i) > 0.6 && pos.getY(i) < 0.93) face++;
  assert.ok(face > 0, 'the face plane at z 0.64 the eyelid mask reads');
});
test('the pig skin is the compiler\'s instanced coverage material with the eyelid patch', () => {
  const m = pigSkin(mc), key = m.customProgramCacheKey();
  assert.match(key, /COVERAGE/); assert.match(key, /x:eyelids/); assert.ok('COVERAGE_INSTANCED' in m.defines);
  assert.ok(pigSkin(mc) === m, 'cached: one material for every pig part');
});
test('the dog and the fox carry their clips for AnimationMixer', () => {
  for (const k of ['dog', 'fox']) assert.deepEqual(['idle', 'walk', 'run'].filter(c => !assets.get(k).clips.some(x => x.name === c)), [], k);
});
