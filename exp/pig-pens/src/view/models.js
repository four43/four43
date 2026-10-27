// Geometry from baked models (phase 3k; replaces gfx.js over assets.json): a model's mesh nodes in model space merged into
// one geometry (position, normal, color) so one instanced draw covers it, or one part in its node-local space for the
// anim-table crowds (the bake writes every model's colours into COLOR_0). Plus the small box/colour/merge helpers the farm builds props with.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const KEEP = ['position', 'normal', 'color'];
// a float copy of the attributes the farm draws with (baked attributes may be interleaved or normalised); one geometry
// per material group, so a multi-material mesh keeps each group's colour
function plain(mesh) {
  const g = mesh.geometry, groups = g.groups.length ? g.groups : [{ start: 0, count: g.index ? g.index.count : g.attributes.position.count, materialIndex: 0 }];
  const idx = g.index ? g.index.array : null, out = [];
  for (const gr of groups) {
    const ids = idx ? idx.subarray(gr.start, gr.start + gr.count) : Uint32Array.from({ length: gr.count }, (_, i) => gr.start + i);
    const remap = new Map(), order = [];
    const index = new Uint32Array(ids.length);
    for (let i = 0; i < ids.length; i++) { let k = remap.get(ids[i]); if (k === undefined) { k = order.length; remap.set(ids[i], k); order.push(ids[i]); } index[i] = k; }
    const o = new THREE.BufferGeometry();
    for (const key of KEEP) {
      const a = g.attributes[key], f = new Float32Array(order.length * 3);
      if (!a) throw new Error(`pig-pens: mesh '${mesh.name}' has no ${key} attribute`);
      for (let i = 0; i < order.length; i++) { f[i * 3] = a.getX(order[i]); f[i * 3 + 1] = a.getY(order[i]); f[i * 3 + 2] = a.getZ(order[i]); }
      o.setAttribute(key, new THREE.BufferAttribute(f, 3));
    }
    o.setIndex(new THREE.BufferAttribute(index, 1));
    out.push(o);
  }
  return out.length === 1 ? out[0] : mergeGeometries(out, false);
}
// a mesh of the baked node `name`: GLTFLoader names a one-primitive mesh after its node, and makes a node with several
// primitives (one per material) a group of that name whose meshes sit at its origin
const ofNode = (o, name) => o.name === name || (o.parent?.name === name && !o.parent.isMesh && !o.parent.isScene);
const ofAny = (o, names) => names.some(n => ofNode(o, n));
// every mesh of `key` (or only those of the nodes named in `parts`) in model space, merged; `xf` applied last
export function modelGeometry(assets, key, xf = null, { parts = null } = {}) {
  const { scene } = assets.get(key), list = [];
  scene.updateMatrixWorld(true);
  scene.traverse(o => { if (o.isMesh && (!parts || ofAny(o, parts))) list.push(plain(o).applyMatrix4(o.matrixWorld)); });
  if (!list.length) throw new Error(`pig-pens: model '${key}' has no mesh${parts ? ` in ${parts.join(', ')}` : ''}`);
  const g = list.length === 1 ? list[0] : mergeGeometries(list, false);
  if (xf) g.applyMatrix4(xf);
  return g;
}
// one node's geometry in its own node-local space (the pet crowds' anim tables give the node's model-space matrix)
export function partGeometry(assets, key, name) {
  const list = [];
  assets.get(key).scene.traverse(o => { if (o.isMesh && ofNode(o, name)) list.push(plain(o)); });
  if (!list.length) throw new Error(`pig-pens: model '${key}' has no part '${name}'`);
  return list.length === 1 ? list[0] : mergeGeometries(list, false);
}
// every mesh under `node` merged into one geometry in the node's own space (the buildings' animated groups: one draw each)
export function geometryUnder(node) {
  node.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(node.matrixWorld).invert(), m = new THREE.Matrix4(), list = [];
  node.traverse(o => { if (o.isMesh) list.push(plain(o).applyMatrix4(m.multiplyMatrices(inv, o.matrixWorld))); });
  return !list.length ? null : list.length === 1 ? list[0] : mergeGeometries(list, false);
}
export const colorGeo = (g, hex) => { const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
export function mergeGeos(list) {
  const parts = list.map(g => g.index ? g.toNonIndexed() : g);
  let n = 0; for (const g of parts) n += g.attributes.position.count;
  const out = new THREE.BufferGeometry();
  for (const k of KEEP) { const a = new Float32Array(n * 3); let o = 0; for (const g of parts) { a.set(g.attributes[k].array, o); o += g.attributes[k].array.length; } out.setAttribute(k, new THREE.BufferAttribute(a, 3)); }
  return out;
}
export const boxGeo = (w, h, d, x, y, z, hex) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); g.deleteAttribute('uv'); return colorGeo(g, hex); };
export const lerpM = (a, b, u, out) => { const A = a.elements, B = b.elements, o = out.elements; for (let k = 0; k < 16; k++) o[k] = A[k] + (B[k] - A[k]) * u; return out; };
// the one decor material, plain and instanced (M-13: separate materials by construction)
export const sceneryMaterials = mc => ({ plain: mc.get('scenery', { vertexColors: true }), instanced: mc.get('scenery', { instanced: true, vertexColors: true }) });
