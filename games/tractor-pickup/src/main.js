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
import { renderIcons } from './ui/icons.js';
import { createHud } from './ui/hud.js';
import { createSlowMo } from './sim/slowmo.js';
import { slotIndex } from './sim/slots.js';
import { FLIGHT } from './sim/launch.js';
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

const snapOf = b => ({ p: new THREE.Vector3().copy(b.translation()), q: new THREE.Quaternion().copy(b.rotation()) });
function lerpSnap(a, b, t, out) { out.p.lerpVectors(a.p, b.p, t); out.q.slerpQuaternions(a.q, b.q, t); return out; }

async function main() {
  await RAPIER.init();
  const params = new URLSearchParams(location.search);
  const power = params.get('power') || 'medium', seed = params.has('seed') ? +params.get('seed') : randomSeed();
  const t0 = performance.now(), game = params.has('sandbox') ? createSandbox(RAPIER, { power }) : createGame(RAPIER, { seed, power });
  console.log('seed', seed, 'sim build ms', Math.round(performance.now() - t0));
  const { renderer, scene, camera, follow } = createScene(document.getElementById('c'));
  const aniso = renderer.capabilities.getMaxAnisotropy();
  const t1 = performance.now(), farm3d = game.farm ? buildFarm3D(scene, game.farm, game.road, game.terrain, game.items, game.yardProps.props, { anisotropy: aniso, trees: game.trees }) : (buildSandbox3D(scene, game, aniso), null);
  console.log('farm 3d build ms', Math.round(performance.now() - t1));
  const vehicles = createVehicles3D(scene, game.tractor, game.train);
  const gibs = createGibs(scene), sound = new Sound();
  const voice = createVoice(sound); // recorded words, with the browser's speech for any word not recorded yet
  // iOS: audio and speech only start inside a gesture, and the context can be interrupted later. Try on every kind of gesture and on coming back to the page,
  // and stop listening only once the context is really running. (Task 14's start tap can call the same unlock.)
  const GEST = ['pointerup', 'touchend', 'click', 'keydown'];
  const unlock = () => { voice.prime(); Promise.resolve(sound.unlock()).then(() => { if (sound.ctx?.state === 'running') { sound.music(true); for (const n of GEST) removeEventListener(n, unlock, true); } }); };
  for (const n of GEST) addEventListener(n, unlock, true);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && sound.ctx && sound.ctx.state !== 'running') { sound.unlock(); for (const n of GEST) addEventListener(n, unlock, true); } });
  const chase = createChaseCam(camera), input = createInput(document.getElementById('ui'));
  const animals3d = game.herd ? createAnimals3D(scene, game.herd) : null, fx = createFx(scene, game.terrain ? (x, z) => game.terrain.height(x, z) : undefined);
  const fxs = { dust: 0, mud: 0, mark: 0, spray: false, drip: new Set() }, wheelPt = {}, sprinklers = farm3d?.sprinklers || [];
  const hud = game.herd ? createHud(document.getElementById('ui'), { icons: renderIcons(renderer) }) : null;
  const trip = game.herd ? createTrip() : null, show = game.herd ? createShow({ root: document.getElementById('ui'), camera, game, voice, sound, fx }) : null;
  let showDone = false, rewardDone = false, riders = [], guideToBarn = false, helpTarget = null, pathT = 0, camBlend = 1;
  const showQuat = new THREE.Quaternion(), chaseQuat = new THREE.Quaternion();
  const showReward = () => { rewardDone = true; }; // Task 14: the sticker card
  let hornQueued = false; input.onHorn(() => { hornQueued = true; });
  const sfx = { surface: 'gravel', air: 0, whee: false };
  const slow = createSlowMo(); let booped = false; // B-7: half speed at the top of the arc of the first animal each boop launches
  const bodies = () => [game.tractor.body, ...game.train.cars.map(c => c.body)];
  let prev = bodies().map(snapOf), curr = prev, view = prev.map(s => ({ p: s.p.clone(), q: s.q.clone() }));
  if (params.has('tune')) { buildTunePanel(game); window.game = game; window.fx = fx; window.renderer = renderer; }
  let acc = 0, last = performance.now();
  renderer.setAnimationLoop(now => {
    const dt = Math.min(0.1, (now - last) / 1000); last = now; acc += dt * slow.scale();
    const inp = input.read();
    while (acc >= DT) {
      prev = curr; const ev = game.step({ ...inp, horn: hornQueued }) || []; hornQueued = false; slow.step(DT); curr = bodies().map(snapOf); acc -= DT;
      for (const e of ev) {
        if (e.type === 'treeBreak') { const t = e.tree, k = t.young ? 0.6 : 1; gibs.burst(t.x, 1.4 * k, t.z, e.dir, k); sound?.treePop?.(); }
        if (e.type === 'horn') sound.horn();
        if (e.type === 'boop') { chase.shake(0.35); sound.boing(); sound.animal(e.animal.type); if (e.animal.golden) sound.bells(); fx.stars(e.animal.x, 1, e.animal.z); booped = true; }
        if (e.type === 'launch' && e.animal.type === 'duck' && game.farm && Math.hypot(e.animal.x - game.farm.yard.pond.x, e.animal.z - game.farm.yard.pond.z) < game.farm.yard.pond.r + 3) fxs.drip.add(e.animal); // A-5: a duck from the pond drips
        if (e.type === 'mud-enter') { fx.mudSplash(game.tractor.x, game.tractor.z); sound.squelch(); } // T-13
        if (e.type === 'washed') { const t = game.tractor; for (let k = 0; k < 3; k++) fx.sparkles(t.x, 1.8, t.z); sound.squeaky(); } // T-15
        if (e.type === 'launch' && booped) { booped = false; slow.onLaunch(FLIGHT[e.animal.type].dur); }
        if (e.type === 'land') { sound.plop(); voice.say(e.animal.golden ? ['golden', e.animal.type] : [e.animal.type], { low: true }); const n = slotIndex(e.slot) + 1; hud.fill(n, e.animal.type, e.animal.golden); hud.showWord((e.animal.golden ? 'Golden ' : '') + TYPES[e.animal.type].word, n); }
      }
      stepSounds(game, sound, sfx);
      if (trip) { // spec 3.1: intro, drive, show, reward
        const cues = stepTrip(trip, { dt: DT, landed: game.load.landed(), booped: ev.some(e => e.type === 'boop'), barnPass: ev.some(e => e.type === 'barnPass'), showDone, rewardDone });
        showDone = rewardDone = false;
        for (const c of cues) {
          if (c === 'say-intro') voice.say(['lets-find', 'animals']);
          if (c === 'full') { voice.say(['great-job', 'go-to-barn']); guideToBarn = true; pathT = 0; }
          if (c === 'help') { const h = game.herd.callHelp(game.tractor); if (h) helpTarget = { a: h, t: 10 }; }
          if (c === 'show') {
            guideToBarn = false; helpTarget = null; fx.sparkleTrail([]); hud.arrowTo(null); riders = game.startShow();
            show.play(riders, buildShowSteps(riders.map(r => ({ type: r.animal.type, golden: r.animal.golden }))))
              .catch(e => console.error('show', e)).finally(() => { showDone = true; }); // R-1: an error in the show never locks the game
          }
          if (c === 'reward') { showQuat.copy(camera.quaternion); camBlend = 0; show.end(); game.finishShow(riders); hud.reset(); showReward(riders); }
        }
      }
    }
    const a = acc / DT; view.forEach((v, i) => lerpSnap(prev[i], curr[i], a, v));
    stepFx(game, fx, sound, fxs, wheelPt, sprinklers, dt); fx.update(dt * slow.scale());
    gibs.update(dt); farm3d?.update(view[0].p); animals3d?.update(dt, game, { cars: view.slice(1), alpha: a });
    vehicles.update({ tractor: view[0], cars: view.slice(1), dirt: game.dirt?.tractor });
    const t = game.tractor, lv = t.body.linvel();
    if (show?.active) show.update(dt);
    else {
      chase.update(dt, { x: view[0].p.x, y: view[0].p.y, z: view[0].p.z, yaw: t.yaw, fwd: t.fwd, speed: t.speed, velYaw: Math.atan2(lv.x, lv.z) });
      if (camBlend < 1) { camBlend = Math.min(1, camBlend + dt); const k = camBlend * camBlend * (3 - 2 * camBlend); chaseQuat.copy(camera.quaternion); camera.quaternion.slerpQuaternions(showQuat, chaseQuat, k); } // F-10: turn back smoothly
    }
    if (trip) { // F-2: sparkle path and arrow to the barn; F-4: arrow to the helper animal for 10 s
      if (helpTarget && ((helpTarget.t -= dt) <= 0 || !game.herd.free().includes(helpTarget.a))) helpTarget = null;
      if (guideToBarn && (pathT -= dt) <= 0) { pathT = 0.5; fx.sparkleTrail(barnPath(game, t.x, t.z)); }
      const b = game.farm.yard.barn, aim = show.active ? null : helpTarget ? { x: helpTarget.a.x, y: 1, z: helpTarget.a.z } : guideToBarn ? { x: b.x, y: 3, z: b.z } : null;
      hud.arrowTo(aim && edgeArrow(camera, aim));
    }
    { const t2 = game.tractor; sound.engine(t2.engine, t2.speed / t2.P.vmax, t2.surface); sound.skid(Math.max(0, Math.min(1, (Math.abs(t2.slip) - 0.2) * 2))); }
    follow(view[0].p.x, view[0].p.z);
    renderer.render(scene, camera);
  });
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

