// Cube Pets in the view (3l Task 15; was render/gfx.js animM/sampleAnim over assets.json): per kind, the part geometries in the anim
// table's part order (each in its node's own space, as the table's frames are pet-space matrices per part) and the hat's frame. The
// hat row is the table's 'sock-hat' row when the bake samples sockets (CI-2); otherwise the hat rides its parent part: the part's
// frame × the inverse of that part's rest matrix × the socket (body space, from the sidecar).
import * as THREE from 'three';
import { sampleAnimTable } from 'lion-hawk/view';
const kinds = new WeakMap(), M = new THREE.Matrix4();
export function petKind(assets, key) {
  let per = kinds.get(assets); if (!per) kinds.set(assets, per = new Map()); if (per.has(key)) return per.get(key);
  const a = assets.get(key), table = a.anim, scene = a.scene; scene.updateMatrixWorld(true);
  const parts = [];
  table.parts.forEach((name, index) => { const o = scene.getObjectByName(name); if (o?.isMesh) { o.geometry.userData.lhShared = true; parts.push({ name, index, geometry: o.geometry }); } }); // the template's: disposeTree keeps it
  const row = table.parts.indexOf('sock-hat'), sock = a.sockets?.hat;
  let hat;
  if (row >= 0) hat = (clip, t, out) => posePart(kind, clip, t, row, out);
  else {
    if (!sock) throw new Error(`pets: ${key} has no hat socket`);
    const parent = parts.find(p => p.name === sock.part) ?? parts.find(p => p.name === 'body');
    const restInv = scene.getObjectByName(parent.name).matrixWorld.clone().invert();
    const local = new THREE.Matrix4().compose(new THREE.Vector3(...sock.p), new THREE.Quaternion(...sock.q), new THREE.Vector3(1, 1, 1));
    const after = new THREE.Matrix4().multiplyMatrices(restInv, local);
    hat = (clip, t, out) => { posePart(kind, clip, t, parent.index, M); return out.multiplyMatrices(M, after); };
  }
  const kind = { key, table, parts, hat };
  per.set(key, kind); return kind;
}
export function posePart(kind, clip, t, index, out) {
  sampleAnimTable(kind.table, kind.table.clips[clip] ? clip : 'idle', t, index, out); return out;
}
export const hasClip = (kind, clip) => !!kind.table.clips[clip];
