// Loose stones on dirt and gravel (rally spec R10-6): ten random low-poly pebble shapes (2–9 cm), one engine instanced mesh each, scattered
// along the road near the camera. Placement is per 4 m chunk of road (deterministic per chunk, cached), in road space
// (distance along, offset across), so every candidate lands on the road or its shoulder and no locator call is needed.
// Density and size come from the surface's `game.road.pebbles` (defs/materials.js), clustered by noise; the wear lines
// (gen/wear.js, R10-8) sweep their grooves nearly clear and pile the stones on the berms beside them. Stones shrink into
// the road between FADE[0] and FADE[1] from the camera (the compiler's WIND feature with no sway), and the instance
// buffers are only rewritten when the camera has moved MOVE m. Cast no shadows: at a few cm they'd only add shadow-map cost.
import * as THREE from 'three';
import { createInstances } from 'lion-hawk/view';
import MATERIALS from '../defs/materials.js';
import { rng } from '../gen/rng.js';
import { noise2 } from '../gen/noise.js';
import { roadSurfaceAt } from '../gen/surfaces.js';
import { groove } from '../gen/wear.js';

const PEB = {
  shapes: 10, chunk: 4, radius: 34, fade: [20, 31], move: 1.5, evict: 90,
  shoulder: 1.2,  // m past the edge that stones spill onto, thinning out
  cap: 6000,      // instances per shape
  sink: 0.25,     // share of a stone's height below the road
};

// Per road surface: { road, shoulder (per m²), size: [min, max] radius (m), color (linear) } or absent.
const CFG = {};
for (const key of ['tarmac', 'hardpack', 'gravel', 'packed', 'ice']) {
  const p = MATERIALS.get(`rally-${key}`).game.road?.pebbles;
  if (p) CFG[key] = { ...p, color: new THREE.Color(p.color) };
}

