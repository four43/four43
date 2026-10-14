// Phase 3k T4 (overview §5.3-1): the baked models draw what assets.json (the 2.1.0 bake) drew. Triangles per model,
// vertices ≤ (the palette bake may weld), bounds, colour palette, and for the crowd pets the anim frames and the posed
// rest bounds (a quantisation or node transform missing from the anim table shows up as a pose that does not fit).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const root = new URL('../', import.meta.url);
const OLD = JSON.parse(readFileSync(new URL('src/assets.json', root), 'utf8'));
const MAN = JSON.parse(readFileSync(new URL('baked/manifest.json', root), 'utf8'));
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const PETS = new Set(['pig', 'dog', 'chick', 'fox']), DUPES = new Set(['corn']);
const l2s = c => Math.round(255 * Math.max(0, Math.min(1, c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)));

// column-major mat4 helpers (the old bake's)
const mul = (a, b) => { const o = new Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; };
const trs = n => { const [x, y, z, w] = n.getRotation(), t = n.getTranslation(), s = n.getScale(), x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
  return [(1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0, (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0, (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0, t[0], t[1], t[2], 1]; };
const world = n => { let m = trs(n), p = n.getParentNode(); while (p) { m = mul(trs(p), m); p = p.getParentNode(); } return m; };
const xf = (m, v) => [m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12], m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13], m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]];
const box = () => ({ min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });
const grow = (b, p) => { for (let k = 0; k < 3; k++) { b.min[k] = Math.min(b.min[k], p[k]); b.max[k] = Math.max(b.max[k], p[k]); } };
const boxNear = (a, b, tol, msg) => { for (const e of ['min', 'max']) for (let k = 0; k < 3; k++) assert.ok(Math.abs(a[e][k] - b[e][k]) <= tol, `${msg} ${e}[${k}] ${a[e][k]} vs ${b[e][k]}`); };

// One baked model: per mesh node { name, tris, verts, local positions, colours (sRGB 0..255) } and its world matrix.
async function baked(id) {
  const doc = await io.read(fileURLToPath(new URL(`baked/${MAN.models[id].glb}`, root))), parts = [], e = [];
  for (const n of doc.getRoot().listNodes()) {
    const mesh = n.getMesh(); if (!mesh) continue;
    const part = { name: n.getName(), m: world(n), tris: 0, verts: 0, pos: [], col: [] };
    for (const prim of mesh.listPrimitives()) {
      const P = prim.getAttribute('POSITION'), C = prim.getAttribute('COLOR_0'), I = prim.getIndices();
      part.verts += P.getCount(); part.tris += (I ? I.getCount() : P.getCount()) / 3;
      for (let i = 0; i < P.getCount(); i++) { P.getElement(i, e); part.pos.push([e[0], e[1], e[2]]); }
      if (C) for (let i = 0; i < C.getCount(); i++) { C.getElement(i, e); part.col.push([l2s(e[0]), l2s(e[1]), l2s(e[2])]); }
      else { // a factor-only material (the Nature Kit has no palette texture): 2.1.0 used the factor as it stands, as sRGB bytes
        assert.ok(!prim.getMaterial().getBaseColorTexture(), `${id}/${part.name}: a palette texture was left (palette: 'vertex' must bake it)`);
        const f = prim.getMaterial().getBaseColorFactor(), c = [0, 1, 2].map(k => Math.round(Math.max(0, Math.min(1, f[k])) * 255));
        for (let i = 0; i < P.getCount(); i++) part.col.push(c);
      }
    }
    parts.push(part);
  }
  return parts;
}
const oldParts = id => PETS.has(id) ? OLD[id].parts : Object.entries(OLD[id]).map(([name, g]) => ({ name, ...g }));
const palette = cols => { const s = new Map(); for (const c of cols) s.set(c.join(), c); return [...s.values()]; };
const covers = (a, b) => a.every(c => b.some(d => Math.abs(c[0] - d[0]) <= 2 && Math.abs(c[1] - d[1]) <= 2 && Math.abs(c[2] - d[2]) <= 2));

