// Rally's 3D scene on the engine renderer (lion-hawk phase 3, overview §4.6): boot owns the WebGL renderer, the scene,
// the camera, resize and the one render per frame; view sync draws the car. This module owns the car's static shaping
// (a sync hook), the world views, the snow view, the looks (light-rig presets) and the camera wiring.
import * as THREE from 'three';
import { SnowView } from './snowView.js';
import { PadView, SURF_LOOK } from './render/padView.js';
import { createRallyCamera } from './render/camera.js';

// Looks as light-rig presets (3e): sky = background and fog colour; snow (the snow pad, winter) gets a low raking sun
// and less sky fill so ruts and berms throw shadows. Pad looks keep the short pad fog, track themes the long hill fog.
const SUN = { day: [25, 45, 18], low: [34, 15, 22] }; // sun offset from the car
const TRACK_LOOK = { summer: { sky: 0xa9c3d4, low: false, fog: [150, 700] }, winter: { sky: 0xc9d6e0, low: true, fog: [150, 700] } };
const hex = n => '#' + n.toString(16).padStart(6, '0');
const look = (sky, low, fog) => ({ sky: hex(sky), hemi: low ? 0.85 : 1.1, sun: { intensity: low ? 3.6 : 2.4, offset: low ? SUN.low : SUN.day }, fog });
export const RENDER = {
  shading: 'standard', dpr: { touch: 2, desktop: 2 }, antialias: true, shadows: 'pcf', toneMapping: 'aces', exposure: 1.05,
  camera: { fov: 60, fovPortrait: 64, near: 0.1, far: 1500 }, // the rigs' FOVs add over lhFov
  lights: {
    sky: '#b7c6cc', hemiSky: '#dfeaf2', ground: '#6b5d4a', hemi: 1.1,
    sun: { color: '#fff1dc', intensity: 2.4, map: 2048, box: 30, offset: SUN.day, near: 1, far: 120, bias: -0.0005, normalBias: 0 },
    fog: [60, 330],
    presets: {
      day: look(0xb7c6cc, false, [60, 330]),
      ...Object.fromEntries(Object.entries(SURF_LOOK).map(([k, v]) => [`pad-${k}`, look(v.sky, k === 'snow', [60, 330])])),
      ...Object.fromEntries(Object.entries(TRACK_LOOK).map(([k, v]) => [k, look(v.sky, v.low, v.fog)])),
    },
  },
};

// The car's static shaping for view sync: a create hook, once per car entity, on the model clone view sync drew (it waits for
// the GLB). The models are life-size with their origin on the ground under the wheelbase midpoint (rally-spec R16-3), so
// the whole model moves into a shell at the sim body's frame (ground -comHeight below the centre of mass, the midpoint at
// zMid); view sync then binds the wheel nodes (through their parent, the shell) and poses them from the sim's part
// poses, interpolated with the body. The camera sockets go on obj.userData.sockets in the body frame.
const BONNET_LIFT = 0.12; // m over sock-cam-bonnet, so the view clears a bonnet scoop (the Impreza's sits at the socket's height)
export function carView(sync, carOf) {
  return sync.on('#car', {
    create(e, obj) {
      const car = carOf(e); if (!car || !obj) return;
      const shell = new THREE.Group();
      shell.position.set(0, -car.cfg.comHeight, car.zMid);
      for (const n of [...obj.children]) shell.add(n);
      obj.add(shell);
      obj.name = `car#${e.id}`;
      const at = (name) => { const n = obj.getObjectByName(name); if (!n) return null; obj.updateMatrixWorld(true); const p = n.getWorldPosition(new THREE.Vector3()); obj.worldToLocal(p); return [p.x, p.y, p.z]; };
      const bonnet = at('sock-cam-bonnet'); if (bonnet) bonnet[1] += BONNET_LIFT;
      obj.userData.sockets = { bumper: at('sock-cam-bumper'), bonnet };
      obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } }); // as before: no self-shadow acne
    },
  });
}

