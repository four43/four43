// Visuals for a TrackWorld (spec tracks T-9): terrain in 64 m chunks with three distance LODs and
// skirts, a vertex-coloured road ribbon, instanced marker posts synced to their bodies, and
// start/finish gates, and tall grass tufts scattered on grass verges near the camera.
// Interface shared with PadView: constructor(scene, world), sync(sim),
// dispose(); plus update(camera) so LOD can follow the camera rather than the car.
import * as THREE from 'three';
import { noise2 } from '../gen/noise.js';
import { roadSurfaceAt } from '../gen/surfaces.js';
import { heightAt } from '../gen/terrain.js';
import { rng } from '../gen/rng.js';

const CHUNK = 64;                 // m (grid cells) per chunk side
const LOD_STEP = [1, 2, 4];       // vertex spacing (m) per LOD
const LOD_FAR = [150, 400];       // finer LOD while the chunk is nearer than this
const HYST = 12;                  // m of hysteresis so chunks on a boundary don't flap
const VIS_FAR = 760;              // chunks beyond this are hidden (fog is opaque by 700 m)
const EVICT = [300, 720];         // drop cached LOD 0 / 1 geometry beyond these distances
const SKIRT = 2;                  // m the chunk edges hang down to hide LOD cracks
const DROP = [0, 0.35, 0.9];      // coarse LODs sink under the road so they never poke through it
const ROAD_LIFT = 0.03, HALF = 3.5;
const BUILD_MS = 3;               // per-frame budget for building chunk geometry after the first frame
// Verge cover: scattered per 8 m world cell (deterministic per cell, cached), kept to cells within
// RADIUS of the camera; the instance buffer is only rewritten when the camera changes cell.
// Tufts shrink into the ground between FADE[0] and FADE[1] so the edge of the patch never pops.
const COVER = {
  cell: 8, radius: 52, fade: [36, 50], evict: 120, minD: 5, fullD: 7.5,
  grass: { perCell: 140, h: [0.3, 0.6], w: [0.8, 1.3] },      // ~2.2 tufts/m², knee high
  // Snowbank verges get none: low drift meshes read as plates or rocks; the bumps show anyway.
};
const POST_H = 1.2, POST_W = 0.12, POST_D = 0.09; // matches TrackWorld's box collider

// Theme looks: sky/fog colour, sun angle hint for the renderer, terrain palette.
export const TRACK_LOOK = {
  summer: { sky: 0xa9c3d4, low: false, fog: [150, 700] },
  winter: { sky: 0xc9d6e0, low: true, fog: [150, 700] },
};

const lin = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; }; // sRGB hex -> linear
const ROAD_COL = {
  tarmac: lin('#45484d'), hardpack: lin('#7a5d43'), gravel: lin('#9c8a6c'), packed: lin('#c9ccce'),
  ice: lin('#b4cddc'), snow: lin('#eef2f6'), grass: lin('#5d6b3a'), snowbank: lin('#eef3f8'),
};
// How dark the two wheel tracks are per road surface (1 = invisible).
const RUT = { tarmac: 0.82, hardpack: 0.8, gravel: 0.78, packed: 0.8, ice: 0.94, snow: 0.86 };
const PAL = {
  summer: {
    a: lin('#56653a'), b: lin('#6f6c42'),          // muted green ↔ olive-brown, by large-scale noise
    earth: lin('#6a5843'), rock: lin('#7a766d'),   // steep slopes
    shoulder: lin('#76694f'), slope: [0.95, 0.8],  // ny range over which slope colour takes over
  },
  winter: {
    a: lin('#f6f9fc'), b: lin('#dde8f3'),
    earth: lin('#7d7a76'), rock: lin('#5f6266'),
    shoulder: lin('#d2d6da'), slope: [0.86, 0.7],   // snow clings until it's quite steep
  },
};

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix3 = (o, a, b, t) => { o[0] = a[0] + (b[0] - a[0]) * t; o[1] = a[1] + (b[1] - a[1]) * t; o[2] = a[2] + (b[2] - a[2]) * t; return o; };

