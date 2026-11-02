// Harvest's browser half: view halves over the sim's scenes (game.sim.js). They read engine.scene.state and the engine's events and
// never write the sim. The farm half builds the 3D farm (view/world3d.js), draws the combine and carts through view sync
// (view/vehicles.js) and the flying grain (view/grain.js), follows the combine with the chase camera (view/rig.js), runs the HUD (view/hud.js) and plays the sounds;
// the shop half draws the workshop card (view/cards.js).
import { defineView, createWarnOnce } from 'lion-hawk/view';
import MANIFEST from '../baked/manifest.json' with { type: 'json' };
import { buildWorld, MODELS } from './view/world3d.js';
import { vehicleViews } from './view/vehicles.js';
import { rig } from './view/rig.js';
import { createHud } from './view/hud.js';
import { shopHalf } from './view/cards.js';
import { createSound } from './view/sound.js';
import { createGrain } from './view/grain.js';

export const RENDER = Object.freeze({
  assets: { manifest: MANIFEST, base: './assets/' },
  shading: 'standard', dpr: { touch: 1.5, desktop: 2 }, antialias: true, shadows: 'pcf', toneMapping: 'none', exposure: 1,
  camera: { fov: 55, fovPortrait: 62, near: 0.3, far: 600 },
  lights: { sky: '#bfe6f5', hemiSky: '#eef7ff', ground: '#b9a27c', hemi: 1.3, sun: { color: '#fff3dc', intensity: 2.1, map: 2048, box: 34, offset: [-26, 46, 22] }, fog: [110, 320] },
});

export const sound = createSound();

function farmHalf() {
  let w = null, hud = null, grain = null, offs = [], view0 = null, eng = null, sounded = false, camFor = null;
  const warn = createWarnOnce(), pose = { x: 0, y: 0, z: 0, yaw: 0, fwd: 0, speed: 0, velYaw: 0 };
  const rigOf = e => e.player ? eng?.scene.state.farm?.rigOf(e.player) ?? null : null;
  const drawn = e => view0?.sync?.objectOf(e);
  const at = { x: 0, y: 0, z: 0 };
  function onEvent(e, engine) {
    const r = engine.scene.state.rig;
    switch (e.type) {
      case 'sold': { if (e.player !== 1) break; sound.coin(); const k = r.train.carts[e.cart] ?? r.c, p = drawn(k.e)?.position ?? k.body.translation(); at.x = p.x; at.y = p.y + 3; at.z = p.z; hud?.sold(e, at); break; }
      case 'full': if (e.player === 1) { sound.full(); rig.shake(0.2); } break;
      case 'bought': sound.fanfare(); hud?.bought(e, engine.scene.state.farm.fields, r.vehicle); break;
      case 'vehicle': sound.fanfare(); hud?.vehicle(e, engine.scene.state.farm.fields); break;
      case 'fieldDone': sound.fanfare(); hud?.fieldDone(e); break;
    }
  }
  return {
    enter(engine, view) {
      view0 = view; eng = engine;
      if (!view.gfx) return; // no WebGL: no 3D
      if (!sounded) { sound.attach(view.audio); sounded = true; }
      view.project = rig.project;
      offs.push(vehicleViews(view.sync, { assets: view.assets, rigOf, grain: () => grain }));
      view.wait(view.assets.preload(MODELS).then(() => {
        const s = engine.scene.state; if (!s.farm || w) return;
        w = buildWorld({ view, farm: s.farm, rig: () => engine.scene.state.rig });
        grain = createGrain(view.gfx.scene);
        rig.setVehicle(s.rig.vehicle); camFor = s.rig.vehicle;
        rig.attach(view.gfx.camera, { canvas: view.gfx.renderer.domElement, combine: s.rig.c });
        const p = s.rig.c.body.translation(); Object.assign(pose, { x: p.x, y: p.y, z: p.z, yaw: s.rig.c.yaw }); rig.snap(pose);
        hud = createHud(view.doc.getElementById('ui'), { project: rig.project });
      }));
      offs.push(engine.events.on(e => { try { onEvent(e, engine); } catch (err) { warn('event ' + e.type, err); } }));
    },
    exit(engine, view) {
      for (const f of offs) f(); offs = [];
      hud?.dispose(); hud = null; w?.dispose(); w = null; grain?.dispose(); grain = null;
      if (view.project === rig.project) view.project = undefined;
    },
    frame(engine, alpha, view) {
      const s = engine.scene.state; if (!w || !s.rig) return;
      const r = s.rig, c = r.c, dt = view.dt;
      const swapped = r.vehicle !== camFor; // a new vehicle starts at its own home: the camera jumps there
      if (swapped) { camFor = r.vehicle; rig.setVehicle(r.vehicle); rig.combine = c; }
      w.update(r.zone, r.selling, dt);
      grain?.update(dt);
      const o = drawn(c.e), p = o?.position ?? c.body.translation(), lv = c.body.linvel();
      pose.x = p.x; pose.y = p.y; pose.z = p.z; pose.yaw = c.yaw; pose.fwd = c.fwd; pose.speed = c.speed; pose.velYaw = Math.atan2(lv.x, lv.z);
      if (swapped) rig.snap(pose); else rig.follow(pose, dt);
      view.gfx.lights.follow?.(p.x, p.z);
      hud?.frame(s, dt, rig.toNdc);
      sound.engine(c.engine, c.speed, c.cutting && !r.load.full());
    },
  };
}

export function harvestView() {
  return defineView({ scenes: { farm: farmHalf(), shop: shopHalf({ sound }) }, render: RENDER });
}
