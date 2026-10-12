// The 3D farm (lion-hawk 2e P6): main.js's rendering code (lights, ground, patches, fences, troughs and their food,
// decor, pigs with mud and eyelids, Zzz, dog, snacks, the two rings, buildFarmExtras, hose nozzle/spray/pipe), moved
// out of its closure unchanged except for three reads: the Shoo ring follows `s.ring`, the nozzle is drawn where the
// sim eased it (`s.hose`, #60) and the pipe trails from it. View only: three.js, Math.random and the DOM are fine here.
// buildWorld({ renderer, sim, tilt }) → { scene, update(dt, s, frame), draw(camera, dist), select(at, kind), feathers(ev), dispose() }
import * as THREE from 'three';
import { ASSETS, geoFrom, modelGeo, mergeGeos, boxGeo, animM, sampleAnim, lerpM } from '../gfx.js';
import { buildFarmExtras } from '../farm3d.js';
import { ST, FOOD_KINDS } from '../sim.js';
import { L } from '../layout.js';
import { createTiltShift } from '../tiltshift.js';

const tilts = new WeakMap(); // one tilt-shift (and its render targets) per renderer, so a re-entered farm reuses it

export function buildWorld({ renderer, sim, tilt = true }) {
  const { lay } = sim;
  const scene = new THREE.Scene();
  const SKY = new THREE.Color('#bfe6f5');
  scene.background = SKY; scene.fog = new THREE.Fog(SKY, 70, 170);
  // tilt-shift miniature look, focused on the camera's look-at point, only once zoomed in; ?tilt=0 turns it off
  let fx = tilts.get(renderer); if (!fx) tilts.set(renderer, fx = createTiltShift(renderer, { on: tilt })); fx.params.on = tilt;

  const hemi = new THREE.HemisphereLight('#eef7ff', '#b9a27c', 1.3); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff3dc', 2.1);
  sun.position.set(-26, 46, 22); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -38, right: 38, top: 36, bottom: -36, near: 5, far: 120 });
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
  scene.add(sun);

  const matV = new THREE.MeshLambertMaterial({ vertexColors: true });

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
  patch(lay.lane.x0, lay.lane.z0, lay.lane.x1, lay.lane.z1, '#dcc196', '#cfb085', 0.012, 9);
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
  const fenceGeo = geoFrom([ASSETS.fence.fence_simple], recentre);
  const planksGeo = geoFrom([ASSETS.planks.fence_planks], recentre);
  const byKind = { fence: [], planks: [], gate: [] };
  for (const e of lay.edges) byKind[e.kind].push(e);
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  const instanced = (geo, list, setter, opts = {}) => {
    const m = new THREE.InstancedMesh(geo, opts.mat || matV, list.length);
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
    const g = kind === 'cob' ? modelGeo('cob') : kind === 'cabbage' ? modelGeo('cabbage') : kind === 'carrot' ? modelGeo('carrot') : modelGeo('apple');
    const m = new THREE.InstancedMesh(g, matV, list.length); m.castShadow = true; scene.add(m);
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
      const g = name === 'corn' ? geoFrom(Object.values(ASSETS.corn)) : name === 'barrel' ? modelGeo(name, new THREE.Matrix4().makeRotationZ(Math.PI / 2).premultiply(new THREE.Matrix4().makeTranslation(0.34, 0.38, 0))) : modelGeo(name);
      instanced(g, list, (d, m) => m.compose(v3.set(d.x, 0, d.z), q.setFromAxisAngle(UP, d.rot), s3.setScalar(d.s)), { cast: !['grass', 'grassS', 'flowerY', 'flowerR'].includes(name) });
    }
  }

  // ---------- pets ------------------------------------------------------------------
  const pigParts = ASSETS.pig.parts.map(p => geoFrom([p]));
  // Eyelids: tag the eye vertices (flat white and grey patches on the face) with (flag, u, v) so the shader can close them.
  for (const g of pigParts) {
    const pos = g.attributes.position, col = g.attributes.color, eye = new Float32Array(pos.count * 3);
    if (g === pigParts[0]) for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), r = col.getX(i), gg = col.getY(i), b = col.getZ(i);
      const white = r > 0.75 && gg > 0.75 && b > 0.75, grey = Math.abs(r - gg) < 0.03 && b > r && r < 0.12;
      if (Math.abs(z - 0.64) < 0.02 && y > 0.6 && y < 0.93 && Math.abs(x) > 0.05 && Math.abs(x) < 0.48 && (white || grey))
        eye.set([1, (Math.abs(x) - 0.06) / 0.41, (y - 0.62) / 0.31], i * 3);
    }
    g.setAttribute('aEye', new THREE.BufferAttribute(eye, 3));
  }
  const N = sim.pigs.length;
  // per-pig mud: blotchy noise mask that creeps up from the legs as the level rises
  const mudAttr = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4); // mud, seed, scale, sleep mudAttr.setUsage(THREE.DynamicDrawUsage);
  const pigMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  pigMat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
