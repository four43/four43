// Scenery visuals (rally-spec R19-4, R19-6): trees, bushes and rocks drawn by distance LOD from cached cells, fence
// sections and posts posed from their bodies each frame. Every model (tools/scenery/*.model.mjs) holds nodes lod0, lod1
// (and lod2) at one origin; each node becomes one merged geometry (its face colours are vertex colours) and one engine
// instanced mesh with the `scenery` material.
// LODs cross-fade (R19-6): around each switch distance D the two models share a band D ± W, and each pixel shows one of
// them by a screen-space dither against that instance's own distance to the camera, worked out on the GPU every frame
// (aLod on each LOD geometry holds its window; one program for all). Past the last LOD the model dithers away the same
// way. The CPU only decides which meshes an instance is in: those whose window, widened by the band, its cell can reach
// before the next refill (every REFILL m of camera travel). The shadow pass dithers too.
import * as THREE from 'three';
import { createInstances } from 'lion-hawk/view';
import { SCENERY } from '../gen/scenery.js';
import { SCENERY_MODELS } from '../defs/scenery.js';

// LOD switch distances (m, camera to the instance): lodN up to D[N], hidden past the last; w: half the fade band.
const LOD = {
  pine: { d: [70, 230, 720], w: 14 }, leafy: { d: [70, 230, 720], w: 14 }, bush: { d: [45, 160], w: 10 },
  'rock-a': { d: [60, 320], w: 12 }, 'rock-b': { d: [60, 320], w: 12 }, fence: { d: [90, 400], w: 10 }, post: { d: [90, 400], w: 10 },
};
const SHADOW = 1;        // lods below this cast shadows (lod0 only: the shadow map covers the near field)
const CELL = 16, REFILL = 8, FAR = 1e5;
// How far an instance can be from its cell's centre, plus how far the camera moves before the next refill.
const SLACK = CELL * Math.SQRT1_2 + REFILL * Math.SQRT2;

// The window of each lod: visible from in to out, each edge a band of ±w (made once: the fences read them every frame).
const WINDOWS = Object.fromEntries(Object.entries(LOD).map(([kind, { d, w }]) => [kind, d.map((out, l) => ({ in: l ? d[l - 1] : -FAR, out, w }))]));

// The cross-fade (R19-6), also on the shadow pass (where cameraPosition is the light's: the eye comes from EYE).
export const EYE = { value: new THREE.Vector3() };
const VERT_HEAD = 'attribute vec4 aLod; uniform vec3 uSceneryEye; varying vec2 vLodT;';
const VERT_MAIN = `{
  #ifdef USE_INSTANCING
    float lodD = length( ( modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xz - uSceneryEye.xz );
  #else
    float lodD = length( ( modelMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xz - uSceneryEye.xz );
  #endif
  vLodT = vec2( smoothstep( aLod.x - aLod.z, aLod.x + aLod.z, lodD ), smoothstep( aLod.y - aLod.z, aLod.y + aLod.z, lodD ) );
}`;
// Interleaved gradient noise: the same threshold for both models at a pixel, so they split it and never both draw.
const FRAG_MAIN = `{
  float lodN = fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) );
  if ( lodN >= vLodT.x || lodN < vLodT.y ) discard;
}`;
function fadePatch(sh, inject) {
  sh.uniforms.uSceneryEye = EYE;
  sh.vertexShader = inject(inject(sh.vertexShader, 'common', VERT_HEAD), 'begin_vertex', VERT_MAIN);
  sh.fragmentShader = inject(inject(sh.fragmentShader, 'common', 'varying vec2 vLodT;'), 'clipping_planes_fragment', FRAG_MAIN);
}

