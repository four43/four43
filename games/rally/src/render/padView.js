// Visuals for a PadWorld: textured ground, painted lines, ramps, humps, slope and instanced
// cones synced to their physics bodies. Interface shared with TrackView:
// constructor(scene, world), sync(sim), dispose(); pads also have setSurface(key).
import * as THREE from 'three';
import ASSETS from '../assets.json';
import { SNOW } from '../snow.js';
import { geomFromPart } from '../render.js';

export const SURF_LOOK = {
  tarmac: { base: '#4a4d52', speck: ['#5b5f64', '#3d4045', '#6a6d70'], density: 0.5, sky: 0x9fb8c8 },
  hardpack: { base: '#7a5f45', speck: ['#8c6f52', '#634b36', '#977a5c'], density: 0.45, sky: 0xb4c4c9 },
  gravel: { base: '#8d7a62', speck: ['#a8957a', '#6f5f4b', '#b9a88d', '#7d6b55'], density: 0.75, sky: 0xb7c6cc },
  snow:   { base: '#f2f5f9', speck: ['#ffffff', '#d5dee6', '#c9d4de'], density: 0.35, sky: 0xc9d6e0 },
  ice:    { base: '#bcd3e0', speck: ['#d9e8f0', '#a6c1d2', '#e8f2f7'], density: 0.25, sky: 0xc4d4de },
};

export function surfaceTexture(key, repeat) {
  const L = SURF_LOOK[key];
  const cv = document.createElement('canvas'); cv.width = cv.height = 512;
  const x = cv.getContext('2d');
  x.fillStyle = L.base; x.fillRect(0, 0, 512, 512);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const n = Math.floor(9000 * L.density);
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
  constructor(scene, world) {
    this.scene = scene; this.world = world;
    const pad = world.pad;
    const root = this.root = new THREE.Group();
    this.groundMat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
    const ground = this.ground = new THREE.Mesh(new THREE.PlaneGeometry(pad.size, pad.size), this.groundMat);
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; root.add(ground);
    // Painted skidpad circle and a start box.
    const paint = new THREE.MeshBasicMaterial({ color: 0xf4efe2, transparent: true, opacity: 0.8 });
    const sp = pad.skidpad;
    const ring = new THREE.Mesh(new THREE.RingGeometry(sp.r - 0.15, sp.r + 0.15, 160), paint);
    ring.rotation.x = -Math.PI / 2; ring.position.set(sp.x, 0.02, sp.z); root.add(ring);
    const line = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.4), paint);
    line.rotation.x = -Math.PI / 2; line.position.set(pad.start.x, 0.02, pad.start.z + 3); root.add(line);
    const prop = new THREE.MeshStandardMaterial({ color: 0x9a8f80, roughness: 0.9 });
    const stripe = new THREE.MeshStandardMaterial({ color: 0xd8b13a, roughness: 0.7 });
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
    // Cones (instanced visuals synced to physics bodies).
    const coneG = geomFromPart(ASSETS.cone.cone, true);
    coneG.scale(1.6, 1.6, 1.6);
    this.cones = new THREE.InstancedMesh(coneG, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), Math.max(1, world.props.length));
    this.cones.count = world.props.length;
    this.cones.castShadow = true; root.add(this.cones);
    scene.add(root);
    this.mat = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.v = new THREE.Vector3(); this.one = new THREE.Vector3(1, 1, 1);
  }

  setSurface(key) {
    if (this.groundMat.map) this.groundMat.map.dispose();
    this.groundMat.map = surfaceTexture(key, this.world.pad.size / 8);
    this.groundMat.roughness = key === 'ice' ? 0.25 : key === 'tarmac' ? 0.85 : 0.95;
    this.groundMat.needsUpdate = true;
    // Under fresh snow the plain ground only shows beyond the snow window, at the snow's height.
    this.ground.position.y = key === 'snow' ? SNOW.depth - 0.005 : 0;
  }

  sync() {
    this.world.props.forEach((c, i) => {
      const t = c.body.translation(), r = c.body.rotation();
      this.q.set(r.x, r.y, r.z, r.w); this.mat.compose(this.v.set(t.x, t.y - c.home.y, t.z), this.q, this.one);
      this.cones.setMatrixAt(i, this.mat);
    });
    this.cones.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.root);
    this.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
    });
  }
}
