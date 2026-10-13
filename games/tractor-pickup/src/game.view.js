// Tractor Pickup's browser half (lion-hawk 2g, [S-1]): view halves over the sim half's scenes (game.sim.js). They read
// engine.scene.state (the farm's ctx.state, #28) and engine events, and never write the sim. G1: the 3D farm and the sandbox
// pad (view/world.js), the chase camera (view/rig.js), the interpolated bodies (view/bodies.js), and the sounds, voice and
// effects main.js's frame loop played from game.step's events and stepSounds (#87). G2: the farm's HUD (view/hud.js). Menus
// and the show come in G3–G5.
import { defineView, createWarnOnce } from 'lion-hawk/view';
import { createScene } from './render/scene.js';
import { Sound } from './audio/sound.js';
import { createVoice } from './audio/voice.js';
import { BURST } from './sim/scenery.js';
import { singOrder } from './sim/sing.js';
import { BED } from './sim/bedtime.js';
import { buildWorld } from './view/world.js';
import { rig } from './view/rig.js';
import { createBodies } from './view/bodies.js';
import { createTractorHud } from './view/hud.js';
import { renderIcons, tractorPicture } from './ui/icons.js';
import { PAINTS } from './render/vehicles3d.js';

let page = null; // one WebGL renderer, scene, camera and audio per page, made on the first enter on #c (main.js's createScene)
function pageOf(doc) {
  if (page) return page;
  const canvas = doc.getElementById('c'), { renderer, scene, camera, follow, setNight } = createScene(canvas), sound = new Sound();
  page = { canvas, renderer, scene, camera, follow, setNight, aniso: renderer.capabilities.getMaxAnisotropy(), sound, voice: createVoice(sound), nightK: 0 };
  return page;
}
// the slot pictures and the bubble's tractor (E-3, M-72): rendered once per page, on the first farm with a HUD
const picturesOf = p => { p.icons ??= renderIcons(p.renderer); p.tractorPic ??= tractorPicture(p.renderer); return p; };

// main.js's per-step event handling, minus the HUD (view/hud.js): sounds, the voice, fx and the camera shake. M-44: a bad event (a
// remote animal, a poof) never stops the frame
function onEvent(e, w, s) {
  const { sound, voice } = page, g = s.game;
  switch (e.type) {
    case 'treeBreak': { const t = e.tree, bush = t.kind === 'bush', b = BURST[bush ? 'bush' : t.young ? 'young' : 'tree']; w.gibs.burst(t.x, b.y * b.k, t.z, e.dir, b.k, bush); if (bush) sound.bushPop(); else sound.treePop(); break; }
    case 'horn': sound.horn(); for (const r of singOrder(g.load.slots)) { sound.animal(r.animal.type, r.delay); w.animals3d?.sing(r.animal, r.delay); } break; // E-1: the riders sing along
    case 'dodge': sound.boing(0.2); break; // B-14
    case 'treeBump': sound.clunk(); break; // T-34: a soft bump when a tree holds
    case 'boop': rig.shake(0.35); sound.boing(); sound.animal(e.animal.type); if (e.animal.golden) sound.bells(); w.fx.stars(e.animal.x, 1, e.animal.z); break;
    case 'launch': if (e.animal.type === 'duck' && g.farm && Math.hypot(e.animal.x - g.farm.yard.pond.x, e.animal.z - g.farm.yard.pond.z) < g.farm.yard.pond.r + 3) w.drip(e.animal); break; // A-5: a duck from the pond drips
    case 'mud-enter': w.fx.mudSplash(g.tractor.x, g.tractor.z); sound.squelch(); break; // T-13
    case 'washed': { const t = g.tractor; for (let k = 0; k < 3; k++) w.fx.sparkles(t.x, 1.8, t.z); sound.squeaky(); break; } // T-15
    case 'bump': sound.boing(0.6); sound.horn(0.5); rig.shake(0.25); break; // M-7
    case 'remoteHorn': sound.horn(0.4); break; // M-8
    case 'unclaim': w.fx.stars(e.pos.x, e.pos.y, e.pos.z); sound.plop(); break; // M-14: poof
    case 'help': sound.animal(e.animal.type); break; // F-4, M-9: the helper calls out
    case 'playerJoined': for (let k = 0; k < 3; k++) w.fx.sparkles(e.x, 1.6, e.z); sound.horn(0.6); break; // M-10
    case 'playerGone': w.fx.stars(e.x, 1.2, e.z); sound.plop(); break; // M-39
    case 'land':
      if (e.animal.golden) { sound.fanfare(); w.fx.confetti(e.animal.x, 2, e.animal.z); } // E-6, A-8: a large celebration
      sound.plop(); voice.say(e.animal.golden ? ['golden', e.animal.type] : [e.animal.type], { low: true }); break;
    case 'whee': sound.whee(); break; // T-14 (#87)
    case 'cheer': sound.cheer(); break;
    case 'squelch': sound.squelch(); break; // T-13: the sandbox's mud
    case 'say': voice.say(e.ids, e.low ? { low: true } : undefined); break; // the trip's lines (spec 3.1)
    case 'progress': w.vehicles.setPaint(e.progress.paint); break; // W-3
  }
}

