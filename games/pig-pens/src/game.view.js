// Pig Pens' browser half (lion-hawk 2e P6/P7, [S-1]): the farm's view half over the sim half's `farm` scene. It reads
// engine.scene.state (the farm's ctx.state, #28) and never writes it: the world, the camera rig, sounds from engine
// events, the HUD. The controls are the engine's (adopted from template.html through data-lh-slot).
import * as THREE from 'three';
import { defineView } from 'lion-hawk/view';
import { buildWorld } from './view/world.js';
import { createHud } from './view/hud.js';
import { rig, attach, fitCam, applyCam, project, chase, afterDrive, bindGestures } from './view/rig.js';
import { Sound } from './sound.js';

let renderer = null, camera = null, sound = null; // one WebGL renderer, camera and audio context per page

export function pigPensView({ tilt = true } = {}) {
  let world = null, hud = null, frame = 0, offs = [];

  const farm = {
    enter(engine, view) {
      const doc = view.doc, win = doc.defaultView, canvas = doc.getElementById('c');
      if (!renderer) {
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
        renderer.setPixelRatio(Math.min(win.devicePixelRatio || 1, 2));
        renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
        camera = new THREE.PerspectiveCamera(48, 1, 0.3, 400);
        sound = new Sound();
      }
      const s = engine.scene.state;
      world = buildWorld({ renderer, sim: s.sim, tilt }); frame = 0;
      hud = createHud(doc, { world });
      const first = !rig.ready;
      const resize = () => { const w = canvas.clientWidth, h = canvas.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w / h < 0.9 ? 64 : 48; camera.updateProjectionMatrix(); };
      resize(); attach(camera, canvas);
      if (first) { fitCam(); applyCam(); }
      view.project = project;
      // #67: audio unlocks (and resumes) on any tap or key on the page, captured before the game sees it
      const unlock = () => sound.unlock();
      const flock = s.sim.flock, hint = (text, seconds) => hud.hint(text, seconds, engine.time.sim);
      const off = engine.events.on(ev => {
        sound.event(ev, camera);
        switch (ev.type) {
          case 'select': sound.pop(); break;
          case 'bark': sound.bark(); break;
          case 'hose': sound.hose(ev.on); break;
          case 'toss': sound.whoosh(); break;
          case 'scatter': sound.scatter(); break;
          case 'horn': sound.horn(); break;
          case 'bell': sound.bell(); break;
          case 'door': sound.gate(); break;
          case 'feathers': world.feathers(ev); break;
          case 'hint': hint(ev.text, ev.seconds); break;
          case 'egg': hud.event(ev, flock.basket); break;
          case 'drive': sound.engine(ev.on); if (!ev.on) afterDrive(); break;
          // main.js eventToast: the flock's stories as hints
          case 'fox': hint('A fox is sniffing around the farm. Is the coop door shut?', 4.5); break;
          case 'gulp': hint(`Gulp! The fox has ${ev.name} in its cheeks. Tap the fox!`, 4.5); break;
          case 'spit': hint(ev.reason === 'hiccup' ? `Hic! The fox couldn\u2019t keep ${ev.name} down.` : ev.reason === 'morning' ? `Ptooey! The fox spat out ${ev.name} and slunk off home.` : `Ptooey! Out pops ${ev.name}, a bit ruffled.`, 3.5); break;
          case 'hatch': hint(`An egg hatched! ${flock.birds[ev.mom].name} has a new chick.`, 4); break;
        }
      });
      win.addEventListener('resize', resize);
      doc.addEventListener('pointerdown', unlock, true); doc.addEventListener('keydown', unlock, true);
      offs = [bindGestures(engine, canvas), off, () => {
        win.removeEventListener('resize', resize);
        doc.removeEventListener('pointerdown', unlock, true); doc.removeEventListener('keydown', unlock, true);
      }];
    },
    exit(engine, view) {
      for (const f of offs) f(); offs = [];
      hud?.dispose(); hud = null; world?.dispose(); world = null;
      sound?.hose(false); sound?.engine(false);
      if (view.project === project) view.project = undefined;
    },
    // view.dt is the driver's frame time; 0 for hook renders (#19), which only redraw.
    frame(engine, alpha, view) {
      if (!world) return; // enter failed (no WebGL): nothing to draw
      const s = engine.scene.state, dt = view.dt;
      if (s.driving) { const t = s.sim.tractor; chase(t, dt); sound.engineLevel(t.engine, t.speed); }
      world.update(dt, s, frame); hud.update(engine, s, frame, dt);
      applyCam(); world.draw(camera, rig.cam.dist);
      frame++;
    },
  };
  return defineView({ scenes: { farm } });
}
