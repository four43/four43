import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { DT } from './sim/physics.js';
import { createGame } from './sim/game.js';
import { TYPES } from './sim/herd.js';
import { TREE } from './sim/trees.js';
import { createGibs } from './render/gibs.js';
import { createFx } from './render/fx.js';
import { randomSeed } from './sim/rng.js';
import { createAnimals3D } from './render/animals3d.js';
import { renderIcons, tractorPicture } from './ui/icons.js';
import { createStickerArt } from './ui/stickerArt.js';
import { createHud } from './ui/hud.js';
import { slotIndex } from './sim/slots.js';
import { buildFarm3D } from './render/farm3d.js';
import { POWER, TP } from './sim/tractor.js';
import { TR } from './sim/hitch.js';
import { createSandbox } from './sim/sandbox.js';
import { createScene } from './render/scene.js';
import { createChaseCam, CAM } from './render/camera.js';
import { createVehicles3D } from './render/vehicles3d.js';
import { createInput } from './ui/input.js';
import { makeGravelTexture, worldUV } from './render/textures.js';
import { createTrip, stepTrip } from './sim/trip.js';
import { buildShowSteps } from './sim/showSteps.js';
import { createShow } from './ui/show.js';
import { Sound } from './audio/sound.js';
import { createVoice } from './audio/voice.js';
import { createMenus, paintBtnSvg, bookSvg } from './ui/menus.js';
import { disposeTree } from './render/dispose.js';
import { load, save } from './ui/store.js';
import { Handshake } from './net/handshake.js';
import { createSession, parseRoomInput } from './net/session.js';
import { parseLag } from './net/link.js';
import { createOthers3D } from './render/others3d.js';
import { DEFAULT_SETTINGS, seedParam, powerParam, clampSettings, clampProgress, completeShow, wornHats, emptyProgress, hasPaintChoice } from './sim/progress.js';

const snapOf = b => ({ p: new THREE.Vector3().copy(b.translation()), q: new THREE.Quaternion().copy(b.rotation()) });
const snapInto = (b, s) => { const t = b.translation(), q = b.rotation(); s.p.set(t.x, t.y, t.z); s.q.set(q.x, q.y, q.z, q.w); };
function lerpSnap(a, b, t, out) { out.p.lerpVectors(a.p, b.p, t); out.q.slerpQuaternions(a.q, b.q, t); return out; }