// Neutral speckle multiplied over the vertex colours: detail up close, fog hides the tiling.
function detailTexture(contrast = 1) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const x = cv.getContext('2d');
  x.fillStyle = '#ececec'; x.fillRect(0, 0, 256, 256);
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 5000; i++) {
    const v = Math.round(236 - contrast * (51 - Math.floor(rnd() * 70)));
    x.fillStyle = `rgb(${v},${v},${v})`; x.globalAlpha = 0.4 + rnd() * 0.5;
    const s = 1 + rnd() * 2.5; x.fillRect(rnd() * 256, rnd() * 256, s, s);
  }
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

function bannerTexture(kind, closed) {
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 128;
  const x = cv.getContext('2d');
  const chequer = (y0, h, sq) => {
    for (let i = 0; i * sq < 1024; i++) for (let j = 0; j * sq < h; j++) {
      x.fillStyle = (i + j) % 2 ? '#111' : '#f4f4f4'; x.fillRect(i * sq, y0 + j * sq, sq, sq);
    }
  };
  if (kind === 'finish') chequer(0, 128, 32);
  else {
    x.fillStyle = '#2f9e44'; x.fillRect(0, 0, 1024, 128);
    if (closed) { chequer(0, 16, 16); chequer(112, 16, 16); }
    x.fillStyle = '#fff'; x.font = 'bold 72px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(closed ? 'START · FINISH' : 'START', 512, 66);
  }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// Merge simple indexed geometries into one with a flat colour per part.
function mergeColoured(parts) {
  let nv = 0, ni = 0;
  for (const { g } of parts) { nv += g.attributes.position.count; ni += g.index.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3), idx = new Uint16Array(ni);
  let ov = 0, oi = 0;
  for (const { g, c } of parts) {
    const p = g.attributes.position, n = g.attributes.normal, k = lin(c);
    pos.set(p.array, ov * 3); nor.set(n.array, ov * 3);
    for (let i = 0; i < p.count; i++) col.set(k, (ov + i) * 3);
    for (let i = 0; i < g.index.count; i++) idx[oi + i] = g.index.array[i] + ov;
    ov += p.count; oi += g.index.count; g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

// Marker post centred on its body origin: a flat box like its collider (round posts rolled away).
function postGeometry() {
  const g = (grow, h, y) => new THREE.BoxGeometry(POST_W + grow, h, POST_D + grow).translate(0, y, 0);
  return mergeColoured([
    { g: g(0, POST_H, 0), c: '#f2f2ee' },
    { g: g(0.008, 0.16, POST_H / 2 - 0.2), c: '#e8541c' },   // reflector band
    { g: g(0.006, 0.03, POST_H / 2 - 0.015), c: '#222' },     // cap
  ]);
}

// Grass tuft: 11 thin tapered blades leaning out from the centre, unit height (scaled per
// instance), dark at the root and light at the tip; normals point up so blades light evenly.
function tuftGeometry() {
  const B = 11, pos = [], col = [], nor = [], idx = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let b = 0; b < B; b++) {
    const a = (b / B) * 2 * Math.PI + rnd() * 0.6, r = 0.04 + rnd() * 0.1, lean = 0.1 + rnd() * 0.3;
    const ca = Math.cos(a), sa = Math.sin(a), hw = 0.03 + rnd() * 0.015, h = 0.6 + rnd() * 0.4;
    const bx = ca * r, bz = sa * r, v = pos.length / 3;
    // Base edge across the blade (perpendicular to its lean), tip leaning outwards.
    pos.push(bx - sa * hw, 0, bz + ca * hw, bx + sa * hw, 0, bz - ca * hw, bx + ca * lean, h, bz + sa * lean);
    col.push(0.75, 0.78, 0.72, 0.75, 0.78, 0.72, 1.25, 1.25, 1.0);
    nor.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
    idx.push(v, v + 1, v + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

export class TrackView {
  constructor(scene, world) {
    this.scene = scene; this.world = world;
    const track = this.track = world.track, T = track.terrain;
    this.theme = track.theme === 'winter' ? 'winter' : 'summer';
    this.look = TRACK_LOOK[this.theme];
    scene.background = new THREE.Color(this.look.sky);
    scene.fog = new THREE.Fog(this.look.sky, ...this.look.fog);
    this.root = new THREE.Group(); scene.add(this.root);
    this.noise = noise2(`${track.seed}|look`);
    // Snow gets a softer speckle so it reads white rather than grey.
    this.detail = detailTexture();
    this.groundDetail = this.theme === 'winter' ? detailTexture(0.45) : this.detail;
    this.textures = [...new Set([this.detail, this.groundDetail])];
    this.materials = [];

    this.roadDist = this.buildRoadDistance();
    this.terrainMat = this.mat(new THREE.MeshStandardMaterial({ vertexColors: true, map: this.groundDetail, roughness: 1, metalness: 0 }));
    // Chunk grid: chunk (cx, cz) spans grid cells cx*64 .. cx*64+64 (clamped to the heightfield).
    this.ncx = Math.ceil((T.nx - 1) / CHUNK); this.ncz = Math.ceil((T.nz - 1) / CHUNK);
    this.chunks = [];
    for (let cz = 0; cz < this.ncz; cz++) for (let cx = 0; cx < this.ncx; cx++) {
      const x0 = T.x0 + cx * CHUNK, z0 = T.z0 + cz * CHUNK;
      this.chunks.push({ cx, cz, x0, z0, x1: x0 + CHUNK, z1: z0 + CHUNK, geo: [null, null, null], lod: -1, mesh: null });
    }
    this.lodIndex = LOD_STEP.map((st) => this.chunkIndex(CHUNK / st + 1));
    this.lastLod = null; this.pending = false; this.camera = null;
    this.stats = { builds: 0, buildMs: 0, lastUpdateMs: 0 };

    this.buildRoad();
    this.buildMarkers();
    this.buildGates();
    this.buildCover();
    this.mtx = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.v = new THREE.Vector3(); this.one = new THREE.Vector3(1, 1, 1);
    // Build what the spawn needs right away (unbudgeted), so the first frame isn't patchy.
    this.updateLod(track.spawn.x, track.spawn.z, Infinity);
  }

  mat(m) { this.materials.push(m); return m; }

  // Distance (dm, capped 25.5 m) from each 1 m grid point to the nearest centreline sample, for
  // the shoulder colour and for sinking coarse LODs under the road. Stamped near the road only.
  buildRoadDistance() {
    const T = this.track.terrain, L = this.track.layout, R = 12;
    const out = new Uint8Array(T.nx * T.nz).fill(255);
    for (let i = 0; i < L.n; i++) {
      const sx = L.x[i] - T.x0, sz = L.z[i] - T.z0;
      const ax = Math.max(0, Math.ceil(sx - R)), bx = Math.min(T.nx - 1, Math.floor(sx + R));
      const az = Math.max(0, Math.ceil(sz - R)), bz = Math.min(T.nz - 1, Math.floor(sz + R));
      for (let iz = az; iz <= bz; iz++) {
        const dz = iz - sz, row = iz * T.nx;
        for (let ix = ax; ix <= bx; ix++) {
          const d = Math.min(255, Math.round(Math.hypot(ix - sx, dz) * 10));
          if (d < out[row + ix]) out[row + ix] = d;
        }
      }
    }
    return out;
  }

  // Shared index for a chunk of n×n vertices plus 4 skirts of n vertices each (outward facing).
  chunkIndex(n) {
    const idx = [];
    for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
      const a = j * n + i, b = a + n, c = a + 1, d = b + 1;
      idx.push(a, b, c, b, d, c);
    }
    // Skirts: edge e(k) and its skirt vertex s(k) = base + k. Edges listed with their outward axis.
    const g = (i, j) => j * n + i;
    const edges = [
      [(k) => g(k, 0), [0, 0, -1], [1, 0, 0]], [(k) => g(k, n - 1), [0, 0, 1], [1, 0, 0]],
      [(k) => g(0, k), [-1, 0, 0], [0, 0, 1]], [(k) => g(n - 1, k), [1, 0, 0], [0, 0, 1]],
    ];
    edges.forEach(([e, out, t], m) => {
      const base = n * n + m * n;
      // Face normal of (e_k, s_k, e_k+1) is (-tz, 0, tx); flip when that points inward.
      const flip = -t[2] * out[0] + t[0] * out[2] < 0;
      for (let k = 0; k < n - 1; k++) {
        const e0 = e(k), e1 = e(k + 1), s0 = base + k, s1 = base + k + 1;
        if (!flip) idx.push(e0, s0, e1, e1, s0, s1); else idx.push(e0, e1, s0, e1, s1, s0);
      }
    });
    return new THREE.BufferAttribute(new Uint16Array(idx), 1);
  }

  buildChunk(ch, lod) {
    const t0 = performance.now();
    const T = this.track.terrain, H = T.heights, nx = T.nx, nz = T.nz, st = LOD_STEP[lod], n = CHUNK / st + 1;
    const P = PAL[this.theme], nse = this.noise, dist = this.roadDist, drop = DROP[lod];
    const nv = n * n + 4 * n;
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
    const hAt = (gx, gz) => H[(gz < 0 ? 0 : gz >= nz ? nz - 1 : gz) * nx + (gx < 0 ? 0 : gx >= nx ? nx - 1 : gx)];
    const dAt = (gx, gz) => dist[(gz < 0 ? 0 : gz >= nz ? nz - 1 : gz) * nx + (gx < 0 ? 0 : gx >= nx ? nx - 1 : gx)] / 10;
    const c = [0, 0, 0], e = [0, 0, 0];
    for (let j = 0, v = 0; j < n; j++) for (let i = 0; i < n; i++, v++) {
      const gx = ch.cx * CHUNK + i * st, gz = ch.cz * CHUNK + j * st;
      const x = T.x0 + gx, z = T.z0 + gz, d = dAt(gx, gz);
      let h = hAt(gx, gz);
      if (drop && d < 7) h -= drop * (1 - smooth(4.5, 7, d));
      pos[v * 3] = x; pos[v * 3 + 1] = h; pos[v * 3 + 2] = z;
      uv[v * 2] = x / 8; uv[v * 2 + 1] = z / 8;
      // Normal from the 1 m grid at this LOD's spacing, so neighbouring chunks agree at edges.
      const dx = (hAt(gx + st, gz) - hAt(gx - st, gz)) / (2 * st), dz = (hAt(gx, gz + st) - hAt(gx, gz - st)) / (2 * st);
      const il = 1 / Math.sqrt(dx * dx + 1 + dz * dz), ny = il;
      nor[v * 3] = -dx * il; nor[v * 3 + 1] = ny; nor[v * 3 + 2] = -dz * il;
      // Colour: two-tone ground by broad noise, fine variation, rock/earth on slopes, road shoulder.
      const big = nse(x / 70, z / 70), fine = nse(x / 6.5, z / 6.5);
      mix3(c, P.a, P.b, 0.5 + 0.6 * big);
      const sl = smooth(P.slope[0], P.slope[1], ny);
      if (sl > 0) { mix3(e, P.earth, P.rock, 0.5 + 0.5 * fine); mix3(c, c, e, sl); }
      if (d < 8) mix3(c, c, P.shoulder, (1 - smooth(4.5, 7, d)) * 0.7);
      const k = 1 + 0.07 * fine;
      col[v * 3] = c[0] * k; col[v * 3 + 1] = c[1] * k; col[v * 3 + 2] = c[2] * k;
    }
    // Skirt vertices: copies of the edge vertices hung SKIRT m lower.
    const edgeV = [(k) => k, (k) => (n - 1) * n + k, (k) => k * n, (k) => k * n + n - 1];
    edgeV.forEach((e, m) => {
      for (let k = 0; k < n; k++) {
        const s = n * n + m * n + k, v = e(k);
        for (let a = 0; a < 3; a++) { pos[s * 3 + a] = pos[v * 3 + a]; nor[s * 3 + a] = nor[v * 3 + a]; col[s * 3 + a] = col[v * 3 + a]; }
        pos[s * 3 + 1] -= SKIRT; uv[s * 2] = uv[v * 2]; uv[s * 2 + 1] = uv[v * 2 + 1];
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(this.lodIndex[lod]);
    geo.computeBoundingSphere();
    ch.geo[lod] = geo;
    this.stats.builds++; this.stats.buildMs += performance.now() - t0;
    return geo;
  }

  // Pick each chunk's LOD from the rectangle distance to (px, pz). Geometry is built lazily: the
  // first call builds everything it needs; later calls spend at most BUILD_MS and let deferred
  // chunks show whatever LOD they already have.
  updateLod(px, pz, budget = BUILD_MS) {
    if (this.lastLod && !this.pending && Math.hypot(px - this.lastLod[0], pz - this.lastLod[1]) < 2) return;
    const t0 = performance.now();
    this.lastLod = [px, pz]; this.pending = false;
    for (const ch of this.chunks) {
      const dx = Math.max(ch.x0 - px, 0, px - ch.x1), dz = Math.max(ch.z0 - pz, 0, pz - ch.z1), d = Math.hypot(dx, dz);
      if (ch.geo[0] && d > EVICT[0]) { if (ch.lod === 0) ch.lod = -1; ch.geo[0].dispose(); ch.geo[0] = null; }
      if (ch.geo[1] && d > EVICT[1]) { if (ch.lod === 1) ch.lod = -1; ch.geo[1].dispose(); ch.geo[1] = null; }
      if (d > VIS_FAR) { if (ch.mesh) ch.mesh.visible = false; continue; }
      let want = d < LOD_FAR[0] ? 0 : d < LOD_FAR[1] ? 1 : 2;
      if (ch.lod >= 0 && ch.lod < want && d < LOD_FAR[ch.lod] + HYST) want = ch.lod; // stay finer a bit
      let lod = want;
      if (!ch.geo[want]) {
        if (performance.now() - t0 < budget) this.buildChunk(ch, want);
        else {
          this.pending = true;
          lod = ch.geo.findIndex((g) => g); // anything already built
          if (lod < 0) lod = 2, this.buildChunk(ch, 2); // never leave a hole; LOD 2 is cheap
        }
      }
      if (!ch.mesh) {
        ch.mesh = new THREE.Mesh(ch.geo[lod], this.terrainMat);
        ch.mesh.receiveShadow = true; ch.mesh.matrixAutoUpdate = false;
        this.root.add(ch.mesh);
      }
      ch.mesh.geometry = ch.geo[lod]; ch.mesh.visible = true; ch.lod = lod;
    }
    this.stats.lastUpdateMs = performance.now() - t0;
  }

  // Road ribbon: 11 vertices across (edges, shoulders of colour, two wheel tracks) per 1 m sample.
  buildRoad() {
    const { layout: L, terrain: T, surfaces } = this.track;
    const D = [HALF, 3.1, 1.15, 0.8, 0.45, 0, -0.45, -0.8, -1.15, -3.1, -HALF];
    const RUTW = [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]; // wheel tracks at ±0.8 m
    const EDGE = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]; // loose edges blend a little to the verge
    const m = D.length, n = L.n, nv = n * m;
    const pos = new Float32Array(nv * 3), col = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
    const shoulder = PAL[this.theme].shoulder;
    const c = [0, 0, 0], e = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      const s = i * L.ds, h = L.heading[i], ch = Math.cos(h), sh = Math.sin(h), tb = Math.tan(T.bank[i]);
      const surf = roadSurfaceAt(surfaces, s);
      mix3(c, ROAD_COL[surf.road] || ROAD_COL.gravel, ROAD_COL[surf.next?.road] || ROAD_COL[surf.road] || ROAD_COL.gravel, surf.t);
      const rut = (RUT[surf.road] ?? 0.85) + ((RUT[surf.next?.road] ?? RUT[surf.road] ?? 0.85) - (RUT[surf.road] ?? 0.85)) * surf.t;
      const vary = 1 + 0.06 * this.noise(L.x[i] / 9, L.z[i] / 9);
      for (let k = 0; k < m; k++) {
        const v = i * m + k, d = D[k];
        pos[v * 3] = L.x[i] + d * ch; pos[v * 3 + 1] = T.road[i] + tb * d + ROAD_LIFT; pos[v * 3 + 2] = L.z[i] - d * sh;
        mix3(e, c, shoulder, EDGE[k] * 0.45);
        const f = vary * (RUTW[k] ? rut : 1) * (1 + 0.04 * this.noise(L.x[i] / 2 + d, L.z[i] / 2));
        col[v * 3] = e[0] * f; col[v * 3 + 1] = e[1] * f; col[v * 3 + 2] = e[2] * f;
        uv[v * 2] = (d + HALF) / 4; uv[v * 2 + 1] = s / 4;
      }
    }
    const idx = [], segs = L.closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const a = i * m, b = ((i + 1) % n) * m;
      for (let k = 0; k < m - 1; k++) idx.push(a + k, a + k + 1, b + k, a + k + 1, b + k + 1, b + k);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(nv > 65535 ? new THREE.BufferAttribute(new Uint32Array(idx), 1) : new THREE.BufferAttribute(new Uint16Array(idx), 1));
    geo.computeVertexNormals(); geo.computeBoundingSphere();
    const mat = this.mat(new THREE.MeshStandardMaterial({
      vertexColors: true, map: this.detail, roughness: 0.92, metalness: 0,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    }));
    this.road = new THREE.Mesh(geo, mat); this.road.receiveShadow = true; this.road.matrixAutoUpdate = false;
    this.root.add(this.road);
  }

  // Markers: one InstancedMesh. Synced to the world's marker props when it has them; otherwise
  // (no physics yet) drawn at the roadside's home positions.
  buildMarkers() {
    this.markerProps = (this.world.props || []).filter((p) => p.kind === 'marker');
    const homes = this.track.roadside.markers;
    const count = this.markerProps.length || homes.length;
    const mat = this.mat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 }));
    const im = this.markers = new THREE.InstancedMesh(postGeometry(), mat, Math.max(1, count));
    im.count = count; im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
    if (!this.markerProps.length) {
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
      homes.forEach((h, i) => im.setMatrixAt(i, m.compose(new THREE.Vector3(h.x, h.y + POST_H / 2, h.z), q.setFromAxisAngle(up, h.yaw), one)));
      im.instanceMatrix.needsUpdate = true;
    }
    this.root.add(im);
  }

  buildGates() {
    const { roadside, terrain: T, layout: L } = this.track;
    const postMat = this.mat(new THREE.MeshStandardMaterial({ color: 0x2b2d31, roughness: 0.6 }));
    const edgeMat = this.mat(new THREE.MeshStandardMaterial({ color: 0xdedede, roughness: 0.7 }));
    const W = 6, TOP = 5.2, BAN = 1.1; // posts at ±6 m like TrackWorld's gate colliders; banner under the top
    for (const g of roadside.gates) {
      const tex = bannerTexture(g.kind, L.closed); this.textures.push(tex);
      // A little self-lit so the banner reads even with the sun behind it.
      const face = this.mat(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.35 }));
      const grp = new THREE.Group();
      const ch = Math.cos(g.yaw), sh = Math.sin(g.yaw);
      const roadY = g.y;
      const postTop = roadY + TOP;
      for (const side of [1, -1]) {
        const x = g.x + side * W * ch, z = g.z - side * W * sh, gy = heightAt(T, x, z);
        const h = postTop - (gy - 1);
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.3, h, 0.3), postMat);
        p.position.set(x, gy - 1 + h / 2, z); p.castShadow = true; grp.add(p);
      }
      const banner = new THREE.Mesh(new THREE.BoxGeometry(2 * W, BAN, 0.12), [edgeMat, edgeMat, edgeMat, edgeMat, face, face]);
      banner.position.set(g.x, postTop - BAN / 2 - 0.1, g.z); banner.rotation.y = g.yaw; banner.castShadow = true;
      grp.add(banner);
      this.root.add(grp);
    }
  }

  // Verge cover: one InstancedMesh per kind (grass tufts so far), filled from cached cells.
  buildCover() {
    this.cover = {}; this.coverCells = new Map(); this.coverAt = null; this.coverTime = { value: 0 };
    const geos = { grass: tuftGeometry() };
    for (const kind of Object.keys(geos)) {
      const cfg = COVER[kind], cap = Math.ceil(cfg.perCell * Math.PI * ((COVER.radius + COVER.cell) / COVER.cell) ** 2);
      const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, side: THREE.DoubleSide });
      const time = this.coverTime;
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = time;
        sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
          vec4 iw = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          transformed *= 1.0 - smoothstep(${COVER.fade[0].toFixed(1)}, ${COVER.fade[1].toFixed(1)}, distance(iw.xz, cameraPosition.xz));
          float ph = iw.x * 0.37 + iw.z * 0.23, hh = transformed.y * transformed.y;
          transformed.x += sin(uTime * 1.7 + ph) * 0.12 * hh;
          transformed.z += sin(uTime * 1.1 + ph * 1.3) * 0.08 * hh;`);
        // Blades are double-sided but lit as facing up from both sides (no black undersides).
        sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>',
          '#include <normal_fragment_begin>\n  normal = normalize(vNormal);');
      };
      m.customProgramCacheKey = () => `cover-${kind}`;
      this.mat(m);
      const im = new THREE.InstancedMesh(geos[kind], m, cap);
      im.count = 0; im.frustumCulled = false; im.receiveShadow = true; im.castShadow = false;
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      this.root.add(im);
      this.cover[kind] = im;
    }
  }

  // Instances for one cover cell: [kind, Float32Array of x, y, z, yaw, width, height, r, g, b].
  coverCell(cx, cz) {
    const key = cx * 65536 + cz;
    let e = this.coverCells.get(key);
    if (e) return e;
    const { terrain: T, locator, surfaces, seed } = this.track, C = COVER.cell;
    const x0 = cx * C, z0 = cz * C;
    // The verge kind is per section (hundreds of metres), so the cell centre decides it.
    const at = locator.locate(x0 + C / 2, z0 + C / 2), r0 = roadSurfaceAt(surfaces, at.s);
    const kind = r0.next && r0.t > 0.5 ? r0.next.verge : r0.verge, cfg = COVER[kind];
    e = { kind, cx, cz, data: null, n: 0 };
    this.coverCells.set(key, e);
    if (!cfg) return e;
    const r = rng(`${seed}|cover|${cx}|${cz}`), out = new Float32Array(cfg.perCell * 9), P = PAL[this.theme], c = [0, 0, 0];
    const dist = this.roadDist;
    let n = 0;
    for (let k = 0; k < cfg.perCell; k++) {
      const x = x0 + r.next() * C, z = z0 + r.next() * C, keep = r.next(), yaw = r.next() * 2 * Math.PI;
      const w = r.range(...cfg.w), h = r.range(...cfg.h), tint = r.range(0.8, 1.15);
      const gx = Math.round(x - T.x0), gz = Math.round(z - T.z0);
      if (gx < 0 || gz < 0 || gx >= T.nx || gz >= T.nz) continue;
      // Coarse distance from the 1 m road-distance grid; exact (locator) only near the road.
      let d = dist[gz * T.nx + gx] / 10;
      if (d < COVER.fullD + 1.5) d = Math.abs(locator.locate(x, z).d);
      if (d < COVER.minD || keep > smooth(COVER.minD, COVER.fullD, d) * 0.98 + 0.02) continue;
      const big = this.noise(x / 70, z / 70);
      mix3(c, P.a, P.b, 0.5 + 0.6 * big);
      const o = n * 9;
      out[o] = x; out[o + 1] = heightAt(T, x, z) - 0.03; out[o + 2] = z; out[o + 3] = yaw; out[o + 4] = w; out[o + 5] = h;
      out[o + 6] = c[0] * tint; out[o + 7] = c[1] * tint; out[o + 8] = c[2] * tint;
      n++;
    }
    e.data = out; e.n = n;
    return e;
  }

  // Refill the cover instances when the focus point changes cell; evict far cached cells.
  updateCover(px, pz) {
    const C = COVER.cell, fcx = Math.floor(px / C), fcz = Math.floor(pz / C);
    if (this.coverAt && this.coverAt[0] === fcx && this.coverAt[1] === fcz) return;
    const t0 = performance.now();
    this.coverAt = [fcx, fcz];
    const R = Math.ceil(COVER.radius / C), counts = {};
    for (const kind in this.cover) counts[kind] = 0;
    for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) {
      // Nearest point of the cell to the focus.
      const dx = Math.max(0, Math.abs(a) - 1) * C, dz = Math.max(0, Math.abs(b) - 1) * C;
      if (dx * dx + dz * dz > COVER.radius ** 2) continue;
      const e = this.coverCell(fcx + a, fcz + b), im = this.cover[e.kind];
      if (!im || !e.n) continue;
      const m = im.instanceMatrix.array, col = im.instanceColor.array, cap = im.instanceMatrix.count;
      for (let k = 0; k < e.n && counts[e.kind] < cap; k++) {
        const o = k * 9, i = counts[e.kind]++, j = i * 16, d = e.data;
        const cy = Math.cos(d[o + 3]), sy = Math.sin(d[o + 3]), w = d[o + 4], h = d[o + 5];
        m[j] = cy * w; m[j + 1] = 0; m[j + 2] = -sy * w; m[j + 3] = 0;
        m[j + 4] = 0; m[j + 5] = h; m[j + 6] = 0; m[j + 7] = 0;
        m[j + 8] = sy * w; m[j + 9] = 0; m[j + 10] = cy * w; m[j + 11] = 0;
        m[j + 12] = d[o]; m[j + 13] = d[o + 1]; m[j + 14] = d[o + 2]; m[j + 15] = 1;
        col[i * 3] = d[o + 6]; col[i * 3 + 1] = d[o + 7]; col[i * 3 + 2] = d[o + 8];
      }
    }
    for (const kind in this.cover) {
      const im = this.cover[kind];
      im.count = counts[kind];
      im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true;
    }
    for (const [key, e] of this.coverCells) {
      if (Math.hypot(e.cx - fcx, e.cz - fcz) * C > COVER.evict) this.coverCells.delete(key);
    }
    this.stats.coverMs = performance.now() - t0;
  }

  // Optional: let LOD follow the render camera (call before sync each frame).
  update(camera) { this.camera = camera; }

  sync(sim) {
    const p = this.camera ? this.camera.position : sim?.car?.body.translation();
    if (p) { this.updateLod(p.x, p.z); this.updateCover(p.x, p.z); }
    this.coverTime.value = performance.now() / 1000;
    const props = this.markerProps;
    if (!props.length) return;
    for (let i = 0; i < props.length; i++) {
      const t = props[i].body.translation(), r = props[i].body.rotation();
      this.q.set(r.x, r.y, r.z, r.w);
      this.markers.setMatrixAt(i, this.mtx.compose(this.v.set(t.x, t.y, t.z), this.q, this.one));
    }
    this.markers.instanceMatrix.needsUpdate = true;
  }

  // Triangles in the visible terrain chunks (before frustum culling) plus road and markers.
  triangles() {
    let t = 0;
    for (const ch of this.chunks) if (ch.mesh?.visible) t += ch.mesh.geometry.index.count / 3;
    const cover = Object.values(this.cover).reduce((a, im) => a + im.count * im.geometry.index.count / 3, 0);
    return { terrain: t, road: this.road.geometry.index.count / 3, markers: this.markers.count * this.markers.geometry.index.count / 3, cover };
  }

  dispose() {
    this.scene.remove(this.root);
    for (const ch of this.chunks) for (const g of ch.geo) g?.dispose();
    this.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    for (const m of this.materials) m.dispose();
    for (const t of this.textures) t.dispose();
    this.chunks = [];
  }
}