for (const id of Object.keys(MAN.models)) {
  test(`${id}: triangles, vertices, bounds and palette match the 2.1.0 bake`, async () => {
    const now = await baked(id), was = oldParts(id);
    const tNow = now.reduce((s, p) => s + p.tris, 0), tWas = was.reduce((s, p) => s + p.idx.length / 3, 0);
    if (DUPES.has(id)) assert.ok(tNow >= tWas, `${id}: ${tNow} < ${tWas}`); else assert.equal(tNow, tWas, `${id} triangles`);
    if (!DUPES.has(id)) assert.ok(now.reduce((s, p) => s + p.verts, 0) <= was.reduce((s, p) => s + p.pos.length / 3, 0), `${id} vertices grew`);
    const cNow = palette(now.flatMap(p => p.col)), cWas = palette(was.flatMap(p => { const o = []; for (let i = 0; i < p.col.length; i += 3) o.push(p.col.slice(i, i + 3)); return o; }));
    assert.ok(covers(cWas, cNow) && covers(cNow, cWas), `${id}: palettes differ ${JSON.stringify(cWas)} vs ${JSON.stringify(cNow)}`);
    if (PETS.has(id)) return; // pet parts are node-local in assets.json; the posed check below covers them
    const bNow = box(), bWas = box();
    for (const p of now) for (const v of p.pos) grow(bNow, xf(p.m, v));
    for (const p of was) for (let i = 0; i < p.pos.length; i += 3) grow(bWas, p.pos.slice(i, i + 3));
    if (!DUPES.has(id)) boxNear(bNow, bWas, 1e-3, `${id} bounds`);
  });
}

// anim.json: { v, fps, parts: [names], clips: { clip: { dur, frames, data: base64 Float32 frames×parts×12 } } } (§4.3).
// 3f C7: the 12 floats are the column-major mat4 without its last row: elements 0,1,2, 4,5,6, 8,9,10, 12,13,14. Rows are
// the parts, then any sock-<name> rows (3d C2); t.parts lists the part rows.
const COLS = [0, 1, 2, 4, 5, 6, 8, 9, 10, 12, 13, 14];
const table = id => JSON.parse(readFileSync(new URL(`baked/${MAN.models[id].anim}`, root), 'utf8'));
const frame = (t, clip, f, k) => { const c = t.clips[clip], b = Buffer.from(c.data, 'base64'), d = new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)), o = (f * t.parts.length + k) * 12, m = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]; COLS.forEach((e, j) => { m[e] = d[o + j]; }); return m; };
for (const id of ['pig', 'chick']) {
  test(`${id}: anim tables reproduce the 2.1.0 frames and pose the baked parts where the old ones stood`, async () => {
    const t = table(id), old = OLD[id], now = await baked(id);
    for (const [clip, a] of Object.entries(old.anims)) {
      assert.ok(t.clips[clip], `${id}: clip ${clip}`); assert.equal(t.clips[clip].frames, a.frames.length, `${id}/${clip} frames`);
      assert.ok(Math.abs(t.clips[clip].dur - a.dur) < 1e-3, `${id}/${clip} dur`);
      old.parts.forEach((p, kOld) => {
        const k = t.parts.indexOf(p.name); assert.ok(k >= 0, `${id}: part ${p.name} missing from the table`);
        for (let f = 0; f < a.frames.length; f++) {
          const m = frame(t, clip, f, k), w = a.frames[f][kOld];
          for (const e of COLS) assert.ok(Math.abs(m[e] - w[e]) <= 2e-3, `${id}/${clip} frame ${f} part ${p.name} [${e}] ${m[e]} vs ${w[e]}`);
        }
      });
    }
    // idle frame 0: the table's matrix × the baked part's own vertices lands on the old part × the old matrix
    old.parts.forEach((p, kOld) => {
      const k = t.parts.indexOf(p.name), part = now.find(q => q.name === p.name), bNow = box(), bWas = box(), m = frame(t, 'idle', 0, k), w = old.anims.idle.frames[0][kOld];
      for (const v of part.pos) grow(bNow, xf(m, v));
      for (let i = 0; i < p.pos.length; i += 3) grow(bWas, xf(w, p.pos.slice(i, i + 3)));
      boxNear(bNow, bWas, 2e-3, `${id}/${p.name} posed bounds`);
    });
  });
}
