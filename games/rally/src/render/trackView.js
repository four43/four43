// Visuals for a TrackWorld (spec tracks T-9): the terrain through lion-hawk's terrain mesh (64 m chunks, three distance
// LODs, skirts), a procedurally shaded road ribbon (render/roadSurface.js, R10), instanced marker posts drawn from the transform pool, start/finish gates,
// and tall grass tufts scattered on grass verges near the camera. Every material comes from the engine's compiler.
// Interface shared with PadView: constructor(scene, world, kit), sync(sim), dispose(); plus update(camera) so LOD
// can follow the camera rather than the car.
import * as THREE from 'three';
import { createInstances } from 'lion-hawk/view';
import { createTerrainMesh } from 'lion-hawk/kits/terrain/view';
import { noise2 } from '../gen/noise.js';
import { roadSurfaceAt } from '../gen/surfaces.js';
import { heightAt } from '../gen/terrain.js';
import { rng } from '../gen/rng.js';
import { ROAD_SURFACES, surfaceSlot, roadMaterial, groundMaterial, setSky, setGround } from './roadSurface.js';
import { VERGE } from '../gen/surfaces.js';
import { EDGE, edgeAt } from '../gen/edges.js';
import { Pebbles } from './pebbles.js';

const DROP = [0, 0.35, 0.9];      // coarse LODs sink under the road ribbon so they never poke through it
const ROAD_LIFT = 0.03;
// Road ribbon vertices across: from the left flat shoulder's end to the right's (each side's edge + EDGE.shoulder, R12), so
// the shader draws the road's edge and its spill onto the ground; ≤ 0.5 m apart, so it follows the road bumps (R11) in
// the 1 m heightfield.
const ACROSS = 1 + Math.ceil(2 * (EDGE.max + EDGE.shoulder) / 0.5);
// Verge cover: scattered per 8 m world cell (deterministic per cell, cached), kept to cells within
// RADIUS of the camera; the instance buffer is only rewritten when the camera changes cell.
// Tufts shrink into the ground between FADE[0] and FADE[1] so the edge of the patch never pops.
const COVER = {
  cell: 8, radius: 52, fade: [36, 50], evict: 120, minD: 5, fullD: 7.5,
  grass: { perCell: 140, h: [0.3, 0.6], w: [0.8, 1.3] },      // ~2.2 tufts/m², knee high
  // Snowbank verges get none: low drift meshes read as plates or rocks; the bumps show anyway.
};
const POST_H = 1.2, POST_W = 0.12, POST_D = 0.09; // matches TrackWorld's box collider