async function main() {
  await RAPIER.init();
  const params = new URLSearchParams(location.search), sandbox = params.has('sandbox'), ui = document.getElementById('ui');
  const lag = parseLag(params.get('lag')), signal = params.get('signal') || undefined; // M-28
  const safe = (fn, fallback) => { try { return fn(); } catch (e) { console.warn('saved data ignored', e); return fallback(); } }; // no storage content may stop the game starting
  let settings = safe(() => clampSettings(load('tp-settings', DEFAULT_SETTINGS)), () => clampSettings({})), progress = safe(() => clampProgress(load('tp-progress', null), Object.keys(TYPES)), emptyProgress);
  let powerNow = powerParam(params.get('power'), settings.power);
  const { renderer, scene, camera, follow } = createScene(document.getElementById('c'));
  const aniso = renderer.capabilities.getMaxAnisotropy(), perf = params.has('fps') ? createFpsMeter(renderer) : null;
  const sound = new Sound(), voice = createVoice(sound); // recorded words, with the browser's speech for any word not recorded yet
  voice.enabled = settings.voice;
  // iOS: audio and speech only start inside a gesture, and the context can be interrupted later. Try on every kind of gesture and on coming back to the page,
  // and stop listening only once the context is really running. The start screen's tap is the real gesture (menus onPlay); this stays as the fallback.
  const GEST = ['pointerup', 'touchend', 'click', 'keydown'];
  const unlock = () => { voice.prime(); Promise.resolve(sound.unlock()).then(() => { if (sound.ctx?.state === 'running') { sound.music(settings.music); for (const n of GEST) removeEventListener(n, unlock, true); } }); };
  for (const n of GEST) addEventListener(n, unlock, true);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && sound.ctx && sound.ctx.state !== 'running') { sound.unlock(); for (const n of GEST) addEventListener(n, unlock, true); } });
  const input = createInput(ui);
  const icons = sandbox ? null : renderIcons(renderer), hud = sandbox ? null : createHud(ui, { icons, onWordTap: ids => voice.say(ids) });
  const showQuat = new THREE.Quaternion(), chaseQuat = new THREE.Quaternion();
  let hornQueued = false; input.onHorn(() => { hornQueued = true; });
  // Everything below `world` belongs to one farm. startFarm throws it all away and builds the next one; trips on the same farm rebuild nothing.
  let world, game, farm3d, vehicles, gibs, animals3d, others3d, fx, chase, trip, show, sprinklers, fxs, wheelPt, prev, curr, view, viewCars, bodyList, seed, gen = 0;
  const stepIn = { thr: 0, steer: 0, horn: false }, animView = { cars: null, alpha: 0 }, vehSnap = { tractor: null, cars: null, dirt: 0 }, chaseIn = { x: 0, y: 0, z: 0, yaw: 0, fwd: 0, speed: 0, velYaw: 0 }; // reused every step/frame: nothing allocated in the loop
  let started = sandbox, showDone, rewardDone, riders, guideToBarn, helpTarget, pathT, pathK = false, barnWay = null, camBlend, acc = 0, last = performance.now();
  const sfx = { surface: 'gravel', air: 0, whee: false };
  const bodies = () => bodyList;
  const applyHats = () => { const ids = wornHats(progress); animals3d?.setHats(a => ids.length ? animals3d.hat(ids[a.id % ids.length]) : null); }; // W-4

  function build(newSeed, power, player = 1) {
    seed = newSeed; gen++;
    world = new THREE.Group(); scene.add(world);
    const t0 = performance.now(); game = sandbox ? createSandbox(RAPIER, { power }) : createGame(RAPIER, { seed, power, player });
    console.log('seed', seed, 'sim build ms', Math.round(performance.now() - t0));
    const t1 = performance.now(); farm3d = game.farm ? buildFarm3D(world, game.farm, game.road, game.terrain, game.items, game.yardProps.props, { anisotropy: aniso, trees: game.trees }) : (buildSandbox3D(world, game, aniso), null);
    console.log('farm 3d build ms', Math.round(performance.now() - t1));
    vehicles = createVehicles3D(world, game.tractor, game.train); vehicles.setPaint(progress.paint);
    gibs = createGibs(world); chase = createChaseCam(camera);
    animals3d = game.herd ? createAnimals3D(world, game.herd) : null; applyHats(); others3d = createOthers3D(world);
    fx = createFx(world, game.terrain ? (x, z) => game.terrain.height(x, z) : undefined);
    fxs = { dust: 0, mud: 0, mark: 0, spray: false, drip: new Set() }; wheelPt = {}; sprinklers = farm3d?.sprinklers || [];
    trip = game.herd ? createTrip() : null; show = game.herd ? createShow({ root: ui, camera, game, voice, sound, fx, scene: world }) : null;
    showDone = rewardDone = false; riders = []; guideToBarn = false; helpTarget = null; pathT = 0; camBlend = 1;
    if (!started) game.mode = 'start'; // the start screen is up: nothing moves until the tap
    bodyList = [game.tractor.body, ...game.train.cars.map(c => c.body)];
    prev = bodyList.map(snapOf); curr = bodyList.map(snapOf); view = prev.map(s => ({ p: s.p.clone(), q: s.q.clone() })); viewCars = view.slice(1); animView.cars = vehSnap.cars = viewCars; vehSnap.tractor = view[0];
    document.getElementById('tune')?.remove();
    if (params.has('tune')) { buildTunePanel(game); Object.assign(window, { game, fx, renderer, tp: { get game() { return game; }, get trip() { return trip; }, get progress() { return progress; }, get animals3d() { return animals3d; }, get seed() { return seed; }, sound, voice, startFarm } }); }
  }
  function dispose() {
    gen++; show?.end(); document.getElementById('show')?.remove(); voice.stop?.(); hud?.arrowTo(null);
    sound.spray(false); sound.skid(0); sfx.surface = 'gravel'; sfx.air = 0; sfx.whee = false; // no loop of the old farm (a sprinkler, a skid) keeps sounding
    scene.remove(world); disposeTree(world); // geometries, materials, textures, instance buffers
    game.phys.world.free(); // the Rapier world, with the terrain heightfield, trees, props and vehicles
  }
  function startFarm({ seed: s, power, player }) {
    renderer.setAnimationLoop(null);
    try {
      dispose();
      try { build(s ?? randomSeed(), power ?? powerNow, player); } catch (e) { console.error('new farm failed, retrying with a fresh seed', e); try { world && (scene.remove(world), disposeTree(world)); } catch { /* half built */ } build(randomSeed(), power ?? powerNow, player); }
      hud?.reset();
      const t = game.tractor, p = t.body.translation(); chase.update(1, { x: p.x, y: p.y, z: p.z, yaw: t.yaw, fwd: t.fwd, speed: t.speed, velYaw: t.yaw }); // the camera starts behind the new tractor
    } catch (e) { console.error('new farm', e); } finally { acc = 0; last = performance.now(); renderer.setAnimationLoop(frame); }
    return game;
  }
  const showReward = rs => { // W-1, W-3, W-4: the sticker, a new color or hat, then the card. R-1: a failure here never leaves the game held
    try {
      const r = completeShow(progress, rs.map(x => x.animal)); progress = r.progress;
      if (r.newHat) applyHats();
      save('tp-progress', progress);
      if (r.newPaint || r.newHat) sound.bells();
      menus.showReward({ sticker: r.sticker, newPaint: r.newPaint, newHat: r.newHat, progress });
      voice.say(['you-did-it', 'new-sticker']);
    } catch (e) { console.error('reward', e); menus.hide(); rewardDone = true; }
  };
  // The trip starts on a real gesture: it unlocks audio and speech (iOS). F-11: the start screen shows only when there is a
  // paint to choose; otherwise the tractor can drive at once and the first touch or key press starts the trip.
  function play() { if (started) return; voice.prime(); started = true; game.mode = 'drive'; Promise.resolve(sound.unlock()).then(() => sound.music(settings.music)); }
  function enterStart() {
    if (!menus) return;
    if (hasPaintChoice(progress)) { menus.showStart(progress); return; }
    game.mode = 'drive';
    const first = () => { removeEventListener('pointerdown', first, true); removeEventListener('keydown', first, true); play(); };
    addEventListener('pointerdown', first, true); addEventListener('keydown', first, true);
  }
  const menus = sandbox ? null : createMenus(ui, {
    icons, art: createStickerArt(renderer), tractorPic: sandbox ? null : tractorPicture(renderer),
    onStickers(p) { save('tp-progress', p); }, // W-2: a sticker was placed, moved or taken off a page
    onHats(p) { save('tp-progress', p); applyHats(); sound.plop(); }, // W-4: a hat was turned off or on
    onPlay: play,
    onKeepDriving() { rewardDone = true; },
    onNewFarm() { startFarm({ seed: settings.seed ?? randomSeed(), power: powerNow }); session?.setGame(game); if (!started) enterStart(); }, // M-19: a host's guests get the new farm too. R-1: from the start screen (or its sticker book) the new farm waits for the go tap; otherwise it is driving
    onPaint(p) { progress.paint = p; vehicles.setPaint(p); save('tp-progress', progress); sound.plop(); session?.setPaint(p); }, // W-3
    onSettings(s) { // power, voice and music apply at once; a seed applies with the next new farm
      settings = s; save('tp-settings', s); powerNow = s.power; game.tractor.setPower?.(s.power);
      voice.enabled = s.voice; if (!s.voice) voice.stop?.();
      sound.music(s.music);
    },
    onClearStickers() { progress = { ...progress, stickers: [] }; save('tp-progress', progress); },
    onParent() { menus.openParent(settings, seed, { guest: !!session?.isGuest }); }, // M-19: no new farm for a guest
    onMultiplayer() { menus.openMultiplayer(session); },
  });
  const session = sandbox ? null : createSession({ Handshake, server: signal, lag, getGame: () => game, getPaint: () => progress.paint,
    onFarm: (s, n) => { startFarm({ seed: s, power: powerNow, player: n }); if (!started) play(); return game; }, // M-1: the guest makes the host's farm
    onChange: () => menus.refreshMultiplayer() });
  let lastSync = null; // a room that just ended: the events its sync pushed on the way out (playerGone poofs, M-39, M-41) still play
  const netEvents = now => { try { const y = session.sync, left = lastSync && lastSync !== y ? lastSync.out.splice(0) : []; lastSync = y; const e = session.before(now); return left.length ? [...left, ...e] : e; } catch (e) { console.warn('net before', e); return []; } }; // M-44: a sync error never stops the frame loop

  // U-6: while driving, the paint screen and the sticker book are a tap away (bottom left); the tractor is held while one is open
  const driveBtns = sandbox ? null : Object.assign(document.createElement('div'), { id: 'drivebtns', hidden: true });
  if (driveBtns) {
    ui.appendChild(driveBtns);
    const btn = (cls, svg, label, openIt) => { const b = document.createElement('button'); b.className = 'pic ' + cls; b.innerHTML = svg; b.setAttribute('aria-label', label);
      b.addEventListener('pointerdown', e => e.stopPropagation()); b.addEventListener('click', e => { e.stopPropagation(); if (game.mode !== 'drive') return; game.mode = 'menu'; sound.plop(); openIt(() => { if (game.mode === 'menu') game.mode = 'drive'; }); }); driveBtns.appendChild(b); };
    btn('paintbtn', paintBtnSvg(), 'Paint', back => menus.openPaint(progress, back));
    btn('stickerbtn', bookSvg(), 'Sticker book', back => menus.showBook(progress, back));
  }
  build(seedParam(params.get('seed')) ?? settings.seed ?? randomSeed(), powerNow);
  const frame = now => {
    const dt = Math.min(0.1, (now - last) / 1000); last = now; acc += dt;
    const inp = input.read();
    while (acc >= DT) {
      stepIn.thr = inp.thr; stepIn.steer = inp.steer; stepIn.horn = hornQueued;
      const g0 = gen, nowMs = performance.now(), netEv = session ? netEvents(nowMs) : []; // before game.step: a welcome may rebuild the farm here (M-1)
      if (gen !== g0) { acc -= DT; continue; } // a new farm: fresh bodies and snapshots, its first step comes next
      const old = prev; prev = curr; curr = old; // two snapshot sets swap places: nothing is allocated per step
      const ev = [...netEv, ...(game.step(stepIn) || [])]; hornQueued = false; for (let i = 0; i < bodyList.length; i++) snapInto(bodyList[i], curr[i]); acc -= DT;
      if (session) try { session.after(ev, nowMs); } catch (e) { console.warn('net after', e); } // M-44
      for (const e of ev) {
        if (e.type === 'treeBreak') { const t = e.tree, bush = t.kind === 'bush', k = bush ? 0.7 : t.young ? 0.8 : 1.3; gibs.burst(t.x, (bush ? 0.8 : 1.6) * k, t.z, e.dir, k, bush); if (bush) sound.bushPop(); else sound.treePop(); }
        if (e.type === 'horn') sound.horn();
        if (e.type === 'dodge') sound.boing(0.2); // B-14
        if (e.type === 'treeBump') sound.clunk(); // T-34: a soft bump when a tree holds
        if (e.type === 'boop') { chase.shake(0.35); sound.boing(); sound.animal(e.animal.type); if (e.animal.golden) sound.bells(); fx.stars(e.animal.x, 1, e.animal.z); }
        if (e.type === 'launch' && e.animal.type === 'duck' && game.farm && Math.hypot(e.animal.x - game.farm.yard.pond.x, e.animal.z - game.farm.yard.pond.z) < game.farm.yard.pond.r + 3) fxs.drip.add(e.animal); // A-5: a duck from the pond drips
        if (e.type === 'mud-enter') { fx.mudSplash(game.tractor.x, game.tractor.z); sound.squelch(); } // T-13
        if (e.type === 'washed') { const t = game.tractor; for (let k = 0; k < 3; k++) fx.sparkles(t.x, 1.8, t.z); sound.squeaky(); } // T-15
        if (e.type === 'bump') { sound.boing(0.6); sound.horn(0.5); chase.shake(0.25); } // M-7
        if (e.type === 'remoteHorn') sound.horn(0.4); // M-8
        if (e.type === 'unclaim') { fx.stars(e.pos.x, e.pos.y, e.pos.z); sound.plop(); hud.reset(); for (const s of game.load.slots) if (s.landed) hud.fill(slotIndex(s) + 1, s.animal.type, s.animal.golden); } // M-14: poof; the slot bar packs up
        if (e.type === 'help') { helpTarget = { a: e.animal, t: 10 }; sound.animal(e.animal.type); } // M-9
        if (e.type === 'playerJoined') { for (let k = 0; k < 3; k++) fx.sparkles(e.x, 1.6, e.z); sound.horn(0.6); } // M-10
        if (e.type === 'playerGone') { fx.stars(e.x, 1.2, e.z); sound.plop(); } // M-39
        if (e.type === 'land') { sound.plop(); voice.say(e.animal.golden ? ['golden', e.animal.type] : [e.animal.type], { low: true }); const n = slotIndex(e.slot) + 1; hud.fill(n, e.animal.type, e.animal.golden); hud.showWord((e.animal.golden ? 'Golden ' : '') + TYPES[e.animal.type].word, n, e.animal.golden ? ['golden', e.animal.type] : [e.animal.type]); }
      }
      stepSounds(game, sound, sfx);
      if (trip && started) { // spec 3.1: intro, drive, show, reward
        const cues = stepTrip(trip, { dt: DT, landed: game.load.landed(), booped: ev.some(e => e.type === 'boop'), barnPass: ev.some(e => e.type === 'barnPass'), showDone, rewardDone });
        showDone = rewardDone = false;
        for (const c of cues) {
          if (c === 'drive') game.mode = 'drive'; // the card is gone: driving and boops work again
          if (c === 'say-intro') voice.say(['lets-find', 'animals']);
          if (c === 'full') { voice.say(['great-job', 'go-to-barn']); guideToBarn = true; pathT = 0; }
          if (c === 'help') { if (!session?.requestHelp()) { const h = game.herd.callHelp(game.tractor); if (h) { helpTarget = { a: h, t: 10 }; sound.animal(h.type); } } } // F-4: the helper calls out; M-9: a guest asks the host (its answer is a help event, or none)
          if (c === 'show') {
            const myGen = gen;
            guideToBarn = false; helpTarget = null; fx.sparkleTrail([]); hud.arrowTo(null); riders = game.startShow(); session?.showStarted(); // M-17
            show.play(riders, buildShowSteps(riders.map(r => ({ type: r.animal.type, golden: r.animal.golden }))))
              .catch(e => console.error('show', e)).finally(() => { if (gen === myGen) showDone = true; }); // R-1: an error in the show never locks the game
          }
          if (c === 'reward') { showQuat.copy(camera.quaternion); camBlend = 0; show.end(); game.finishShow(riders); session?.delivered(riders); game.mode = 'reward'; hud.reset(); showReward(riders); } // F-3: held (no driving, no boops) until a card button is tapped
        }
      }
    }
    const a = acc / DT; view.forEach((v, i) => lerpSnap(prev[i], curr[i], a, v));
    stepFx(game, fx, sound, fxs, wheelPt, sprinklers, dt); fx.update(dt);
    gibs.update(dt); farm3d?.update(view[0].p); animView.alpha = a; animals3d?.update(dt, game, animView); others3d?.update(dt, session?.sync?.players ?? null);
    vehSnap.dirt = game.dirt?.tractor; vehicles.update(vehSnap);
    const t = game.tractor, lv = t.body.linvel();
    if (show?.active) show.update(dt);
    else {
      chaseIn.x = view[0].p.x; chaseIn.y = view[0].p.y; chaseIn.z = view[0].p.z; chaseIn.yaw = t.yaw; chaseIn.fwd = t.fwd; chaseIn.speed = t.speed; chaseIn.velYaw = Math.atan2(lv.x, lv.z); chase.update(dt, chaseIn);
      if (camBlend < 1) { camBlend = Math.min(1, camBlend + dt); const k = camBlend * camBlend * (3 - 2 * camBlend); chaseQuat.copy(camera.quaternion); camera.quaternion.slerpQuaternions(showQuat, chaseQuat, k); } // F-10: turn back smoothly
    }
    if (driveBtns) { const on = started && game.mode === 'drive' && !show?.active; if (driveBtns.hidden === on) driveBtns.hidden = !on; }
    if (trip && started) { // F-2: sparkle path and arrow to the barn; F-4: arrow to the helper animal for 10 s
      if (helpTarget && ((helpTarget.t -= dt) <= 0 || !game.herd.free().includes(helpTarget.a))) helpTarget = null;
      if (guideToBarn && (pathT -= dt) <= 0) { pathT = 0.25; barnWay = barnPath(game, t.x, t.z); if ((pathK = !pathK)) fx.sparkleTrail(barnWay.path); fx.sparkleFrame(barnWay.frame); } // the door frame twice as often
      const aim = show.active ? null : helpTarget ? { x: helpTarget.a.x, y: 1, z: helpTarget.a.z } : guideToBarn && barnWay ? barnWay.aim : null;
      hud.arrowTo(aim && edgeArrow(camera, aim));
    }
    { const t2 = game.tractor; sound.engine(t2.engine, t2.speed / t2.P.vmax, t2.surface); sound.skid(Math.max(0, Math.min(1, (Math.abs(t2.slip) - 0.2) * 2))); }
    follow(view[0].p.x, view[0].p.z);
    renderer.render(scene, camera);
    perf?.tick(dt);
  };
  enterStart();
  const linkCode = parseRoomInput(params.get('r')); // M-34: a QR link opens the join prompt
  if (session && params.has('r')) { const u = new URL(location.href); u.searchParams.delete('r'); history.replaceState(null, '', u); } // a reload does not ask again
  if (session && linkCode) { menus.openMultiplayer(session); session.openJoin(); session.submitCode(linkCode); }
  renderer.setAnimationLoop(frame);
}