attribute vec4 aMud; attribute vec3 aEye; varying vec3 vMudP; varying vec2 vMud; varying vec3 vEye; varying float vSleep;`).replace('#include <begin_vertex>', `#include <begin_vertex>
vEye = aEye; vSleep = aMud.w;
vMudP = position * 2.3 + vec3(aMud.y * 31.7, aMud.y * 17.3, aMud.y * 7.1);
#ifdef USE_INSTANCING
vec4 mudW = modelMatrix * instanceMatrix * vec4(position, 1.0);
#else
vec4 mudW = modelMatrix * vec4(position, 1.0);
#endif
vMud = vec2(aMud.x, clamp(mudW.y / max(0.05, aMud.z * 1.5), 0.0, 1.0));`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vMudP; varying vec2 vMud; varying vec3 vEye; varying float vSleep;
float mh(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float mn(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(mh(i), mh(i + vec3(1,0,0)), f.x), mix(mh(i + vec3(0,1,0)), mh(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(mh(i + vec3(0,0,1)), mh(i + vec3(1,0,1)), f.x), mix(mh(i + vec3(0,1,1)), mh(i + vec3(1,1,1)), f.x), f.y), f.z); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
if (vMud.x > 0.002) {
  float n = mn(vMudP) * 0.75 + mn(vMudP * 2.4) * 0.25;
  float s = n * 0.6 + (1.0 - vMud.y) * 0.6;
  float th = 1.22 - vMud.x * 0.98;
  float m = smoothstep(th, th + 0.07, s);
  vec3 mudc = mix(vec3(0.15, 0.072, 0.028), vec3(0.26, 0.135, 0.058), mn(vMudP * 4.0)) * (0.75 + 0.25 * vMud.y);
  diffuseColor.rgb = mix(diffuseColor.rgb, mudc, m);
}
if (vEye.x > 0.5 && vSleep > 0.5) {
  // closed eye: pink lid with a little curved lash line
  vec3 lid = vec3(0.70, 0.27, 0.42);
  float line = 0.38 + 0.9 * (vEye.y - 0.5) * (vEye.y - 0.5);
  float lash = 1.0 - smoothstep(0.045, 0.075, abs(vEye.z - line));
  diffuseColor.rgb = mix(lid, vec3(0.06, 0.06, 0.08), lash * step(0.08, vEye.y) * step(vEye.y, 0.92));
}`);
  };
  for (const g of pigParts) g.setAttribute('aMud', mudAttr);
  const pigMeshes = pigParts.map(g => { const m = new THREE.InstancedMesh(g, pigMat, N); m.castShadow = true; m.frustumCulled = false; m.receiveShadow = true; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); return m; });
  const PIG_ANIM = animM('pig'), DOG_ANIM = animM('dog');
  const dogGroup = new THREE.Group(); scene.add(dogGroup);
  const dogMeshes = ASSETS.dog.parts.map(p => { const m = new THREE.Mesh(geoFrom([p]), matV); m.castShadow = true; m.matrixAutoUpdate = false; dogGroup.add(m); return m; });
  dogGroup.matrixAutoUpdate = false;

  const tmpA = new THREE.Matrix4(), tmpB = new THREE.Matrix4();
  const animState = sim.pigs.map(p => ({ name: 'idle', t: Math.random(), prev: 'idle', prevT: 0, blend: 1, rest: 0, phase: Math.random() * 10 }));
  function pickAnim(p, s) {
    switch (p.state) {
      case ST.GRAB: return ['dance', 2.2];
      case ST.AIR: return ['gesture-negative', 1.5];
      case ST.EAT: return ['eat', 1];
      case ST.REST: return ['idle', 0.4];
      case ST.SHOWER: if (p.speed < 0.25 && Math.hypot(p.px - sim.hose.x, p.pz - sim.hose.z) < 2.2 && sim.hose.active) return ['dance', 1.4]; break;
      case ST.SNACK: if (p.speed < 0.2) return ['eat', 1.3]; break;
      case ST.GRAZE: if (p.speed < 0.15) return [Math.sin(s.phase * 0.3 + sim.time * 0.25) > -0.2 ? 'eat' : 'idle', 0.7]; break;
    }
    if (p.speed < 0.12) return ['idle', 1];
    const sc = p.scale / 0.62;
    if (p.speed < 1.7) return ['walk', Math.max(0.5, p.speed / (0.85 * sc))];
    return ['run', p.speed / (2.6 * sc)];
  }
  const W = new THREE.Matrix4(), Q = new THREE.Quaternion(), Qid = new THREE.Quaternion(), Qt = new THREE.Quaternion(), Qy = new THREE.Quaternion(), Qr = new THREE.Quaternion();
  const PM = new THREE.Matrix4(), PB = new THREE.Matrix4(), TMP = new THREE.Matrix4(), ZX = new THREE.Vector3(0, 0, 1);
  function updatePigs(dt) {
    for (const p of sim.pigs) {
      const s = animState[p.i];
      const [name, rate] = pickAnim(p, s);
      if (name !== s.name) { s.prev = s.name; s.prevT = s.t; s.name = name; s.blend = 0; }
      s.t += dt * rate; s.prevT += dt * rate; s.blend = Math.min(1, s.blend + dt * 6);
      s.rest += ((p.state === ST.REST ? 1 : 0) - s.rest) * Math.min(1, dt * 3);
      // world transform: tumbling uses the physics body rotation, then eases back upright
      Qy.setFromAxisAngle(UP, p.yaw);
      if (p.state === ST.GRAB || p.state === ST.AIR) Q.set(p.rot[0], p.rot[1], p.rot[2], p.rot[3]).multiply(Qy);
      else if (p.getUp > 0) { Qt.set(p.tumbleQ[0], p.tumbleQ[1], p.tumbleQ[2], p.tumbleQ[3]); Q.copy(Qid).slerp(Qt, p.getUp * p.getUp * (3 - 2 * p.getUp)).multiply(Qy); }
      else Q.copy(Qy);
      if (s.rest > 0.01) Q.multiply(Qr.setFromAxisAngle(ZX, s.rest * 1.45 * (p.i % 2 ? 1 : -1)));
      // rotate about the physics body centre so tumbling looks right; feet sit r below it
      W.compose(v3.set(p.px, p.py, p.pz), Q, s3.setScalar(p.scale)).multiply(TMP.makeTranslation(0, -p.r / p.scale, 0));
      if (s.rest > 0.01) W.multiply(TMP.makeTranslation((p.i % 2 ? -1 : 1) * 0.35 * s.rest, -0.18 * s.rest, 0));
      for (let k = 0; k < pigMeshes.length; k++) {
        sampleAnim(PIG_ANIM, s.name, s.t, k, PM);
        if (s.blend < 1) { sampleAnim(PIG_ANIM, s.prev, s.prevT, k, PB); lerpM(PB, PM, s.blend, PM); }
        TMP.multiplyMatrices(W, PM); pigMeshes[k].setMatrixAt(p.i, TMP);
      }
    }
    for (const p of sim.pigs) mudAttr.setXYZW(p.i, p.mud, p.seed, p.scale, animState[p.i].rest > 0.6 ? 1 : 0);
    mudAttr.needsUpdate = true;
    for (const m of pigMeshes) m.instanceMatrix.needsUpdate = true;
  }
  // little Zzz's drifting up from pigs asleep at night
  const zTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.font = '900 52px "Sniglet", "Arial Rounded MT Bold", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 8; g.strokeStyle = '#4a3a6a'; g.strokeText('z', 32, 34); g.fillStyle = '#ffffff'; g.fillText('z', 32, 34); return new THREE.CanvasTexture(c); })();
  const zs = Array.from({ length: 36 }, () => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: zTex, transparent: true, depthWrite: false })); sp.visible = false; scene.add(sp); return { sp, age: 0, life: 0, x: 0, y: 0, z: 0, ph: 0 }; });
  let zNext = 0; const zTimer = new Float32Array(N).map(() => Math.random() * 3);
  function updateZs(dt) {
    const night = sim.clock.night;
    for (const p of sim.pigs) {
      const asleep = night && p.state === ST.REST && animState[p.i].rest > 0.8;
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
  const dogAnim = { name: 'idle', t: 0 };
  function updateDog(dt) {
    const d = sim.dog;
    const name = d.speed < 0.2 ? 'idle' : d.speed < 2.5 ? 'walk' : 'run';
    const rate = name === 'idle' ? 1 : name === 'walk' ? d.speed / 0.7 : d.speed / 2.4;
    dogAnim.name = name; dogAnim.t += dt * rate;
    const hopY = Math.sin(Math.min(1, d.hop) * Math.PI / 2) * 1.05;
    W.compose(v3.set(d.x, hopY, d.z), Q.setFromAxisAngle(UP, d.yaw), s3.setScalar(0.62));
    dogGroup.matrix.copy(W); dogGroup.matrixWorldNeedsUpdate = true;
    dogMeshes.forEach((m, k) => { sampleAnim(DOG_ANIM, name, dogAnim.t, k, m.matrix); m.matrixWorldNeedsUpdate = true; });
  }

  // ---------- thrown snacks -------------------------------------------------------------
  const foodMeshes = Object.fromEntries(FOOD_KINDS.map(k => {
    const g = modelGeo(k); g.computeBoundingBox(); const bb = g.boundingBox; g.translate(0, -(bb.max.y + bb.min.y) / 2, 0); // pivot at centre for tumbling
    const m = new THREE.InstancedMesh(g, matV, 16); m.castShadow = true; m.frustumCulled = false; m.count = 0; scene.add(m); return [k, m];
  }));
  const FOOD_SCALE = { apple: 1.7, carrot: 0.75, cabbage: 1.35, cob: 1.0 };
  function updateFoods() {
    for (const m of Object.values(foodMeshes)) m.count = 0;
    for (const f of sim.foods) {
      const m = foodMeshes[f.kind]; const shrink = (1 - Math.min(1, f.bites / 2.5) * 0.7) * Math.max(0, f.life);
      m.setMatrixAt(m.count++, mtx.compose(v3.set(f.x, f.y, f.z), Q.set(f.rot[0], f.rot[1], f.rot[2], f.rot[3]), s3.setScalar(FOOD_SCALE[f.kind] * shrink)));
    }
    for (const m of Object.values(foodMeshes)) m.instanceMatrix.needsUpdate = true;
  }

  // target ring under the finger
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.75, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false }));
  ring.position.y = 0.04; ring.visible = false; scene.add(ring);
  const selRing = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.8, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffd84a', transparent: true, opacity: 0.95, depthWrite: false }));
  selRing.position.y = 0.045; selRing.visible = false; scene.add(selRing);
  const extras = buildFarmExtras({ scene, sim, matV, sun, hemi, fogColor: scene.fog.color });


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
    scene,
    // One drawn frame (main.js's frame minus the sim, input and HUD). dt is the frame time, 0 for hook renders (#19):
    // nothing here divides by it. `frame` counts drawn frames (trough food every 8th, as before).
    update(dt, s, frame) {
      updatePigs(dt); updateZs(dt); updateDog(dt); updateHose(dt, s.hose); updateFoods(); extras.update(dt);
      if ((frame & 7) === 0) updateTroughFood();
      ring.visible = !!s.ring;
      if (s.ring) { ring.position.x = s.ring[0]; ring.position.z = s.ring[1]; ring.rotation.y += dt; ring.scale.setScalar(1 + 0.08 * Math.sin(performance.now() * 0.01)); }
    },
    draw(camera, dist) { fx.render(scene, camera, dist); },
    // the yellow selection ring (main.js renderCard): at [x, z] or null, scaled by kind
    select(at, kind) {
      if (at) { selRing.visible = true; selRing.position.x = at[0]; selRing.position.z = at[1]; selRing.scale.setScalar(kind === 'tractor' ? 3.2 : kind === 'bird' ? 0.5 : 1); } else selRing.visible = false;
    },
    feathers(ev) { extras.spawnFeathers(ev.x, ev.y, ev.z, ev.n, ev.tint); },
    dispose() {
      const seen = new Set(), free = o => { if (o && !seen.has(o)) { seen.add(o); o.dispose?.(); } };
      scene.traverse(o => {
        free(o.geometry);
        for (const m of [].concat(o.material ?? [])) { free(m); for (const k in m) if (m[k]?.isTexture) free(m[k]); }
      });
      scene.clear();
    },
  };
}