const lin = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; }; // sRGB hex -> linear
const PAL = {
  summer: {
    a: lin('#445e2e'), b: lin('#66823e'),          // the tufts' greens, by large-scale noise (rally-grass's painted tones, R13)
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

const BANNERS = new Map(); // one per (kind, closed): at most three for the page
const bannerTexture = (kind, closed) => { const k = `${kind}|${closed}`; let t = BANNERS.get(k); if (!t) BANNERS.set(k, t = makeBanner(kind, closed)); return t; };
// The banner face is a little self-lit so it reads even with the sun behind it (emissive = its own colour × 0.35).
const GLOW = (sh, inject) => { sh.fragmentShader = inject(sh.fragmentShader, 'emissivemap_fragment', 'totalEmissiveRadiance += diffuseColor.rgb * 0.35;'); };
function makeBanner(kind, closed) {
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

// Distance (dm, capped 25.5 m) from each 1 m grid point to the nearest centreline sample, for the shoulder colour and for
// sinking coarse LODs under the road, measured as if the road were the standard width: less that side's edge's excess
// over EDGE.half (R12), so the shoulder tint, the sink and the verge cover follow the road's real edge. Near the road only.
export function roadDistance(track) {
  const T = track.terrain, L = track.layout, E = track.edges, R = 12 + EDGE.max - EDGE.half;
  const out = new Uint8Array(T.nx * T.nz).fill(255);
  for (let i = 0; i < L.n; i++) {
    const sx = L.x[i] - T.x0, sz = L.z[i] - T.z0, lx = Math.cos(L.heading[i]), lz = -Math.sin(L.heading[i]); // left normal
    const exL = E.left[i] - EDGE.half, exR = E.right[i] - EDGE.half;
    const ax = Math.max(0, Math.ceil(sx - R)), bx = Math.min(T.nx - 1, Math.floor(sx + R));
    const az = Math.max(0, Math.ceil(sz - R)), bz = Math.min(T.nz - 1, Math.floor(sz + R));
    for (let iz = az; iz <= bz; iz++) {
      const dz = iz - sz, row = iz * T.nx;
      for (let ix = ax; ix <= bx; ix++) {
        const dx = ix - sx, ex = dx * lx + dz * lz >= 0 ? exL : exR;
        const d = Math.min(255, Math.max(0, Math.round((Math.hypot(dx, dz) - ex) * 10)));
        if (d < out[row + ix]) out[row + ix] = d;
      }
    }
  }
  return out;
}

// lion-hawk's terrain mesh with Rally's chunk numbers (3j #9): 64 m chunks, three LODs with hysteresis, skirts, a 3 ms
// build budget, far LOD eviction, and the road sink (coarse LODs sink under the road). colorAt: two-tone
// ground by broad noise, fine variation, earth/rock on slopes (by ny), road shoulder.
export function terrainMeshOptions(track, theme, roadDist, noise) {
  const T = track.terrain, P = PAL[theme], c = [0, 0, 0], e = [0, 0, 0];
  const dAt = (x, z) => { const gx = Math.round(x - T.x0), gz = Math.round(z - T.z0);
    return roadDist[(gz < 0 ? 0 : gz >= T.nz ? T.nz - 1 : gz) * T.nx + (gx < 0 ? 0 : gx >= T.nx ? T.nx - 1 : gx)] / 10; };
  return {
    chunkCells: 64, lods: [1, 2, 4], lodFar: [150, 400], hysteresis: 12, skirt: 2, visFar: 760, evict: [300, 720], budgetMs: 3, moveEps: 2,
    drop: (x, z, lod) => { const d = dAt(x, z); return DROP[lod] && d < 8 ? DROP[lod] * (1 - smooth(5.5, 8, d)) : 0; },
    colorAt(x, z, out, ny) {
      const d = dAt(x, z), big = noise(x / 70, z / 70), fine = noise(x / 6.5, z / 6.5);
      mix3(c, P.a, P.b, 0.5 + 0.6 * big);
      const sl = smooth(P.slope[0], P.slope[1], ny);
      if (sl > 0) { mix3(e, P.earth, P.rock, 0.5 + 0.5 * fine); mix3(c, c, e, sl); }
      if (d < 8) mix3(c, c, P.shoulder, (1 - smooth(4.5, 7, d)) * 0.7);
      const k = 1 + 0.07 * fine;
      out[0] = c[0] * k; out[1] = c[1] * k; out[2] = c[2] * k; return out;
    },
  };
}

export class TrackView {
  constructor(scene, world, kit) {
    this.scene = scene; this.world = world; this.mc = kit.mc;
    const track = this.track = world.track;
    this.theme = track.theme === 'winter' ? 'winter' : 'summer'; // also the light-rig preset (render.js)
    this.root = new THREE.Group(); scene.add(this.root);
    this.noise = noise2(`${track.seed}|look`);
    // The ground's look (R13): the verge's painted palette.
    setGround(VERGE[this.theme]);
    this.roadDist = roadDistance(track);
    this.terrainMat = groundMaterial(this.mc, this.mc.get('rally-ground', { vertexColors: true }));
    this.terrainOpts = terrainMeshOptions(track, this.theme, this.roadDist, this.noise);
    this.terrainMesh = createTerrainMesh(world.terrain, { ...this.terrainOpts, compiler: this.mc, material: this.terrainMat });
    this.root.add(this.terrainMesh.group);
    this.stats = this.terrainMesh.stats;
    this.camera = null;
    this.focus = { position: { x: track.spawn.x, y: 0, z: track.spawn.z } };

    this.buildRoad();
    this.pebbles = new Pebbles(this.root, track, this.mc, ROAD_LIFT);
    this.buildMarkers();
    this.buildGates();
    this.buildCover();
    this.terrainMesh.update(this.focus); // the first update is unbudgeted: the spawn's chunks are there on frame one
  }

  // Road ribbon (R10-2, R11, R12): ACROSS vertices per 1 m sample, between the flat shoulders' ends, on the heightfield. Its vertex colours are the terrain's own
  // (colorAt) and its ground is drawn by the terrain's function, so where the shader draws ground the ribbon meets the
  // terrain without a seam. Per vertex for the shader: aRoad (offset across, distance along), aEdge (the track's
  // half-widths, left and right: the physics edge), the section blend as weights per road surface (aSurfA, aSurfB) and
  // the wear lines (aWear: centre and strength of each pair, R10-8).
  buildRoad() {
    const { layout: L, terrain: T, surfaces, edges, wear } = this.track;
    const m = ACROSS, n = L.n, nv = n * m;
    const pos = new Float32Array(nv * 3), col = new Float32Array(nv * 3), wr = new Float32Array(nv * 4);
    const road = new Float32Array(nv * 2), edge = new Float32Array(nv * 2), surfA = new Float32Array(nv * 4), surfB = new Float32Array(nv);
    const c = [0, 0, 0], wt = new Float32Array(ROAD_SURFACES.length);
    for (let i = 0; i < n; i++) {
      const s = i * L.ds, h = L.heading[i], ch = Math.cos(h), sh = Math.sin(h), ny = Math.cos(T.bank[i]);
      const at = roadSurfaceAt(surfaces, s);
      wt.fill(0); wt[surfaceSlot(at.road)] += 1 - at.t; wt[surfaceSlot(at.next?.road ?? at.road)] += at.t;
      for (let k = 0; k < m; k++) {
        const lo = -(edges.right[i] + EDGE.shoulder), hi = edges.left[i] + EDGE.shoulder;
        const v = i * m + k, d = hi + (lo - hi) * k / (m - 1), x = L.x[i] + d * ch, z = L.z[i] - d * sh;
        pos[v * 3] = x; pos[v * 3 + 1] = heightAt(T, x, z) + ROAD_LIFT; pos[v * 3 + 2] = z; // the heightfield's own triangles: what the wheels ride
        this.terrainOpts.colorAt(x, z, c, ny);
        col[v * 3] = c[0]; col[v * 3 + 1] = c[1]; col[v * 3 + 2] = c[2];
        wr[v * 4] = wear.c1[i]; wr[v * 4 + 1] = wear.a1[i]; wr[v * 4 + 2] = wear.c2[i]; wr[v * 4 + 3] = wear.a2[i];
        road[v * 2] = d; road[v * 2 + 1] = s;
        edge[v * 2] = edges.left[i]; edge[v * 2 + 1] = edges.right[i];
        surfA.set(wt.subarray(0, 4), v * 4); surfB[v] = wt[4];
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
    geo.setAttribute('aRoad', new THREE.BufferAttribute(road, 2));
    geo.setAttribute('aEdge', new THREE.BufferAttribute(edge, 2));
    geo.setAttribute('aSurfA', new THREE.BufferAttribute(surfA, 4));
    geo.setAttribute('aSurfB', new THREE.BufferAttribute(surfB, 1));
    geo.setAttribute('aWear', new THREE.BufferAttribute(wr, 4));
    geo.setIndex(nv > 65535 ? new THREE.BufferAttribute(new Uint32Array(idx), 1) : new THREE.BufferAttribute(new Uint16Array(idx), 1));
    geo.computeVertexNormals(); geo.computeBoundingSphere();
    const mat = roadMaterial(this.mc, this.mc.get('rally-road', { vertexColors: true }));
    mat.polygonOffset = true; mat.polygonOffsetFactor = -2; mat.polygonOffsetUnits = -4; // the road material's only user
    this.road = new THREE.Mesh(geo, mat); this.road.receiveShadow = true; this.road.matrixAutoUpdate = false;
    this.root.add(this.road);
  }

  // Markers: one instanced mesh through the engine, drawn from the world's marker props (their pool poses) when it has
  // them; otherwise (no physics yet) at the roadside's home positions.
  buildMarkers() {
    this.markerProps = (this.world.props || []).filter((p) => p.kind === 'marker');
    const homes = this.track.roadside.markers;
    const count = this.markerProps.length || homes.length;
    const inst = this.markerInst = createInstances({ geometry: postGeometry(), material: this.mc.get('marker', { instanced: true, vertexColors: true }),
      max: Math.max(1, count), castShadow: true, receiveShadow: true });
    inst.count = count;
    this.markers = inst.mesh;
    if (!this.markerProps.length) {
      const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), at = { x: 0, y: 0, z: 0 };
      homes.forEach((h, i) => { at.x = h.x; at.y = h.y + POST_H / 2; at.z = h.z; inst.set(i, at, q.setFromAxisAngle(up, h.yaw), 1); });
      inst.commit();
    }
    this.root.add(inst.mesh);
  }

  buildGates() {
    const { roadside, terrain: T, layout: L } = this.track;
    const postMat = this.mc.get('gate-post'), edgeMat = this.mc.get('gate-banner');
    const W = 6, TOP = 5.2, BAN = 1.1; // posts at ±6 m like TrackWorld's gate colliders; banner under the top
    for (const g of roadside.gates) {
      const face = this.mc.extend(this.mc.get('gate-banner', { map: bannerTexture(g.kind, L.closed) }), 'rally-banner-glow', GLOW);
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

  // Verge cover: one engine instanced mesh per kind (grass tufts so far), filled from cached cells.
  buildCover() {
    this.cover = {}; this.coverCells = new Map(); this.coverAt = null;
    const geos = { grass: tuftGeometry() };
    for (const kind of Object.keys(geos)) {
      const cfg = COVER[kind], cap = Math.ceil(cfg.perCell * Math.PI * ((COVER.radius + COVER.cell) / COVER.cell) ** 2);
      // Tufts sway (height²) and shrink into the ground between COVER.fade radii: the compiler's WIND feature.
      const m = this.mc.get('rally-grass', { instanced: true, vertexColors: true, wind: { fade: COVER.fade, amp: [0.12, 0.08] } });
      const im = createInstances({ geometry: geos[kind], material: m, max: cap, colors: true, castShadow: false, receiveShadow: true }).mesh;
      this.root.add(im); // updateCover writes its matrix and colour arrays in place
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
      if (d < COVER.fullD + 1.5) { const at = locator.locate(x, z); d = Math.abs(at.d) - (edgeAt(this.track.edges, this.track.layout, at.s, at.d) - EDGE.half); }
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
    const p = this.camera ? this.camera.position : sim?.car?.e.xf.p;
    if (this.scene.fog) setSky(this.scene.fog.color); // the light rig sets the fog per look; reflections follow it
    if (p) {
      this.focus.position.x = p.x; this.focus.position.z = p.z;
      this.terrainMesh.update(this.focus); this.updateCover(p.x, p.z); this.pebbles.update(p.x, p.z);
    }
    const props = this.markerProps;
    if (!props.length) return;
    for (let i = 0; i < props.length; i++) { const xf = props[i].e.xf; this.markerInst.set(i, xf.p, xf.q, 1); }
    this.markerInst.commit();
  }

  // Triangles in the visible terrain chunks (before frustum culling) plus road, pebbles, markers and cover.
  triangles() {
    let t = 0;
    for (const m of this.terrainMesh.group.children) if (m.visible) t += m.geometry.index.count / 3;
    const cover = Object.values(this.cover).reduce((a, im) => a + im.count * im.geometry.index.count / 3, 0);
    return { terrain: t, road: this.road.geometry.index.count / 3, pebbles: this.pebbles.triangles(), markers: this.markers.count * this.markers.geometry.index.count / 3, cover };
  }

  // Geometries only: the compiler owns the materials, the page keeps the textures.
  dispose() {
    this.terrainMesh.dispose();
    this.scene.remove(this.root);
    this.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }
}