// Per-step sound cues: the squelch when the wheels enter mud (T-13); whee and a cheer when all four wheels leave the ground for over 0.15 s (T-14)
function stepSounds(game, sound, s) {
  const t = game.tractor;
  if (t.surface === 'mud' && s.surface !== 'mud' && !game.dirt) sound.squelch(); // the farm game sends a mud-enter event instead
  s.surface = t.surface;
  const air = [0, 1, 2, 3].every(i => !t.vc.wheelIsInContact(i));
  s.air = air ? s.air + DT : 0;
  if (!air) s.whee = false;
  else if (s.air > 0.15 && !s.whee) { s.whee = true; sound.whee(); if (game.load?.landed() > 0) sound.cheer(); }
}

// F-2: the way to the barn. Along the route to the yard gate, then to a point on the barn axis 16 m out from the opening that
// faces the player (going around the side first if the player is beside the barn, clear of the open door leaves), then straight
// in along the axis to the barn's middle: points every 3 m. frame: points around the whole door opening; aim: its center.
const BARN_DOOR = { half: 4.6, h: 4.8 }; // the opening between the walls (m either side of the axis) and up to the header
function barnPath(game, x, z) {
  const { road, farm, terrain } = game, b = farm.yard.barn, f = [Math.sin(b.yaw), Math.cos(b.yaw)], rt = [Math.cos(b.yaw), -Math.sin(b.yaw)], pts = [];
  const at = (a, sd) => ({ x: b.x + f[0] * a + rt[0] * sd, z: b.z + f[1] * a + rt[1] * sd }), local = p => ({ a: (p.x - b.x) * f[0] + (p.z - b.z) * f[1], s: (p.x - b.x) * rt[0] + (p.z - b.z) * rt[1] });
  const line = (p, q) => { const m = Math.max(1, Math.round(Math.hypot(q.x - p.x, q.z - p.z) / 3)); for (let i = pts.length ? 1 : 0; i <= m && pts.length < 60; i++) pts.push({ x: p.x + (q.x - p.x) * i / m, z: p.z + (q.z - p.z) * i / m }); };
  let from = { x, z };
  if (!road.inYard(x, z)) {
    const n = road.nearest(x, z), R = road.routes[n.pt.r], dir = n.pt.s < R.length - n.pt.s ? -1 : 1;
    for (let i = n.pt.n; i >= 0 && i < R.pts.length && pts.length < 40; i += dir * 3) pts.push(R.pts[i]);
    from = R.pts[dir < 0 ? 0 : R.pts.length - 1];
  }
  const L = local(from), end = L.a >= 0 ? 1 : -1, out = b.half + b.leaf + 5, q = at(end * out, 0), door = at(end * b.half, 0);
  const way = [from];
  if (Math.abs(L.a) < out && Math.abs(L.s) < b.width + 4) way.push(at(L.a, (L.s >= 0 ? 1 : -1) * (b.width + 4))); // beside the barn or a door leaf: step out to the side first
  if (Math.abs(L.a) < out) way.push(at(end * out, local(way.at(-1)).s));                                          // then along the side, past the leaves
  way.push(q, door, at(0, 0));
  for (let i = 1; i < way.length; i++) line(way[i - 1], way[i]);
  const frame = [], fa = end * (b.half + 0.4);
  for (let k = -BARN_DOOR.half; k <= BARN_DOOR.half; k += 0.35) frame.push({ ...at(fa, k), y: BARN_DOOR.h });
  for (const sd of [-1, 1]) for (let y = 0.2; y < BARN_DOOR.h; y += 0.35) frame.push({ ...at(fa, sd * BARN_DOOR.half), y });
  return { path: pts.map(p => ({ x: p.x, y: terrain.height(p.x, p.z) + 0.6, z: p.z })), frame, aim: { ...door, y: BARN_DOOR.h / 2 } };
}

