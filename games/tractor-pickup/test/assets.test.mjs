// The baked models (3l; spec X-8: lion-hawk bake turns assets/models/*.glb into baked/), as the view reads them through engine.assets.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Color, Vector3, Matrix4 } from 'three';
import { fakeAssets } from './helpers/assets.mjs';
import { stripComments } from 'lion-hawk/test';
import { modelGeometry, partGeometry } from '../src/view/geom.js';
import { petKind, posePart } from '../src/view/pets.js';
const STATICS = ['tractor', 'oak', 'tree', 'treeFat', 'bush', 'bushS', 'fence', 'rock', 'pumpkin', 'corn', 'grass', 'flowerY', 'flowerR', 'log', 'stump', 'hay', 'rockA', 'rockB', 'rockC',
  'trailer', 'barn', 'wash', 'hat-straw', 'hat-cowboy', 'hat-party', 'bale', 'cone', 'barrel', 'stump-cut', 'sprinkler', 'gate', 'shrub'];
const PETS = ['pig', 'cow', 'chick', 'bunny', 'dog', 'sheep', 'duck', 'chicken'];
const A = await fakeAssets([...STATICS, ...PETS]);
const node = (k, n) => A.get(k).scene.getObjectByName(n);
const srgb = (attr, i, c = new Color()) => { c.setRGB(attr.getX(i), attr.getY(i), attr.getZ(i)).convertLinearToSRGB(); return [c.r * 255, c.g * 255, c.b * 255]; };

test('statics are present and non-empty', () => {
  for (const k of STATICS) { const g = modelGeometry(A, k); assert.ok(g.attributes.position.count > 0 && g.attributes.color, k); }
});
test('tractor parts: body is paint-body, fenders and roof are paint-trim, glass, details and wheels are never painted (W-3)', () => {
  const mat = n => node('tractor', n)?.material?.name;
  assert.equal(mat('body'), 'paint-body'); assert.equal(mat('fenders'), 'paint-trim'); assert.equal(mat('roof'), 'paint-trim');
  for (const n of ['glass', 'details', 'wheel-front-left', 'wheel-front-right', 'wheel-back-left', 'wheel-back-right']) { assert.ok(node('tractor', n), n); assert.doesNotMatch(mat(n), /^paint-/, `${n} is painted`); }
  const g = partGeometry(A, 'tractor', 'glass'), c = g.attributes.color; for (let i = 0; i < c.count; i++) assert.ok(srgb(c, i)[2] > 200, 'glass is light');
});
test('the parts the code uses by name are in the model files; the barn walls and gables carry UVs', () => {
  for (const [k, names] of Object.entries({ trailer: ['bed', 'wheel'], barn: ['walls', 'trim', 'roof-shingles', 'roof-gables', 'roof-trim'], wash: ['frame', 'canopy', 'brush'] })) for (const n of names) assert.ok(node(k, n)?.isMesh, `${k}.${n}`);
  for (const n of ['walls', 'roof-gables']) assert.ok(partGeometry(A, 'barn', n, { uv: true }).attributes.uv, n);
});
test('every pet has parts, idle/walk/run clips and a hat that moves with the head (W-4)', () => {
  const m = new Matrix4(), h = new Matrix4(), p = new Vector3(), b = new Vector3();
  for (const pet of PETS) {
    const k = petKind(A, pet), body = k.parts.find(x => x.name === 'body'); assert.ok(k.parts.length >= 5, pet);
    for (const c of ['idle', 'walk', 'run']) assert.ok(k.table.clips[c], `${pet}.${c}`);
    for (let t = 0; t < k.table.clips.walk.dur; t += k.table.clips.walk.dur / 8) { posePart(k, 'walk', t, body.index, m); k.hat('walk', t, h);
      p.setFromMatrixPosition(h); b.setFromMatrixPosition(m); assert.ok(p.y > 1.1 && p.y < 1.8, `${pet} hat at y ${p.y}`); assert.ok(Math.abs(p.y - b.y - 1.26) < 0.05, `${pet}: hat does not ride on the head`); }
  }
});
// colours weighted by the area of the triangles they paint: what the eye sees, not how many vertices a detail has (sRGB 0..255)
const cols = geos => geos.flatMap(g => { const P = g.attributes.position, C = g.attributes.color, I = g.index?.array ?? Array.from({ length: P.count }, (_, i) => i), out = [], a = new Vector3(), bb = new Vector3(), c = new Vector3();
  for (let t = 0; t < I.length; t += 3) { a.fromBufferAttribute(P, I[t]); bb.fromBufferAttribute(P, I[t + 1]); c.fromBufferAttribute(P, I[t + 2]);
    out.push({ c: srgb(C, I[t]), area: bb.sub(a).cross(c.sub(a)).length() / 2 }); }
  return out; });