// The drive half for the farm and the sandbox (main.js build/startFarm/frame, view side): one world per farm generation.
// withHud: the farm's slot bar, arrows, roster and drive controls (the sandbox has none, as main.js's ?sandbox)
function driveHalf({ withHud = false } = {}) {
  let w = null, gen = -1, offs = [], hud = null;
  const bodies = createBodies(), warnOnce = createWarnOnce();
  const animView = { cars: null, alpha: 0 }, vehSnap = { tractor: null, cars: null, dirt: 0 }, chaseIn = { x: 0, y: 0, z: 0, yaw: 0, fwd: 0, speed: 0, velYaw: 0 }; // reused every frame
  // paint (W-3): the farm's progress; the sandbox keeps none, so the stored one from the scene args (main.js setPaint)
  const build = (s, args) => {
    const g = s.game;
    w = buildWorld({ renderer: page.renderer, scene: page.scene, camera: page.camera, game: g, paint: (s.progress ?? args?.progress)?.paint, aniso: page.aniso }); gen = s.gen;
    page.canvas.dataset.tpGen = gen; // the farm generation the 3D shows (a debug read for the browser tests)
    bodies.rebind(g); animView.cars = vehSnap.cars = bodies.cars; vehSnap.tractor = bodies.view[0];
    rig.attach(page.camera, { canvas: page.canvas, tractor: g.tractor });
  };
  const drop = () => { w?.dispose(page.sound); w = null; };
  return {
    enter(engine, view) {
      pageOf(view.doc);
      const s = engine.scene.state; if (!s.game) return;
      page.voice.enabled = s.settings?.voice ?? true;
      build(s, engine.scene.args); view.project = rig.project;
      if (withHud) {
        const { icons, tractorPic, voice, sound } = picturesOf(page);
        hud = createTractorHud(view.doc.getElementById('ui'), { icons, tractorPic, voice, sound, rig, paints: PAINTS, scene: page.scene, world: () => w, tractorAt: () => bodies.view[0].p });
        hud.reset(s); // 2f delta: the slot bar from state on enter
      }
      offs = [bodies.watch(engine), engine.events.on(e => { if (w) { try { onEvent(e, w, engine.scene.state); } catch (err) { warnOnce('event ' + e.type, err); } try { hud?.event(e, engine); } catch (err) { warnOnce('hud ' + e.type, err); } } })];
    },
    // [S-6] a farm.new or a guest's welcome rebuilt the sim farm (its Rapier world is already freed): drop the old 3D farm,
    // build the new one, and the camera starts behind the new tractor (main.js startFarm)
    built(engine, view) {
      const s = engine.scene.state; if (!w || !s.game || s.gen === gen) return;
      drop(); build(s, engine.scene.args); hud?.reset(s); // 2f delta: the slot bar from state on built
      const t = s.game.tractor, p = t.body.translation();
      Object.assign(chaseIn, { x: p.x, y: p.y, z: p.z, yaw: t.yaw, fwd: t.fwd, speed: t.speed, velYaw: t.yaw }); rig.follow(1, chaseIn);
    },
    exit(engine, view) {
      for (const f of offs) f(); offs = [];
      hud?.dispose(); hud = null;
      drop();
      if (view.project === rig.project) view.project = undefined;
    },
    // view.dt is the driver's frame time (capped at maxFrame); 0 for hook renders (#19), which only redraw
    frame(engine, alpha, view) {
      const s = engine.scene.state, g = s.game; if (!w || g !== w.game) return; // no WebGL, or a build not yet seen by built()
      const dt = view.dt, sound = page.sound, players = s.net?.sync?.players ?? null;
      bodies.alpha(alpha);
      if (dt > 0) { w.stepFx(sound, dt); w.fx.update(dt); } // a hook render (dt 0) only redraws: no gravel or water spawns
      // M-65: the other trains (and their riders) where the forecast has them this frame: the step's wall stamp plus the alpha (#76)
      if (players) try { players.drawAt(engine.time.wall + alpha * 1000 / engine.game.sim.hz, g.herd); } catch (e) { warnOnce('net draw', e); }
      w.gibs.update(dt); w.farm3d?.update(bodies.view[0].p); animView.alpha = alpha; w.animals3d?.update(dt, g, animView);
      try { w.others3d.update(dt, players); } catch (e) { warnOnce('others3d', e); } // M-44
      vehSnap.dirt = g.dirt?.tractor; w.vehicles.update(vehSnap);
      const t = g.tractor, lv = t.body.linvel(), v0 = bodies.view[0].p;
      chaseIn.x = v0.x; chaseIn.y = v0.y; chaseIn.z = v0.z; chaseIn.yaw = t.yaw; chaseIn.fwd = t.fwd; chaseIn.speed = t.speed; chaseIn.velYaw = Math.atan2(lv.x, lv.z); rig.follow(dt, chaseIn);
      sound.engine(t.engine, t.speed / t.P.vmax, t.surface); sound.skid(Math.max(0, Math.min(1, (Math.abs(t.slip) - 0.2) * 2)));
      hud?.frame(engine, dt); // after the camera: the arrows project through this frame's view
      page.follow(v0.x, v0.z);
      const nightTo = s.bed?.phase === 'asleep' ? 1 : 0; // E-5
      if (page.nightK !== nightTo) { page.nightK = nightTo > page.nightK ? Math.min(nightTo, page.nightK + dt / BED.dusk) : Math.max(nightTo, page.nightK - dt / BED.wakeFade); page.setNight(page.nightK); }
      page.renderer.render(page.scene, page.camera);
    },
  };
}

// tune, fps: ?tune and ?fps (G4); sandbox: the ?sandbox page (its scene has no HUD or menus)
export function tractorView({ tune = false, fps = false, sandbox = false } = {}) {
  return defineView({ scenes: { farm: driveHalf({ withHud: true }), sandbox: driveHalf() } });
}
