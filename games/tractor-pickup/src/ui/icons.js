// Render one portrait per animal type to a data URL for the slot bar and the sticker card.
import * as THREE from 'three';
import { ASSETS, geoFrom } from '../render/gfx.js';
import { MODEL, copper } from '../render/animals3d.js';
export function renderIcons(renderer) {
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50); cam.position.set(1.9, 2.2, 3.1); cam.lookAt(0, 0.6, 0); // the whole animal (Cube Pets stand about 1.7 m, the bunny's ears 2.1 m)
  scene.add(new THREE.HemisphereLight('#ffffff', '#b9a27c', 2.2)); const d = new THREE.DirectionalLight('#ffffff', 1.5); d.position.set(2, 4, 3); scene.add(d);
  const N = 256, rt = new THREE.WebGLRenderTarget(N, N), px = new Uint8Array(N * N * 4), cv = document.createElement('canvas'); cv.width = cv.height = N; // 256 px: the sticker card shows it big; the slot bar scales it down by CSS
  const out = { golden: {} }, mat = new THREE.MeshLambertMaterial({ vertexColors: true }), gold = new THREE.MeshStandardMaterial({ color: '#ffd24a', metalness: 0.7, roughness: 0.3, emissive: '#6a4a00' });
  const clear = new THREE.Color(); renderer.getClearColor(clear); const clearA = renderer.getClearAlpha();
  for (const [type, model] of Object.entries(MODEL)) for (const golden of [false, true]) {
    const g = new THREE.Group(); ASSETS[model].parts.forEach(p => g.add(new THREE.Mesh(geoFrom([type === 'chicken' ? copper(p) : p]), golden ? gold : mat))); g.rotation.y = -0.5; scene.add(g);
    renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, cam); renderer.readRenderTargetPixels(rt, 0, 0, N, N, px); renderer.setRenderTarget(null);
    const img = cv.getContext('2d').createImageData(N, N); for (let y = 0; y < N; y++) img.data.set(px.subarray((N - 1 - y) * N * 4, (N - y) * N * 4), y * N * 4);
    cv.getContext('2d').putImageData(img, 0, 0); (golden ? out.golden : out)[type] = cv.toDataURL(); scene.remove(g);
    g.traverse(m => m.geometry?.dispose());
  }
  renderer.setClearColor(clear, clearA); rt.dispose();
  return out;
}
