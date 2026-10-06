// Small mesh kit for the model files (spec X-8): read and write glTF primitives as plain triangle lists, move palette-texture
// colors into vertex colors, cut triangles at a plane, and turn three.js geometry into triangles. Used by models.mjs.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { PNG } from 'pngjs';

export const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
export const s2l = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
export const l2s = c => { c = Math.max(0, Math.min(1, c)); return Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)); };

// sRGB 0..255 color of each vertex: COLOR_0 (linear) if the primitive has it, else the base color factor times the texture
// texel at the vertex UV (Kenney models use one small palette texture).
const pngCache = new Map();
export function vertexColors(prim) {
  const n = prim.getAttribute('POSITION').getCount(), out = [], e = [], C = prim.getAttribute('COLOR_0');
  if (C) { for (let i = 0; i < n; i++) { C.getElement(i, e); out.push([l2s(e[0]), l2s(e[1]), l2s(e[2])]); } return out; }
  const mat = prim.getMaterial(), f = mat ? mat.getBaseColorFactor() : [1, 1, 1, 1], tex = mat?.getBaseColorTexture(), uv = prim.getAttribute('TEXCOORD_0');
  let png = null; if (tex && uv) { if (!pngCache.has(tex)) pngCache.set(tex, PNG.sync.read(Buffer.from(tex.getImage()))); png = pngCache.get(tex); }
  for (let i = 0; i < n; i++) {
    let c = [f[0], f[1], f[2]]; // Kenney writes sRGB-looking values into the factor; used as they are (as the old bake did)
    if (png) { uv.getElement(i, e); const u = ((e[0] % 1) + 1) % 1, v = ((e[1] % 1) + 1) % 1, px = Math.min(png.width - 1, Math.floor(u * png.width)), py = Math.min(png.height - 1, Math.floor(v * png.height)), o = (py * png.width + px) * 4;
      c = [png.data[o] / 255 * c[0], png.data[o + 1] / 255 * c[1], png.data[o + 2] / 255 * c[2]]; }
    out.push(c.map(x => Math.round(Math.max(0, Math.min(1, x)) * 255)));
  }
  return out;
}

// A primitive as triangles: { p: [[x, y, z] x 3], n: [...], c: [[r, g, b] sRGB 0..255 x 3], uv?: [[u, v] x 3] }
export function readTris(prim) {
  const P = prim.getAttribute('POSITION'), N = prim.getAttribute('NORMAL'), UV = prim.getAttribute('TEXCOORD_0'), I = prim.getIndices(), cols = vertexColors(prim);
  const get = (A, i) => { const e = []; A.getElement(i, e); return e; }, ix = I ? Array.from(I.getArray()) : [...Array(P.getCount()).keys()], tris = [];
  for (let t = 0; t + 2 < ix.length; t += 3) {
    const vs = [ix[t], ix[t + 1], ix[t + 2]];
    tris.push({ p: vs.map(i => get(P, i)), n: vs.map(i => N ? get(N, i) : [0, 1, 0]), c: vs.map(i => cols[i].slice()), ...(UV && keepUV(prim) ?{ uv: vs.map(i => get(UV, i)) } : {}) });
  }
  return tris;
}
const keepUV = prim => !!prim.getMaterial()?.getExtras()?.keepUV; // only textured game materials (barn planks, shingles) keep UVs

// Write triangles into a primitive: welds equal vertices, writes POSITION, NORMAL, COLOR_0 (linear) and, if the triangles
// carry them, TEXCOORD_0; every other attribute is dropped.
export function writeTris(doc, prim, tris) {
  const buf = doc.getRoot().listBuffers()[0] || doc.createBuffer(), keys = new Map(), pos = [], nrm = [], col = [], uvs = [], idx = [], hasUV = tris.some(t => t.uv);
  for (const t of tris) for (let k = 0; k < 3; k++) {
    const p = t.p[k].map(v => +v.toFixed(4)), n = t.n[k].map(v => +v.toFixed(3)), c = t.c[k].map(v => Math.round(v)), uv = hasUV ? (t.uv?.[k] || [0, 0]).map(v => +v.toFixed(4)) : null;
    const key = [p, n, c, uv].join('|'); let i = keys.get(key);
    if (i === undefined) { i = pos.length / 3; keys.set(key, i); pos.push(...p); nrm.push(...n); col.push(...c.map(s2l)); if (uv) uvs.push(...uv); }
    idx.push(i);
  }
  for (const s of prim.listSemantics()) { const a = prim.getAttribute(s); prim.setAttribute(s, null); if (a && !a.listParents().some(p => p !== doc.getRoot())) a.dispose(); }
  const acc = (arr, type, Ctor) => doc.createAccessor().setType(type).setArray(new Ctor(arr)).setBuffer(buf);
  prim.setAttribute('POSITION', acc(pos, 'VEC3', Float32Array)).setAttribute('NORMAL', acc(nrm, 'VEC3', Float32Array)).setAttribute('COLOR_0', acc(col, 'VEC3', Float32Array));
  if (hasUV) prim.setAttribute('TEXCOORD_0', acc(uvs, 'VEC2', Float32Array));
  const old = prim.getIndices(); prim.setIndices(acc(idx, 'SCALAR', pos.length / 3 > 65535 ? Uint32Array : Uint16Array)); if (old && !old.listParents().some(p => p !== doc.getRoot())) old.dispose();
  return prim;
}

