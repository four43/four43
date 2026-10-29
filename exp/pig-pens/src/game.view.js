// Pig Pens' browser half (lion-hawk 2e P6/P7, [S-1]; on the phase 3 engine since 3k): the farm's view half over the sim
// half's `farm` scene. It reads engine.scene.state (the farm's ctx.state, #28) and never writes it. Renderer, camera, lights,
// assets, material compiler, view sync, audio and the orbit rig are the engine's (view.gfx, view.assets, view.materials,
// view.sync, view.audio, createOrbitRig); the farm's own drawing sits under one root in view.gfx.scene. The controls are the
// engine's (adopted from template.html through data-lh-slot).
import { defineView, createTiltShift } from 'lion-hawk/view';
import MANIFEST from '../baked/manifest.json' with { type: 'json' };
import { buildWorld } from './view/world.js';
import { createHud } from './view/hud.js';
import { bindSnacks } from './view/snacks3d.js';
import { rig, attach, bindCamera, followFocus, fly, nearFocus, roofPanel } from './view/rig.js';
import { Sound } from './sound.js';
import { dof, dofPanel } from './view/dofPanel.js';

export const MODEL_KEYS = Object.keys(MANIFEST.models);
const SKY = '#bfe6f5';
const tilts = new WeakMap(); // one tilt-shift pass (and its render targets) per renderer, reused when the farm is re-entered
// 2.10.0: tuned in the ?debug=dof panel: a wide sharp band, a gentle ramp either side, and a fade over the whole zoom range
const DOF = { band: 0.41, scale: 0.3, nearScale: 0.5, fullAt: 2, offAt: 80 };