// Continuous effects, once per drawn frame (the one-off ones come from game events): D-9 gravel spray, tire marks and dust, T-13 mud splashes,
// T-15 sprinkler water, golden rainbow trails (A-8) and the pond duck's drips (A-5)
function stepFx(game, fx, sound, s, w, sprinklers, dt) {
  const t = game.tractor; if (!game.tractorWorld) return;
  s.dust -= dt; s.mud -= dt; s.mark -= dt;
  const lv = t.body.linvel(), sp = Math.hypot(lv.x, lv.z), hx = sp > 1 ? lv.x / sp : Math.sin(t.yaw), hz = sp > 1 ? lv.z / sp : Math.cos(t.yaw);
  if (game.mode === 'drive' && t.surface === 'gravel' && (Math.abs(t.slip) > 0.25 || (t.engine > 0.8 && t.speed < 3))) {
    for (const i of [2, 3]) { game.tractorWorld({ x: t.W[i].cx, y: 0, z: t.W[i].cz }, w); fx.gravel(w.x, w.z, hx, hz, 2); if (s.mark <= 0) fx.tireMark(w.x, w.z, Math.atan2(hx, hz), Math.min(1, Math.abs(t.slip) * 2)); }
    if (s.mark <= 0) s.mark = 0.06;
  }
  if (t.speed > 4 && t.surface === 'gravel' && s.dust <= 0) { s.dust = 0.1; fx.dust(t.x - hx * 2, t.z - hz * 2); }
  if (t.surface === 'mud' && t.speed > 2 && s.mud <= 0) { s.mud = 0.15; for (const i of [2, 3]) { game.tractorWorld({ x: t.W[i].cx, y: 0, z: t.W[i].cz }, w); fx.mudSplash(w.x, w.z); } }
  let near = false;
  for (const sp2 of sprinklers) if (Math.hypot(sp2.x - t.x, sp2.z - t.z) < 15) { near = true; fx.water(sp2.x, sp2.z, sp2.yaw, sp2.h ?? 4.1, 8, sp2.spread ?? 14, sp2.depth ?? 18); } // route sprinklers and the farmyard wash (T-36)
  if (near !== s.spray) { s.spray = near; sound.spray(near); }
  for (const f of game.flights) {
    if (f.u < 0) continue;
    if (f.animal.golden) fx.rainbowTrail(f.pos.x, f.pos.y, f.pos.z);
    if (s.drip.has(f.animal)) { if (f.u > 0.6) s.drip.delete(f.animal); else fx.water(f.pos.x, f.pos.z, 0, f.pos.y - game.terrain.height(f.pos.x, f.pos.z), 1, 0.6); }
  }
}

