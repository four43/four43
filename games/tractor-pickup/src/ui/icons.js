// Render one portrait per animal type to a data URL for the slot bar and the sticker card.
import * as THREE from 'three';
import { ASSETS, geoFrom, PET_ANIMS, sampleAnim } from '../render/gfx.js';
import { MODEL } from '../render/animals3d.js';
import { paintable } from '../render/vehicles3d.js';
export function renderIcons(renderer) {
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50); cam.position.set(1.9, 2.2, 3.1); cam.lookAt(0, 0.6, 0); // the whole animal (Cube Pets stand about 1.7 m, the bunny's ears 2.1 m)
  scene.add(new THREE.HemisphereLight('#ffffff', '#b9a27c', 2.2)); const d = new THREE.DirectionalLight('#ffffff', 1.5); d.position.set(2, 4, 3); scene.add(d);
  const N = 256, rt = new THREE.WebGLRenderTarget(N, N), px = new Uint8Array(N * N * 4), cv = document.createElement('canvas'); cv.width = cv.height = N; // 256 px: the sticker card shows it big; the slot bar scales it down by CSS
  const out = { golden: {} }, mat = new THREE.MeshLambertMaterial({ vertexColors: true }), gold = new THREE.MeshStandardMaterial({ color: '#ffd24a', metalness: 0.7, roughness: 0.3, emissive: '#6a4a00' });
  const clear = new THREE.Color(); renderer.getClearColor(clear); const clearA = renderer.getClearAlpha();
  for (const [type, model] of Object.entries(MODEL)) for (const golden of [false, true]) {
    const g = new THREE.Group(); ASSETS[model].parts.forEach((p, i) => { const m = new THREE.Mesh(geoFrom([p]), golden ? gold : mat); m.matrixAutoUpdate = false; sampleAnim(PET_ANIMS[model], 'idle', 0, i, m.matrix); g.add(m); }); g.rotation.y = -0.5; scene.add(g); // each part in its idle pose: part geometry is in its own node space (the snout sits on the face, the legs under the body)
    renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, cam); renderer.readRenderTargetPixels(rt, 0, 0, N, N, px); renderer.setRenderTarget(null);
    const img = cv.getContext('2d').createImageData(N, N); for (let y = 0; y < N; y++) img.data.set(px.subarray((N - 1 - y) * N * 4, (N - y) * N * 4), y * N * 4);
    cv.getContext('2d').putImageData(img, 0, 0); (golden ? out.golden : out)[type] = cv.toDataURL(); scene.remove(g);
    g.traverse(m => m.geometry?.dispose());
  }
  renderer.setClearColor(clear, clearA); rt.dispose();
  return out;
}

// W-3: the paint screen's picture: the tractor model in its paints, three-quarter view, to a data URL (cached per paint pair)
export function tractorPicture(renderer) {
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(28, 4 / 3, 0.1, 50), W = 480, H = 360, cache = new Map();
  scene.add(new THREE.HemisphereLight('#ffffff', '#b9a27c', 2.2)); const d = new THREE.DirectionalLight('#ffffff', 1.6); d.position.set(3, 5, 4); scene.add(d);
  const geo = paintable(Object.values(ASSETS.tractor)), mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true })); scene.add(mesh);
  const box = new THREE.Box3().setFromObject(mesh), c = box.getCenter(new THREE.Vector3()), r = box.getSize(new THREE.Vector3()).length() / 2;
  mesh.rotation.y = -0.6; cam.position.set(c.x + r * 0.2, c.y + r * 1.1, c.z + r * 3.6); cam.lookAt(c.x, c.y - r * 0.1, c.z);
  const rt = new THREE.WebGLRenderTarget(W, H), px = new Uint8Array(W * H * 4), cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  return paint => {
    const key = paint.body + '/' + paint.trim; if (cache.has(key)) return cache.get(key);
    geo.userData.paint(paint);
    const clear = new THREE.Color(); renderer.getClearColor(clear); const clearA = renderer.getClearAlpha();
    renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, cam); renderer.readRenderTargetPixels(rt, 0, 0, W, H, px); renderer.setRenderTarget(null); renderer.setClearColor(clear, clearA);
    const img = cv.getContext('2d').createImageData(W, H); for (let y = 0; y < H; y++) img.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
    cv.getContext('2d').putImageData(img, 0, 0); const url = cv.toDataURL(); cache.set(key, url); return url;
  };
}