const share = (list, f) => list.reduce((s, x) => s + (f(x.c) ? x.area : 0), 0) / list.reduce((s, x) => s + x.area, 0);
const petGeos = (pet, f = () => true) => petKind(A, pet).parts.filter(f).map(p => p.geometry);
test('the sheep is cream wool with round black ears, not a white pig (5.1)', () => {
  const c = cols(petGeos('sheep'));
  assert.ok(share(c, ([r, g, b]) => r > 225 && g > 220 && b > 205) > 0.3, 'not mostly cream wool');
  assert.ok(share(c, ([r, g, b]) => r < 50 && g < 50 && b < 50) > 0.05, 'no black ears');
  assert.ok(share(c, ([r, g]) => r - g > 50) < 0.01, 'still pink');
  const snout = petGeos('sheep', p => p.name === 'Group'); assert.ok(snout.length, 'no snout');
  assert.ok(cols(snout).every(({ c: [r, g, b] }) => r < 120 && Math.abs(r - g) < 20 && Math.abs(r - b) < 20), 'snout is not a dark muzzle');
});
test('the duck is a mallard: green head, yellow bill, orange feet (5.1)', () => {
  const c = cols(petGeos('duck'));
  assert.ok(share(c, ([r, g, b]) => g > r + 40 && g > b + 30) > 0.15, 'no green head');
  assert.ok(share(c, ([r, g, b]) => r > 220 && g > 160 && b < 80) > 0.01, 'no yellow bill');
  assert.ok(cols(petGeos('duck', p => p.name.startsWith('leg'))).every(({ c: [r, , b] }) => r > 220 && b < 80), 'feet not orange');
});
test('the chicken is white with a red comb and an orange beak (5.1)', () => {
  const c = cols(petGeos('chicken'));
  assert.ok(share(c, ([r, g, b]) => r > 235 && g > 235 && b > 225) > 0.4, 'not white');
  assert.ok(share(c, ([r, g, b]) => r > 190 && g < 70 && b < 70) > 0.01, 'no red comb');
  assert.ok(share(c, ([r, g, b]) => r > 220 && g > 120 && g < 175 && b < 90) > 0.01, 'no orange beak');
});
test('edge rocks are grey, not orange or teal', () => {
  for (const k of ['rockA', 'rockB', 'rockC']) { const C = modelGeometry(A, k).attributes.color; for (let i = 0; i < C.count; i++) { const [r, g, b] = srgb(C, i); assert.ok(Math.max(r, g, b) - Math.min(r, g, b) < 40, `${k} colour ${r},${g},${b}`); } }
});
const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const files = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(f => f.isDirectory() ? files(path.join(d, f.name)) : f.name.endsWith('.js') ? [path.join(d, f.name)] : []);
test('no src module imports assets.json or render/gfx.js', () => {
  for (const f of files(SRC)) assert.doesNotMatch(stripComments(fs.readFileSync(f, 'utf8')), /assets\.json|render\/gfx/, f);
});
test('pictures go through the engine snapshot: no render target, pixel read or paintable under src/', () => {
  for (const f of files(SRC)) assert.doesNotMatch(stripComments(fs.readFileSync(f, 'utf8')), /WebGLRenderTarget|readRenderTargetPixels|paintable\(/, f);
});
