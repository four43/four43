import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { ASSETS, s2l, geoFrom, modelGeo, colorGeo, mergeGeos, boxGeo, animM, sampleAnim, lerpM } from './gfx.js';
import { buildFarmExtras } from './farm3d.js';
import { createSim, ST, DT, FOOD_KINDS } from './sim.js';
import { L } from './layout.js';
import { Sound } from './sound.js';
import { createTiltShift } from './tiltshift.js';

const $ = id => document.getElementById(id);
async function main() {
  await RAPIER.init();
  const params = new URLSearchParams(location.search);
  const sim = createSim(RAPIER, { pigs: +(params.get('pigs') || 48), seed: +(params.get('seed') || 1) });
  const { lay } = sim;
  const sound = new Sound();

  // ---------- renderer / scene ----------------------------------------------------
  const canvas = $('c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const SKY = new THREE.Color('#bfe6f5');
  scene.background = SKY; scene.fog = new THREE.Fog(SKY, 70, 170);
  const camera = new THREE.PerspectiveCamera(48, 1, 0.3, 400);
  // tilt-shift miniature look, focused on the camera's look-at point, only once zoomed in; ?tilt=0 turns it off
  const tilt = createTiltShift(renderer, { on: params.get('tilt') !== '0' });
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
  const hoseState = { on: false, tx: 0, tz: 0, nx: 0, ny: 1.5, nz: 0, bx: 0, bz: 1 };
  function aimHose(x, z) {
    const back = new THREE.Vector3(camera.position.x - x, 0, camera.position.z - z); if (back.lengthSq() < 1e-4) back.set(0, 0, 1); back.normalize();
    hoseState.tx = x; hoseState.tz = z; hoseState.bx = back.x; hoseState.bz = back.z;
    const side = new THREE.Vector3(-back.z, 0, back.x);
    const nx = x + back.x * 5.2 + side.x * 1.2, nz = z + back.z * 5.2 + side.z * 1.2;
    if (!hoseState.on) { hoseState.nx = nx; hoseState.nz = nz; }
    hoseState.gx = nx; hoseState.gz = nz;
    sim.setHose(x, z, true, hoseState.nx, hoseState.nz);
  }
  function updateHose(dt) {
    const H = hoseState, active = sim.hose.active;
    if (active) { const k = Math.min(1, dt * 6); H.nx += (H.gx - H.nx) * k; H.nz += (H.gz - H.nz) * k; }
    nozzle.visible = active || hp.n > 0; hoseRing.visible = active;
    if (active) {
      hoseRing.position.x = H.tx; hoseRing.position.z = H.tz;
      nozzle.position.set(H.nx, H.ny, H.nz); nozzle.lookAt(H.tx, 0.6, H.tz);
      // spawn droplets aimed to land in a disc around the target
      hp.acc += dt * 300; const nd = nozzle.getWorldDirection(new THREE.Vector3());
      while (hp.acc >= 1 && hp.n < HOSE_MAX) {
        hp.acc--; const i = hp.n++, a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 1.0, T = 0.48 + Math.random() * 0.1;
        const ox = H.nx + nd.x * 0.32, oz = H.nz + nd.z * 0.32, oy = H.ny + nd.y * 0.32;
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
        const b = new THREE.Vector3(H.bx, 0, H.bz), sd = new THREE.Vector3(-H.bz, 0, H.bx), n = new THREE.Vector3(H.nx, H.ny, H.nz), back = nozzle.getWorldDirection(new THREE.Vector3()).multiplyScalar(-0.28);
        const out = sd.clone().multiplyScalar(0.8).addScaledVector(b, 0.6).normalize();
        const gy = 0.16, g = () => n.clone().setY(gy);   // ground run sits clear of the grass
        const curve = new THREE.CatmullRomCurve3([n.clone().add(back), n.clone().add(back).addScaledVector(out, 0.6).add(new THREE.Vector3(0, -0.6, 0)), g().addScaledVector(out, 1.8), g().addScaledVector(out, 5).addScaledVector(b, 1), g().addScaledVector(out, 12).addScaledVector(b, 8), g().addScaledVector(out, 40).addScaledVector(b, 40), g().addScaledVector(out, 100).addScaledVector(b, 100), g().addScaledVector(out, 200).addScaledVector(b, 200)]);
        pipe = new THREE.Mesh(new THREE.TubeGeometry(curve, 160, 0.075, 6, false), pipeMat); pipe.castShadow = true; scene.add(pipe);
      }
    } else if (pipe) { pipe.geometry.dispose(); scene.remove(pipe); pipe = null; pipeKey = ''; }
    hoseState.on = active;
  }

  // ---------- camera -----------------------------------------------------------------
  const cam = { tx: 0, tz: 1, yaw: 0, pitch: 0.92, dist: 46 };
  const fitCam = () => {
    const a = canvas.clientWidth / canvas.clientHeight;
    cam.yaw = a < 0.9 ? Math.PI / 2 : 0;           // long axis of the pens runs up the screen on phones
    cam.dist = a < 0.9 ? 60 : 46; cam.tx = a < 0.9 ? -3 : -1; cam.tz = a < 0.9 ? -9 : -4;
  };
  fitCam();
  const applyCam = () => {
    cam.pitch = Math.max(0.28, Math.min(1.48, cam.pitch)); cam.dist = Math.max(2.5, Math.min(80, cam.dist));
    cam.tx = Math.max(-34, Math.min(34, cam.tx)); cam.tz = Math.max(-30, Math.min(30, cam.tz));
    const cp = Math.cos(cam.pitch);
    camera.position.set(cam.tx + Math.sin(cam.yaw) * cp * cam.dist, Math.sin(cam.pitch) * cam.dist, cam.tz + Math.cos(cam.yaw) * cp * cam.dist);
    camera.lookAt(cam.tx, 0.5, cam.tz);
  };
  const draw = () => tilt.render(scene, camera, cam.dist);
  const resize = () => { const w = canvas.clientWidth, h = canvas.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w / h < 0.9 ? 64 : 48; camera.updateProjectionMatrix(); };
  addEventListener('resize', resize); resize(); applyCam();

  // ---------- input -------------------------------------------------------------------
  const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const rayAt = (cx, cy) => { const r = canvas.getBoundingClientRect(); ndc.set((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1); raycaster.setFromCamera(ndc, camera); return raycaster.ray; };
  const planeHit = (ray, y) => { if (Math.abs(ray.direction.y) < 1e-4) return null; const t = (y - ray.origin.y) / ray.direction.y; if (t < 0) return null; return ray.origin.clone().addScaledVector(ray.direction, t); };

  let tool = 'hand';
  const TOOL_HINT = {
    hand: 'Tap an animal to meet it. Tap a gate or the coop door to open or shut it. Hold the tractor to drive.',
    shoo: 'Drag to send the dog. Pigs and chickens scatter from it.',
    feed: 'Tap to toss a snack. Tap in the chicken run to scatter grain.',
    hose: 'Drag to spray. Muddy pigs come for a bath.',
    grab: 'Drag a pig or a chicken to lift it. Flick to throw.',
  };
  const hint = $('hint'); let hintTimer = 0;
  const showHint = (txt, sec = 3.2) => { hint.textContent = txt; hint.classList.add('on'); hintTimer = sec; };
  function setTool(t) {
    tool = t;
    for (const b of document.querySelectorAll('[data-tool]')) b.setAttribute('aria-pressed', b.dataset.tool === t ? 'true' : 'false');
    showHint(TOOL_HINT[t]);
  }
  for (const b of document.querySelectorAll('[data-tool]')) b.addEventListener('click', () => { sound.unlock(); setTool(b.dataset.tool); });

  // ---------- info card for whatever the Hand selects ----------------------------------------------
  const flock = sim.flock;
  const card = $('card'); let selected = null, cardT = 0;
  const PIG_DOING = s => ({ [ST.ROAM]: 'Wandering about', [ST.GRAZE]: 'Nibbling the grass', [ST.EAT]: 'Eating at the trough', [ST.FLEE]: 'Running away!', [ST.SNACK]: 'Chasing a snack', [ST.GRAB]: 'Squealing in your hand', [ST.AIR]: 'Flying!', [ST.SHOWER]: 'Waiting for a bath', [ST.ZOOM]: 'Squeaky clean and zooming' }[s]);
  const BIRD_DOING = { 0: 'Pecking at the ground', 1: 'Strutting about', 2: 'Going for grain', 3: 'Off to a nest box', 4: 'Laying an egg', 5: 'Sitting on an egg', 6: 'Taking a dust bath', 7: 'Panicking!', 8: 'Heading to bed', 9: 'Climbing the ramp', 10: 'Asleep in the coop', 11: 'Coming out', 12: 'Inside the fox\u2019s cheeks!', 13: 'Lost in the woods', 14: 'Flapping in your hand', 15: 'Flapping through the air', 16: 'Walking home', 17: 'Chasing the fox!' };
  const bar = (label, v, cls) => `<div class="bar ${cls}"><span>${label}</span><i><b style="width:${Math.round(Math.max(0, Math.min(1, v)) * 100)}%"></b></i></div>`;
  function cardInfo(sel) {
    if (sel.kind === 'pig') {
      const p = sim.pigs[sel.i], mum = p.mom >= 0 ? sim.pigs[p.mom].name : null;
      let doing = PIG_DOING(p.state);
      if (p.state === ST.REST) doing = Math.hypot(p.px - lay.wallow.x, p.pz - lay.wallow.z) < 4 ? 'Rolling in the mud' : 'Fast asleep';
      if (p.state === ST.TRAVEL) doing = p.trough >= 0 ? 'Heading to the trough' : p.target === lay.destinations.length - 1 ? 'Off to the mud' : 'Exploring another pen';
      return { name: p.name, sub: p.piglet ? `Piglet \u00b7 mum is ${mum}` : 'Pig', doing, bars: bar('Hunger', p.hunger, 'hunger') + bar('Mud', p.mud, 'mud'), at: [p.px, p.pz] };
    }
    if (sel.kind === 'bird') {
      const b = flock.birds[sel.i], adults = flock.birds.filter(o => o.kind !== 'chick').length;
      const sub = b.kind === 'rooster' ? 'Rooster \u00b7 top of the pecking order' : b.kind === 'chick' ? `Chick \u00b7 mum is ${flock.birds[b.mom].name}` : `Hen \u00b7 number ${b.rank + 1} of ${adults} in the pecking order`;
      const extra = b.kind === 'hen' ? `<div class="facts"><span>Eggs today <b>${b.eggsToday}</b></span><span>All time <b>${b.eggsTotal}</b></span></div>` : '';
      return { name: b.name, sub, doing: BIRD_DOING[b.state], bars: extra + bar('Fright', b.panic, 'fright'), at: b.state === 12 ? [flock.fox.x, flock.fox.z] : b.hidden ? null : [b.px, b.pz] };
    }
    if (sel.kind === 'fox') { const f = flock.fox; return { name: 'The fox', sub: 'Fox \u00b7 up to no good', doing: f.carrying ? `Cheeks full of ${f.carrying.name}! Tap to make it spit.` : ['Gone', 'Sniffing around', 'Chasing a chicken!', 'Very pleased with itself', 'Running away'][f.state], bars: bar('Nerve', 1 - Math.min(1, f.fear / 0.6), 'fright'), at: f.state ? [f.x, f.z] : null }; }
    if (sel.kind === 'dog') return { name: 'Biscuit', sub: 'Sheepdog \u00b7 good dog', doing: sim.dog.active ? 'Herding' : 'Waiting for a job', bars: '', at: [sim.dog.x, sim.dog.z] };
    const t = sim.tractor; return { name: 'Tractor', sub: 'Press and hold it to drive', doing: t.driven ? `Driving at ${(Math.abs(t.fwd) * 3.6).toFixed(0)} km/h` : 'Parked', bars: '', at: [t.x, t.z] };
  }
  function renderCard() {
    if (!selected) return; const c = cardInfo(selected);
    $('cardName').textContent = c.name; $('cardSub').textContent = c.sub; $('cardDoing').textContent = c.doing || '';
    $('cardBars').innerHTML = c.bars;
    if (c.at) { selRing.visible = true; selRing.position.x = c.at[0]; selRing.position.z = c.at[1]; selRing.scale.setScalar(selected.kind === 'tractor' ? 3.2 : selected.kind === 'bird' ? 0.5 : 1); } else selRing.visible = false;
  }
  function select(sel) { selected = sel; card.hidden = !sel; selRing.visible = !!sel; if (sel) { renderCard(); sound.pop(); } }
  $('cardClose').addEventListener('click', () => select(null));

  // ---------- what is under the finger ----------------------------------------------------------
  function classify(x, y) {
    const r = rayAt(x, y), h = planeHit(r, 0), o = r.origin, d = r.direction;
    const egg = extras.pickEgg(r); if (egg) return { kind: 'egg', e: egg };
    const pi = sim.pick(o.x, o.y, o.z, d.x, d.y, d.z), bi = flock.pick(o.x, o.y, o.z, d.x, d.y, d.z);
    const dist = (x, y, z) => Math.hypot(x - o.x, y - o.y, z - o.z);
    const cands = [];
    if (pi >= 0) { const p = sim.pigs[pi]; cands.push({ kind: 'pig', i: pi, d: dist(p.px, p.py, p.pz) }); }
    if (bi >= 0) { const b = flock.birds[bi]; cands.push({ kind: 'bird', i: bi, d: dist(b.px, b.py, b.pz) - 0.4 }); }
    const f = flock.fox; if (extras.foxHit(r)) cands.push({ kind: 'fox', d: dist(f.x, 0.35, f.z) - 0.6 });
    if (r.distanceToPoint(v3.set(sim.dog.x, 0.4, sim.dog.z)) < 0.8) cands.push({ kind: 'dog', d: dist(sim.dog.x, 0.4, sim.dog.z) });
    if (cands.length) return cands.sort((a, b) => a.d - b.d)[0];
    if (h) { const g = extras.pickGate(h.x, h.z); if (g) return { kind: 'gate', g }; if (extras.pickDoor(h.x, h.z)) return { kind: 'door' }; }
    if (extras.tractorHit(r)) return { kind: 'tractor' };
    return null;
  }
  function act(t) {
    if (!t) { select(null); return; }
    if (t.kind === 'egg') { flock.collectEgg(t.e.id); return; }
    if (t.kind === 'gate') { sim.setGate(t.g.id, !t.g.open); showHint(t.g.open ? 'Gate open.' : 'Gate shut.', 1.2); return; }
    if (t.kind === 'fox' && flock.fox.carrying) { flock.tapFox(); return; }
    if (t.kind === 'door') { lay.coop.open = !lay.coop.open; sound.gate(); showHint(lay.coop.open ? 'Coop door open.' : 'Coop door shut. Foxes stay out, chickens stay in.', 2); return; }
    select(t.kind === 'tractor' ? { kind: 'tractor' } : t);
  }
  // press-and-hold ring (for the tractor)
  const press = $('press'); let pressStart = 0, pressTimer = 0;
  const showPress = (x, y) => {
    press.style.left = x + 'px'; press.style.top = y + 'px'; press.classList.remove('go'); void press.offsetWidth; press.classList.add('go'); press.hidden = false; pressStart = performance.now();
    clearTimeout(pressTimer); pressTimer = setTimeout(() => { if (pressStart && downInfo?.target?.kind === 'tractor' && !driving) { toolActive = false; enterDrive(); } }, 750); // timer, so slow frames can't miss it
  };
  const hidePress = () => { press.hidden = true; press.classList.remove('go'); pressStart = 0; clearTimeout(pressTimer); };

  // ---------- driving ----------------------------------------------------------------------------
  let driving = false, chaseOff = 0;
  const stick = { x: 0, y: 0, id: null }, keys = new Set();
  function enterDrive() {
    driving = true; sim.tractor.driven = true; document.body.classList.add('driving'); select(null); hidePress();
    if (sim.dog.active) sim.setDog(null, null, false);
    sound.engine(true); showHint('Push the stick to drive. Honk to clear the way.', 4);
  }
  function exitDrive() {
    driving = false; sim.tractor.driven = false; sim.tractor.setInput(0, 0); document.body.classList.remove('driving');
    sound.engine(false); cam.pitch = Math.max(cam.pitch, 0.7); cam.dist = Math.max(cam.dist, 18); chaseOff = 0;
  }
  $('exit').addEventListener('click', exitDrive);
  $('horn').addEventListener('pointerdown', e => { e.preventDefault(); sim.horn(); sound.horn(); });
  const stickEl = $('stick'), knob = $('knob');
  const stickMove = e => {
    const r = stickEl.getBoundingClientRect(), R = r.width * 0.36;
    let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2); const l = Math.hypot(dx, dy); if (l > R) { dx *= R / l; dy *= R / l; }
    stick.x = dx / R; stick.y = dy / R; knob.style.transform = `translate(${dx}px, ${dy}px)`;
  };
  stickEl.addEventListener('pointerdown', e => { sound.unlock(); stick.id = e.pointerId; stickEl.setPointerCapture(e.pointerId); stickMove(e); });
  stickEl.addEventListener('pointermove', e => { if (e.pointerId === stick.id) stickMove(e); });
  const stickEnd = e => { if (e.pointerId !== stick.id) return; stick.id = null; stick.x = stick.y = 0; knob.style.transform = ''; };
  stickEl.addEventListener('pointerup', stickEnd); stickEl.addEventListener('pointercancel', stickEnd);
  addEventListener('keydown', e => {
    if (driving) { keys.add(e.key.toLowerCase()); if (e.key === 'h' || e.key === 'H') { sim.horn(); sound.horn(); } if (e.key === 'Escape' || e.key === 'e' || e.key === 'E') exitDrive(); return; }
    const k = { 1: 'hand', 2: 'shoo', 3: 'feed', 4: 'hose', 5: 'grab' }[e.key]; if (k) setTool(k); if (e.key === 'b') ringBell(); if (e.key === 'Escape') select(null);
  });
  addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  function driveInput(dt) {
    let thr = -stick.y, st = -stick.x;
    const k = n => keys.has(n);
    if (k('w') || k('arrowup')) thr = 1; if (k('s') || k('arrowdown')) thr = -1;
    if (k('a') || k('arrowleft')) st = 1; if (k('d') || k('arrowright')) st = -1;
    st = Math.sign(st) * Math.pow(Math.abs(st), 1.4);
    sim.tractor.setInput(thr, st);
    const t = sim.tractor;
    if (t.speed < 0.3 && t.rightIfTipped()) showHint('Back on four wheels.', 1.5);
    // chase camera: sits behind the tractor, eases round as it turns
    const want = t.yaw + Math.PI + chaseOff; let d = want - cam.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    cam.yaw += d * Math.min(1, dt * 2.5); if (!gesture) chaseOff *= Math.max(0, 1 - dt * 0.8);
    const lead = Math.max(-1, Math.min(3, t.fwd * 0.5));
    cam.tx += (t.x + Math.sin(t.yaw) * lead - cam.tx) * Math.min(1, dt * 5); cam.tz += (t.z + Math.cos(t.yaw) * lead - cam.tz) * Math.min(1, dt * 5);
    cam.pitch += (0.42 - cam.pitch) * Math.min(1, dt * 2); cam.dist += (Math.min(Math.max(cam.dist, 9), 22) - cam.dist) * Math.min(1, dt * 2);
    sound.engineLevel(t.engine, t.speed);
  }

  const pointers = new Map(); let gesture = null, toolActive = false, downInfo = null, lastToss = 0, grabbing = null;
  // with a finger the target would be hidden under it, so touch aims a little above the finger
  const TOUCH_LIFT = 80, SPRAY_LIFT = 55; let touch = false;
  const grabAim = { x: 0, y: 0, lift: 0, goal: 0 };
  const sprayY = y => touch ? y - SPRAY_LIFT : y;
  const moveGrabTo = () => { const h = planeHit(rayAt(grabAim.x, grabAim.y - grabAim.lift), 1.7); if (h && grabbing) (grabbing.kind === 'pig' ? sim : flock).moveGrab(h.x, grabbing.kind === 'pig' ? 1.7 : 1.4, h.z); };
  const twoInfo = () => { const [a, b] = [...pointers.values()]; return { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x) }; };
  function toolDown(x, y, btn) {
    downInfo = { x, y, t: performance.now(), btn };
    if (driving) { gesture = { kind: 'chase', x, y }; return; }
    if (btn === 2) { gesture = { kind: 'orbit', x, y }; return; }
    if (btn === 1) { gesture = { kind: 'pan', x, y }; return; }
    toolActive = true;
    if (tool === 'hand') { downInfo.target = classify(x, y); if (downInfo.target?.kind === 'tractor') showPress(x, y); }
    if (tool === 'shoo') { const h = planeHit(rayAt(x, y), 0); if (h) { sim.setDog(h.x, h.z, true); ring.position.set(h.x, 0.04, h.z); ring.visible = true; sound.bark(); } }
    if (tool === 'hose') { const h = planeHit(rayAt(x, sprayY(y)), 0); if (h) { aimHose(h.x, h.z); sound.hose(true); } }
    if (tool === 'grab') {
      const r = rayAt(x, y), o = r.origin, d = r.direction;
      const pi = sim.pick(o.x, o.y, o.z, d.x, d.y, d.z), bi = flock.pick(o.x, o.y, o.z, d.x, d.y, d.z);
      const dp = pi >= 0 ? o.distanceTo(v3.set(sim.pigs[pi].px, sim.pigs[pi].py, sim.pigs[pi].pz)) : Infinity;
      const db = bi >= 0 ? o.distanceTo(v3.set(flock.birds[bi].px, flock.birds[bi].py, flock.birds[bi].pz)) - 0.4 : Infinity;
      if (pi < 0 && bi < 0 && extras.foxHit(r) && flock.fox.carrying) { flock.tapFox(); grabbing = null; }
      else if (pi < 0 && bi < 0) { showHint('Touch a pig or a chicken to pick it up.', 1.8); grabbing = null; }
      else if (dp <= db) { grabbing = { kind: 'pig' }; sim.grab(pi); }
      else { grabbing = { kind: 'bird' }; flock.grab(bi); }
      if (grabbing) { Object.assign(grabAim, { x, y, lift: 0, goal: touch ? TOUCH_LIFT : 0 }); moveGrabTo(); }
    }
  }
  function toolMove(x, y) {
    const moved = downInfo && Math.hypot(x - downInfo.x, y - downInfo.y) > 10;
    if (gesture?.kind === 'chase') { chaseOff -= (x - gesture.x) * 0.006; cam.pitch += (y - gesture.y) * 0.004; gesture.x = x; gesture.y = y; return; }
    if (gesture?.kind === 'orbit') { cam.yaw -= (x - gesture.x) * 0.006; cam.pitch += (y - gesture.y) * 0.005; gesture.x = x; gesture.y = y; return; }
    if (gesture?.kind === 'pan') { panBy(x - gesture.x, y - gesture.y); gesture.x = x; gesture.y = y; return; }
    if (!toolActive) return;
    if (tool === 'hand' && moved) { hidePress(); toolActive = false; gesture = { kind: 'orbit', x, y }; return; } // the Hand drags the view
    if (tool === 'shoo') { const h = planeHit(rayAt(x, y), 0); if (h) { sim.setDog(h.x, h.z, true); ring.position.set(h.x, 0.04, h.z); } }
    if (tool === 'hose') { const h = planeHit(rayAt(x, sprayY(y)), 0); if (h) aimHose(h.x, h.z); }
    if (tool === 'grab' && grabbing) { grabAim.x = x; grabAim.y = y; moveGrabTo(); }
  }
  function toolUp(x, y) {
    const wasTap = downInfo && Math.hypot(x - downInfo.x, y - downInfo.y) < 12 && performance.now() - downInfo.t < 450;
    if (toolActive) {
      if (tool === 'hand') { hidePress(); if (wasTap) act(downInfo?.target); }
      if (tool === 'shoo') { sim.setDog(null, null, false); ring.visible = false; }
      if (tool === 'grab' && grabbing) { (grabbing.kind === 'pig' ? sim : flock).release(); grabbing = null; }
      if (tool === 'hose') { sim.setHose(null, null, false); sound.hose(false); }
      if (tool === 'feed' && wasTap) toss(x, y);
    }
    toolActive = false; gesture = null; downInfo = null;
  }
  function toss(x, y) {
    const now = performance.now(); if (now - lastToss < 180) return; lastToss = now;
    const h = planeHit(rayAt(x, y), 0); if (!h) return;
    h.x = Math.max(lay.field.x0 + 1, Math.min(lay.field.x1 - 1, h.x)); h.z = Math.max(lay.field.z0 + 1, Math.min(lay.field.z1 - 1, h.z));
    const back = new THREE.Vector3(camera.position.x - h.x, 0, camera.position.z - h.z).normalize();
    const r = lay.run;
    if (h.x > r.x0 && h.x < r.x1 && h.z > r.z0 && h.z < r.z1) {
      if (!flock.scatterGrain(h.x + back.x * 2.5, 1.6, h.z + back.z * 2.5, h.x, h.z)) { showHint('Plenty of grain down already. Let them peck.', 2.2); return; }
      sound.scatter(); return;
    }
    if (!sim.tossFood(h.x + back.x * 5, 3.5, h.z + back.z * 5, h.x, h.z)) { showHint('That\u2019s all the snacks for now. Wait for the pigs to finish.', 2.5); return; }
    sound.whoosh(); updateBadge();
  }
  function panBy(dx, dy) {
    const k = cam.dist * 0.0016;
    const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
    cam.tx -= (dx * rx - dy * fx / Math.max(0.5, Math.sin(cam.pitch))) * k; cam.tz -= (dx * rz - dy * fz / Math.max(0.5, Math.sin(cam.pitch))) * k;
  }
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => {
    sound.unlock(); canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    touch = e.pointerType !== 'mouse';
    if (pointers.size === 1) toolDown(e.clientX, e.clientY, e.pointerType === 'mouse' ? e.button : 0);
    else if (pointers.size === 2) { if (toolActive) toolUp(-1e4, -1e4); hidePress(); toolActive = false; gesture = { kind: 'two', ...twoInfo() }; }
  });
  canvas.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2 && gesture?.kind === 'two') {
      const n = twoInfo();
      cam.dist *= gesture.d / Math.max(10, n.d);
      let da = n.ang - gesture.ang; da = Math.atan2(Math.sin(da), Math.cos(da)); if (driving) chaseOff += da; else { cam.yaw += da; panBy(n.cx - gesture.cx, n.cy - gesture.cy); }
      gesture = { kind: 'two', ...n };
    } else if (pointers.size === 1) toolMove(e.clientX, e.clientY);
  });
  const end = e => {
    if (!pointers.has(e.pointerId)) return; pointers.delete(e.pointerId);
    if (pointers.size === 0) { if (gesture?.kind !== 'two') toolUp(e.clientX, e.clientY); gesture = null; toolActive = false; }
    else if (pointers.size === 1) { const [p] = [...pointers.values()]; gesture = { kind: 'idle' }; downInfo = null; }
  };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('wheel', e => { e.preventDefault(); cam.dist *= Math.exp(e.deltaY * 0.0012); }, { passive: false });

  // ---------- top bar: bell --------------------------------------------------------------------
  const ringBell = () => { sim.bell(); sound.bell(); showHint('Dinner time. Every trough is full.', 2.5); };
  $('bell').addEventListener('click', () => { sound.unlock(); ringBell(); });
  const badge = $('snacks');
  let shownLeft = -1;
  function updateBadge() {
    const left = sim.foodCap - sim.foods.length; if (left === shownLeft) return; shownLeft = left;
    badge.textContent = left; badge.classList.toggle('empty', left === 0);
    document.querySelector('[data-tool="feed"]').setAttribute('aria-label', `Feed, ${left} of ${sim.foodCap} snacks left`);
  }
  updateBadge();

  // ---------- day/night switch and egg basket ----------------------------------------------------
  const dn = $('daynight'), eggTxt = $('eggCount');
  const paintDN = () => { const n = sim.clock.night; dn.setAttribute('aria-pressed', n ? 'true' : 'false'); dn.setAttribute('aria-label', n ? 'Night. Switch to day' : 'Day. Switch to night'); };
  dn.addEventListener('click', () => {
    sound.unlock(); const n = !sim.clock.night; sim.setNight(n); paintDN();
    if (n) showHint('Night time. The chickens are off to bed. Shut the coop door once they\u2019re in.', 4.5);
    else showHint(lay.coop.open ? 'Good morning!' : 'Good morning! Open the coop door to let the chickens out.', 3.5);
  });
  paintDN();
  let lastEggs = -1;
  function updateHud() {
    if (flock.basket !== lastEggs) { const bump = lastEggs >= 0; lastEggs = flock.basket; eggTxt.textContent = lastEggs; if (bump) { eggBox.classList.remove('bump'); void eggBox.offsetWidth; eggBox.classList.add('bump'); } }
    if ((dn.getAttribute('aria-pressed') === 'true') !== sim.clock.night) paintDN();
  }
  // collecting an egg floats the new basket total up from the nest. It's an HTML overlay that starts
  // above the nest-box roof (~0.86 m), so the box can never cover or cut through it.
  const eggBox = $('eggs'), eggPops = [], popV = new THREE.Vector3();
  const stillMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function popEgg(x, z, n) {
    for (const p of eggPops) if (Math.hypot(p.x - x, p.z - z) < 1.2) p.t = Math.max(p.t, 0.98); // quick taps: the older number fades so only the newest count reads
    const el = document.createElement('div'); el.className = 'eggpop'; el.textContent = n; el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el); eggPops.push({ el, x, z, t: 0 });
  }
  function updateEggPops(dt) {
    for (let i = eggPops.length - 1; i >= 0; i--) {
      const p = eggPops[i]; p.t += dt; const u = Math.min(1, p.t / 1.4);
      if (u >= 1) { p.el.remove(); eggPops.splice(i, 1); continue; }
      popV.set(p.x, 1.15 + (stillMotion ? 0 : 0.6 * (1 - (1 - u) * (1 - u))), p.z).project(camera);
      const sc = stillMotion ? 1 : u < 0.15 ? 0.4 + 0.8 * (u / 0.15) : 1.2 - 0.2 * Math.min(1, (u - 0.15) / 0.15);
      p.el.style.opacity = popV.z > 1 ? 0 : u < 0.7 ? 1 : 1 - (u - 0.7) / 0.3;
      p.el.style.transform = `translate(${(popV.x + 1) / 2 * canvas.clientWidth}px, ${(1 - popV.y) / 2 * canvas.clientHeight}px) translate(-50%, -100%) scale(${sc})`;
    }
  }
  function eventToast(ev) {
    if (ev.type === 'egg') popEgg(ev.x, ev.z, flock.basket);
    else if (ev.type === 'feathers') extras.spawnFeathers(ev.x, ev.y, ev.z, ev.n, ev.tint);
    else if (ev.type === 'fox') showHint('A fox is sniffing around the farm. Is the coop door shut?', 4.5);
    else if (ev.type === 'gulp') showHint(`Gulp! The fox has ${ev.name} in its cheeks. Tap the fox!`, 4.5);
    else if (ev.type === 'spit') showHint(ev.reason === 'hiccup' ? `Hic! The fox couldn\u2019t keep ${ev.name} down.` : ev.reason === 'morning' ? `Ptooey! The fox spat out ${ev.name} and slunk off home.` : `Ptooey! Out pops ${ev.name}, a bit ruffled.`, 3.5);
    else if (ev.type === 'hatch') showHint(`An egg hatched! ${flock.birds[ev.mom].name} has a new chick.`, 4);

  }

  // ---------- loop ---------------------------------------------------------------------
  let acc = 0, last = performance.now(), frames = 0, paused = false;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (!paused) { acc += dt; let n = 0; while (acc >= DT && n < 4) { sim.step(); acc -= DT; n++; } if (n === 4) acc = 0; }
    for (const ev of sim.events.splice(0)) { sound.event(ev, camera); eventToast(ev); }
    if (driving) driveInput(dt);
    if (toolActive && tool === 'grab' && grabbing && grabAim.lift !== grabAim.goal) { grabAim.lift = Math.min(grabAim.goal, grabAim.lift + dt * TOUCH_LIFT / 0.18); moveGrabTo(); }
    updatePigs(dt); updateZs(dt); updateDog(dt); updateHose(dt); updateFoods(); updateBadge(); extras.update(dt); updateEggPops(dt); if ((frames & 7) === 0) updateTroughFood();
    if (selected && frames % 6 === 0) renderCard();
    if ((frames & 7) === 0) updateHud();
    if (ring.visible) { ring.rotation.y += dt; ring.scale.setScalar(1 + 0.08 * Math.sin(now * 0.01)); }
    applyCam(); draw();
    if (hintTimer > 0) { hintTimer -= dt; if (hintTimer <= 0) hint.classList.remove('on'); }
    frames++; requestAnimationFrame(frame);
  }
  $('loading').remove();
  setTool('hand'); showHint('Tap an animal to meet it. Hold the tractor to drive. Two fingers turn, pan and zoom.', 5);
  requestAnimationFrame(frame);

  // debug hook for scripted checks
  window.piggies = {
    sim, cam, setTool, THREE, camera, tilt: tilt.params,
    stepN(n) { for (let i = 0; i < n; i++) sim.step(); },
    pause(v) { paused = v; },
    render(dt = 1 / 60) { updatePigs(dt); updateDog(dt); updateFoods(); updateTroughFood(); extras.update(dt); if (selected) renderCard(); updateHud(); applyCam(); draw(); },
    toolDown, toolMove, toolUp, toss, aimHose, updateHose, enterDrive, exitDrive, driveInput, classify, act, select, extras, stick, get driving() { return driving; },
  };
}
main().catch(err => { const l = $('loading'); if (l) l.textContent = 'Could not start: ' + err.message; console.error(err); });
