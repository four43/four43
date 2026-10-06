import * as THREE from 'three';
import ASSETS from '../assets.json';
export { ASSETS };
export const s2l = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };

// ---------- geometry helpers (shared) ----------------------------------------------------
export function geoFrom(parts, xf) {
  let nv = 0, ni = 0; for (const p of parts) { nv += p.pos.length / 3; ni += p.idx.length; }
  const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), col = new Float32Array(nv * 3), idx = new Uint32Array(ni);
  let ov = 0, oi = 0;
  for (const p of parts) {
    pos.set(p.pos, ov * 3); nrm.set(p.nrm, ov * 3);
    for (let i = 0; i < p.col.length; i++) col[ov * 3 + i] = s2l(p.col[i]);
    for (let i = 0; i < p.idx.length; i++) idx[oi + i] = p.idx[i] + ov;
    ov += p.pos.length / 3; oi += p.idx.length;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(new THREE.BufferAttribute(idx, 1));
  if (parts.every(p => p.uv)) { const uv = new Float32Array(nv * 2); let o = 0; for (const p of parts) { uv.set(p.uv, o); o += p.uv.length; } g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); } // textured model parts (the barn)
  if (xf) g.applyMatrix4(xf);
  return g;
}
export const colorGeo = (g, hex) => { const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
export function mergeGeos(list) {
  const parts = list.map(g => { const ng = g.index ? g.toNonIndexed() : g; return ng; });
  let n = 0; for (const g of parts) n += g.attributes.position.count;
  const out = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'color']) { const a = new Float32Array(n * 3); let o = 0; for (const g of parts) { a.set(g.attributes[k].array, o); o += g.attributes[k].array.length; } out.setAttribute(k, new THREE.BufferAttribute(a, 3)); }
  return out;
}
export const boxGeo = (w, h, d, x, y, z, hex) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return colorGeo(g, hex); };


// baked Cube Pets animation tables -> Matrix4 frames
export const animM = pet => Object.fromEntries(Object.entries(ASSETS[pet].anims).map(([k, a]) => [k, { dur: a.dur, frames: a.frames.map(f => f.map(arr => new THREE.Matrix4().fromArray(arr))) }]));
export function sampleAnim(anims, name, t, partIdx, out) {
  const a = anims[name]; const n = a.frames.length; const f = ((t / a.dur) % 1 + 1) % 1 * n;
  const i0 = Math.floor(f) % n, i1 = (i0 + 1) % n, u = f - Math.floor(f);
  const A = a.frames[i0][partIdx].elements, B = a.frames[i1][partIdx].elements, o = out.elements;
  for (let k = 0; k < 16; k++) o[k] = A[k] + (B[k] - A[k]) * u;
  return out;
}

// One Matrix4 table per pet, built once.
export const PET_ANIMS = Object.fromEntries(['pig', 'cow', 'chick', 'bunny', 'dog', 'sheep', 'duck', 'chicken'].map(p => [p, animM(p)]));
