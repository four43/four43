// The 3D farm (lion-hawk 2g G1): main.js's build and dispose (their 3D parts), stepFx, barnPath, buildSandbox3D and addMarkers,
// moved. buildWorld makes one farm's group in the page's scene from the sim game it is given and only reads it; the sim
// half's scene World holds the bodies; the engine frees it ([S-3]).
import * as THREE from 'three';
import { createGibs } from '../render/gibs.js';
import { createFx } from '../render/fx.js';
import { createAnimals3D } from '../render/animals3d.js';
import { buildFarm3D } from '../render/farm3d.js';
import { instancedShadows } from '../render/shadows.js';
import { warmShaders } from '../render/warm.js';
import { createVehicles3D } from '../render/vehicles3d.js';
import { createOthers3D } from '../render/others3d.js';
import { makeGravelTexture, worldUV } from '../render/textures.js';
import { disposeTree } from '../render/dispose.js';

// One farm's 3D: main.js build's view half. paint: the player's (W-3); aniso: the renderer's max anisotropy
export function buildWorld({ renderer, scene, camera, game, paint, aniso }) {
  const world = new THREE.Group(); scene.add(world);
  const farm3d = game.farm ? buildFarm3D(world, game.farm, game.road, game.terrain, game.items, game.yardProps.props, { anisotropy: aniso, trees: game.trees }) : (buildSandbox3D(world, game, aniso), null);
  const vehicles = createVehicles3D(world, game.tractor, game.train); if (paint) vehicles.setPaint(paint);
  const gibs = createGibs(world);
  const animals3d = game.herd ? createAnimals3D(world, game.herd) : null, others3d = createOthers3D(world);
  const fx = createFx(world, game.terrain ? (x, z) => game.terrain.height(x, z) : undefined);
  const fxs = { dust: 0, mud: 0, mark: 0, halo: 0, spray: false, drip: new Set() }, wheelPt = {}, sprinklers = farm3d?.sprinklers || [];
  instancedShadows(world); // X-4: no shadow-pass program churn (render/shadows.js)
  try { Promise.resolve(warmShaders(renderer, scene, camera)).catch(e => console.warn('shader warm-up', e)); } catch (e) { console.warn('shader warm-up', e); } // B-2
  return {
    group: world, game, farm3d, vehicles, gibs, animals3d, others3d, fx,
    stepFx: (sound, dt) => stepFx(game, fx, sound, fxs, wheelPt, sprinklers, dt),
    drip: a => fxs.drip.add(a), // A-5: a duck from the pond drips
    // main.js dispose's view half: no loop of the old farm (a sprinkler, a skid) keeps sounding; geometries, materials, textures, instance buffers
    dispose(sound) { sound.spray(false); sound.skid(0); scene.remove(world); disposeTree(world); },
  };
}

// F-2: the way to the barn. Along the route to the yard gate, then to a point on the barn axis 16 m out from the opening that
// faces the player (going around the side first if the player is beside the barn, clear of the open door leaves), then straight
// in along the axis to the barn's middle: points every 3 m. frame: points around the whole door opening; aim: its center.
const BARN_DOOR = { half: 4.6, h: 4.8 }; // the opening between the walls (m either side of the axis) and up to the header
export function barnPath(game, x, z) {
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
export function stepFx(game, fx, sound, s, w, sprinklers, dt) {
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
  if (game.herd && (s.halo -= dt) <= 0) { s.halo = 0.05; for (const a of game.herd.animals) if (a.golden && !a.hidden && a.state !== 'gone' && a.state !== 'fly' && a.state !== 'ride' && a.state !== 'elsewhere') fx.rainbowHalo(a.x, (a.y || 0) + 0.3, a.z); } // E-6
  for (const f of game.flights) {
    if (f.u < 0) continue;
    if (f.animal.golden) for (let k = 0; k < 3; k++) fx.rainbowTrail(f.pos.x, f.pos.y, f.pos.z, k); // E-6: a wider ribbon
    if (s.drip.has(f.animal)) { if (f.u > 0.6) s.drip.delete(f.animal); else fx.water(f.pos.x, f.pos.z, 0, f.pos.y - game.terrain.height(f.pos.x, f.pos.z), 1, 0.6); }
  }
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