// One geometry per LOD node: every mesh under it, flattened to float position/normal/colour in the model's frame.
function lodGeometry(scene, name, win) {
  const node = scene.getObjectByName(name);
  if (!node) return null;
  scene.updateMatrixWorld(true);
  const meshes = []; node.traverse((o) => { if (o.isMesh) meshes.push(o); });
  let n = 0; for (const m of meshes) n += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3).fill(1);
  const v = new THREE.Vector3(), nm = new THREE.Matrix3();
  let o = 0;
  for (const m of meshes) {
    const g = m.geometry, P = g.attributes.position, N = g.attributes.normal, C = g.attributes.color, I = g.index;
    nm.getNormalMatrix(m.matrixWorld);
    const count = I ? I.count : P.count;
    for (let k = 0; k < count; k++, o++) {
      const i = I ? I.getX(k) : k;
      v.fromBufferAttribute(P, i).applyMatrix4(m.matrixWorld); pos[o * 3] = v.x; pos[o * 3 + 1] = v.y; pos[o * 3 + 2] = v.z;
      v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor[o * 3] = v.x; nor[o * 3 + 1] = v.y; nor[o * 3 + 2] = v.z;
      if (C) { col[o * 3] = C.getX(i); col[o * 3 + 1] = C.getY(i); col[o * 3 + 2] = C.getZ(i); }
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const lod = new Float32Array(n * 4); for (let i = 0; i < n; i++) lod.set([win.in, win.out, win.w, 0], i * 4);
  out.setAttribute('aLod', new THREE.BufferAttribute(lod, 4));
  out.computeBoundingSphere();
  return out;
}

export class SceneryView {
  constructor(root, world, kit) {
    const track = world.track, S = track.scenery, theme = track.theme === 'winter' ? 'winter' : 'summer';
    this.models = SCENERY_MODELS[theme];
    const mc = kit.mc;
    this.mat = mc.extend(mc.get('scenery', { instanced: true, vertexColors: true }), 'rally-lod-fade', fadePatch);
    this.depth = mc.depth(this.mat);
    this.inst = {}; // kind -> [lod instances]
    this.at = null; this.ms = 0;
    const statics = S ? [...S.trees, ...S.bushes, ...S.rocks] : [];
    const counts = {}; for (const t of statics) counts[t.kind] = (counts[t.kind] || 0) + 1;
    const props = (world.props || []).filter((p) => p.kind === 'fence' || p.kind === 'post');
    for (const p of props) counts[p.kind] = (counts[p.kind] || 0) + 1;
    for (const kind of Object.keys(counts)) {
      const scene = kit.assets.get(this.models[kind]).scene, lods = [];
      for (let l = 0; l < 3; l++) {
        if (l >= LOD[kind].d.length) break;
        const geo = lodGeometry(scene, `lod${l}`, WINDOWS[kind][l]);
        if (!geo) break;
        const im = createInstances({ geometry: geo, material: this.mat, max: counts[kind], castShadow: l < SHADOW, receiveShadow: true });
        im.mesh.customDepthMaterial = this.depth; // the shadow dithers with the model
        root.add(im.mesh); lods.push(im);
      }
      this.inst[kind] = lods;
    }
    this.cells = this.buildCells(statics);
    this.props = props;
  }

  // Each cell: per kind, a Float32Array of instance matrices (column-major, sunk SINK m and scaled).
  buildCells(statics) {
    const cells = new Map(), m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const lists = new Map();
    for (const t of statics) {
      const cx = Math.floor(t.x / CELL), cz = Math.floor(t.z / CELL), key = cx * 65536 + cz;
      let c = lists.get(key); if (!c) lists.set(key, c = { cx, cz, items: [] });
      c.items.push(t);
    }
    for (const [key, { cx, cz, items }] of lists) {
      const byKind = {};
      for (const t of items) (byKind[t.kind] ??= []).push(t);
      const kinds = {};
      for (const kind in byKind) {
        const a = new Float32Array(byKind[kind].length * 16);
        byKind[kind].forEach((t, i) => {
          p.set(t.x, t.y - SCENERY.sink * (kind.startsWith('rock') ? t.scale : 1), t.z);
          m.compose(p, q.setFromAxisAngle(up, t.yaw), s.setScalar(t.scale)).toArray(a, i * 16);
        });
        kinds[kind] = a;
      }
      cells.set(key, { cx, cz, kinds });
    }
    return cells;
  }

  // Refill the static instances once the camera has moved REFILL m (a step of the REFILL grid): each cell goes into every LOD
  // mesh whose window, widened by its fade band, the cell can reach before the next refill; the shader picks the pixels.
  updateStatic(px, pz) {
    const fx = Math.floor(px / REFILL), fz = Math.floor(pz / REFILL);
    if (this.at && this.at[0] === fx && this.at[1] === fz) return;
    const t0 = performance.now();
    this.at = [fx, fz];
    const cx = (fx + 0.5) * REFILL, cz = (fz + 0.5) * REFILL, n = {};
    for (const kind in this.inst) n[kind] = this.inst[kind].map(() => 0);
    for (const c of this.cells.values()) {
      const d = Math.hypot((c.cx + 0.5) * CELL - cx, (c.cz + 0.5) * CELL - cz), lo = d - SLACK, hi = d + SLACK;
      for (const kind in c.kinds) {
        const lods = this.inst[kind], a = c.kinds[kind];
        for (let l = 0; l < lods.length; l++) {
          const win = WINDOWS[kind][l];
          if (hi < win.in - win.w || lo > win.out + win.w) continue;
          lods[l].mesh.instanceMatrix.array.set(a, n[kind][l] * 16);
          n[kind][l] += a.length / 16;
        }
      }
    }
    for (const kind in this.inst) {
      if (kind === 'fence' || kind === 'post') continue;
      this.inst[kind].forEach((im, l) => { im.mesh.count = n[kind][l]; im.mesh.instanceMatrix.needsUpdate = true; });
    }
    this.ms = performance.now() - t0;
  }

  // Fences and posts: each from its body's pose, in every LOD mesh whose band holds it.
  updateProps(px, pz) {
    if (!this.props.length) return;
    const n = { fence: [0, 0], post: [0, 0] }, sc = { x: 1, y: 1, z: 1 };
    for (const pr of this.props) {
      const xf = pr.e.xf, d = Math.hypot(xf.p.x - px, xf.p.z - pz), lods = this.inst[pr.kind];
      sc.z = pr.kind === 'fence' ? pr.home.len / 3 : 1;
      for (let l = 0; l < lods.length; l++) {
        const win = WINDOWS[pr.kind][l];
        if (d >= win.in - win.w && d <= win.out + win.w) lods[l].set(n[pr.kind][l]++, xf.p, xf.q, sc);
      }
    }
    for (const kind of ['fence', 'post']) (this.inst[kind] || []).forEach((im, l) => { im.count = n[kind][l]; im.commit(); });
  }

  // p: the camera's position (the fade measures from it on the GPU, the shadow pass included).
  update(p) { EYE.value.set(p.x, p.y, p.z); this.updateStatic(p.x, p.z); this.updateProps(p.x, p.z); }

  triangles() {
    let t = 0;
    for (const kind in this.inst) for (const im of this.inst[kind]) t += im.mesh.count * im.mesh.geometry.attributes.position.count / 3;
    return t;
  }
}

