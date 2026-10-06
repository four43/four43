import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { createPhysics, DT } from './sim/physics.js';
import { createTractor } from './sim/tractor.js';
import { createTrain } from './sim/hitch.js';
import { generateFarm } from './sim/track.js';
import { buildRoad } from './sim/road.js';
import { scatterScenery, addSceneryColliders, addFarmColliders, addYardProps } from './sim/scenery.js';
import { makeRng, randomSeed } from './sim/rng.js';
import { buildFarm3D } from './render/farm3d.js';
import { POWER, TP } from './sim/tractor.js';
import { TR } from './sim/hitch.js';
import { createSandbox } from './sim/sandbox.js';
import { createScene } from './render/scene.js';
import { createChaseCam, CAM } from './render/camera.js';
import { createVehicles3D } from './render/vehicles3d.js';
import { createInput } from './ui/input.js';
import { makeGravelTexture, worldUV } from './render/textures.js';

const snapOf = b => ({ p: new THREE.Vector3().copy(b.translation()), q: new THREE.Quaternion().copy(b.rotation()) });
function lerpSnap(a, b, t, out) { out.p.lerpVectors(a.p, b.p, t); out.q.slerpQuaternions(a.q, b.q, t); return out; }

async function main() {
  await RAPIER.init();
  const params = new URLSearchParams(location.search);
  const power = params.get('power') || 'medium', seed = params.has('seed') ? +params.get('seed') : randomSeed();
  const game = params.has('sandbox') ? createSandbox(RAPIER, { power }) : createFarmDrive(RAPIER, seed, power);
  console.log('seed', seed);
  const { renderer, scene, camera, follow } = createScene(document.getElementById('c'));
  const aniso = renderer.capabilities.getMaxAnisotropy();
  const farm3d = game.farm ? buildFarm3D(scene, game.farm, game.road, game.items, game.yardProps.props, { anisotropy: aniso }) : (buildSandbox3D(scene, game, aniso), null);
  const vehicles = createVehicles3D(scene, game.tractor, game.train);
  const chase = createChaseCam(camera), input = createInput(document.getElementById('ui'));
  const bodies = () => [game.tractor.body, ...game.train.cars.map(c => c.body)];
  let prev = bodies().map(snapOf), curr = prev, view = prev.map(s => ({ p: s.p.clone(), q: s.q.clone() }));
  if (params.has('tune')) { buildTunePanel(game); window.game = game; }
  let acc = 0, last = performance.now();
  renderer.setAnimationLoop(now => {
    const dt = Math.min(0.1, (now - last) / 1000); last = now; acc += dt;
    const inp = input.read();
    while (acc >= DT) { prev = curr; game.step({ ...inp, horn: false }); curr = bodies().map(snapOf); acc -= DT; }
    const a = acc / DT; view.forEach((v, i) => lerpSnap(prev[i], curr[i], a, v));
    farm3d?.update(view[0].p);
    vehicles.update({ tractor: view[0], cars: view.slice(1) });
    const t = game.tractor, lv = t.body.linvel();
    chase.update(dt, { x: view[0].p.x, y: view[0].p.y, z: view[0].p.z, yaw: t.yaw, fwd: t.fwd, speed: t.speed, velYaw: Math.atan2(lv.x, lv.z) });
    follow(view[0].p.x, view[0].p.z);
    renderer.render(scene, camera);
  });
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

function createFarmDrive(RAPIER, seed, power) {
  const farm = generateFarm(seed), road = buildRoad(farm), items = scatterScenery(farm, road, makeRng(seed ^ 0x9e3779b9));
  const phys = createPhysics(RAPIER); addFarmColliders(phys, farm, road); addSceneryColliders(phys, items);
  const yardProps = addYardProps(phys, farm), s = farm.start;
  const tractor = createTractor(phys, { x: s.x, z: s.z, yaw: s.yaw, power, surfaceAt: road.surfaceAt });
  const train = createTrain(phys, tractor);
  return { phys, farm, road, items, yardProps, tractor, train, step(input) {
    tractor.setInput(input.thr, input.steer); tractor.step(DT);
    const e = road.edgePush(tractor.x, tractor.z); if (e.x || e.z) tractor.body.applyImpulse({ x: e.x * 1400 * DT, y: 0, z: e.z * 1400 * DT }, true);
    train.step(DT, { parked: Math.abs(input.thr) < 0.05 && tractor.speed < 0.3 }); phys.world.step();
  } };
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
}
main();