// F-2, F-4: a point off screen (or behind the camera) gives an arrow on a screen ellipse inset by 70 px, pointing toward it; on screen gives null
const _v = new THREE.Vector3();
function edgeArrow(camera, p) {
  const behind = _v.set(p.x, p.y, p.z).applyMatrix4(camera.matrixWorldInverse).z > 0;
  _v.set(p.x, p.y, p.z).project(camera);
  if (!behind && Math.abs(_v.x) <= 1 && Math.abs(_v.y) <= 1) return null;
  let dx = _v.x * innerWidth / 2, dy = -_v.y * innerHeight / 2; if (behind) { dx = -dx; dy = -dy; }
  if (Math.hypot(dx, dy) < 1) dy = 1; // straight behind: point down
  const e = Math.hypot(dx / (innerWidth / 2 - 70), dy / (innerHeight / 2 - 70));
  return { x: innerWidth / 2 + dx / e, y: innerHeight / 2 + dy / e, angle: Math.atan2(dy, dx) };
}

function buildSandbox3D(scene, game, anisotropy) {
  const ground = new THREE.Mesh(worldUV(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), 8), new THREE.MeshLambertMaterial({ map: makeGravelTexture({ anisotropy }) }));
  ground.receiveShadow = true; scene.add(ground);
  addMarkers(scene, game);
  for (const m of game.mud) { const g = new THREE.Mesh(new THREE.CircleGeometry(m.r, 32).rotateX(-Math.PI / 2), new THREE.MeshPhongMaterial({ color: '#7a5233', shininess: 60 })); g.position.set(m.x, 0.02, m.z); scene.add(g); }
  for (const r of game.ramps) { // simple visual for the sandbox kicker
    const s = new THREE.Shape([[-5, 0], [0, 0.6], [1, 0.6], [4, 0]].map(([a, y]) => new THREE.Vector2(a, y)));
    const g = new THREE.ExtrudeGeometry(s, { depth: 7, bevelEnabled: false }); g.translate(0, 0, -3.5); g.rotateY(-Math.PI / 2);
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: '#b89a70' })); m.position.set(r.x, 0, r.z); m.rotation.y = r.yaw; m.receiveShadow = m.castShadow = true; scene.add(m);
  }
}

