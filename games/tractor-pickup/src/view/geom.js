// Model geometry for instancing and merged statics (3l Task 15; was render/gfx.js geoFrom over assets.json): every mesh of a baked
// model in model space, merged, with float attributes. Baked GLBs are meshopt-quantized (normalized ints), so attributes are
// denormalized to Float32 before any transform. Cached per (assets, key); never per frame.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
const KEEP = ['position', 'normal', 'color', 'uv'];
const f32 = a => { const n = a.count, s = a.itemSize, out = new Float32Array(n * s); for (let i = 0; i < n; i++) for (let k = 0; k < s; k++) out[i * s + k] = a.getComponent(i, k); return new THREE.BufferAttribute(out, s); };
function floatCopy(mesh, withUv) {
  const g = new THREE.BufferGeometry(), src = mesh.geometry;
  for (const k of KEEP) if (src.attributes[k] && (k !== 'uv' || withUv)) g.setAttribute(k, f32(src.attributes[k]));
  if (src.attributes.color && src.attributes.color.itemSize === 4) g.setAttribute('color', f32(src.attributes.color)); // RGBA kept as is
  if (src.index) g.setIndex(Array.from(src.index.array));
  return g.applyMatrix4(mesh.matrixWorld);
}
const cache = new WeakMap();
export function modelGeometry(assets, key, { uv = false } = {}) {
  let per = cache.get(assets); if (!per) cache.set(assets, per = new Map());
  const ck = key + (uv ? '|uv' : ''); if (per.has(ck)) return per.get(ck);
  const root = assets.get(key).scene, list = []; root.updateMatrixWorld(true);
  root.traverse(o => { if (o.isMesh) list.push(floatCopy(o, uv)); });
  const g = list.length === 1 ? list[0] : mergeGeometries(list, false); g.userData.lhShared = true; per.set(ck, g); return g; // shared by every farm: disposeTree keeps it
}
export function partGeometry(assets, key, node, { uv = false } = {}) {
  const root = assets.get(key).scene; root.updateMatrixWorld(true);
  const o = root.getObjectByName(node); if (!o?.isMesh) throw new Error(`geom: ${key} has no mesh '${node}'`);
  return floatCopy(o, uv);
}