export class Renderer {
  constructor(gfx) {
    this.gfx = gfx; this.r = gfx.renderer; this.doc = gfx.renderer.domElement.ownerDocument; this.scene = gfx.scene; this.cam = gfx.camera; this.lights = gfx.lights;
    this.camMode = 0; // 0 chase, 1 bumper, 2 bonnet
    this.orbit = false; // title screen: circle the car instead
    this.garage = null; // the garage's turntable { angle, idle } (game.view.js, R16-5): it wins over the orbit
    this.view = null; this.worldToken = 0; this.kit = null; this.drawn = null;
    this.camRig = createRallyCamera(this.cam); this.camCar = { p: null, q: null, v: null, zFront: 0 };
    this.setSurface('gravel');
  }

  // kit = { assets, mc, loaded }: the engine's asset loader and material compiler, and the models' preload; sync: view sync.
  setKit(kit) { this.kit = kit; }
  setSync(sync) { this.drawn = sync; }

  // Swap the world's visuals. Pads build PadView (its cones need the models); other kinds load render/<kind>View.js lazily
  // (an esbuild glob import). Track views: `new TrackView(scene, world, kit)` with sync(sim) and dispose(). Resolves when
  // the view is in the scene (and marks <html data-rally-track>); a newer setWorld call wins over a pending one.
  setWorld(world) {
    const token = ++this.worldToken;
    if (this.view) { this.view.dispose(); this.view = null; }
    const shown = (view) => { this.view = view; this.doc.documentElement.dataset.rallyTrack = world.track?.seed ?? 'pad'; return view; };
    if (world.kind === 'pad') {
      const make = () => {
        if (token !== this.worldToken) return null;
        shown(new PadView(this.scene, world, this.kit));
        this.setSurface(world.surfaceKey || 'gravel');
        return this.view;
      };
      return this.kit.assets.has('cone') ? Promise.resolve(make()) : this.kit.loaded.then(make);
    }
    this.setLook('day');
    return import(`./render/${world.kind}View.js`).then((mod) => {
      if (token !== this.worldToken) return null;
      const View = mod[world.kind[0].toUpperCase() + world.kind.slice(1) + 'View']; // e.g. TrackView
      shown(new View(this.scene, world, this.kit));
      this.setLook(this.view.theme);
      return this.view;
    });
  }

  setLook(name) { this.lights.set(name); } // a RENDER.lights preset: sky, fog, hemisphere, sun intensity and offset

  // Pad surface: ground texture plus the matching sky and lighting.
  setSurface(key) {
    this.setLook(`pad-${key}`);
    if (this.view?.setSurface) this.view.setSurface(key);
  }

  sync(sim) {
    const car = sim.car, p = car.e.xf.p;
    if (sim.snow) {
      if (!this.snowView) this.snowView = new SnowView(this.r, this.scene, this.kit.mc);
      const f = car.wheels[0].center, r = car.wheels[2].center, l = Math.hypot(f.x - r.x, f.z - r.z) || 1;
      this.snowView.show(true);
      this.snowView.update(sim.snow, p, { x: (f.x - r.x) / l, z: (f.z - r.z) / l });
    } else if (this.snowView) this.snowView.show(false);
    if (this.view) { this.view.update?.(this.cam); this.view.sync(sim); }
  }

  updateCamera(sim, dt) {
    const car = sim.car, xf = car.e.xf, c = this.camCar, o = this.drawn?.objectOf(car.e); // the car as view sync drew it this frame
    c.p = o ? o.position : xf.p; c.q = o ? o.quaternion : xf.q; c.v = car.body.linvel(); c.sockets = o?.userData.sockets ?? null; // velocity is not in the pool; the model's camera sockets
    this.camRig.update(c, { orbit: this.orbit, garage: this.garage, mode: this.camMode, dt });
    const p = xf.p; this.lights.follow(p.x, p.z, p.y); // the sun at car + offset, aimed at the car (hilly tracks)
  }
}
