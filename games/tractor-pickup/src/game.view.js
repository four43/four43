// Tractor Pickup's browser half (lion-hawk 2g, [S-1]): view halves over the sim half's scenes (game.sim.js). They read
// engine.scene.state (the farm's ctx.state, #28) and engine events, and never write the sim. G1: the 3D farm and the sandbox
// pad (view/world.js), the chase camera (view/rig.js), the train drawn by view sync (view/vehicles.js), and the sounds, voice and
// effects main.js's frame loop played from game.step's events and stepSounds (#87). G2: the farm's HUD (view/hud.js). G3: the
// show cutscene (ui/show.js on copies of the riders, #79), the sticker card, the start screen and the paint and book screens
// (view/menus.js). G4: the parent menu and the sleep screen (view/menus.js), the sleep and wake voice lines, ?tune and ?fps.
// G5: the Multiplayer panel (view/menus.js) and other players' trains and riders from read-only poses (#102).
import { defineView, createWarnOnce, bindGesture } from 'lion-hawk/view';
import { VIEW } from './view/size.js';
import MANIFEST from '../baked/manifest.json' with { type: 'json' };
import { Sound } from './audio/sound.js';
import { createVoice } from './audio/voice.js';
import { BURST } from './sim/scenery.js';
import { singOrder } from './sim/sing.js';
import { BED } from './sim/bedtime.js';
import { buildWorld } from './view/world.js';
import { rig } from './view/rig.js';
import { coverageView } from 'lion-hawk/kits/coverage/view';
import { createTractorHud } from './view/hud.js';
import { menuHalves } from './view/menus.js';
import { createShow, skipSvg, CHEER } from './ui/show.js';
import { renderIcons, tractorPicture } from './ui/icons.js';
import { PAINTS, PAINT_LOOK, trainViews } from './view/vehicles.js';
import { placeCarried, START_PAINT } from './net/players.js';
import { buildTunePanel, createFpsMeter } from './ui/debug.js';
import { tuneGet, tuneValues } from './sim/tune.js';

let audio = null; // the page's sound and voice: the view halves play them; the entry unlocks them and applies the settings (X-13)
export const audioOf = () => audio ??= (sound => ({ sound, voice: createVoice(sound) }))(new Sound());
// The engine render pipeline (3l, overview §4.6, D5): the 1.8 renderer, camera and light rig as data. shading 'standard': golden
// animals keep their metal look and vertex-coloured art at roughness 1 reads like the old Lambert. Night (E-5): day -> dusk -> night,
// colours and intensities only (no shader change).
export const MODELS = Object.freeze(Object.keys(MANIFEST.models)); // every baked model: the first farm draws once all are loaded and warm (A-10)
export const RENDER = Object.freeze({
  assets: { manifest: MANIFEST, base: './assets/' }, paint: PAINT_LOOK,
  shading: 'standard', dpr: { touch: 1.5, desktop: 2 }, antialias: true, shadows: 'pcf', toneMapping: 'none', exposure: 1,
  camera: { fov: 60, fovPortrait: 64, near: 0.3, far: 500 },
  lights: { sky: '#bfe6f5', hemiSky: '#eef7ff', ground: '#b9a27c', hemi: 1.3, sun: { color: '#fff3dc', intensity: 2.1, map: 2048, box: 30, offset: [-26, 46, 22] }, fog: [90, 220],
    presets: { dusk: { sky: '#f4a76b', hemi: 0.8, sun: { color: '#ffa860', intensity: 1.125 } },
      night: { sky: '#1b2440', hemi: 0.3, sun: { color: '#9fb4ff', intensity: 0.15 } } } },
});
// k 0 = day, 0.5 = sunset, 1 = night: two lerps through dusk
export const setNight = (lights, k) => k < 0.5 ? lights.lerp('day', 'dusk', k * 2) : lights.lerp('dusk', 'night', k * 2 - 1);
let page = null; // the page's renderer, scene, camera and lights (boot's view.gfx) and audio, on the first enter
function pageOf(view) {
  if (page) return page;
  if (!view.gfx) return audioOf(); // no WebGL (or a DOM test): sounds and voice only
  const { renderer, scene, camera, lights } = view.gfx;
  page = { canvas: renderer.domElement, renderer, scene, camera, lights, view, aniso: renderer.capabilities.getMaxAnisotropy(), ...audioOf(), nightK: 0, perf: null };
  return page;
}
// the slot pictures and the bubble's tractor (E-3, M-72): rendered once per page, on the first farm with a HUD
const picturesOf = p => { if (p.renderer) { const v = p.view; p.icons ??= renderIcons(p.renderer, v.assets, v.materials); p.tractorPic ??= tractorPicture(p.renderer, v.assets, v.materials); } return p; };

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
    case 'sleep': if (!e.quiet) voice.say(['sleepy', 'goodnight']); break; // E-5 (the night and the lullaby: the frame and the sleep half)
    case 'wake': voice.say(['wake-up']); break;
  }
}

