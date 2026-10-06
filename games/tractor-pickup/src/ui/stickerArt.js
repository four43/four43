// W-1: die-cut stickers. The animal model in the sticker's pose (one frame of an animation) and camera angle, rendered on a clear
// background, cropped to the animal, with a thick white border that follows its outline. Each look is rendered once, then cached.
import * as THREE from 'three';
import { ASSETS, geoFrom, PET_ANIMS, sampleAnim } from '../render/gfx.js';
import { MODEL } from '../render/animals3d.js';

// pose -> [animation, the moment in it as a part of its length]: a frame where the pose reads clearly
export const POSE_FRAME = { idle: ['idle', 0.2], walk: ['walk', 0.25], run: ['run', 0.3], dance: ['dance', 0.35], eat: ['eat', 0.5], shake: ['gesture-negative', 0.4] };
// view -> the animal turned by yaw (0 faces the camera) and the camera raised by pitch (rad)
export const VIEW_ANGLES = [{ yaw: -0.55, pitch: 0.22 }, { yaw: 0.55, pitch: 0.22 }, { yaw: -1.05, pitch: 0.3 }, { yaw: 1.05, pitch: 0.3 }, { yaw: -0.3, pitch: 0.55 }];
const N = 384, BORDER = 11; // render size and white border (px)

export function createStickerArt(renderer) {
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
  scene.add(new THREE.HemisphereLight('#ffffff', '#b9a27c', 2.2)); const sun = new THREE.DirectionalLight('#ffffff', 1.6); sun.position.set(2, 5, 4); scene.add(sun);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true }), gold = new THREE.MeshStandardMaterial({ color: '#ffd24a', metalness: 0.7, roughness: 0.3, emissive: '#6a4a00' });
  const rt = new THREE.WebGLRenderTarget(N, N), px = new Uint8Array(N * N * 4), cache = new Map(), box = new THREE.Box3(), c = new THREE.Vector3(), sz = new THREE.Vector3();
  function render({ type, golden, pose, view }) {
    const model = MODEL[type], anims = PET_ANIMS[model], [anim, at] = POSE_FRAME[pose] || POSE_FRAME.idle, name = anims[anim] ? anim : 'idle', v = VIEW_ANGLES[view] || VIEW_ANGLES[0];
    const g = new THREE.Group(); g.rotation.y = v.yaw;
    ASSETS[model].parts.forEach((p, i) => { const m = new THREE.Mesh(geoFrom([p]), golden ? gold : mat); m.matrixAutoUpdate = false; sampleAnim(anims, name, at * anims[name].dur, i, m.matrix); g.add(m); });
    scene.add(g); g.updateMatrixWorld(true); box.setFromObject(g); box.getCenter(c); const r = box.getSize(sz).length() / 2;
    const d = r / Math.sin(cam.fov * Math.PI / 360) * 1.02; cam.position.set(c.x, c.y + Math.sin(v.pitch) * d, c.z + Math.cos(v.pitch) * d); cam.lookAt(c);
    const clear = new THREE.Color(), clearA = renderer.getClearAlpha(); renderer.getClearColor(clear);
    renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, cam); renderer.readRenderTargetPixels(rt, 0, 0, N, N, px);
    renderer.setRenderTarget(null); renderer.setClearColor(clear, clearA); scene.remove(g); g.traverse(m => m.geometry?.dispose());
    // crop to the animal (rows come bottom-up from the GPU)
    let x0 = N, y0 = N, x1 = -1, y1 = -1;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (px[(y * N + x) * 4 + 3] > 8) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    if (x1 < 0) return { src: '', w: 1, h: 1 };
    const w = x1 - x0 + 1, h = y1 - y0 + 1, art = document.createElement('canvas'); art.width = w; art.height = h;
    const img = art.getContext('2d').createImageData(w, h);
    for (let y = 0; y < h; y++) img.data.set(px.subarray(((y1 - y) * N + x0) * 4, ((y1 - y) * N + x1 + 1) * 4), y * w * 4);
    art.getContext('2d').putImageData(img, 0, 0);
    // the white die-cut border: the animal's shape in white, stamped all around it, under the animal
    const sil = document.createElement('canvas'); sil.width = w; sil.height = h; const sc = sil.getContext('2d');
    sc.drawImage(art, 0, 0); sc.globalCompositeOperation = 'source-in'; sc.fillStyle = '#ffffff'; sc.fillRect(0, 0, w, h);
    const out = document.createElement('canvas'); out.width = w + BORDER * 2; out.height = h + BORDER * 2; const oc = out.getContext('2d');
    for (const rr of [BORDER * 0.5, BORDER]) for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2; oc.drawImage(sil, BORDER + Math.cos(a) * rr, BORDER + Math.sin(a) * rr); }
    oc.drawImage(art, BORDER, BORDER);
    return { src: out.toDataURL(), w: out.width, h: out.height };
  }
  return {
    // { src (PNG data URL), w, h } for a sticker { type, golden, pose, view }
    get(s) { const key = `${s.type}|${!!s.golden}|${s.pose}|${s.view}`; if (!cache.has(key)) cache.set(key, render(s)); return cache.get(key); },
  };
}
