// The 3D farm (lion-hawk 2e P6; on the phase 3 engine since 3k): ground, patches, fences, troughs and their food, decor,
// the pig crowd (pigs3d.js), Zzz, the two rings, buildFarmExtras and the hose, all under one root group in the engine's
// scene. Geometry is the baked models' (models.js) on the compiler's materials; lights, fog, sky, renderer and post are the
// engine's (view.gfx). Snacks are view sync's (snacks3d.js). View only: three.js, Math.random and the DOM
// are fine here. buildWorld({ gfx, assets, mc, sim, world }) → { root, update(dt, s, frame, alpha), select(at, kind),
// feathers(ev), night, dispose() }
import * as THREE from 'three';
import { disposeTree } from 'lion-hawk/view';
import { modelGeometry, mergeGeos, boxGeo, sceneryMaterials } from './models.js';
import { createPigs } from './pigs3d.js';
import { createFootprints } from './footprints.js';
import { buildFarmExtras } from '../farm3d.js';
import { createBuildings } from './buildings3d.js';
import { ST } from '../sim.js';
import { L } from '../layout.js';

export function buildWorld({ gfx, assets, mc, sim, world }) {
  const { lay } = sim;
  const scene = new THREE.Group(); scene.name = 'farm'; gfx.scene.add(scene); // everything the farm draws (disposed on exit)
  const MAT = sceneryMaterials(mc), matV = MAT.plain;

  // ground with gentle colour variation
  {
    const g = new THREE.PlaneGeometry(420, 420, 140, 140); g.rotateX(-Math.PI / 2);
    const n = g.attributes.position.count, col = new Float32Array(n * 3);
    const base = new THREE.Color('#88cc72'), alt = new THREE.Color('#9fd680'), dark = new THREE.Color('#73bb66'), c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const x = g.attributes.position.getX(i), z = g.attributes.position.getZ(i);
      const v = Math.sin(x * 0.11 + Math.sin(z * 0.07) * 2) * 0.5 + Math.sin(z * 0.13 + x * 0.05) * 0.5;
      c.copy(base).lerp(v > 0 ? alt : dark, Math.abs(v) * 0.6);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = new THREE.Mesh(g, matV); m.receiveShadow = true; scene.add(m);
  }
  // pen floors, lane, wallow
  const patch = (x0, z0, x1, z1, hexA, hexB, y, seed) => {
    const w = x1 - x0, d = z1 - z0, g = new THREE.PlaneGeometry(w, d, Math.ceil(w), Math.ceil(d)); g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
    const n = g.attributes.position.count, col = new Float32Array(n * 3), A = new THREE.Color(hexA), B = new THREE.Color(hexB), c = new THREE.Color();
    for (let i = 0; i < n; i++) { const x = g.attributes.position.getX(i), z = g.attributes.position.getZ(i); const v = 0.5 + 0.5 * Math.sin(x * 0.9 + seed) * Math.sin(z * 0.7 - seed * 2); c.copy(A).lerp(B, v * 0.8); col.set([c.r, c.g, c.b], i * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); const m = new THREE.Mesh(g, matV); m.receiveShadow = true; scene.add(m);
  };
  for (const p of lay.pens) patch(p.x0, p.z0, p.x1, p.z1, '#c9a173', '#b38b5f', 0.012, p.id * 1.7);
  for (const [a, k] of [[lay.lane, 9], [lay.stem, 11]]) patch(a.x0, a.z0, a.x1, a.z1, '#dcc196', '#cfb085', 0.012 + k * 1e-4, k); // the T's bar and stem
  {
    const w = lay.wallow, g = new THREE.CircleGeometry(1, 40); g.rotateX(-Math.PI / 2); g.scale(w.rx, 1, w.rz); g.translate(w.x, 0.02, w.z);
    const m = new THREE.Mesh(g, new THREE.MeshPhongMaterial({ color: '#8a5f3b', shininess: 70, specular: '#4a3622' })); m.receiveShadow = true; scene.add(m);
    for (let k = 0; k < 7; k++) { // lumpy rim so it reads as a puddle, not a hole
      const a = k / 7 * Math.PI * 2 + 0.3, gg = new THREE.CircleGeometry(1, 24); gg.rotateX(-Math.PI / 2); gg.scale(1.3 + (k % 3) * 0.3, 1, 1.0 + (k % 2) * 0.35);
      gg.translate(w.x + Math.cos(a) * w.rx * 0.82, 0.018, w.z + Math.sin(a) * w.rz * 0.82);
      const mm = new THREE.Mesh(gg, m.material); mm.receiveShadow = true; scene.add(mm);
    }
  }

  // ---------- fences --------------------------------------------------------------
  const recentre = new THREE.Matrix4().makeTranslation(0, 0.05, 0.465);
  const fenceGeo = modelGeometry(assets, 'fence', recentre, { parts: ['fence_simple'] });
  const planksGeo = modelGeometry(assets, 'planks', recentre, { parts: ['fence_planks'] });
  const byKind = { fence: [], planks: [], gate: [] };
  for (const e of lay.edges) byKind[e.kind].push(e);
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  const instanced = (geo, list, setter, opts = {}) => {
    const m = new THREE.InstancedMesh(geo, opts.mat || MAT.instanced, list.length);
    list.forEach((e, i) => { setter(e, mtx); m.setMatrixAt(i, mtx); });
    m.castShadow = opts.cast !== false; m.receiveShadow = true; scene.add(m); return m;
  };
  const edgeM = (e, out, extra) => { q.setFromAxisAngle(UP, e.dir === 'x' ? 0 : Math.PI / 2); out.compose(v3.set(e.x, 0, e.z), q, s3.setScalar(L)); if (extra) out.multiply(extra); return out; };
  instanced(fenceGeo, byKind.fence, (e, m) => edgeM(e, m));
  instanced(planksGeo, byKind.planks, (e, m) => edgeM(e, m));

  // ---------- troughs and the food inside them ---------------------------------------
  const troughParts = [];
  const troughFood = { cob: [], cabbage: [], carrot: [], apple: [] };
  for (const t of sim.troughs) {
    const yaw = t.inward > 0 ? 0 : Math.PI;
    const mm = new THREE.Matrix4().compose(v3.set(t.x, 0, t.z), q.setFromAxisAngle(UP, yaw), s3.setScalar(1));
    const w = t.len, d = t.w;
    for (const g of [boxGeo(w, 0.08, d, 0, 0.08, 0, '#b0704b'), boxGeo(w, 0.36, 0.07, 0, 0.22, d / 2 - 0.035, '#d99a6c'), boxGeo(w, 0.36, 0.07, 0, 0.22, -d / 2 + 0.035, '#d99a6c'),
      boxGeo(0.07, 0.38, d, w / 2 - 0.035, 0.21, 0, '#b0704b'), boxGeo(0.07, 0.38, d, -w / 2 + 0.035, 0.21, 0, '#b0704b'),
      boxGeo(0.12, 0.1, d + 0.1, w / 2 - 0.3, 0.02, 0, '#8d5639'), boxGeo(0.12, 0.1, d + 0.1, -w / 2 + 0.3, 0.02, 0, '#8d5639')]) troughParts.push(g.applyMatrix4(mm));
    // food heap slots
    const kinds = ['cob', 'cabbage', 'carrot', 'apple'];
    for (let k = 0; k < 9; k++) {
      const kind = kinds[(k + t.id) % 4], fz = ((k * 37) % 5 - 2) * 0.06;
      let fx = -w / 2 + 0.25 + (k / 8) * (w - 0.5);
      let local;
      if (kind === 'carrot') {
        // the model stands 0.72 tall from its base; lay it lengthways down the trough, centred on
        // its slot and kept clear of the end boards, with a little yaw so the row isn't too neat
        const s = 0.8, half = 0.72 * s / 2, cz = fz * 0.3; fx = Math.max(-w / 2 + 0.1 + half, Math.min(w / 2 - 0.1 - half, fx));
        const yaw = ((k * 53) % 7 - 3) * 0.03, lie = new THREE.Matrix4().makeRotationZ(-Math.PI / 2).multiply(new THREE.Matrix4().makeRotationY(k * 1.7));
        local = new THREE.Matrix4().makeTranslation(fx - Math.cos(yaw) * half, 0.1 + 0.17 * s, cz + Math.sin(yaw) * half)
          .multiply(new THREE.Matrix4().makeRotationY(yaw)).multiply(lie).multiply(new THREE.Matrix4().makeScale(s, s, s));
      } else local = new THREE.Matrix4().compose(v3.set(fx, 0.1, fz), q.setFromEuler(new THREE.Euler(0, k * 1.7, kind === 'cob' ? 1.3 : 0)), s3.setScalar(kind === 'cabbage' ? 1.0 : 1.2));
      troughFood[kind].push({ t, k, m: mm.clone().multiply(local) });
    }
  }
  { const m = new THREE.Mesh(mergeGeos(troughParts), matV); m.castShadow = m.receiveShadow = true; scene.add(m); }
  const troughFoodMeshes = Object.entries(troughFood).map(([kind, list]) => {
    const m = new THREE.InstancedMesh(modelGeometry(assets, kind), MAT.instanced, list.length); m.castShadow = true; scene.add(m);
    return { m, list };
  });
  const updateTroughFood = () => {
    for (const { m, list } of troughFoodMeshes) list.forEach((it, i) => {
      const shown = it.k < Math.ceil(it.t.level * 9 - 0.01);
      if (shown) m.setMatrixAt(i, it.m); else m.setMatrixAt(i, mtx.makeScale(0, 0, 0));
    }), m.instanceMatrix.needsUpdate = true;
  };

  // ---------- decor -----------------------------------------------------------------
  {
    const groups = {}; for (const d of lay.decor) (groups[d.m] ||= []).push(d);
    for (const [name, list] of Object.entries(groups)) {
      const g = modelGeometry(assets, name, name === 'barrel' ? new THREE.Matrix4().makeRotationZ(Math.PI / 2).premultiply(new THREE.Matrix4().makeTranslation(0.34, 0.38, 0)) : null);
      instanced(g, list, (d, m) => m.compose(v3.set(d.x, 0, d.z), q.setFromAxisAngle(UP, d.rot), s3.setScalar(d.s)), { cast: !['grass', 'grassS', 'flowerY', 'flowerR'].includes(name) });
    }
  }

  const pigs = createPigs({ root: scene, assets, mc, sim, world });
  const prints = createFootprints({ root: scene, mc, sim }); // muddy pigs leave hoof prints that fade
  // little Zzz's drifting up from pigs asleep at night
  const N = sim.pigs.length, zTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.font = '900 52px "Sniglet", "Arial Rounded MT Bold", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 8; g.strokeStyle = '#4a3a6a'; g.strokeText('z', 32, 34); g.fillStyle = '#ffffff'; g.fillText('z', 32, 34); return new THREE.CanvasTexture(c); })();
  const zs = Array.from({ length: 36 }, () => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: zTex, transparent: true, depthWrite: false })); sp.visible = false; scene.add(sp); return { sp, age: 0, life: 0, x: 0, y: 0, z: 0, ph: 0 }; });
  let zNext = 0; const zTimer = new Float32Array(N).map(() => Math.random() * 3);
  function updateZs(dt) {
    const night = sim.clock.night;
    for (const p of sim.pigs) {
      const asleep = night && p.state === ST.REST && pigs.anim[p.i].rest > 0.8;
      if (!asleep) continue;
      zTimer[p.i] -= dt; if (zTimer[p.i] > 0) continue; zTimer[p.i] = 2.2 + Math.random() * 1.4;
      const z = zs[zNext]; zNext = (zNext + 1) % zs.length;
      Object.assign(z, { age: 0, life: 2.6, x: p.px + Math.sin(p.yaw) * 0.35 * p.scale / 0.62, y: p.py + 0.25, z: p.pz + Math.cos(p.yaw) * 0.35 * p.scale / 0.62, ph: Math.random() * 6, s: p.piglet ? 0.6 : 1 });
      z.sp.visible = true;
    }
    for (const z of zs) {
      if (!z.sp.visible) continue; z.age += dt; const u = z.age / z.life;
      if (u >= 1) { z.sp.visible = false; continue; }
      z.sp.position.set(z.x + Math.sin(z.age * 2.2 + z.ph) * 0.18, z.y + u * 1.1, z.z);
      z.sp.scale.setScalar((0.3 + u * 0.35) * z.s); z.sp.material.opacity = Math.min(1, u * 5) * (1 - u * u);
    }
  }
  // target ring under the finger
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false }));
  ring.position.y = 0.04; ring.visible = false; scene.add(ring);
  const selRing = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.8, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffd84a', transparent: true, opacity: 0.95, depthWrite: false }));
  selRing.position.y = 0.045; selRing.visible = false; scene.add(selRing);
  const extras = buildFarmExtras({ scene, sim, assets, mc, MAT, lights: { sun: gfx.lights.sun, hemi: gfx.lights.hemi, background: gfx.scene.background, fog: gfx.scene.fog } });
  const buildings = createBuildings({ root: scene, assets, sim, camera: gfx.camera, renderer: gfx.renderer });


  // ---------- hose: nozzle, hose pipe and water particles ---------------------------
  const HOSE_MAX = 900;
  const hp = { pos: new Float32Array(HOSE_MAX * 3), vel: new Float32Array(HOSE_MAX * 3), life: new Float32Array(HOSE_MAX), splash: new Uint8Array(HOSE_MAX), n: 0, acc: 0 };
  const dropTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'); const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(220,242,255,0.8)'); gr.addColorStop(1, 'rgba(200,235,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c); })();
  const waterGeo = new THREE.BufferGeometry(); waterGeo.setAttribute('position', new THREE.BufferAttribute(hp.pos, 3).setUsage(THREE.DynamicDrawUsage)); waterGeo.setDrawRange(0, 0);
  const water = new THREE.Points(waterGeo, new THREE.PointsMaterial({ size: 0.3, map: dropTex, color: '#a8e0ff', transparent: true, depthWrite: false, sizeAttenuation: true }));
  water.frustumCulled = false; scene.add(water);
  const hoseRing = new THREE.Mesh(new THREE.RingGeometry(1.25, 1.42, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#8fd3ff', transparent: true, opacity: 0.7, depthWrite: false }));
  hoseRing.position.y = 0.035; hoseRing.visible = false; scene.add(hoseRing);
  const nozzle = new THREE.Group();
  { const brass = new THREE.MeshLambertMaterial({ color: '#e0b24a' }), green = new THREE.MeshLambertMaterial({ color: '#3f9a4a' });
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 0.42, 10).rotateX(Math.PI / 2).translate(0, 0, 0.21), brass);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.36, 10).rotateX(Math.PI / 2).translate(0, 0, -0.16), green);
    nozzle.add(tip, grip); tip.castShadow = grip.castShadow = true; }
  nozzle.visible = false; scene.add(nozzle);
  const pipeMat = new THREE.MeshLambertMaterial({ color: '#3f9a4a' });
  let pipe = null, pipeKey = '';

  // The nozzle, ring and spray from the sim's hose state (s.hose: target, eased nozzle, back vector; #60). The spray
  // is spawned here, as before.
  const nd = new THREE.Vector3(), NY = 1.5;
  function updateHose(dt, H) {
    const active = sim.hose.active;
    nozzle.visible = active || hp.n > 0; hoseRing.visible = active;
    if (active) {
      hoseRing.position.x = H.tx; hoseRing.position.z = H.tz;
      nozzle.position.set(H.nx, NY, H.nz); nozzle.lookAt(H.tx, 0.6, H.tz);
      // spawn droplets aimed to land in a disc around the target
      hp.acc += dt * 300; nozzle.getWorldDirection(nd);
      while (hp.acc >= 1 && hp.n < HOSE_MAX) {
        hp.acc--; const i = hp.n++, a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 1.0, T = 0.48 + Math.random() * 0.1;
        const ox = H.nx + nd.x * 0.32, oz = H.nz + nd.z * 0.32, oy = NY + nd.y * 0.32;
        const tx = H.tx + Math.cos(a) * r, tz = H.tz + Math.sin(a) * r;
        hp.pos.set([ox, oy, oz], i * 3); hp.vel.set([(tx - ox) / T, (0.05 - oy + 4.905 * T * T) / T, (tz - oz) / T], i * 3); hp.life[i] = 2; hp.splash[i] = 0;
      }
    } else hp.acc = 0;
    // integrate, splash on landing, compact the live list
    let w = 0;
    for (let i = 0; i < hp.n; i++) {
      const o = i * 3; hp.vel[o + 1] -= 9.81 * dt;
      hp.pos[o] += hp.vel[o] * dt; hp.pos[o + 1] += hp.vel[o + 1] * dt; hp.pos[o + 2] += hp.vel[o + 2] * dt; hp.life[i] -= dt;
      let alive = hp.life[i] > 0;
      if (hp.pos[o + 1] < 0.03) {
        if (!hp.splash[i] && Math.random() < 0.55) { hp.pos[o + 1] = 0.04; hp.vel[o] = (Math.random() - 0.5) * 2.2; hp.vel[o + 2] = (Math.random() - 0.5) * 2.2; hp.vel[o + 1] = 1 + Math.random() * 1.6; hp.splash[i] = 1; hp.life[i] = 0.45; }
        else alive = false;
      }
      if (alive && w !== i) { hp.pos.copyWithin(w * 3, o, o + 3); hp.vel.copyWithin(w * 3, o, o + 3); hp.life[w] = hp.life[i]; hp.splash[w] = hp.splash[i]; }
      if (alive) w++;
    }
    hp.n = w; waterGeo.setDrawRange(0, w); waterGeo.attributes.position.needsUpdate = true;
    // the hose pipe trails from the nozzle down to the ground and away
    if (nozzle.visible) {
      const key = [H.nx, H.nz, H.bx, H.bz].map(v => v.toFixed(2)).join();
      if (key !== pipeKey) {
        pipeKey = key; if (pipe) { pipe.geometry.dispose(); scene.remove(pipe); }
        const b = new THREE.Vector3(H.bx, 0, H.bz), sd = new THREE.Vector3(-H.bz, 0, H.bx), n = new THREE.Vector3(H.nx, NY, H.nz), back = nozzle.getWorldDirection(new THREE.Vector3()).multiplyScalar(-0.28);
        const out = sd.clone().multiplyScalar(0.8).addScaledVector(b, 0.6).normalize();
        const gy = 0.16, g = () => n.clone().setY(gy);   // ground run sits clear of the grass
        const curve = new THREE.CatmullRomCurve3([n.clone().add(back), n.clone().add(back).addScaledVector(out, 0.6).add(new THREE.Vector3(0, -0.6, 0)), g().addScaledVector(out, 1.8), g().addScaledVector(out, 5).addScaledVector(b, 1), g().addScaledVector(out, 12).addScaledVector(b, 8), g().addScaledVector(out, 40).addScaledVector(b, 40), g().addScaledVector(out, 100).addScaledVector(b, 100), g().addScaledVector(out, 200).addScaledVector(b, 200)]);
        pipe = new THREE.Mesh(new THREE.TubeGeometry(curve, 160, 0.075, 6, false), pipeMat); pipe.castShadow = true; scene.add(pipe);
      }
    } else if (pipe) { pipe.geometry.dispose(); scene.remove(pipe); pipe = null; pipeKey = ''; }
  }

  updateTroughFood();
  return {
    root: scene, pigs, get night() { return extras.night; },
    // One drawn frame (main.js's frame minus the sim, input and HUD). dt is the frame time, 0 for hook renders (#19):
    // nothing here divides by it. `frame` counts drawn frames (trough food every 8th, as before).
    update(dt, s, frame, alpha = 1) {
      pigs.update(dt, alpha); prints.update(dt); updateZs(dt); updateHose(dt, s.hose); extras.update(dt); buildings.update(dt, s.focus, extras.night);
      if ((frame & 7) === 0) updateTroughFood();
      ring.visible = !!s.ring;
      if (s.ring) { ring.position.x = s.ring[0]; ring.position.z = s.ring[1]; ring.rotation.y += dt; ring.scale.setScalar(1 + 0.08 * Math.sin(performance.now() * 0.01)); }
    },
    // the yellow selection ring (main.js renderCard): at [x, z] or null, scaled by kind
    select(at, kind) {
      if (at) { selRing.visible = true; selRing.position.x = at[0]; selRing.position.z = at[1]; selRing.scale.setScalar(kind === 'bird' ? 0.5 : 1); } else selRing.visible = false;
    },
    feathers(ev) { extras.spawnFeathers(ev.x, ev.y, ev.z, ev.n, ev.tint); },
    dispose() {
      pigs.dispose(); prints.dispose(); extras.dispose(); buildings.dispose(); if (pipe) pipe.geometry.dispose();
      gfx.scene.remove(scene); disposeTree(scene, { keepShared: true }); // the compiler's materials and the assets' geometry stay
    },
  };
}
