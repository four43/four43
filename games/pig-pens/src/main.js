import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import ASSETS from './assets.json';
import { createSim, ST, DT, FOOD_KINDS } from './sim.js';
import { L } from './layout.js';
import { Sound } from './sound.js';

const $ = id => document.getElementById(id);
const s2l = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };

// ---------- geometry helpers ----------------------------------------------------
function geoFrom(parts, xf) {
  let nv = 0, ni = 0; for (const p of parts) { nv += p.pos.length / 3; ni += p.idx.length; }
  const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), col = new Float32Array(nv * 3), idx = new Uint32Array(ni);
  let ov = 0, oi = 0;
  for (const p of parts) {
    pos.set(p.pos, ov * 3); nrm.set(p.nrm, ov * 3);
    for (let i = 0; i < p.col.length; i++) col[ov * 3 + i] = s2l(p.col[i]);
    for (let i = 0; i < p.idx.length; i++) idx[oi + i] = p.idx[i] + ov;
    ov += p.pos.length / 3; oi += p.idx.length;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(new THREE.BufferAttribute(idx, 1));
  if (xf) g.applyMatrix4(xf);
  return g;
}
const modelGeo = (name, xf) => geoFrom(Object.values(ASSETS[name]), xf);
const colorGeo = (g, hex) => { const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
function mergeGeos(list) {
  const parts = list.map(g => { const ng = g.index ? g.toNonIndexed() : g; return ng; });
  let n = 0; for (const g of parts) n += g.attributes.position.count;
  const out = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'color']) { const a = new Float32Array(n * 3); let o = 0; for (const g of parts) { a.set(g.attributes[k].array, o); o += g.attributes[k].array.length; } out.setAttribute(k, new THREE.BufferAttribute(a, 3)); }
  return out;
}
const boxGeo = (w, h, d, x, y, z, hex) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return colorGeo(g, hex); };

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
  scene.add(new THREE.HemisphereLight('#eef7ff', '#b9a27c', 1.3));
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
  const leafGeo = geoFrom([ASSETS.gate.gate], new THREE.Matrix4().makeTranslation(0.15, 0.05, 0.465)).scale(3.15, 1, 1); // hinge at x=0
  const postGeo = mergeGeos([boxGeo(0.06, 0.38, 0.06, 0, 0.19, 0, '#c7835a')]);
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
  // open gates: posts at both ends, leaf swung back against the fence
  const posts = []; for (const e of byKind.gate) for (const s of [-1, 1]) posts.push({ e, s });
  instanced(postGeo, posts, ({ e, s }, m) => edgeM(e, m, new THREE.Matrix4().makeTranslation(s * 0.47, 0, 0)));
  instanced(leafGeo, byKind.gate, (e, m) => {
    const side = ((Math.round(e.x * 7 + e.z * 3) % 2) + 2) % 2 ? 1 : -1;
    const hinge = new THREE.Matrix4().makeTranslation(side * 0.46, 0, 0.03 * side);
    const swing = new THREE.Matrix4().makeRotationY(side > 0 ? -0.24 : Math.PI + 0.24);
    return edgeM(e, m, hinge.multiply(swing));
  });

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
  const N = sim.pigs.length;
  // per-pig mud: blotchy noise mask that creeps up from the legs as the level rises
  const mudAttr = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3); mudAttr.setUsage(THREE.DynamicDrawUsage);
  const pigMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  pigMat.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