// A pebble: a jittered ring of 5–7 points on the ground and one apex (or a two-point ridge) above it, unit radius,
// flat-shaded (non-indexed, face normals) with a little shade per face so the facets read as chips. 5–9 triangles.
function pebbleGeometry(r) {
  const n = 5 + Math.floor(r.next() * 3), ring = [], a0 = r.next() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const a = a0 + (i + (r.next() - 0.5) * 0.6) * (2 * Math.PI / n), rad = 0.75 + r.next() * 0.35;
    ring.push([Math.cos(a) * rad, 0, Math.sin(a) * rad]);
  }
  const h = 0.55 + r.next() * 0.4, ax = (r.next() - 0.5) * 0.4, az = (r.next() - 0.5) * 0.4;
  const ridge = r.next() < 0.5, da = r.next() * Math.PI, dx = Math.cos(da) * 0.3, dz = Math.sin(da) * 0.3;
  const A = [ax - (ridge ? dx : 0), h, az - (ridge ? dz : 0)], B = ridge ? [ax + dx, h * (0.85 + r.next() * 0.15), az + dz] : A;
  const tris = [];
  const apexOf = (p) => !ridge || (p[0] - ax) * dx + (p[2] - az) * dz < 0 ? A : B;
  for (let i = 0; i < n; i++) {
    const p = ring[i], q = ring[(i + 1) % n], m = [(p[0] + q[0]) / 2, 0, (p[2] + q[2]) / 2];
    const ap = apexOf(m), aq = apexOf(ring[(i + 2) % n].map((v, k) => (q[k] + v) / 2));
    tris.push([p, q, ap]);
    if (ridge && ap !== aq) tris.push([q, aq, ap]); // where the ridge's two faces meet over q
  }
  const pos = [], col = [], c = [0, h / 3, 0];
  for (const t of tris) {
    // wind outwards: the face normal points away from the stone's middle
    const e1 = t[1].map((v, k) => v - t[0][k]), e2 = t[2].map((v, k) => v - t[0][k]);
    const nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
    const mid = [0, 1, 2].map(k => (t[0][k] + t[1][k] + t[2][k]) / 3 - c[k]);
    const v = nx * mid[0] + ny * mid[1] + nz * mid[2] < 0 ? [t[0], t[2], t[1]] : t;
    const shade = 0.85 + r.next() * 0.25;
    for (const p of v) { pos.push(...p); col.push(shade, shade, shade); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class Pebbles {
  // root: the group to add the meshes to; track: the generated track; mc: the material compiler; lift: the ribbon's lift
  constructor(root, track, mc, lift) {
    this.track = track; this.lift = lift;
    const L = track.layout;
    this.noise = noise2(`${track.seed}|pebbles`);
    this.chunks = new Map(); this.at = null; this.count = 0;
    this.nChunks = Math.ceil(L.n * L.ds / PEB.chunk);
    const r = rng('rally-pebbles'); // the same ten shapes on every track
    const mat = mc.get('rally-pebble', { instanced: true, vertexColors: true, wind: { fade: PEB.fade, amp: [0, 0] } });
    // in front of the road where they touch it: the road is pulled forward (polygonOffset -2/-4) over the terrain, and
    // would swallow a 1 cm stone otherwise (rally-pebble's only user)
    mat.polygonOffset = true; mat.polygonOffsetFactor = -2; mat.polygonOffsetUnits = -10;
    this.meshes = Array.from({ length: PEB.shapes }, () => {
      const im = createInstances({ geometry: pebbleGeometry(r), material: mat, max: PEB.cap, colors: true, castShadow: false, receiveShadow: true }).mesh;
      root.add(im);
      return im;
    });
    // chunk centres, for the distance test
    this.cx = new Float32Array(this.nChunks); this.cz = new Float32Array(this.nChunks);
    for (let c = 0; c < this.nChunks; c++) { const i = Math.min(L.n - 1, Math.round((c + 0.5) * PEB.chunk / L.ds)); this.cx[c] = L.x[i]; this.cz[c] = L.z[i]; }
  }

  // Stones for one chunk: { n, m: Float32Array(n·16) matrices, c: Float32Array(n·3) colours, s: Uint8Array(n) shapes }.
  chunk(ci) {
    let e = this.chunks.get(ci);
    if (e) return e;
    const { layout: L, terrain: T, surfaces, edges, wear, seed } = this.track, r = rng(`${seed}|peb|${ci}`);
    const s0 = ci * PEB.chunk, mid = roadSurfaceAt(surfaces, s0 + PEB.chunk / 2);
    const top = Math.max(...[mid.road, mid.next?.road].map(k => CFG[k] ? Math.max(CFG[k].road, CFG[k].shoulder) : 0));
    e = { n: 0, m: null, c: null, s: null, ci };
    this.chunks.set(ci, e);
    if (!top) return e;
    const i0 = Math.min(L.n - 1, Math.floor(s0 / L.ds)), wide = Math.max(edges.left[i0], edges.right[i0]) + PEB.shoulder;
    const tries = Math.ceil(top * PEB.chunk * 2 * wide), m = new Float32Array(tries * 16), c = new Float32Array(tries * 3), sh = new Uint8Array(tries);
    let n = 0;
    for (let k = 0; k < tries; k++) {
      const s = s0 + r.next() * PEB.chunk, d = (r.next() * 2 - 1) * wide, keep = r.next(), shape = Math.floor(r.next() * PEB.shapes);
      const u = r.next(), sx = 0.8 + r.next() * 0.4, sz = 0.8 + r.next() * 0.4, sy = 0.6 + r.next() * 0.4, yaw = r.next() * 2 * Math.PI, tint = r.next();
      const f = s / L.ds, i = Math.floor(f) % L.n, t = f - Math.floor(f), i1 = L.closed ? (i + 1) % L.n : i + 1;
      if (i1 >= L.n) continue;
      const at = roadSurfaceAt(surfaces, s), key = at.next && r.next() < at.t ? at.next.road : at.road, cfg = CFG[key];
      if (!cfg) continue;
      const lerp = (a) => a[i] + (a[i1] - a[i]) * t, hw = lerp(d >= 0 ? edges.left : edges.right);
      const out = Math.abs(d) - hw;
      const dens = out <= 0 ? cfg.road : out < PEB.shoulder ? cfg.shoulder * (1 - out / PEB.shoulder) : 0;
      // clusters: thin patches and thick drifts along the road; swept out of the wear lines, piled beside them
      const [g1, b1] = groove(d, lerp(wear.c1), lerp(wear.a1), 0.5), [g2, b2] = groove(d, lerp(wear.c2), lerp(wear.a2), 0.5); // the marks' band
      const g = Math.min(1, g1 + g2) * 0.6, b = Math.min(1, b1 + b2) * (1 - g) * 0.5;
      const cl = (0.25 + 0.75 * smooth(-0.5, 0.6, this.noise(s / 6, d / 3))) * (1 - 0.9 * g) * (1 + 1.5 * b); // above 1 on a berm: as dense as the chunk allows
      if (keep > dens / top * cl) continue;
      const rad = cfg.size[0] * (cfg.size[1] / cfg.size[0]) ** (u ** 1.4); // mostly small, the odd big one
      const h = L.heading[i], ch = Math.cos(h), shh = Math.sin(h), bank = Math.tan(lerp(T.bank));
      const x = lerp(L.x) + d * ch, z = lerp(L.z) - d * shh;
      const y = lerp(T.road) + bank * d + this.lift - PEB.sink * 0.6 * rad * sy;
      const cy = Math.cos(yaw), sny = Math.sin(yaw), w = rad * sx, l = rad * sz, j = n * 16;
      m[j] = cy * w; m[j + 1] = 0; m[j + 2] = -sny * w; m[j + 3] = 0;
      m[j + 4] = 0; m[j + 5] = rad * sy; m[j + 6] = 0; m[j + 7] = 0;
      m[j + 8] = sny * l; m[j + 9] = 0; m[j + 10] = cy * l; m[j + 11] = 0;
      m[j + 12] = x; m[j + 13] = y; m[j + 14] = z; m[j + 15] = 1;
      const v = 0.45 + tint * 0.9, warm = (tint - 0.5) * 0.1; // lighter and darker stones, some a touch warmer
      c[n * 3] = cfg.color.r * v * (1 + warm); c[n * 3 + 1] = cfg.color.g * v; c[n * 3 + 2] = cfg.color.b * v * (1 - warm);
      sh[n] = shape; n++;
    }
    e.n = n; e.m = m; e.c = c; e.s = sh;
    return e;
  }

  // Refill the instance buffers from the chunks near (px, pz) once the camera has moved; evict far cached chunks.
  update(px, pz) {
    if (this.at && Math.hypot(px - this.at[0], pz - this.at[1]) < PEB.move) return;
    this.at = [px, pz];
    const counts = new Array(PEB.shapes).fill(0), R2 = (PEB.radius + PEB.chunk) ** 2;
    for (let ci = 0; ci < this.nChunks; ci++) {
      const dx = this.cx[ci] - px, dz = this.cz[ci] - pz;
      if (dx * dx + dz * dz > R2) continue;
      const e = this.chunk(ci);
      for (let k = 0; k < e.n; k++) {
        const s = e.s[k], im = this.meshes[s], i = counts[s];
        if (i >= PEB.cap) continue;
        counts[s]++;
        im.instanceMatrix.array.set(e.m.subarray(k * 16, k * 16 + 16), i * 16);
        im.instanceColor.array.set(e.c.subarray(k * 3, k * 3 + 3), i * 3);
      }
    }
    this.count = 0;
    this.meshes.forEach((im, s) => { im.count = counts[s]; this.count += counts[s]; im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; });
    for (const [ci, e] of this.chunks) {
      if (Math.hypot(this.cx[ci] - px, this.cz[ci] - pz) > PEB.evict) this.chunks.delete(ci);
    }
  }

  triangles() { return this.meshes.reduce((a, im) => a + im.count * im.geometry.attributes.position.count / 3, 0); }
}