// What the farm half and the show half share (one farm on the page): the farm's 3D and HUD, the show that has the camera, the
// pose copies animals3d draws in place of the sim's riders while it runs (#79), and the last `show` event with its copies until
// the show half takes it. menus: the overlays' screens (view/menus.js), whose book needs the seen mark from the farm's frames.
const link = { w: null, hud: null, show: null, poses: null, pending: null, kick: null, menus: null };

// #102 (as #79): the animals other players carry, drawn where their drawn train has them this frame. A pose copy per animal id
// (pooled), only for an animal the sim has as carried by that player; the show's copies (#79) win. Returns the map animals3d
// draws in place of the sim's animals (or the show's own map, or null, when no train carries anything)
const carriedPoses = new Map(), posePool = new Map();
function posesOf(herd, others, show) {
  if (!others?.size || !herd) return show;
  carriedPoses.clear();
  for (const o of others.values()) if (!o.away) for (const c of o.carried) {
    const a = herd.animals[c.id]; if (a?.state !== 'carried' || a.owner !== o.n) continue;
    let p = posePool.get(c.id); if (!p) posePool.set(c.id, p = { id: c.id });
    // every field animals3d reads off an animal: its kind (type, golden) and dirt from the sim animal, the place from the train
    p.type = a.type; p.golden = !!a.golden; p.state = 'carried'; p.ride = null; p.hidden = false; p.dirt = a.dirt; placeCarried(p, c); carriedPoses.set(c.id, p);
  }
  if (!carriedPoses.size) return show;
  if (show) for (const [id, p] of show) carriedPoses.set(id, p);
  return carriedPoses;
}