// Cones scattered every ~12 m for parallax. Keeps the lane to the ramp and the mud patch clear.
function addMarkers(scene, game) {
  const spots = []; let seed = 3; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let x = -150; x <= 150; x += 12) for (let z = -150; z <= 150; z += 12) {
    const px = x + (rnd() - 0.5) * 8, pz = z + (rnd() - 0.5) * 8;
    if (Math.abs(px) < 10 && pz > -15 && pz < 70) continue;
    if (game.mud.some(m => Math.hypot(px - m.x, pz - m.z) < m.r + 2)) continue;
    spots.push([px, pz]);
  }
  const cone = new THREE.ConeGeometry(0.35, 1, 10).translate(0, 0.5, 0);
  const mesh = new THREE.InstancedMesh(cone, new THREE.MeshLambertMaterial({ color: '#ff7a1a' }), spots.length), M = new THREE.Matrix4();
  spots.forEach(([x, z], i) => { const s = 0.8 + rnd() * 0.8; M.makeScale(s, s, s).setPosition(x, 0, z); mesh.setMatrixAt(i, M); });
  mesh.castShadow = true; scene.add(mesh);
}

// ?tune: sliders for live feel tuning during the playtest. Values print to the console to copy into tractor.js.
function buildTunePanel(game) {
  const el = document.createElement('div'); el.id = 'tune'; document.body.appendChild(el);
  const head = document.createElement('button'); head.textContent = 'tune'; head.id = 'tuneToggle'; el.appendChild(head);
  const body = document.createElement('div'); body.hidden = true; el.appendChild(body);
  head.onclick = () => { body.hidden = !body.hidden; };
  const t = game.tractor, rows = [
    ['vmax', () => t.P.vmax, v => t.P.vmax = v, 3, 15, 0.5], ['force', () => t.P.force, v => t.P.force = v, 2000, 15000, 100],
    ['rearSide', () => t.P.rearSide, v => t.P.rearSide = v, 0.2, 1.2, 0.01], ['slideMax', () => t.P.slideMax, v => t.P.slideMax = v, 0.2, 1.2, 0.01],
    ['loose', () => t.P.loose, v => t.P.loose = v, 0, 0.3, 0.005],
    ['cam dist', () => CAM.D, v => CAM.D = v, 4, 20, 0.5], ['cam height', () => CAM.H, v => CAM.H = v, 4, 22, 0.5], ['cam ahead', () => CAM.AHEAD, v => CAM.AHEAD = v, 2, 24, 0.5],
    ['slip', () => TP.slip, v => TP.slip = v, 0.5, 6, 0.1], ['steerMax', () => TP.steerMax, v => TP.steerMax = v, 0.3, 0.9, 0.01],
    ['tree break speed', () => TREE.breakSpeed, v => TREE.breakSpeed = v, 1, 10, 0.5],
    ['stiffness (reload)', () => TP.stiffness, v => TP.stiffness = v, 8, 40, 1], ['trailer limitBeta', () => TR.limitBeta, v => TR.limitBeta = v, 0.1, 2, 0.05],
  ];
  for (const [name, get, set, min, max, step] of rows) {
    const l = document.createElement('label'); l.innerHTML = `<span>${name}</span><input type=range min=${min} max=${max} step=${step} value=${get()}><output>${get()}</output>`;
    const i = l.querySelector('input'), o = l.querySelector('output');
    i.oninput = () => { set(+i.value); o.textContent = i.value; console.log('tune', JSON.stringify({ P: t.P, TP: { slip: TP.slip, steerMax: TP.steerMax, stiffness: TP.stiffness }, limitBeta: TR.limitBeta })); };
    body.appendChild(l);
  }
  const sel = document.createElement('select'); sel.innerHTML = Object.keys(POWER).map(k => `<option ${k === t.power ? 'selected' : ''}>${k}</option>`).join('');
  sel.onchange = () => t.setPower(sel.value); body.appendChild(sel);
  if (game.trees) { const r = document.createElement('button'); r.textContent = 'reset props and trees'; r.onclick = () => { game.yardProps.reset(); game.trees.reset(); }; body.appendChild(r); }
}
main();

// ?fps: a small corner readout of frames per second (now, and the lowest over the last 5 s), draw calls and triangles
function createFpsMeter(renderer) {
  const el = Object.assign(document.createElement('div'), { id: 'fps' });
  el.style.cssText = 'position:fixed;right:6px;top:6px;z-index:99;font:12px/1.3 monospace;color:#fff;background:rgba(0,0,0,.55);padding:3px 6px;border-radius:4px;pointer-events:none;white-space:pre';
  document.body.appendChild(el);
  const win = []; let shown = 0;
  return { tick(dt) {
    win.push(dt); if (win.length > 300) win.shift();
    if ((shown += dt) < 0.5) return; shown = 0;
    const avg = win.reduce((a, b) => a + b, 0) / win.length, worst = Math.max(...win), i = renderer.info.render;
    el.textContent = `${(1 / dt).toFixed(0)} fps (avg ${(1 / avg).toFixed(0)}, min ${(1 / worst).toFixed(0)})\n${i.calls} draws, ${(i.triangles / 1000).toFixed(0)}k tris`;
  } };
}
