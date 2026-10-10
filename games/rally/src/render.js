import * as THREE from 'three';
import ASSETS from './assets.json';
import { SnowView } from './snowView.js';
import { PadView, SURF_LOOK } from './render/padView.js';

export function geomFromPart(part, recenter = false) {
  const g = new THREE.BufferGeometry();
  const p = new Float32Array(part.p);
  if (recenter) {
    const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (let i = 0; i < p.length; i++) { mn[i % 3] = Math.min(mn[i % 3], p[i]); mx[i % 3] = Math.max(mx[i % 3], p[i]); }
    for (let i = 0; i < p.length; i++) p[i] -= (mn[i % 3] + mx[i % 3]) / 2;
  }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const c = new Float32Array(part.c.length);
  const col = new THREE.Color();
  for (let i = 0; i < c.length; i += 3) {
    col.setRGB(part.c[i] / 255, part.c[i + 1] / 255, part.c[i + 2] / 255, THREE.SRGBColorSpace); // sRGB -> linear once
    c[i] = col.r; c[i + 1] = col.g; c[i + 2] = col.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  g.setIndex(part.i);
  g.computeVertexNormals();
  return g;
}

// Repaint the Kenney blue-grey body panels in the livery colour, keeping shading.
function repaint(geom, hex) {
  const c = geom.getAttribute('color'), paint = new THREE.Color(hex);
  const ref = new THREE.Color().setRGB(109 / 255, 110 / 255, 131 / 255, THREE.SRGBColorSpace);
  const refL = ref.r * 0.3 + ref.g * 0.59 + ref.b * 0.11;
  for (let i = 0; i < c.count; i++) {
    const r = c.getX(i), g = c.getY(i), b = c.getZ(i);
    const isPaint = b > r * 1.12 && b > g * 1.1 && r > 0.1 && r < 0.25;
    if (!isPaint) continue;
    const l = (r * 0.3 + g * 0.59 + b * 0.11) / refL;
    c.setXYZ(i, paint.r * l, paint.g * l, paint.b * l);
  }
}

export class Renderer {
  constructor(canvas) {
    this.r = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.r.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.r.shadowMap.enabled = true; this.r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.r.toneMapping = THREE.ACESFilmicToneMapping; this.r.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(62, 1, 0.1, 1500);
    this.camMode = 0; // 0 chase, 1 bumper, 2 bonnet
    const hemi = this.hemi = new THREE.HemisphereLight(0xdfeaf2, 0x6b5d4a, 1.1);
    this.scene.add(hemi);
    this.sunOffset = new THREE.Vector3(25, 45, 18);
    this.sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera; sc.left = sc.bottom = -30; sc.right = sc.top = 30; sc.near = 1; sc.far = 120;
    this.sun.shadow.bias = -0.0005;
    this.scene.add(this.sun, this.sun.target);
    this.view = null; this.worldToken = 0;
    this.camPos = new THREE.Vector3(0, 4, -8); this.camLook = new THREE.Vector3();
    this.tmpQ = new THREE.Quaternion(); this.tmpV = new THREE.Vector3();
    this.setSurface('gravel');
  }

  // Swap the world's visuals. Pads build PadView synchronously; other kinds load
  // render/<kind>View.js lazily (an esbuild glob import, so the bundle builds without it).
  // Track views: `new TrackView(scene, world)` with sync(sim) and dispose(). Resolves when the
  // view is in the scene; a newer setWorld call wins over a pending one.
  setWorld(world) {
    const token = ++this.worldToken;
    if (this.view) { this.view.dispose(); this.view = null; }
    if (world.kind === 'pad') {
      this.view = new PadView(this.scene, world);
      this.setSurface(world.surfaceKey || 'gravel');
      return Promise.resolve(this.view);
    }
    this.setLook({ sky: 0xb7c6cc, low: false });
    return import(`./render/${world.kind}View.js`).then((mod) => {
      if (token !== this.worldToken) return null;
      const View = mod[world.kind[0].toUpperCase() + world.kind.slice(1) + 'View']; // e.g. TrackView
      this.view = new View(this.scene, world);
      // The view's theme decides the sun and sky; it keeps its own (longer) fog for the hills.
      if (this.view.look) { const fog = this.scene.fog; this.setLook(this.view.look); this.scene.fog = fog; }
      return this.view;
    });
  }

  setLook({ sky, low }) {
    // Snow gets a low raking sun and less sky fill so ruts and berms throw shadows.
    this.sunOffset.set(...(low ? [34, 15, 22] : [25, 45, 18]));
    this.hemi.intensity = low ? 0.85 : 1.1; this.sun.intensity = low ? 3.6 : 2.4;
    this.scene.background = new THREE.Color(sky);
    this.scene.fog = new THREE.Fog(sky, 60, 330);
  }

  // Pad surface: ground texture plus the matching sky and lighting.
  setSurface(key) {
    this.setLook({ sky: SURF_LOOK[key].sky, low: key === 'snow' });
    if (this.view?.setSurface) this.view.setSurface(key);
  }

  setCar(car) {
    if (this.carGroup) this.scene.remove(this.carGroup);
    const cfg = car.cfg, parts = ASSETS[cfg.model];
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.15 });
    const [sx, sy, sz] = cfg.body.scale;
    const shell = new THREE.Group();
    for (const [name, part] of Object.entries(parts)) {
      if (name.startsWith('wheel')) continue;
      const geo = geomFromPart(part);
      const m = new THREE.Mesh(geo, bodyMat); m.castShadow = true; shell.add(m);
    }
    shell.scale.set(sx, sy, sz);
    shell.position.set(0, -cfg.comHeight + cfg.radius - 0.3 * sy + (car.cfg.travel - car.staticComp) * 0, car.zMid);
    g.add(shell);
    this.scene.add(g);
    const wheelMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
    const ws = cfg.radius / 0.3;
    this.wheelMeshes = car.wheels.map((w) => {
      const src = parts[w.left ? 'wheel-front-left' : 'wheel-front-right'];
      const geo = geomFromPart(src, true); geo.scale(ws, ws, ws);
      const m = new THREE.Mesh(geo, wheelMat); m.castShadow = true; this.scene.add(m); return m;
    });
    if (this.oldWheels) this.oldWheels.forEach((m) => this.scene.remove(m));
    this.oldWheels = this.wheelMeshes;
    this.carGroup = g;
  }

  sync(sim) {
    const car = sim.car, b = car.body, p = b.translation(), q = b.rotation();
    if (sim.snow) {
      if (!this.snowView) this.snowView = new SnowView(this.r, this.scene);
      const f = car.wheels[0].center, r = car.wheels[2].center, l = Math.hypot(f.x - r.x, f.z - r.z) || 1;
      this.snowView.show(true);
      this.snowView.update(sim.snow, p, { x: (f.x - r.x) / l, z: (f.z - r.z) / l });
    } else if (this.snowView) this.snowView.show(false);
    this.carGroup.position.set(p.x, p.y, p.z);
    this.carGroup.quaternion.set(q.x, q.y, q.z, q.w);
    const bq = this.carGroup.quaternion;
    const steerQ = new THREE.Quaternion(), spinQ = new THREE.Quaternion();
    const Y = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0);
    car.wheels.forEach((w, i) => {
      const m = this.wheelMeshes[i];
      m.position.set(w.center.x, w.center.y, w.center.z);
      steerQ.setFromAxisAngle(Y, w.steer); spinQ.setFromAxisAngle(X, w.spin);
      m.quaternion.copy(bq).multiply(steerQ).multiply(spinQ);
    });
    if (this.view) { this.view.update?.(this.cam); this.view.sync(sim); }
  }

  updateCamera(sim, dt) {
    const car = sim.car, b = car.body, p = b.translation(), q = b.rotation(), v = b.linvel();
    const cp = new THREE.Vector3(p.x, p.y, p.z), bq = new THREE.Quaternion(q.x, q.y, q.z, q.w);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(bq); fwd.y = 0; fwd.normalize();
    const vel = new THREE.Vector3(v.x, 0, v.z);
    if (this.camMode === 0) {
      // Chase: look direction blends body heading with travel direction so slides read.
      const sp = vel.length();
      const dir = fwd.clone();
      if (sp > 3) dir.lerp(vel.normalize(), Math.min(0.55, (sp - 3) / 20)).normalize();
      if (!this.chaseDir) this.chaseDir = dir.clone();
      this.chaseDir.lerp(dir, 1 - Math.exp(-dt * 3.5)).normalize();
      const want = cp.clone().addScaledVector(this.chaseDir, -6.8).add(new THREE.Vector3(0, 2.4, 0));
      this.camPos.lerp(want, 1 - Math.exp(-dt * 8));
      const look = cp.clone().addScaledVector(this.chaseDir, 3).add(new THREE.Vector3(0, 0.6, 0));
      this.camLook.lerp(look, 1 - Math.exp(-dt * 12));
      this.cam.position.copy(this.camPos); this.cam.lookAt(this.camLook);
      this.cam.fov = 62 + Math.min(10, sp * 0.25); this.cam.updateProjectionMatrix();
    } else {
      const off = this.camMode === 1 ? new THREE.Vector3(0, 0.05, car.wheels[0].local.z + 0.9) : new THREE.Vector3(0, 0.62, 0.35);
      this.cam.position.copy(cp).add(off.applyQuaternion(bq));
      const look = cp.clone().add(new THREE.Vector3(0, 0.3, 20).applyQuaternion(bq));
      this.cam.up.set(0, 1, 0).applyQuaternion(bq);
      this.cam.lookAt(look); this.cam.up.set(0, 1, 0);
      this.cam.fov = 72; this.cam.updateProjectionMatrix();
    }
    this.sun.position.set(p.x, p.y, p.z).add(this.sunOffset); this.sun.target.position.set(p.x, p.y, p.z);
  }

  resize(w, h) { this.r.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); }
  render() { this.r.render(this.scene, this.cam); }
}