// The drive half for the farm and the sandbox (main.js build/startFarm/frame, view side): one world per farm generation.
// withHud: the farm's slot bar, arrows, roster and drive controls (the sandbox has none, as main.js's ?sandbox). tune: the ?tune
// panel (D-5, G4b: its sim sliders issue `tune` commands and show what the `tune` event says was written; hidden for a guest);
// fps: the ?fps meter (X-4, B-1)
function driveHalf({ withHud = false, tune = false, fps = false } = {}) {
  let w = null, gen = -1, offs = [], hud = null, pageDoc = null, panel = null;
  const warnOnce = createWarnOnce(), netView = new Map(); // netView: players.poseAt's (#102)
  const carPose = [{ p: null, q: null }, { p: null, q: null }], animView = { cars: carPose, alpha: 0, poses: null }, chaseIn = { x: 0, y: 0, z: 0, yaw: 0, fwd: 0, speed: 0, velYaw: 0 }; // reused every frame
  let view0 = null; // the view the drive half entered with (sync, assets, materials)
  // the drawn train (view sync's objects, interpolated): the tractor's position, and each car's { p, q } for the riders (X-1)
  const drawn = e => view0?.sync?.objectOf(e);
  // paint (W-3): the farm's progress; the sandbox keeps none, so the stored one from the scene args (main.js setPaint)
  const build = (s, args) => {
    const g = s.game;
    w = buildWorld({ view: view0, game: g, aniso: page.aniso }); gen = s.gen;
    page.canvas.dataset.tpGen = gen; // the farm generation the 3D shows (a debug read for the browser tests)
    rig.attach(page.camera, { canvas: page.canvas, tractor: g.tractor });
    panel?.refresh(); // a new farm: the picker shows its tractor's preset
  };
  const drop = () => { w?.dispose(page.sound); w = null; };
  // ?fps: a rAF callback asked for during this frame runs before the driver's next tick, so it stamps the start of the next frame
  // (before its steps): the meter gets that frame's gap, its sim time and its draw time, as main.js's frame did
  const meter = { t0: 0, last: 0, gap: 0, drawn: 0, end: 0, mark(ts) { meter.drawn = meter.end ? performance.now() - meter.end : 0; page.perf.begin(ts); meter.gap = meter.last ? ts - meter.last : 0; meter.last = ts; meter.t0 = performance.now(); } };
  return {
    enter(engine, view) {
      if (!view.gfx) return; // no WebGL: the page runs without 3D (render: ... is reported)
      pageOf(view); pageDoc = view.doc; view0 = view;
      const s = engine.scene.state; if (!s.game) return;
      if (fps) page.perf ??= createFpsMeter(page.renderer);
      view.project = rig.project;
      // the train's hooks before any train is drawn (sync measures the wheel hubs after the create hooks): paint (W-3) from the player's
      // records (the sandbox keeps none: the stored ones from the scene args), coverage for the dirt (T-16)
      const paintOf = () => engine.scene.state.progress?.paint ?? engine.scene.args?.progress?.paint ?? START_PAINT, cov = coverageView(view.sync, view.materials);
      offs.push(trainViews(view.sync, { materials: view.materials, paintOf }), () => cov.off());
      // INTERIM (engine request in the phase 3l notes, as Pig Pens' 3k): view sync clones a drawn entity's model on the first frame it
      // sees it and throws while that model is still loading, so its frames wait for the preload
      const sync = view.sync, syncFrame = sync.frame, loaded = () => MODELS.every(k => view.assets.has(k));
      sync.frame = alpha => { if (loaded()) { sync.frame = syncFrame; syncFrame(alpha); } };
      offs.push(() => { if (sync.frame !== syncFrame) sync.frame = syncFrame; });
      // the first farm draws once every baked model is loaded, compiled and warm (A-10); its HUD needs the portraits made from them
      view.wait(view.assets.preload(MODELS).then(() => {
        if (engine.scene.state !== s || w) return;
        build(s, engine.scene.args);
        if (withHud) {
          const { icons, tractorPic, voice, sound } = picturesOf(page);
          hud = createTractorHud(view.doc.getElementById('ui'), { icons, tractorPic, voice, sound, rig, paints: PAINTS, scene: page.scene, world: () => w, tractorAt: () => drawn(engine.scene.state.game.tractor.e)?.position ?? engine.scene.state.game.tractor.body.translation() });
          hud.reset(s, engine.scene.id); // 2f delta: the slot bar from state on enter
          Object.assign(link, { w, hud, pending: null });
        }
      }));
      if (tune) {
        pageDoc.getElementById('tune')?.remove(); const game = () => engine.scene.state.game;
        panel = buildTunePanel({ doc: pageDoc, read: id => tuneGet(game(), id), power: () => game().tractor.power, values: () => tuneValues(game()),
          send: (key, value) => engine.command('tune', { key, value }), reset: s.game.trees ? () => engine.command('tune.reset', {}) : null });
      }
      if (page.perf) { // B-1, #106: Rapier's share, from the World's running total (the entry gave boot the timer under ?fps)
        let last = null, ms = 0;
        offs.push(engine.onStep(() => {
          page.perf.step(); const w = engine.world; if (!w) return;
          if (w.serial === last) page.perf.worldMs(w.stats.stepMsTotal - ms); last = w.serial; ms = w.stats.stepMsTotal; // #106: the engine times Rapier
        }));
      }
      offs.push(engine.events.on(e => {
        page.perf?.event(e.type);
        if (e.type === 'tune' && panel) try { panel.shown(e.key, e.value); } catch (err) { warnOnce('tune', err); }
        if (!w) return;
        try { onEvent(e, w, engine.scene.state); } catch (err) { warnOnce('event ' + e.type, err); }
        try { hud?.event(e, engine); } catch (err) { warnOnce('hud ' + e.type, err); }
        if (withHud && e.type === 'show') try { showCopies(e, engine.scene.state); } catch (err) { warnOnce('show', err); }
      }));
    },
    // [S-6] a farm.new or a guest's welcome rebuilt the sim farm (its Rapier world is already freed): drop the old 3D farm,
    // build the new one, and the camera starts behind the new tractor (main.js startFarm). The old farm's voice line stops (the
    // old dispose's voice.stop): the build's events, the new intro among them, flush after this hook
    built(engine, view) {
      const s = engine.scene.state; if (!w || !s.game || s.gen === gen) return;
      try { page.voice.stop?.(); } catch (err) { warnOnce('voice stop', err); }
      drop(); build(s, engine.scene.args); hud?.reset(s, engine.scene.id); // 2f delta: the slot bar from state on built
      if (withHud) { link.show?.end(); Object.assign(link, { w, pending: null, poses: null }); } // a farm.new during the show ends it: no show.done for the old farm
      const t = s.game.tractor, p = t.body.translation();
      Object.assign(chaseIn, { x: p.x, y: p.y, z: p.z, yaw: t.yaw, fwd: t.fwd, speed: t.speed, velYaw: t.yaw }); rig.snap(chaseIn);
    },
    exit(engine, view) {
      for (const f of offs) f(); offs = [];
      hud?.dispose(); hud = null; netView.clear();
      if (withHud) Object.assign(link, { w: null, hud: null, pending: null, poses: null });
      drop(); panel?.el.remove(); panel = null;
      if (view.project === rig.project) view.project = undefined;
    },
    // view.dt is the driver's frame time (capped at maxFrame); 0 for hook renders (#19), which only redraw
    frame(engine, alpha, view) {
      const s = engine.scene.state, g = s.game; if (!w || g !== w.game) return; // no WebGL, or a build not yet seen by built()
      VIEW.w = view.gfx.size.w; VIEW.h = view.gfx.size.h;
      const dt = view.dt, sound = page.sound, players = s.net?.sync?.players ?? null;
      panel?.enable(s.net?.role !== 'guest'); // a guest's tune would be dropped (game/commands.js)
      if (dt > 0) { w.stepFx(sound, dt); w.fx.update(dt); } // a hook render (dt 0) only redraws: no gravel or water spawns
      // M-65, #102: the other trains (and their riders) where the forecast has them this frame (the step's wall stamp plus the alpha,
      // #76), from the view's own read-only poses: the sim's players, forecasts and herd are never touched here
      let others = null;
      if (players) try { others = players.poseAt(engine.time.wall + alpha * 1000 / engine.game.sim.hz, netView); } catch (e) { warnOnce('net draw', e); }
      const t = g.tractor, to = drawn(t.e), v0 = to?.position ?? t.body.translation(); // the drawn (interpolated) tractor
      g.train.cars.forEach((c, k) => { const o = drawn(c.e); carPose[k].p = o?.position ?? c.body.translation(); carPose[k].q = o?.quaternion ?? c.body.rotation(); });
      w.gibs.update(dt); w.farm3d?.update(v0); animView.alpha = alpha; animView.poses = posesOf(g.herd, others, withHud ? link.poses : null); w.animals3d?.update(dt, g, animView);
      try { w.others3d.update(dt, others); } catch (e) { warnOnce('others3d', e); } // M-44
      const lv = t.body.linvel(), show = withHud ? link.show : null;
      if (show?.active) show.update(view.rawDt); // F-5: the show has the camera; its waits on the uncapped frame time (#56, #83): a slow device does not stretch them, a hidden tab gives 0
      else { chaseIn.x = v0.x; chaseIn.y = v0.y; chaseIn.z = v0.z; chaseIn.yaw = t.yaw; chaseIn.fwd = t.fwd; chaseIn.speed = t.speed; chaseIn.velYaw = Math.atan2(lv.x, lv.z); rig.follow(chaseIn, dt); }
      if (withHud && !engine.scene.overlays.includes('book')) link.menus?.noteSeen(s);
      sound.engine(t.engine, t.speed / t.P.vmax, t.surface); sound.skid(Math.max(0, Math.min(1, (Math.abs(t.slip) - 0.2) * 2)));
      hud?.frame(engine, dt); // after the camera: the arrows project through this frame's view
      page.lights.follow(v0.x, v0.z);
      const nightTo = s.bed?.phase === 'asleep' ? 1 : 0; // E-5
      if (page.nightK !== nightTo) { page.nightK = nightTo > page.nightK ? Math.min(nightTo, page.nightK + dt / BED.dusk) : Math.max(nightTo, page.nightK - dt / BED.wakeFade); setNight(page.lights, page.nightK); }
      const perf = page.perf, t1 = perf ? performance.now() : 0, progs = perf ? perf.programs() : 0;
      // boot draws once after every half's frame (overview §4.6): the meter's draw time is the previous frame's (meter.drawn)
      if (perf && view.rawDt > 0) { // a hook render (rawDt 0) is no frame
        const y = g.farm?.yard.barn; perf.tick(view.rawDt, meter.gap, meter.t0 ? t1 - meter.t0 : 0, meter.drawn, y ? Math.hypot(t.x - y.x, t.z - y.z) : 0, progs);
        requestAnimationFrame(meter.mark); meter.end = performance.now(); // 'draw' then spans boot's draw and the wait for the next rAF
      }
    },
  };
}

