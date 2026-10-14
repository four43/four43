// The slot bar and sticker card portraits and the paint screen's tractor (3l Task 17; were hand-made render targets): posed baked
// models drawn with the compiled materials, rendered once each to a data URL by the engine's snapshot (3e, §4.6). Each keeps 1.8's
// fixed camera and light rig: the lights ride in the snapshotted group and the studio lights are off (lights: false).
import * as THREE from 'three';
import { snapshot } from 'lion-hawk/view';
import { petKind, posePart } from '../view/pets.js';
import { MODEL } from '../render/animals3d.js';
import { paintValues } from '../view/vehicles.js';
// 1.8's picture lights: a hemisphere (sky #ffffff, ground #b9a27c, 2.2) and a white sun of the given intensity at sunAt (aimed at the origin)
function stage(sun, sunAt) {
  const g = new THREE.Group(), d = new THREE.DirectionalLight('#ffffff', sun); d.position.fromArray(sunAt);
  g.add(new THREE.HemisphereLight('#ffffff', '#b9a27c', 2.2), d);
  return g;
}
// { [type]: dataURL, golden: { [type]: dataURL } }, 256 px (the sticker card shows it big; the slot bar scales it down by CSS)
export function renderIcons(renderer, assets, compiler) {
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50); cam.position.set(1.9, 2.2, 3.1); cam.lookAt(0, 0.6, 0); cam.updateMatrixWorld();
  const out = { golden: {} }, mat = compiler.get('pet', { vertexColors: true }), gold = compiler.get('gold'), st = stage(1.5, [2, 4, 3]);
  for (const [type, model] of Object.entries(MODEL)) for (const golden of [false, true]) {
    const k = petKind(assets, model), g = new THREE.Group(); g.rotation.y = -0.5;
    for (const p of k.parts) { const m = new THREE.Mesh(p.geometry, golden ? gold : mat); m.matrixAutoUpdate = false; posePart(k, 'idle', 0, p.index, m.matrix); g.add(m); } // part geometry is in its node's own space
    st.add(g);
    (golden ? out.golden : out)[type] = snapshot(renderer, st, { size: 256, camera: cam, lights: false });
    st.remove(g); // geometries and materials are shared (the template's, the compiler's): nothing to dispose
  }
  return out;
}
// W-3: the paint screen's picture: the tractor in a paint pair, three-quarter view, 480 × 360 (CI-13), cached per pair
export function tractorPicture(renderer, assets, compiler) {
  const cam = new THREE.PerspectiveCamera(28, 4 / 3, 0.1, 50), cache = new Map(), st = stage(1.6, [3, 5, 4]), obj = assets.clone('tractor');
  st.add(obj); st.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj), c = box.getCenter(new THREE.Vector3()), r = box.getSize(new THREE.Vector3()).length() / 2;
  obj.rotation.y = -0.6; cam.position.set(c.x + r * 0.2, c.y + r * 1.1, c.z + r * 3.6); cam.lookAt(c.x, c.y - r * 0.1, c.z); cam.updateMatrixWorld();
  return paint => {
    const key = paint.body + '/' + paint.trim;
    if (!cache.has(key)) { compiler.repaint(obj, paintValues(paint)); cache.set(key, snapshot(renderer, st, { size: [480, 360], camera: cam, lights: false })); }
    return cache.get(key);
  };
}