export function pigPensView({ tilt = true, shading = 'lambert' } = {}) {
  let world = null, hud = null, sound = null, frame = 0, offs = [], asked; // asked: the focus last sent, until the sim has it

  const farm = {
    enter(engine, view) {
      const doc = view.doc, gfx = view.gfx, s = engine.scene.state;
      if (!gfx) return; // no WebGL: boot reported it, the sim and UI run on
      const canvas = gfx.renderer.domElement;
      offs = [];
      sound ??= new Sound(view.audio); view.audio.listen(gfx.camera);
      // 3e's gfx.post seam: boot's gfx.render() draws through the tilt-shift pass; the pass is ours (one per renderer, reused)
      let fx = tilts.get(gfx.renderer); if (!fx) tilts.set(gfx.renderer, fx = createTiltShift(gfx.renderer, { ...DOF, on: tilt })); fx.params.on = tilt;
      gfx.post = fx; offs.push(() => { if (gfx.post === fx) gfx.post = null; });
      offs.push(view.debug.panel(dofPanel(fx, () => rig.orbit.state.dist))); // ?debug=dof (lion-hawk 0.16.0 D-9)
      offs.push(view.debug.panel(roofPanel)); // ?debug=roofs
      view.orbit = attach(gfx.camera, canvas); view.project = rig.project;
      // R1 measurement: draw calls and programs of the last drawn frame (read with ?tilt=0: one render per frame)
      view.perf = () => { const i = gfx.info(); return { calls: i.calls, triangles: i.triangles, programs: i.programs }; };
      offs.push(bindSnacks(view.sync)); // before the first snack is drawn
      let pending = null; // a hint that came before the models (the start hint): shown once the HUD exists
      const build = () => {
        if (engine.scene.state !== s) return; // left the farm while loading
        world = buildWorld({ gfx, assets: view.assets, mc: view.materials, sim: s.sim, world: engine.world }); frame = 0;
        hud = createHud(doc, { world }); if (pending) hud.hint(pending[0], pending[1], engine.time.sim);
        doc.getElementById('loading')?.remove();
      };
      // the first entry preloads every model (then warms the materials); a re-entered farm builds at once from the cache
      if (MODEL_KEYS.every(k => view.assets.has(k))) build(); else view.wait(view.assets.preload(MODEL_KEYS).then(build));
      const flock = s.sim.flock, hint = (text, seconds) => { if (hud) hud.hint(text, seconds, engine.time.sim); else pending = [text, seconds]; };
      const off = engine.events.on(ev => {
        sound.event(ev);
        switch (ev.type) {
          case 'select': sound.pop(); break;
          case 'bark': sound.bark(); break;
          case 'hose': sound.hose(ev.on); break;
          case 'toss': sound.whoosh(); break;
          case 'scatter': sound.scatter(); break;
          case 'bell': sound.bell(); break;
          case 'door': sound.gate(); break;
          case 'fly': fly(ev.to, s.focus); break; // a roof tap or Outside: the camera on its way
          case 'feathers': world?.feathers(ev); break;
          case 'hint': hint(ev.text, ev.seconds); break;
          case 'egg': hud?.event(ev, flock.basket); break;
          // the flock's stories as hints
          case 'fox': hint('A fox is sniffing around the farm. Is the coop door shut?', 4.5); break;
          case 'gulp': hint(`Gulp! The fox has ${ev.name} in its cheeks. Tap the fox!`, 4.5); break;
          case 'spit': hint(ev.reason === 'hiccup' ? `Hic! The fox couldn’t keep ${ev.name} down.` : ev.reason === 'morning' ? `Ptooey! The fox spat out ${ev.name} and slunk off home.` : `Ptooey! Out pops ${ev.name}, a bit ruffled.`, 3.5); break;
          case 'hatch': hint(`An egg hatched! ${flock.birds[ev.mom].name} has a new chick.`, 4); break;
          // v3 R3: sickness and the clinic
          case 'sick': hint(`${ev.name} isn’t feeling well. Grab ${ev.name} and drop them on the vet’s clinic!`, 5); break;
          case 'clinic': hint({ in: `${ev.name} is in the waiting room. Tap the clinic, then the exam room.`, healthy: `${ev.name}’s fit as a fiddle!`, full: 'The waiting room’s full.', out: `${ev.name} is all better!` }[ev.what], 3.5); break;
          case 'exam': hud?.say(ev.text, ev.what === 'cured' ? 3 : 2.4, engine.time.sim); break;
          case 'cured': case 'pet': world?.cured(ev.kind, ev.i); break; // a heart: made better, or a scratch from the vet
        }
      });
      offs.push(bindCamera(engine, canvas), off);
    },
    exit(engine, view) {
      for (const f of offs) f(); offs = [];
      hud?.dispose(); hud = null; world?.dispose(); world = null;
      sound?.hose(false);
      if (view.project === rig.project) view.project = undefined;
      view.orbit = undefined; view.perf = undefined;
    },
    // view.dt is the driver's frame time; 0 for hook renders (#19), which only redraw. Boot draws after this (gfx.render).
    frame(engine, alpha, view) {
      if (!world) return; // still loading, or no WebGL
      const s = engine.scene.state, dt = view.dt;
      world.update(dt, s, frame, alpha); hud.update(engine, s, frame, dt);
      rig.locked = s.focus === 'clinic.exam'; followFocus(s.focus, dt); rig.orbit.update(dt, view.rawDt);
      // the roof comes off when the camera gets near a building and goes back on when it pulls away (the sim's focus)
      const near = nearFocus(s.focus);
      if (near === s.focus) asked = undefined; else if (near !== asked) { asked = near; engine.command('focus', { id: near }); }
      const post = view.gfx.post; if (post?.params && !dof.hold) post.params.focus = Math.round(rig.orbit.state.dist * 100) / 100; // to the cm: the dof panel shows it
      frame++;
    },
  };
  return defineView({
    scenes: { farm },
    render: {
      assets: { manifest: MANIFEST, base: './assets/' },
      shading, dpr: { touch: 2, desktop: 2 }, antialias: true, shadows: 'pcf', toneMapping: 'none', exposure: 1,
      camera: { fov: 48, fovPortrait: 64, near: 0.3, far: 400 },
      // 2.1.0's world.js lights: hemisphere #eef7ff / #b9a27c, sun 2048 map, box ±38 × ±36, near 5, far 120; fog 70..170
      lights: { sky: SKY, hemiSky: '#eef7ff', ground: '#b9a27c', hemi: 1.3,
        sun: { color: '#fff3dc', intensity: 2.1, map: 2048, box: [38, 36], offset: [-26, 46, 22], near: 5, far: 120, bias: -0.0006, normalBias: 0.03 }, fog: [70, 170] },
    },
  });
}
