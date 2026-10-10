// Rendering for the newer farm pieces: animated gates, coop, nest boxes, eggs, grain,
// chickens, the fox, the drivable tractor, and the day/night lighting.
import * as THREE from 'three';
import { ASSETS, geoFrom, modelGeo, mergeGeos, boxGeo, colorGeo, animM, sampleAnim, lerpM } from './gfx.js';
import { L } from './layout.js';
import { CST, FST } from './chickens.js';
import { TP } from './tractor.js';
import { furGeo, furMaterial } from './fur.js';

const UP = new THREE.Vector3(0, 1, 0);
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function buildFarmExtras({ scene, sim, matV, sun, hemi, fogColor }) {
  const { lay } = sim, flock = sim.flock, coop = lay.coop;
  const M = new THREE.Matrix4(), T = new THREE.Matrix4(), PM = new THREE.Matrix4(), PB = new THREE.Matrix4();
  const q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

  // ---------- gates --------------------------------------------------------------------------
  const leafGeo = geoFrom([ASSETS.gate.gate], new THREE.Matrix4().makeTranslation(0.15, 0.05, 0.465)).scale(3.15, 1, 1); // hinge at x=0
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
  const postMesh = new THREE.InstancedMesh(postGeo, matV, posts.length); posts.forEach((m, i) => postMesh.setMatrixAt(i, m)); postMesh.castShadow = true; scene.add(postMesh);
  const leafMesh = new THREE.InstancedMesh(leafGeo, matV, leaves.length); leafMesh.castShadow = true; leafMesh.frustumCulled = false; leafMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(leafMesh);
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
  function pickGate(x, z) {
    let best = null, bd = 1.5;
    for (const g of lay.gates) {
      const along = g.dir === 'x', hw = g.width / 2;
      const ax = along ? Math.max(0, Math.abs(x - g.x) - hw) : Math.abs(x - g.x), az = along ? Math.abs(z - g.z) : Math.max(0, Math.abs(z - g.z) - hw);
      const d = Math.hypot(ax, az); if (d < bd) { bd = d; best = g; }
    }
    return best;
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
  const coopMesh = new THREE.Mesh(mergeGeos(coopParts), matV); coopMesh.castShadow = coopMesh.receiveShadow = true; scene.add(coopMesh);
  const windowMat = new THREE.MeshLambertMaterial({ color: '#3a2a1c', emissive: '#ffb347', emissiveIntensity: 0 });
  const win = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.04), windowMat); win.position.set(cx - 0.75, 0.35 + 0.95, front + 0.01); scene.add(win);
  const doorPanel = new THREE.Mesh(boxGeo(0.66, 0.66, 0.05, 0, 0.33, 0, '#b0704b'), matV); doorPanel.castShadow = true; scene.add(doorPanel);
  let doorAnim = coop.open ? 1 : 0;
  const coopLight = new THREE.PointLight('#ffb347', 0, 7, 1.6); coopLight.position.set(cx - 0.75, 1.3, front + 0.6); scene.add(coopLight);

  const nestParts = [];
  for (const n of lay.nests) {
    nestParts.push(boxGeo(0.78, 0.06, 0.6, n.x, 0.03, n.z, '#8d5639'), boxGeo(0.7, 0.07, 0.5, n.x, 0.08, n.z, '#e6c35c'), boxGeo(0.06, 0.62, 0.6, n.x - 0.39, 0.31, n.z, '#c98b5e'), boxGeo(0.78, 0.62, 0.05, n.x, 0.31, n.z - 0.29, '#c98b5e'), boxGeo(0.78, 0.12, 0.05, n.x, 0.06, n.z + 0.29, '#c98b5e'));
  }
  const last = lay.nests[lay.nests.length - 1];
  nestParts.push(boxGeo(0.06, 0.62, 0.6, last.x + 0.39, 0.31, last.z, '#c98b5e'));
  { const rg = boxGeo(lay.nests.length * 0.8 + 0.2, 0.06, 0.8, 0, 0, 0, '#9c4a3c'); rg.rotateX(-0.35); rg.translate((lay.nests[0].x + last.x) / 2, 0.72, last.z + 0.02); nestParts.push(rg); }
  const nestMesh = new THREE.Mesh(mergeGeos(nestParts), matV); nestMesh.castShadow = nestMesh.receiveShadow = true; scene.add(nestMesh);
  { const g = new THREE.CircleGeometry(lay.dust.r, 28).rotateX(-Math.PI / 2); g.translate(lay.dust.x, 0.016, lay.dust.z); const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: '#e9d7a4' })); m.receiveShadow = true; scene.add(m); }
  { const r = lay.run, g = new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0).rotateX(-Math.PI / 2); g.translate((r.x0 + r.x1) / 2, 0.011, (r.z0 + r.z1) / 2); const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: '#c8b07a' })); m.receiveShadow = true; scene.add(m); }

  // ---------- eggs and grain ------------------------------------------------------------------
  const eggMesh = new THREE.InstancedMesh(modelGeo('egg'), matV, 12); eggMesh.castShadow = true; eggMesh.frustumCulled = false; eggMesh.count = 0; scene.add(eggMesh);
  const grainMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 0.03, 0.04), new THREE.MeshLambertMaterial({ color: '#f2c14e' }), 120); grainMesh.count = 0; grainMesh.frustumCulled = false; scene.add(grainMesh);
  function updateEggsGrain() {
    eggMesh.count = 0;
    for (const e of flock.eggs) { if (eggMesh.count >= 12) break; eggMesh.setMatrixAt(eggMesh.count++, M.compose(v.set(e.x, 0.1, e.z), q.setFromAxisAngle(UP, e.id), s.setScalar(1.35))); }
    eggMesh.instanceMatrix.needsUpdate = true;
    grainMesh.count = 0;
    for (const h of flock.handfuls) for (const g of h.grains) { if (g.eaten || grainMesh.count >= 120) continue; grainMesh.setMatrixAt(grainMesh.count++, M.compose(v.set(g.x, g.y, g.z), q.setFromAxisAngle(UP, g.x * 31), s.setScalar(1))); }
    grainMesh.instanceMatrix.needsUpdate = true;
  }
  function pickEgg(ray) {
    let best = null, bd = 0.45;
    for (const e of flock.eggs) { v.set(e.x, 0.12, e.z); const d = ray.distanceToPoint(v); if (d < bd) { bd = d; best = e; } }
    return best;
  }

  // ---------- chickens --------------------------------------------------------------------------
  const CH_ANIM = animM('chick'), FOX_ANIM = animM('fox');
  const NB = 26;
  const chickMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  // Grown-ups get white plumage (Kenney's chick is yellow); beak, feet and eyes keep their colours.
  const plume = (p, i) => p.col[i] >= 250 && p.col[i + 1] >= (p.name.startsWith('wing') ? 140 : 170);
  const whiten = p => {
    const col = p.col.slice(), wing = p.name.startsWith('wing');
    for (let i = 0; i < col.length; i += 3) {
      const g = col[i + 1];
      if (plume(p, i)) { const sh = wing ? 0.8 + 0.2 * Math.min(1, (g - 150) / 57) : 0.9 + 0.1 * Math.min(1, (g - 170) / 40); col[i] = 248 * sh; col[i + 1] = 246 * sh; col[i + 2] = 240 * sh; }
    }
    return { ...p, col };
  };
  // plumage (body and wings) gets shell fur; the base mesh and the fur shells share one InstancedMesh
  const furMat = furMaterial({ bare: [[-0.47, 0.4, 0.5], [0.47, 0.96, 1]] });   // bare face, so the eyes and beak show
  const birdGeo = (p, src) => p.name === 'body' || p.name.startsWith('wing') ? furGeo(geoFrom([p]), i => plume(src, i * 3) ? 1 : 0) : geoFrom([p]);
  const mkSet = (parts, src) => parts.map((p, k) => { const g = birdGeo(p, src[k]), m = new THREE.InstancedMesh(g, g.groups.length ? [chickMat, furMat] : chickMat, NB); m.castShadow = true; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); for (let i = 0; i < NB; i++) { m.setColorAt(i, new THREE.Color(1, 1, 1)); m.setMatrixAt(i, ZERO); } scene.add(m); return m; });
  const adultMeshes = mkSet(ASSETS.chick.parts.map(whiten), ASSETS.chick.parts), babyMeshes = mkSet(ASSETS.chick.parts, ASSETS.chick.parts);
  const allBirdMeshes = [...adultMeshes, ...babyMeshes];
  const birdAnim = [];
  const tint = new THREE.Color();
  function birdClip(b) {
    switch (b.state) {
      case CST.GRAB: case CST.AIR: case CST.CARRIED: return ['dance', 2.6];
      case CST.LAY: case CST.BROOD: return ['idle', 0.5];
      case CST.DUST: return b.dusting ? ['dance', 0.8] : null;
      case CST.PECK: if (b.speed < 0.1) return ['eat', 1.2]; break;
      case CST.GRAIN: if (b.speed < 0.12) return ['eat', 2]; break;
      case CST.ROOST: if (b.speed < 0.1 && !coop.open) return ['gesture-negative', 0.6]; break;
    }
    return null;
  }
  function updateBirds(dt) {
    for (const b of flock.birds) {
      let a = birdAnim[b.i]; if (!a) a = birdAnim[b.i] = { name: 'idle', t: Math.random(), prev: 'idle', pt: 0, blend: 1, painted: false };
      const set = b.kind === 'chick' ? babyMeshes : adultMeshes, other = b.kind === 'chick' ? adultMeshes : babyMeshes;
      if (!a.painted) { if (b.kind === 'chick') tint.setRGB(1, 1, 1); else tint.setRGB(b.tint[0], b.tint[1], b.tint[2]); for (const m of set) { m.setColorAt(b.i, tint); m.instanceColor.needsUpdate = true; } for (const m of other) m.setMatrixAt(b.i, ZERO); a.painted = true; }
      if (b.hidden || b.state === CST.INSIDE || b.state === CST.LOST) { for (const m of set) m.setMatrixAt(b.i, ZERO); continue; }
      let [name, rate] = birdClip(b) || (b.speed < 0.08 ? ['idle', 1] : b.speed < 1.0 ? ['walk', b.speed / (0.5 * b.scale / 0.3)] : ['run', b.speed / (1.6 * b.scale / 0.3)]);
      if (name !== a.name) { a.prev = a.name; a.pt = a.t; a.name = name; a.blend = 0; }
      a.t += dt * rate; a.pt += dt * rate; a.blend = Math.min(1, a.blend + dt * 8);
      const sit = b.state === CST.LAY || b.state === CST.BROOD || (b.state === CST.DUST && b.dusting) ? 0.28 * b.scale : 0;
      M.compose(v.set(b.px, b.py - b.r - sit, b.pz), q.setFromAxisAngle(UP, b.yaw), s.setScalar(b.scale));
      for (let k = 0; k < set.length; k++) {
        sampleAnim(CH_ANIM, a.name, a.t, k, PM); if (a.blend < 1) { sampleAnim(CH_ANIM, a.prev, a.pt, k, PB); lerpM(PB, PM, a.blend, PM); }
        set[k].setMatrixAt(b.i, T.multiplyMatrices(M, PM));
      }
    }
    for (const m of allBirdMeshes) m.instanceMatrix.needsUpdate = true;
  }

  // ---------- feathers: flutter down, then lie on the ground for a while -----------------------------
  const FMAX = 360, fGeo = new THREE.PlaneGeometry(0.14, 0.055); fGeo.translate(0.03, 0, 0);
  const featherMesh = new THREE.InstancedMesh(fGeo, new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), FMAX);
  featherMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); featherMesh.frustumCulled = false; featherMesh.count = 0; scene.add(featherMesh);
  const fea = []; let fNext = 0; const fc = new THREE.Color(), fe = new THREE.Euler();
  function spawnFeathers(x, y, z, n, tint, spread = 1.4) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * 6.283, sp = (0.4 + Math.random()) * spread;
      const p = { x, y, z, vx: Math.cos(a) * sp, vy: 1 + Math.random() * 1.6, vz: Math.sin(a) * sp, ph: Math.random() * 6.28, spin: (Math.random() - 0.5) * 8, rot: Math.random() * 6.28, age: 0, life: 35 + Math.random() * 25, ground: false };
      const i = fNext; fNext = (fNext + 1) % FMAX; fea[i] = p;
      const w = 0.85 + Math.random() * 0.15; fc.setRGB(Math.min(1, (tint?.[0] ?? 1) * w), Math.min(1, (tint?.[1] ?? 1) * w * 0.98), Math.min(1, (tint?.[2] ?? 0.9) * w * 0.9 + 0.08));
      featherMesh.setColorAt(i, fc);
    }
    if (featherMesh.instanceColor) featherMesh.instanceColor.needsUpdate = true;
    featherMesh.count = Math.max(featherMesh.count, Math.min(FMAX, fea.length));
  }
  function updateFeathers(dt) {
    for (let i = 0; i < featherMesh.count; i++) {
      const p = fea[i]; if (!p) continue; p.age += dt;
      if (!p.ground) {
        p.vy = Math.max(-0.45, p.vy - 6 * dt);            // drag keeps the fall slow
        p.vx *= 1 - dt * 1.5; p.vz *= 1 - dt * 1.5;
        p.x += (p.vx + Math.sin(p.age * 5 + p.ph) * 0.5) * dt; p.z += (p.vz + Math.cos(p.age * 4 + p.ph) * 0.4) * dt; p.y += p.vy * dt; p.rot += p.spin * dt;
        if (p.y <= 0.02) { p.y = 0.02; p.ground = true; }
        fe.set(Math.sin(p.age * 6 + p.ph) * 0.9, p.rot, Math.cos(p.age * 5 + p.ph) * 0.6);
      } else fe.set(-Math.PI / 2, 0, p.rot);
      const sc = p.age > p.life ? Math.max(0, 1 - (p.age - p.life) / 2) : 1;
      featherMesh.setMatrixAt(i, M.compose(v.set(p.x, p.y, p.z), q.setFromEuler(fe), s.setScalar(sc)));
    }
    featherMesh.instanceMatrix.needsUpdate = true;
  }

  // ---------- fox -------------------------------------------------------------------------------
  const foxGroup = new THREE.Group(); foxGroup.matrixAutoUpdate = false; scene.add(foxGroup);
  const foxMeshes = ASSETS.fox.parts.map(p => { const m = new THREE.Mesh(geoFrom([p]), matV); m.castShadow = true; m.matrixAutoUpdate = false; foxGroup.add(m); return m; });
  const foxA = { t: 0, puff: 0 };
  const cheekMat = new THREE.MeshLambertMaterial({ color: '#f0eadf' });
  const cheeks = [-1, 1].map(sd => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), cheekMat); m.position.set(sd * 0.36, 0.56, 0.7); m.castShadow = true; foxGroup.add(m); return m; });
  const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.4, 6).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#ffd84a' })); tuft.position.set(0.05, 0.62, 0.98); foxGroup.add(tuft);
  for (const m of [...cheeks, tuft]) m.matrixAutoUpdate = true;
  function updateFox(dt) {
    const f = flock.fox; foxGroup.visible = f.state !== FST.AWAY; if (!foxGroup.visible) return;
    const name = f.speed < 0.2 ? 'idle' : f.speed < 2.2 ? 'walk' : 'run';
    foxA.t += dt * (name === 'idle' ? 1 : name === 'walk' ? f.speed / 0.8 : f.speed / 3);
    foxGroup.matrix.compose(v.set(f.x, Math.sin(Math.min(1, f.hop) * Math.PI / 2) * 1.0, f.z), q.setFromAxisAngle(UP, f.yaw), s.setScalar(0.5)); foxGroup.matrixWorldNeedsUpdate = true;
    foxMeshes.forEach((m, k) => { sampleAnim(FOX_ANIM, name, foxA.t, k, m.matrix); m.matrixWorldNeedsUpdate = true; });
    foxA.puff += ((f.carrying ? 1 : 0) - foxA.puff) * Math.min(1, dt * 6);
    const wob = 1 + Math.sin(foxA.t * 9) * 0.08 * foxA.puff;
    cheeks.forEach((c, k) => { c.visible = foxA.puff > 0.02; c.scale.setScalar(Math.max(0.01, foxA.puff * wob * (k ? 1.05 : 0.95))); });
    tuft.visible = foxA.puff > 0.5; tuft.rotation.y = Math.sin(foxA.t * 6) * 0.4;
    if (f.carrying && Math.random() < dt * 4) { // feathers keep escaping from its mouth
      v.set(0, 0.62, 1.0).applyMatrix4(foxGroup.matrix); spawnFeathers(v.x, v.y, v.z, 1, f.carrying.tint, 0.6);
    }
  }

  // ---------- tractor ---------------------------------------------------------------------------
  const tr = sim.tractor, S = TP.scale;
  const modelRot = new THREE.Matrix4().makeRotationY(Math.PI / 2).multiply(new THREE.Matrix4().makeScale(S, S, S));
  // Kenney's tractor is grey-blue; paint the bodywork classic farm red, keep the trim
  const tbGeo = geoFrom([ASSETS.tractor.body]);
  { const c = tbGeo.attributes.color; for (let i = 0; i < c.count; i++) { const r = c.getX(i), g = c.getY(i), b = c.getZ(i); if (b > r * 1.1 && r > 0.08) { const l = 0.3 * r + 0.6 * g + 0.1 * b; c.setXYZ(i, Math.min(1, l * 3.4), l * 0.42, l * 0.32); } } }
  const tractorBody = new THREE.Mesh(tbGeo, matV); tractorBody.castShadow = true; tractorBody.matrixAutoUpdate = false; scene.add(tractorBody);
  const wheelMeshes = tr.W.map(w => {
    const g = geoFrom([ASSETS.tractor[w.name]]); g.translate(-w.mx, -w.my, -w.mz);
    const m = new THREE.Mesh(g, matV); m.castShadow = true; m.matrixAutoUpdate = false; scene.add(m); return m;
  });
  const head = new THREE.SpotLight('#fff2cc', 0, 26, 0.55, 0.5, 1.2); scene.add(head); scene.add(head.target);
  const chassis = new THREE.Matrix4(), cq = new THREE.Quaternion();
  function updateTractor(night) {
    const p = tr.body.translation(), r = tr.body.rotation();
    chassis.compose(v.set(p.x, p.y, p.z), cq.set(r.x, r.y, r.z, r.w), s.set(1, 1, 1));
    tractorBody.matrix.multiplyMatrices(chassis, modelRot); tractorBody.matrixWorldNeedsUpdate = true;
    tr.W.forEach((w, i) => {
      const susp = tr.vc.wheelSuspensionLength(i) ?? TP.suspRest, rot = tr.vc.wheelRotation(i) ?? 0, st = tr.vc.wheelSteering(i) ?? 0;
      M.copy(chassis).multiply(T.makeTranslation(w.cx, w.cy + 0.12 - susp, w.cz)).multiply(T.makeRotationY(st)).multiply(T.makeRotationZ(-rot)).multiply(modelRot);
      wheelMeshes[i].matrix.copy(M); wheelMeshes[i].matrixWorldNeedsUpdate = true;
    });
    head.position.set(0, 0, 0).applyMatrix4(T.multiplyMatrices(chassis, T.makeTranslation(1.7, 1.25, 0)));
    head.target.position.set(0, 0, 0).applyMatrix4(T.multiplyMatrices(chassis, T.makeTranslation(9, 0, 0)));
    head.intensity = (tr.driven ? 60 : 0) * night;
  }
  function tractorHit(ray) { v.set(tr.x, 1.2, tr.z); return ray.distanceToPoint(v) < 2.1; }

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
    scene.background.copy(sky); fogColor.copy(sky);
    const az = (h / 24) * Math.PI * 2;
    if (day > 0.02) { sun.position.set(-Math.cos(az) * 30, 12 + Math.max(0, el) * 40, 22 - Math.sin(az) * 10); sun.color.copy(SUN_DAY).lerp(SUN_DUSK, twi); sun.intensity = 0.25 + 1.9 * day; }
    else { sun.position.set(18, 40, -20); sun.color.copy(MOON); sun.intensity = 0.45; }
    hemi.intensity = 0.35 + 0.95 * day; hemi.color.copy(sky).lerp(new THREE.Color('#ffffff'), 0.5 * day + 0.2);
    windowMat.emissiveIntensity = nightF * 1.4; coopLight.intensity = nightF * 6;
    return nightF;
  }

  function update(dt) {
    const n = updateSky(dt);
    updateFeathers(dt);
    updateGates(dt);
    doorAnim += Math.sign((coop.open ? 1 : 0) - doorAnim) * Math.min(Math.abs((coop.open ? 1 : 0) - doorAnim), dt * 2.5);
    doorPanel.position.set(coop.doorX, 0.35 + doorAnim * 0.62, front + 0.04);
    updateEggsGrain(); updateBirds(dt); updateFox(dt); updateTractor(n);
  }
  const pickDoor = (x, z) => Math.hypot(x - coop.doorX, z - (front + 0.5)) < 1.3;
  const foxHit = ray => flock.fox.state !== FST.AWAY && ray.distanceToPoint(v.set(flock.fox.x, 0.4, flock.fox.z)) < 0.9;
  return { update, pickGate, pickEgg, pickDoor, tractorHit, foxHit, spawnFeathers, get night() { return nightF; } };
}
