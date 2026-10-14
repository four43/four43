// Rendering for the newer farm pieces: animated gates, coop, nest boxes, eggs, grain, feathers (the engine's particle
// pool) and the day/night lighting on the engine's light rig. Geometry comes from the baked models;
// the chickens, the fox and the dog are view/flock3d.js; the tractor and snacks are drawn by view sync (view/tractor3d.js).
import * as THREE from 'three';
import { createParticles } from 'lion-hawk/kits/fx/view';
import { modelGeometry, mergeGeos, boxGeo, colorGeo } from './view/models.js';
import { createFlock3d } from './view/flock3d.js';
import { L } from './layout.js';

const UP = new THREE.Vector3(0, 1, 0);
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function buildFarmExtras({ scene, sim, assets, mc, MAT, lights }) {
  const { sun, hemi } = lights;
  const { lay } = sim, flock = sim.flock, coop = lay.coop;
  const M = new THREE.Matrix4(), T = new THREE.Matrix4();
  const q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

  // ---------- gates --------------------------------------------------------------------------
  const leafGeo = modelGeometry(assets, 'gate', new THREE.Matrix4().makeTranslation(0.15, 0.05, 0.465), { parts: ['gate'] }).scale(3.15, 1, 1); // hinge at x=0
  const postGeo = mergeGeos([boxGeo(0.06, 0.38, 0.06, 0, 0.19, 0, '#c7835a')]);
  const leaves = [], posts = [];
  for (const g of lay.gates) {
    g.anim = g.open ? 1 : 0;
    const hw = g.width / 2, rot = g.dir === 'x' ? 0 : Math.PI / 2;
    g.frame = new THREE.Matrix4().compose(new THREE.Vector3(g.x, 0, g.z), new THREE.Quaternion().setFromAxisAngle(UP, rot), new THREE.Vector3(1, 1, 1));
    for (const sd of [-1, 1]) posts.push(new THREE.Matrix4().copy(g.frame).multiply(new THREE.Matrix4().makeTranslation(sd * (hw - 0.03), 0, 0)).multiply(new THREE.Matrix4().makeScale(L, L, L)));
    g.tiles.forEach((tile, k) => {
      const side = g.tiles.length > 1 ? (k === 0 ? -1 : 1) : (((Math.round(g.x * 7 + g.z * 3) % 2) + 2) % 2 ? 1 : -1);
      const hingeX = g.tiles.length > 1 ? side * hw : side * (hw - 0.04);
      leaves.push({ g, side, hingeX });
    });
  }
  const postMesh = new THREE.InstancedMesh(postGeo, MAT.instanced, posts.length); posts.forEach((m, i) => postMesh.setMatrixAt(i, m)); postMesh.castShadow = true; scene.add(postMesh);
  const leafMesh = new THREE.InstancedMesh(leafGeo, MAT.instanced, leaves.length); leafMesh.castShadow = true; leafMesh.frustumCulled = false; leafMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(leafMesh);
  function updateGates(dt) {
    let dirty = false;
    for (const g of lay.gates) { const tgt = g.open ? 1 : 0; if (g.anim !== tgt) { g.anim += Math.sign(tgt - g.anim) * Math.min(Math.abs(tgt - g.anim), dt * 1.8); dirty = true; } }
    if (!dirty && updateGates.done) return; updateGates.done = true;
    leaves.forEach((l, i) => {
      const closedRot = l.side > 0 ? Math.PI : 0, openRot = l.side > 0 ? 0.2 : Math.PI - 0.2, u = smooth(0, 1, l.g.anim); // swing through -z only
      M.copy(l.g.frame).multiply(T.makeTranslation(l.hingeX, 0, -0.07 * l.g.anim)).multiply(T.makeRotationY(closedRot + (openRot - closedRot) * u)).multiply(T.makeScale(L, L, L));
      leafMesh.setMatrixAt(i, M);
    });
    leafMesh.instanceMatrix.needsUpdate = true;
  }

  // ---------- coop, nest boxes, dust bath -------------------------------------------------------------
  const W = coop.hx * 2, D = coop.hz * 2, H = 1.45, cx = coop.x, cz = coop.z, front = cz + coop.hz;
  const coopParts = [
    boxGeo(W + 0.1, 0.35, D + 0.1, cx, 0.175, cz, '#8d5639'),                       // stilts / base
    boxGeo(W, H, D, cx, 0.35 + H / 2, cz, '#e07b52'),                                  // walls
    boxGeo(W + 0.12, 0.12, 0.12, cx, 0.35 + H, front + 0.02, '#f4e1c1'),               // trim
    boxGeo(0.12, H, 0.12, cx - W / 2, 0.35 + H / 2, front + 0.02, '#f4e1c1'),
    boxGeo(0.12, H, 0.12, cx + W / 2, 0.35 + H / 2, front + 0.02, '#f4e1c1'),
    boxGeo(0.62, 0.62, 0.05, coop.doorX, 0.35 + 0.31, front + 0.005, '#2c1a10'),      // door hole
  ];
  // pitched roof
  const PITCH = 0.55, RT = 0.1, roofY = 0.35 + H + 0.42, roofZ = D / 4 + 0.1;
  for (const sd of [-1, 1]) {
    const g = boxGeo(W + 0.5, RT, D / 2 + 0.5, 0, 0, 0, '#9c4a3c'); g.rotateX(sd * PITCH); g.translate(cx, roofY, cz + sd * roofZ); coopParts.push(g);
  }
  // attic: wall-top up to the underside of the roof slabs (y = ridge - tan(pitch)·|z|), so the gable ends are closed and nothing pokes through
  { const k = Math.tan(PITCH), ridge = roofY + roofZ * k - RT / 2 / Math.cos(PITCH) - 0.01, top = 0.35 + H, eave = ridge - k * D / 2;
    const shape = new THREE.Shape([new THREE.Vector2(-D / 2, top), new THREE.Vector2(D / 2, top), new THREE.Vector2(D / 2, eave), new THREE.Vector2(0, ridge), new THREE.Vector2(-D / 2, eave)]);
    const g = new THREE.ExtrudeGeometry(shape, { depth: W, bevelEnabled: false }).translate(0, 0, -W / 2).rotateY(Math.PI / 2).translate(cx, 0, cz);
    coopParts.push(colorGeo(g, '#e07b52')); }
  // ramp with slats
  { const run = coop.rampZ - front, len = Math.hypot(run, 0.35) + 0.08, ang = Math.atan2(0.35, run); // +z end goes down to the ground
    const rg = boxGeo(0.5, 0.05, len, 0, 0, 0, '#c98b5e'); rg.rotateX(ang); rg.translate(coop.doorX, 0.185, (front + coop.rampZ) / 2); coopParts.push(rg);
    for (let k = 1; k < 5; k++) { const u = k / 5; const sg = boxGeo(0.5, 0.035, 0.05, 0, 0, 0, '#8d5639'); sg.rotateX(ang); sg.translate(coop.doorX, 0.35 * (1 - u) + 0.04, front + run * u); coopParts.push(sg); } }
  const coopMesh = new THREE.Mesh(mergeGeos(coopParts), MAT.plain); coopMesh.castShadow = coopMesh.receiveShadow = true; scene.add(coopMesh);
  const windowMat = new THREE.MeshLambertMaterial({ color: '#3a2a1c', emissive: '#ffb347', emissiveIntensity: 0 });
  const win = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.04), windowMat); win.position.set(cx - 0.75, 0.35 + 0.95, front + 0.01); scene.add(win);
  const doorPanel = new THREE.Mesh(boxGeo(0.66, 0.66, 0.05, 0, 0.33, 0, '#b0704b'), MAT.plain); doorPanel.castShadow = true; scene.add(doorPanel);
  let doorAnim = coop.open ? 1 : 0;
  const coopLight = new THREE.PointLight('#ffb347', 0, 7, 1.6); coopLight.position.set(cx - 0.75, 1.3, front + 0.6); scene.add(coopLight);

  const nestParts = [];
  for (const n of lay.nests) {
    nestParts.push(boxGeo(0.78, 0.06, 0.6, n.x, 0.03, n.z, '#8d5639'), boxGeo(0.7, 0.07, 0.5, n.x, 0.08, n.z, '#e6c35c'), boxGeo(0.06, 0.62, 0.6, n.x - 0.39, 0.31, n.z, '#c98b5e'), boxGeo(0.78, 0.62, 0.05, n.x, 0.31, n.z - 0.29, '#c98b5e'), boxGeo(0.78, 0.12, 0.05, n.x, 0.06, n.z + 0.29, '#c98b5e'));
  }
  const last = lay.nests[lay.nests.length - 1];
  nestParts.push(boxGeo(0.06, 0.62, 0.6, last.x + 0.39, 0.31, last.z, '#c98b5e'));
  { const rg = boxGeo(lay.nests.length * 0.8 + 0.2, 0.06, 0.8, 0, 0, 0, '#9c4a3c'); rg.rotateX(-0.35); rg.translate((lay.nests[0].x + last.x) / 2, 0.72, last.z + 0.02); nestParts.push(rg); }
  const nestMesh = new THREE.Mesh(mergeGeos(nestParts), MAT.plain); nestMesh.castShadow = nestMesh.receiveShadow = true; scene.add(nestMesh);
  { const g = new THREE.CircleGeometry(lay.dust.r, 28).rotateX(-Math.PI / 2); g.translate(lay.dust.x, 0.016, lay.dust.z); const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: '#e9d7a4' })); m.receiveShadow = true; scene.add(m); }
  { const r = lay.run, g = new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0).rotateX(-Math.PI / 2); g.translate((r.x0 + r.x1) / 2, 0.011, (r.z0 + r.z1) / 2); const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: '#c8b07a' })); m.receiveShadow = true; scene.add(m); }

  // ---------- eggs and grain ------------------------------------------------------------------
  const eggMesh = new THREE.InstancedMesh(modelGeometry(assets, 'egg'), MAT.instanced, 12); eggMesh.castShadow = true; eggMesh.frustumCulled = false; eggMesh.count = 0; scene.add(eggMesh);
  const grainMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 0.03, 0.04), new THREE.MeshLambertMaterial({ color: '#f2c14e' }), 120); grainMesh.count = 0; grainMesh.frustumCulled = false; scene.add(grainMesh);
  function updateEggsGrain() {
    eggMesh.count = 0;
    for (const e of flock.eggs) { if (eggMesh.count >= 12) break; eggMesh.setMatrixAt(eggMesh.count++, M.compose(v.set(e.x, 0.1, e.z), q.setFromAxisAngle(UP, e.id), s.setScalar(1.35))); }
    eggMesh.instanceMatrix.needsUpdate = true;
    grainMesh.count = 0;
    for (const h of flock.handfuls) for (const g of h.grains) { if (g.eaten || grainMesh.count >= 120) continue; grainMesh.setMatrixAt(grainMesh.count++, M.compose(v.set(g.x, g.y, g.z), q.setFromAxisAngle(UP, g.x * 31), s.setScalar(1))); }
    grainMesh.instanceMatrix.needsUpdate = true;
  }

  // ---------- feathers: drift down, then lie on the ground for a while (the engine's particle pool, lion-hawk/kits/fx) -------
  // 2.1.0 fell at most 0.45 m/s with a sideways flutter; the pool has gravity and drag only, so FEATHER_G is picked to land a
  // feather thrown from 1 m at 2.1.0's time (the phase 3k notes), and landed feathers lie flat as before.
  const FEATHER_G = 1.3, FEATHER_DRAG = 1.5, fGeo = new THREE.PlaneGeometry(0.14, 0.055); fGeo.translate(0.03, 0, 0);
  const featherMat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  const feathers = createParticles({ max: 360, shape: 'quad', geometry: fGeo, material: featherMat, floor: () => 0 });
  scene.add(feathers.mesh);
  const fc = new THREE.Color();
  function spawnFeathers(x, y, z, n, tint, spread = 1.4) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * 6.283, sp = (0.4 + Math.random()) * spread, w = 0.85 + Math.random() * 0.15;
      fc.setRGB(Math.min(1, (tint?.[0] ?? 1) * w), Math.min(1, (tint?.[1] ?? 1) * w * 0.98), Math.min(1, (tint?.[2] ?? 0.9) * w * 0.9 + 0.08));
      feathers.emit(x, y, z, Math.cos(a) * sp, 1 + Math.random() * 1.6, Math.sin(a) * sp, 35 + Math.random() * 25, 1, fc, FEATHER_G, FEATHER_DRAG);
    }
  }
  const flock3d = createFlock3d({ root: scene, assets, mc, sim, spawnFeathers });

  // ---------- day and night -----------------------------------------------------------------------
  const SKY_DAY = new THREE.Color('#bfe6f5'), SKY_DUSK = new THREE.Color('#f3a97a'), SKY_NIGHT = new THREE.Color('#152039');
  const SUN_DAY = new THREE.Color('#fff3dc'), SUN_DUSK = new THREE.Color('#ffb070'), MOON = new THREE.Color('#9db4ff');
  const sky = new THREE.Color();
  let nightF = 0, vis = sim.clock.night ? 1 : 0;
  function updateSky(dt) {
    vis += ((sim.clock.night ? 1 : 0) - vis) * Math.min(1, dt * 1.6);
    const el = 0.85 - vis * 1.8;                               // sun height proxy: high at day, below the horizon at night
    const h = 11 + vis * 7;
    const day = smooth(-0.12, 0.22, el), twi = Math.max(0, 1 - Math.abs(el) / 0.32);
    nightF = 1 - day;
    sky.copy(SKY_NIGHT).lerp(SKY_DAY, day).lerp(SKY_DUSK, twi * 0.55);
    lights.background.copy(sky); lights.fog?.color.copy(sky);
    const az = (h / 24) * Math.PI * 2;
    if (day > 0.02) { sun.position.set(-Math.cos(az) * 30, 12 + Math.max(0, el) * 40, 22 - Math.sin(az) * 10); sun.color.copy(SUN_DAY).lerp(SUN_DUSK, twi); sun.intensity = 0.25 + 1.9 * day; }
    else { sun.position.set(18, 40, -20); sun.color.copy(MOON); sun.intensity = 0.45; }
    hemi.intensity = 0.35 + 0.95 * day; hemi.color.copy(sky).lerp(new THREE.Color('#ffffff'), 0.5 * day + 0.2);
    windowMat.emissiveIntensity = nightF * 1.4; coopLight.intensity = nightF * 6;
    return nightF;
  }

  function update(dt) {
    const n = updateSky(dt);
    feathers.update(dt);
    updateGates(dt);
    doorAnim += Math.sign((coop.open ? 1 : 0) - doorAnim) * Math.min(Math.abs((coop.open ? 1 : 0) - doorAnim), dt * 2.5);
    doorPanel.position.set(coop.doorX, 0.35 + doorAnim * 0.62, front + 0.04);
    updateEggsGrain(); flock3d.update(dt);
  }
  return {
    update, spawnFeathers, flock3d, get night() { return nightF; },
    dispose() { flock3d.dispose(); fGeo.dispose(); featherMat.dispose(); },
  };
}