// F-2: points every 3 m to the nearer barn end: along the route to its nearer end (the gate), then straight across the farmyard
function barnPath(game, x, z) {
  const { road, farm, terrain } = game, b = farm.yard.barn, f = [Math.sin(b.yaw), Math.cos(b.yaw)], pts = [];
  const nearEnd = p => [b.half, -b.half].map(k => ({ x: b.x + f[0] * k, z: b.z + f[1] * k })).sort((u, w) => Math.hypot(u.x - p.x, u.z - p.z) - Math.hypot(w.x - p.x, w.z - p.z))[0];
  let from = { x, z };
  if (!road.inYard(x, z)) {
    const n = road.nearest(x, z), R = road.routes[n.pt.r], dir = n.pt.s < R.length - n.pt.s ? -1 : 1;
    for (let i = n.pt.n; i >= 0 && i < R.pts.length && pts.length < 40; i += dir * 3) pts.push(R.pts[i]);
    from = R.pts[dir < 0 ? 0 : R.pts.length - 1];
  }
  const to = nearEnd(from), m = Math.max(1, Math.round(Math.hypot(to.x - from.x, to.z - from.z) / 3));
  for (let i = pts.length ? 1 : 0; i <= m && pts.length < 40; i++) pts.push({ x: from.x + (to.x - from.x) * i / m, z: from.z + (to.z - from.z) * i / m });
  return pts.map(p => ({ x: p.x, y: terrain.height(p.x, p.z) + 0.6, z: p.z }));
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
  for (const sp2 of sprinklers) if (Math.hypot(sp2.x - t.x, sp2.z - t.z) < 15) { near = true; fx.water(sp2.x, sp2.z, sp2.yaw, 4.1, 8, 14, 18); }
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
