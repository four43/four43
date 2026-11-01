// Shared shapes and colouring for the scenery models (rally-spec R19): chunky pines, leafy broadleaves, bushes, rocks and
// fences, in Art of Rally's faceted look. Every model is one GLB with nodes lod0, lod1 (and lod2) at the same origin; the
// game picks a node by distance. Colours are written as COLOR_0 (linear, per face) so the bake leaves them alone, and every
// material is renamed to `scenery` at bake (game.config.js): one instanced program draws the lot.
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const KIT = `${homedir()}/.claude/skills/glb-author/scripts/kit.mjs`;
export const { model, THREE } = await import(KIT);
export const OUT = fileURLToPath(new URL('../../assets/models/', import.meta.url));

// Deterministic rng per model, so a rebuild writes the same GLB.
export function rng(seed) {
  let s = 0; for (const ch of String(seed)) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
  s = s || 1;
  const next = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return { next, range: (a, b) => a + (b - a) * next(), pick: (a) => a[Math.floor(next() * a.length)] };
}

// Planar UVs in metres (x, z): the kit's convention for every mesh, though the bake drops them (vertex colours only).
export function planarUV(g) {
  const p = g.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i); uv[i * 2 + 1] = p.getZ(i); }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

// One pine tier: a star skirt of `points` branch tips (tips at radius r drooping `droop` below the notches at notch·r), an
// optional mid ring of lumps, the apex at h; a cupped underside up to `cup`·h so the tier reads solid from below.
export function starTier({ r, h, points = 8, notch = 0.7, droop = 0.25, mid = true, cup = 0.3, jitter = 0.08, rand }) {
  const pos = [], idx = [], v = (x, y, z) => (pos.push(x, y, z), pos.length / 3 - 1);
  const J = () => 1 + (rand.next() * 2 - 1) * jitter, ring = [], n = points * 2, a0 = rand.next() * Math.PI;
  for (let k = 0; k < n; k++) {
    const tip = k % 2 === 0, a = a0 + (k / n) * 2 * Math.PI, rr = (tip ? r : r * notch) * J();
    ring.push(v(Math.sin(a) * rr, tip ? -droop * J() : 0, Math.cos(a) * rr));
  }
  const apex = v(0, h, 0), under = v(0, cup * h, 0);
  if (mid) {
    const m = [];
    for (let k = 0; k < points; k++) {
      const a = a0 + ((2 * k + 1) / n) * 2 * Math.PI, rr = r * 0.48 * J();
      m.push(v(Math.sin(a) * rr, h * 0.42 * J(), Math.cos(a) * rr));
    }
    for (let k = 0; k < points; k++) {
      const t0 = ring[2 * k], n1 = ring[2 * k + 1], t1 = ring[(2 * k + 2) % n], m0 = m[k], m1 = m[(k + 1) % points];
      idx.push(t0, n1, m0, n1, t1, m0, m0, t1, m1, m0, m1, apex);
    }
  } else for (let k = 0; k < n; k++) idx.push(ring[k], ring[(k + 1) % n], apex);
  for (let k = 0; k < n; k++) idx.push(ring[(k + 1) % n], ring[k], under);
  return indexed(pos, idx);
}

// A lumpy blob: an icosahedron (detail 0 = 20 faces, 1 = 80) with each vertex pushed in or out, scaled per axis.
export function blob(r, { detail = 1, lump = 0.14, scale = [1, 1, 1], rand }) {
  const g = new THREE.IcosahedronGeometry(r, detail), p = g.attributes.position, seen = new Map();
  for (let i = 0; i < p.count; i++) {
    // Vertices are duplicated per face: share one push per position so the blob stays closed.
    const key = `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
    let f = seen.get(key); if (f === undefined) seen.set(key, f = 1 + (rand.next() * 2 - 1) * lump);
    p.setXYZ(i, p.getX(i) * f * scale[0], p.getY(i) * f * scale[1], p.getZ(i) * f * scale[2]);
  }
  return planarUV(g);
}

function indexed(pos, idx) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return planarUV(g);
}

// Colour rules per material name: (face normal y, rand) => sRGB hex or [r, g, b] 0..1 sRGB, applied per triangle.
// `shade` jitters each face's brightness by ±shade so the facets (the leaves) read.
const lin = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
export function colourFaces(m, rules, { seed = 'faces', shade = 0.08 } = {}) {
  const rand = rng(seed), doc = m.doc, buf = doc.getRoot().listBuffers()[0], n = new THREE.Vector3();
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh(); if (!mesh) continue;
    // "Up" is the world's: a beam's mesh is along its node's local +Y.
    const nm = new THREE.Matrix3().getNormalMatrix(new THREE.Matrix4().fromArray(node.getWorldMatrix()));
    for (const prim of mesh.listPrimitives()) {
      const mat = prim.getMaterial(), rule = rules[mat.getName()];
      const P = prim.getAttribute('POSITION').getArray(), N = prim.getAttribute('NORMAL').getArray(), count = P.length / 3;
      if (prim.getIndices()) throw new Error(`${mesh.getName()}: colourFaces needs flat (unindexed) primitives`);
      const base = mat.getBaseColorFactor().slice(0, 3), c = new Float32Array(count * 3);
      for (let t = 0; t < count; t += 3) {
        const ny = n.set(N[t * 3], N[t * 3 + 1], N[t * 3 + 2]).applyMatrix3(nm).normalize().y;
        const pick = rule ? rule(ny, rand) : null, k = pick ? lin(pick) : base, f = 1 + (rand.next() * 2 - 1) * shade;
        for (let j = 0; j < 3; j++) c.set([Math.min(1, k[0] * f), Math.min(1, k[1] * f), Math.min(1, k[2] * f)], (t + j) * 3);
      }
      prim.setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(c).setBuffer(buf));
    }
  }
  // glTF multiplies COLOR_0 by the factor: white, so the face colours are the colour (the game's material is white too).
  for (const mat of doc.getRoot().listMaterials()) mat.setBaseColorFactor([1, 1, 1, 1]);
}

// Snow settles on faces facing up past `min` (ny), with a soft blue in the creases.
export const snowOn = (min, under) => (ny, r) => (ny > min + r.next() * 0.12 ? (ny > min + 0.25 ? '#f4f7fb' : '#e2e9f2') : under(ny, r));