// White material that shows the vertex colors, one per name in a document
export function vcMaterial(doc, name, extras) {
  const found = doc.getRoot().listMaterials().find(m => m.getName() === name);
  if (found) return found;
  const m = doc.createMaterial(name).setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(1).setMetallicFactor(0);
  if (extras) m.setExtras(extras);
  return m;
}

// Every primitive of a Kenney document to vertex colors; the palette textures go away. edit(tris, nodeName) may change the
// triangles (recolor, reshape, add) before they are written.
export function toVertexColors(doc, edit = t => t) {
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh(); if (!mesh) continue;
    for (const prim of mesh.listPrimitives()) writeTris(doc, prim, edit(readTris(prim), node.getName(), prim));
  }
  for (const m of doc.getRoot().listMaterials()) m.setBaseColorTexture(null).setBaseColorFactor([1, 1, 1, 1]).setMetallicFactor(0).setRoughnessFactor(1);
  for (const t of doc.getRoot().listTextures()) t.dispose();
  return doc;
}

// Split each triangle that crosses the plane p[axis] = v into whole triangles on each side (winding kept). Colors, normals and
// UVs are interpolated at the cut.
const lerp = (a, b, t) => a.map((x, k) => x + (b[k] - x) * t);
export function clip(tris, axis, v, eps = 1e-5) {
  const out = [];
  for (const t of tris) {
    const d = t.p.map(p => p[axis] - v);
    if (d.every(x => x >= -eps) || d.every(x => x <= eps)) { out.push(t); continue; }
    const V = k => ({ p: t.p[k], n: t.n[k], c: t.c[k], uv: t.uv?.[k] });
    const mix = (a, b, s) => ({ p: lerp(a.p, b.p, s), n: lerp(a.n, b.n, s), c: lerp(a.c, b.c, s), uv: a.uv && lerp(a.uv, b.uv, s) });
    const above = [], below = [];
    for (let k = 0; k < 3; k++) {
      const j = (k + 1) % 3, a = V(k), b = V(j);
      (d[k] >= 0 ? above : below).push(a);
      if ((d[k] > 0 && d[j] < 0) || (d[k] < 0 && d[j] > 0)) { const m = mix(a, b, d[k] / (d[k] - d[j])); above.push(m); below.push(m); }
    }
    for (const poly of [above, below]) for (let k = 1; k + 1 < poly.length; k++) {
      const q = [poly[0], poly[k], poly[k + 1]];
      out.push({ p: q.map(x => x.p), n: q.map(x => x.n), c: q.map(x => x.c), ...(t.uv ? { uv: q.map(x => x.uv) } : {}) });
    }
  }
  return out;
}
export const centroid = t => [0, 1, 2].map(k => (t.p[0][k] + t.p[1][k] + t.p[2][k]) / 3);
export const faceNormal = t => { const n = [0, 1, 2].map(k => (t.n[0][k] + t.n[1][k] + t.n[2][k]) / 3), l = Math.hypot(...n) || 1; return n.map(x => x / l); };
export const paint = (t, rgb) => { t.c = t.c.map(() => rgb.slice()); return t; };

// three.js BufferGeometry (position, normal, color in linear, optional uv) -> triangles
export function trisFromGeometry(g) {
  const ng = g.index ? g.toNonIndexed() : g, P = ng.attributes.position, N = ng.attributes.normal, C = ng.attributes.color, U = ng.attributes.uv, tris = [];
  for (let i = 0; i + 2 < P.count; i += 3) {
    const vs = [i, i + 1, i + 2];
    tris.push({ p: vs.map(k => [P.getX(k), P.getY(k), P.getZ(k)]), n: vs.map(k => [N.getX(k), N.getY(k), N.getZ(k)]),
      c: vs.map(k => C ? [l2s(C.getX(k)), l2s(C.getY(k)), l2s(C.getZ(k))] : [255, 255, 255]), ...(U ? { uv: vs.map(k => [U.getX(k), U.getY(k)]) } : {}) });
  }
  return tris;
}

// A node with one mesh (one primitive per material) under parent (a scene or a node)
export function addNode(doc, parent, name, byMaterial, { translation } = {}) {
  const mesh = doc.createMesh(name);
  for (const [mat, tris] of byMaterial) { if (!tris.length) continue; const prim = doc.createPrimitive().setMaterial(mat); writeTris(doc, prim, tris); mesh.addPrimitive(prim); }
  const node = doc.createNode(name).setMesh(mesh); if (translation) node.setTranslation(translation);
  parent.addChild(node); return node;
}