attribute vec3 aMud; varying vec3 vMudP; varying vec2 vMud;`).replace('#include <begin_vertex>', `#include <begin_vertex>
vMudP = position * 2.3 + vec3(aMud.y * 31.7, aMud.y * 17.3, aMud.y * 7.1);
#ifdef USE_INSTANCING
vec4 mudW = modelMatrix * instanceMatrix * vec4(position, 1.0);
#else
vec4 mudW = modelMatrix * vec4(position, 1.0);
#endif
vMud = vec2(aMud.x, clamp(mudW.y / max(0.05, aMud.z * 1.5), 0.0, 1.0));`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vMudP; varying vec2 vMud;
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
}`);
  };
  for (const g of pigParts) g.setAttribute('aMud', mudAttr);
  const pigMeshes = pigParts.map(g => { const m = new THREE.InstancedMesh(g, pigMat, N); m.castShadow = true; m.receiveShadow = true; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); return m; });
  const animM = pet => Object.fromEntries(Object.entries(ASSETS[pet].anims).map(([k, a]) => [k, { dur: a.dur, frames: a.frames.map(f => f.map(arr => new THREE.Matrix4().fromArray(arr))) }]));
  const PIG_ANIM = animM('pig'), DOG_ANIM = animM('dog');
  const dogGroup = new THREE.Group(); scene.add(dogGroup);
  const dogMeshes = ASSETS.dog.parts.map(p => { const m = new THREE.Mesh(geoFrom([p]), matV); m.castShadow = true; m.matrixAutoUpdate = false; dogGroup.add(m); return m; });
  dogGroup.matrixAutoUpdate = false;

  const tmpA = new THREE.Matrix4(), tmpB = new THREE.Matrix4();
  // sample an animation at time t into out[] (lerp between frames, crossfade with previous)
  function sampleAnim(anims, name, t, partIdx, out) {
    const a = anims[name]; const n = a.frames.length; const f = ((t / a.dur) % 1 + 1) % 1 * n;
    const i0 = Math.floor(f) % n, i1 = (i0 + 1) % n, u = f - Math.floor(f);
    const A = a.frames[i0][partIdx].elements, B = a.frames[i1][partIdx].elements, o = out.elements;
    for (let k = 0; k < 16; k++) o[k] = A[k] + (B[k] - A[k]) * u;
    return out;
  }
  const lerpM = (a, b, u, out) => { const A = a.elements, B = b.elements, o = out.elements; for (let k = 0; k < 16; k++) o[k] = A[k] + (B[k] - A[k]) * u; return out; };
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
    for (const p of sim.pigs) mudAttr.setXYZ(p.i, p.mud, p.seed, p.scale);
    mudAttr.needsUpdate = true;
    for (const m of pigMeshes) m.instanceMatrix.needsUpdate = true;
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
    const m = new THREE.InstancedMesh(g, matV, 16); m.castShadow = true; m.count = 0; scene.add(m); return [k, m];
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
    cam.dist = a < 0.9 ? 52 : 42; cam.tx = a < 0.9 ? 0 : 0; cam.tz = a < 0.9 ? 0 : 2;
  };
  fitCam();
  const applyCam = () => {
    cam.pitch = Math.max(0.28, Math.min(1.48, cam.pitch)); cam.dist = Math.max(6, Math.min(80, cam.dist));
    cam.tx = Math.max(-34, Math.min(34, cam.tx)); cam.tz = Math.max(-30, Math.min(30, cam.tz));
    const cp = Math.cos(cam.pitch);
    camera.position.set(cam.tx + Math.sin(cam.yaw) * cp * cam.dist, Math.sin(cam.pitch) * cam.dist, cam.tz + Math.cos(cam.yaw) * cp * cam.dist);
    camera.lookAt(cam.tx, 0.5, cam.tz);
  };
  const resize = () => { const w = canvas.clientWidth, h = canvas.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.fov = w / h < 0.9 ? 64 : 48; camera.updateProjectionMatrix(); };
  addEventListener('resize', resize); resize(); applyCam();

  // ---------- input -------------------------------------------------------------------
  const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const rayAt = (cx, cy) => { const r = canvas.getBoundingClientRect(); ndc.set((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1); raycaster.setFromCamera(ndc, camera); return raycaster.ray; };
  const planeHit = (ray, y) => { if (Math.abs(ray.direction.y) < 1e-4) return null; const t = (y - ray.origin.y) / ray.direction.y; if (t < 0) return null; return ray.origin.clone().addScaledVector(ray.direction, t); };

  let tool = 'shoo';
  const TOOL_HINT = {
    shoo: 'Drag to send the dog. Pigs scatter from it.',
    feed: 'Tap to toss a snack. Up to 5 at a time.',
    hose: 'Drag to spray. Muddy pigs come for a bath.',
    grab: 'Drag a pig to lift it. Flick to throw.',
    look: 'Drag to look around. Pinch to zoom.',
  };
  const hint = $('hint'); let hintTimer = 0;
  const showHint = (txt, sec = 3.2) => { hint.textContent = txt; hint.classList.add('on'); hintTimer = sec; };
  function setTool(t) {
    tool = t;
    for (const b of document.querySelectorAll('[data-tool]')) b.setAttribute('aria-pressed', b.dataset.tool === t ? 'true' : 'false');
    showHint(TOOL_HINT[t]);
  }
  for (const b of document.querySelectorAll('[data-tool]')) b.addEventListener('click', () => { sound.unlock(); setTool(b.dataset.tool); });
  addEventListener('keydown', e => { const k = { 1: 'shoo', 2: 'feed', 3: 'hose', 4: 'grab', 5: 'look' }[e.key]; if (k) setTool(k); if (e.key === 'b') ringBell(); });

  const pointers = new Map(); let gesture = null, toolActive = false, downInfo = null, lastToss = 0;
  // with a finger the target would be hidden under it, so touch aims a little above the finger
  const TOUCH_LIFT = 80, SPRAY_LIFT = 55; let touch = false;
  const grabAim = { x: 0, y: 0, lift: 0, goal: 0 };
  const sprayY = y => touch ? y - SPRAY_LIFT : y;
  const moveGrabTo = () => { const h = planeHit(rayAt(grabAim.x, grabAim.y - grabAim.lift), 1.7); if (h) sim.moveGrab(h.x, 1.7, h.z); };
  const twoInfo = () => { const [a, b] = [...pointers.values()]; return { cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x) }; };
  function toolDown(x, y, btn) {
    downInfo = { x, y, t: performance.now(), btn };
    if (btn === 2 || tool === 'look') { gesture = { kind: 'orbit', x, y }; return; }
    if (btn === 1) { gesture = { kind: 'pan', x, y }; return; }
    toolActive = true;
    if (tool === 'shoo') { const h = planeHit(rayAt(x, y), 0); if (h) { sim.setDog(h.x, h.z, true); ring.position.set(h.x, 0.04, h.z); ring.visible = true; sound.bark(); } }
    if (tool === 'hose') { const h = planeHit(rayAt(x, sprayY(y)), 0); if (h) { aimHose(h.x, h.z); sound.hose(true); } }
    if (tool === 'grab') {
      const r = rayAt(x, y); const i = sim.pick(r.origin.x, r.origin.y, r.origin.z, r.direction.x, r.direction.y, r.direction.z);
      if (i >= 0) { sim.grab(i); Object.assign(grabAim, { x, y, lift: 0, goal: touch ? TOUCH_LIFT : 0 }); moveGrabTo(); }
      else showHint('Touch a pig to pick it up.', 1.8);
    }
  }
  function toolMove(x, y) {
    if (gesture?.kind === 'orbit') { cam.yaw -= (x - gesture.x) * 0.006; cam.pitch += (y - gesture.y) * 0.005; gesture.x = x; gesture.y = y; return; }
    if (gesture?.kind === 'pan') { panBy(x - gesture.x, y - gesture.y); gesture.x = x; gesture.y = y; return; }
    if (!toolActive) return;
    if (tool === 'shoo') { const h = planeHit(rayAt(x, y), 0); if (h) { sim.setDog(h.x, h.z, true); ring.position.set(h.x, 0.04, h.z); } }
    if (tool === 'hose') { const h = planeHit(rayAt(x, sprayY(y)), 0); if (h) aimHose(h.x, h.z); }
    if (tool === 'grab' && sim.grabbed >= 0) { grabAim.x = x; grabAim.y = y; moveGrabTo(); }
  }
  function toolUp(x, y) {
    const wasTap = downInfo && Math.hypot(x - downInfo.x, y - downInfo.y) < 12 && performance.now() - downInfo.t < 450;
    if (toolActive) {
      if (tool === 'shoo') { sim.setDog(null, null, false); ring.visible = false; }
      if (tool === 'grab') sim.release();
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
    else if (pointers.size === 2) { if (toolActive) toolUp(-1e4, -1e4); toolActive = false; gesture = { kind: 'two', ...twoInfo() }; }
  });
  canvas.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2 && gesture?.kind === 'two') {
      const n = twoInfo();
      cam.dist *= gesture.d / Math.max(10, n.d);
      let da = n.ang - gesture.ang; da = Math.atan2(Math.sin(da), Math.cos(da)); cam.yaw += da;
      panBy(n.cx - gesture.cx, n.cy - gesture.cy);
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

  // ---------- top bar: bell, sound -------------------------------------------------------------
  const ringBell = () => { sim.bell(); sound.bell(); showHint('Dinner time. Every trough is full.', 2.5); };
  $('bell').addEventListener('click', () => { sound.unlock(); ringBell(); });
  $('mute').addEventListener('click', () => { sound.unlock(); sound.muted = !sound.muted; $('mute').setAttribute('aria-pressed', sound.muted ? 'true' : 'false'); $('mute').setAttribute('aria-label', sound.muted ? 'Turn sound on' : 'Turn sound off'); });

  const badge = $('snacks');
  let shownLeft = -1;
  function updateBadge() {
    const left = sim.foodCap - sim.foods.length; if (left === shownLeft) return; shownLeft = left;
    badge.textContent = left; badge.classList.toggle('empty', left === 0);
    document.querySelector('[data-tool="feed"]').setAttribute('aria-label', `Feed, ${left} of ${sim.foodCap} snacks left`);
  }
  updateBadge();

  // ---------- loop ---------------------------------------------------------------------
  let acc = 0, last = performance.now(), frames = 0, paused = false;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (!paused) { acc += dt; let n = 0; while (acc >= DT && n < 4) { sim.step(); acc -= DT; n++; } if (n === 4) acc = 0; }
    for (const ev of sim.events.splice(0)) sound.event(ev, camera);
    if (toolActive && tool === 'grab' && sim.grabbed >= 0 && grabAim.lift !== grabAim.goal) { grabAim.lift = Math.min(grabAim.goal, grabAim.lift + dt * TOUCH_LIFT / 0.18); moveGrabTo(); }
    updatePigs(dt); updateDog(dt); updateHose(dt); updateFoods(); updateBadge(); if ((frames & 7) === 0) updateTroughFood();
    if (ring.visible) { ring.rotation.y += dt; ring.scale.setScalar(1 + 0.08 * Math.sin(now * 0.01)); }
    applyCam(); renderer.render(scene, camera);
    if (hintTimer > 0) { hintTimer -= dt; if (hintTimer <= 0) hint.classList.remove('on'); }
    frames++; requestAnimationFrame(frame);
  }
  $('loading').remove();
  setTool('shoo'); showHint('Drag to send the dog. Two fingers to turn, pan and zoom.', 5);
  requestAnimationFrame(frame);

  // debug hook for scripted checks
  window.piggies = {
    sim, cam, setTool, THREE, camera,
    stepN(n) { for (let i = 0; i < n; i++) sim.step(); },
    pause(v) { paused = v; },
    render() { updatePigs(1 / 60); updateDog(1 / 60); updateFoods(); updateTroughFood(); applyCam(); renderer.render(scene, camera); },
    toolDown, toolMove, toolUp, toss, aimHose, updateHose,
  };
}
main().catch(err => { const l = $('loading'); if (l) l.textContent = 'Could not start: ' + err.message; console.error(err); });