// #79: the `show` event, as the step that started the show left the riders: copies of them ({ id, type, golden, x, y, z, yaw,
// state: 'ride', hat }, with the slot they ride in and their dirt) for the cutscene to move; the sim's own riders wait in their
// show state for show.done
function showCopies(e, s) {
  const riders = [], byId = new Map(s.show?.riders.map(r => [r.animal.id, r.animal]));
  for (const r of e.riders) {
    const a = byId.get(r.id); if (!a) continue;
    riders.push({ animal: { id: a.id, type: a.type, golden: !!a.golden, x: a.x, y: a.y, z: a.z, yaw: a.yaw, state: 'ride', hat: a.hat, ride: a.ride, anim: 'idle', dirt: a.dirt }, slot: { car: r.car, k: r.k } });
  }
  link.pending = { gen: e.gen, state: s, riders, steps: e.steps };
  link.kick?.();
}

// The show overlay's half (F-5..F-8, F-10, F-12..F-16, parity #13, #14): the cutscene on the copies, on engine time (the waits
// count the frames' uncapped dt), its skip button the sim's show.skip hold on game markup; a touch on the show cheers (pointerdown),
// a 1 s hold hurries (bindGesture). When it settles, show.done tells the sim where each rider stands, unless the farm changed under it.
function showHalf() {
  let show = null, gesture = null, layer = null, off = null, step = '';
  const cheer = e => { if (!e.target?.closest?.('button')) show?.cheer(); }; // A-3: a child's touch cheers at once (on pointerdown, as before), a held one too
  const start = engine => {
    const p = link.pending, s = engine.scene.state, w = link.w;
    if (!p || !show || show.active || !w || p.state !== s || p.gen !== s.gen) return;
    link.pending = null;
    const copies = p.riders.map(r => r.animal);
    link.poses = new Map(copies.map(a => [a.id, a]));
    const done = () => { // R-1: whatever happened in the show, the train goes on; never for an older farm or another scene
      if (engine.scene.state !== p.state || p.state.gen !== p.gen) return;
      engine.command('show.done', { gen: p.gen, spots: copies.map(a => [a.id, a.x, a.y || 0, a.z, a.yaw]) }); // 2f delta: always the show's gen
    };
    show.play(p.riders, p.steps).catch(err => console.error('show', err)).finally(done);
  };
  return {
    enter(engine, view) {
      const w = link.w, s = engine.scene.state; if (!w || !page) return;
      const doc = view.doc, skip = doc.createElement('button');
      skip.type = 'button'; skip.className = 'skip'; skip.dataset.lhSlot = 'show.skip'; skip.setAttribute('aria-label', 'Skip'); skip.innerHTML = skipSvg();
      show = createShow({ root: doc.getElementById('ui'), camera: page.camera, game: s.game, voice: page.voice, sound: page.sound, fx: w.fx, scene: w.group,
        onHop: r => link.hud?.hop(r), skip, gesture: false, clock: 'update' });
      layer = show.layer; link.show = show; view.ui.adopt();
      layer.addEventListener('pointerdown', cheer);
      gesture = bindGesture(engine, layer, { hold: { seconds: CHEER.fastMs / 1000, fire: () => show.hurry() } }); // F-8: a 1 s hold finishes the step
      off = engine.events.on(e => { if (e.type === 'showSkip') show?.skip(); });
      link.kick = () => start(engine); start(engine);
    },
    exit(engine, view) {
      off?.(); off = null; gesture?.dispose(); gesture = null; link.kick = null;
      if (show) {
        if (show.active && page) rig.blendFrom(page.camera.quaternion); // F-10: the camera turns back to the chase view over 1 s
        show.end(); layer.removeEventListener('pointerdown', cheer); layer.remove();
      }
      if (link.show === show) { link.show = null; link.poses = null; }
      show = layer = null; step = '';
    },
    frame(engine, alpha, view) {
      if (!show) return;
      gesture?.update(view.dt, view.rawDt);
      const k = String(show.step); if (k !== step) { step = k; layer.dataset.step = k; } // the step that runs, for the tests
    },
  };
}

// tune, fps: ?tune and ?fps (D-5); sandbox: the ?sandbox page (its scene has no HUD or menus). net: { session, netlog } for
// the Multiplayer panel (G5; the entry sets net.session after boot), or null
export function tractorView({ tune = false, fps = false, sandbox = false, net = null } = {}) {
  const menus = link.menus = menuHalves(view => picturesOf(pageOf(view)), net);
  if (net) net.refresh = () => menus.refreshMultiplayer(); // the session's onChange
  return defineView({ scenes: { farm: driveHalf({ withHud: true, tune, fps }), sandbox: driveHalf({ tune, fps }), show: showHalf(),
    start: menus.start, reward: menus.reward, paint: menus.paint, book: menus.book, parent: menus.parent, sleep: menus.sleep, multiplayer: menus.multiplayer }, render: RENDER });
}
