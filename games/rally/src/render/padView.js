// Visuals for a PadWorld: textured ground, painted lines, ramps, humps, slope and instanced
// cones drawn from the transform pool. Interface shared with TrackView: constructor(scene, world, kit), sync(sim),
// dispose(); pads also have setSurface(key). kit = { assets, mc }: every material comes from the engine's compiler.
import * as THREE from 'three';
import { createInstances } from 'lion-hawk/view';
import { SNOW } from '../snow.js';
import { materialOf } from '../surface.js';

export const SURF_LOOK = {
  tarmac: { base: '#4a4d52', speck: ['#5b5f64', '#3d4045', '#6a6d70'], specks: 0.5, sky: 0x9fb8c8 },
  hardpack: { base: '#7a5f45', speck: ['#8c6f52', '#634b36', '#977a5c'], specks: 0.45, sky: 0xb4c4c9 },
  gravel: { base: '#8d7a62', speck: ['#a8957a', '#6f5f4b', '#b9a88d', '#7d6b55'], specks: 0.75, sky: 0xb7c6cc },
  snow:   { base: '#f2f5f9', speck: ['#ffffff', '#d5dee6', '#c9d4de'], specks: 0.35, sky: 0xc9d6e0 },
  ice:    { base: '#bcd3e0', speck: ['#d9e8f0', '#a6c1d2', '#e8f2f7'], specks: 0.25, sky: 0xc4d4de },
};

// One texture per (surface, repeat), kept for the page: the compiler keys materials by map, so a texture made per pad
// would leak a compiled material per rebuild.
const TEXTURES = new Map();
export function surfaceTextureOf(key, repeat) {
  const k = `${key}|${repeat}`;
  let t = TEXTURES.get(k);
  if (!t) TEXTURES.set(k, t = surfaceTexture(key, repeat));
  return t;
}
export function surfaceTexture(key, repeat) {
  const L = SURF_LOOK[key];
  const cv = document.createElement('canvas'); cv.width = cv.height = 512;
  const x = cv.getContext('2d');
  x.fillStyle = L.base; x.fillRect(0, 0, 512, 512);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const n = Math.floor(9000 * L.specks);
  for (let i = 0; i < n; i++) {
    x.fillStyle = L.speck[Math.floor(rnd() * L.speck.length)];
    const s = 1 + rnd() * (key === 'gravel' ? 3.5 : 2);
    x.globalAlpha = 0.35 + rnd() * 0.5;
    x.fillRect(rnd() * 512, rnd() * 512, s, s);
  }
  x.globalAlpha = 1;
  if (key === 'ice') { // long glossy streaks
    x.strokeStyle = 'rgba(255,255,255,0.25)';
    for (let i = 0; i < 40; i++) { x.lineWidth = 1 + rnd() * 3; x.beginPath(); const y = rnd() * 512; x.moveTo(0, y); x.bezierCurveTo(170, y + rnd() * 40 - 20, 340, y + rnd() * 40 - 20, 512, y); x.stroke(); }
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

export class PadView {
  constructor(scene, world, kit) {
    this.scene = scene; this.world = world; this.kit = kit;
    const pad = world.pad, mc = kit.mc;
    const root = this.root = new THREE.Group();
    const ground = this.ground = new THREE.Mesh(new THREE.PlaneGeometry(pad.size, pad.size), mc.get(materialOf('gravel'), { map: surfaceTextureOf('gravel', pad.size / 8) }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; root.add(ground);
    // Painted skidpad circle and a start box.
    const paint = mc.get('pad-paint'); // the painted skidpad ring and start line
    const sp = pad.skidpad;
    const ring = new THREE.Mesh(new THREE.RingGeometry(sp.r - 0.15, sp.r + 0.15, 160), paint);
    ring.rotation.x = -Math.PI / 2; ring.position.set(sp.x, 0.02, sp.z); root.add(ring);
    const line = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.4), paint);
    line.rotation.x = -Math.PI / 2; line.position.set(pad.start.x, 0.02, pad.start.z + 3); root.add(line);
    const prop = mc.get('pad-prop'), stripe = mc.get('pad-stripe');
    for (const r of pad.ramps) {
      const ang = Math.atan2(r.h, r.len), hl = Math.hypot(r.len, r.h);
      const m = new THREE.Mesh(new THREE.BoxGeometry(r.w, 1, hl), prop);
      m.castShadow = m.receiveShadow = true;
      m.position.set(r.x + Math.sin(r.yaw) * r.len / 2, r.h / 2 - 0.5 * Math.cos(ang), r.z + Math.cos(r.yaw) * r.len / 2);
      m.rotation.order = 'YXZ'; m.rotation.y = r.yaw; m.rotation.x = -ang; root.add(m);
    }
    for (const b of pad.bumps) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(b.r, b.r, b.w, 24), stripe);
      m.rotation.z = Math.PI / 2; m.position.set(b.x, -b.r + b.depth, b.z); m.castShadow = m.receiveShadow = true; root.add(m);
    }
    const s = pad.slope;
    if (s) {
      const ang = Math.atan(s.grade);
      const sl = new THREE.Mesh(new THREE.BoxGeometry(s.w, 2, s.len / Math.cos(ang)), prop);
      sl.position.set(s.x, s.len / 2 * s.grade - 1 / Math.cos(ang), s.z + s.len / 2); sl.rotation.x = -ang;
      sl.castShadow = sl.receiveShadow = true; root.add(sl);
    }
    // Cones: the baked cone recentred and scaled as before, instanced through the engine, posed from the pool.
    const tpl = kit.assets.get('cone').scene; tpl.updateMatrixWorld(true);
    let src = null; tpl.traverse((o) => { if (o.isMesh && !src) src = o; });
    const coneG = src.geometry.clone().applyMatrix4(src.matrixWorld); // in model space
    coneG.center(); coneG.scale(1.6, 1.6, 1.6);
    this.coneG = coneG;
    this.conesInst = createInstances({ geometry: coneG, material: mc.get('cone', { instanced: true, vertexColors: !!coneG.attributes.color }),
      max: Math.max(1, world.props.length), castShadow: true, receiveShadow: false });
    this.conesInst.count = world.props.length;
    root.add(this.conesInst.mesh);
    scene.add(root);
    this.at = { x: 0, y: 0, z: 0 };
  }

  setSurface(key) {
    this.ground.material = this.kit.mc.get(materialOf(key === 'snow' ? 'packed' : key), { map: surfaceTextureOf(key, this.world.pad.size / 8) });
    // Under fresh snow the plain ground only shows beyond the snow window, at the snow's height.
    this.ground.position.y = key === 'snow' ? SNOW.depth - 0.005 : 0;
  }

  sync() {
    const props = this.world.props;
    for (let i = 0; i < props.length; i++) {
      const c = props[i], p = c.e.xf.p; this.at.x = p.x; this.at.y = p.y - c.home.y; this.at.z = p.z;
      this.conesInst.set(i, this.at, c.e.xf.q, 1);
    }
    this.conesInst.commit();
  }

  // Geometries only: materials are the compiler's, textures are kept for the page.
  dispose() {
    this.scene.remove(this.root);
    this.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    this.conesInst.dispose?.();
  }
}
