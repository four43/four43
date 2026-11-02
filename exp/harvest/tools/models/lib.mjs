// Shared helpers for Harvest's glb-author model scripts (tools/models/*.model.mjs).
//
// Harvest's bake (palette 'vertex') reads baseColorFactor as Kenney's kits store it: sRGB numbers, which it then linearises.
// So the factor written must hold the colour's sRGB values. m.material linearises a hex colour, so hand it the hex that
// linearises to those values (sRGB-encode each channel once more); the baked vertex colour is then the hex given here.
const enc = c => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
export const kenney = hex => '#' + [1, 3, 5].map(i => Math.round(255 * enc(parseInt(hex.slice(i, i + 2), 16) / 255)).toString(16).padStart(2, '0')).join('');

// The glb-author kit, by absolute path (the skill lives outside the repo).
export const KIT = '/home/smiller/.claude/skills/glb-author/scripts/kit.mjs';
const { THREE } = await import(KIT);
const { mergeGeometries } = await import('/home/smiller/.claude/skills/glb-author/node_modules/three/examples/jsm/utils/BufferGeometryUtils.js');
export { THREE };
const D2R = Math.PI / 180;

// Where a model script writes its GLB: assets/models/custom/<name>.glb
export const out = name => new URL(`../../assets/models/custom/${name}.glb`, import.meta.url).pathname;

// Planar UVs in metres (1 UV unit = 1 m), projected along each triangle's dominant normal axis: for hand-built meshes.
export function planarUV(g) {
  const P = g.attributes.position, uv = new Float32Array(P.count * 2);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let t = 0; t < P.count; t += 3) {
    a.fromBufferAttribute(P, t); b.fromBufferAttribute(P, t + 1); c.fromBufferAttribute(P, t + 2);
    const n = b.clone().sub(a).cross(c.clone().sub(a)), ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    for (let k = 0; k < 3; k++) {
      const x = P.getX(t + k), y = P.getY(t + k), z = P.getZ(t + k);
      const [u, v] = ax >= ay && ax >= az ? [z, y] : ay >= az ? [x, z] : [x, y];
      uv[(t + k) * 2] = u; uv[(t + k) * 2 + 1] = v;
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

// Hand-built triangle soup. quad/tri take an `out` hint: a direction the face should look along, or a function of the face
// centre giving one, so winding comes out right without counting vertex order by hand.
export class Soup {
  constructor() { this.p = []; }
  tri(a, b, c, out) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), C = new THREE.Vector3(...c);
    const n = B.clone().sub(A).cross(C.clone().sub(A));
    if (n.lengthSq() < 1e-14) return this;
    const centre = A.clone().add(B).add(C).divideScalar(3);
    const want = new THREE.Vector3(...(typeof out === 'function' ? out(centre.toArray()) : out));
    this.p.push(...(n.dot(want) >= 0 ? [a, b, c] : [a, c, b]).flat());
    return this;
  }
  quad(a, b, c, d, out) { // a-b-c-d around the edge, either way round
    const ctr = [0, 1, 2].map(i => (a[i] + b[i] + c[i] + d[i]) / 4);
    const o = typeof out === 'function' ? out(ctr) : out;
    return this.tri(a, b, c, o).tri(a, c, d, o);
  }
  both(a, b, c, d) { // a two-faced sheet (leaves, petals): both windings, so it shows from either side without doubleSided
    const n = new THREE.Vector3(...b).sub(new THREE.Vector3(...a)).cross(new THREE.Vector3(...c).sub(new THREE.Vector3(...a))).toArray();
    const m = n.map(x => -x);
    if (d) { this.quad(a, b, c, d, n); this.quad(a, b, c, d, m); } else { this.tri(a, b, c, n); this.tri(a, b, c, m); }
    return this;
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.p), 3));
    g.computeVertexNormals();
    return planarUV(g);
  }
}

// A closed convex loft through axis-aligned rectangles [y, halfX, halfZ] (bottom to top), capped at both ends; a ring with
// half 0 is a point. Faces look away from the shape's centroid. Grain heaps, hoppers' outer shells, tapered blocks.
export function loft(rings, { bottom = true, top = true } = {}) {
  const s = new Soup(), ctr = [0, (rings[0][0] + rings.at(-1)[0]) / 2, 0];
  const away = p => p.map((v, i) => v - ctr[i]);
  const corners = ([y, hx, hz]) => [[hx, y, hz], [-hx, y, hz], [-hx, y, -hz], [hx, y, -hz]];
  for (let i = 0; i + 1 < rings.length; i++) {
    const A = corners(rings[i]), B = corners(rings[i + 1]);
    for (let k = 0; k < 4; k++) { const k1 = (k + 1) % 4; s.quad(A[k], A[k1], B[k1], B[k], away); }
  }
  if (bottom && rings[0][1] > 0) { const c = corners(rings[0]); s.quad(...c, [0, -1, 0]); }
  if (top && rings.at(-1)[1] > 0) { const c = corners(rings.at(-1)); s.quad(...c, [0, 1, 0]); }
  return s.geometry();
}

// An open-top bin with walls of thickness t: outer rectangle (bhx, bhz) at y 0 flaring to (thx, thz) at y h. Inner walls are
// the outer ones moved in by t; the inside floor sits at y = t. Grain tanks and hoppers.
export function bin({ bhx, bhz, thx, thz, h, t }) {
  const s = new Soup();
  const R = (y, hx, hz) => [[hx, y, hz], [-hx, y, hz], [-hx, y, -hz], [hx, y, -hz]];
  const fl = (a, b) => a + (b - a) * (t / h); // half-extent at the inner floor height
  const ob = R(0, bhx, bhz), ot = R(h, thx, thz), it = R(h, thx - t, thz - t), ib = R(t, fl(bhx, thx) - t, fl(bhz, thz) - t);
  const outward = p => [p[0], 0, p[2]], inward = p => [-p[0], 0, -p[2]];
  for (let k = 0; k < 4; k++) {
    const k1 = (k + 1) % 4;
    s.quad(ob[k], ob[k1], ot[k1], ot[k], outward);       // outer wall
    s.quad(ot[k], ot[k1], it[k1], it[k], [0, 1, 0]);     // rim
    s.quad(it[k], it[k1], ib[k1], ib[k], inward);        // inner wall
  }
  s.quad(...ib, [0, 1, 0]);                              // inside floor
  s.quad(...ob, [0, -1, 0]);                             // underside
  return s.geometry();
}

// Several kit shapes placed and merged into one geometry: [{ geo, at:[x,y,z], rot:[deg] }]. Use with part(..., { anchor:'none' })
// so many small pieces (rungs, lugs, bats) make one node instead of dozens.
export function merge(pieces) {
  const gs = pieces.map(({ geo, at = [0, 0, 0], rot = [0, 0, 0], scale }) => {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (scale) g.scale(...(typeof scale === 'number' ? [scale, scale, scale] : scale));
    g.applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0] * D2R, rot[1] * D2R, rot[2] * D2R)));
    g.translate(...at);
    return g;
  });
  return mergeGeometries(gs);
}

// Fold other mesh nodes' primitives into one node's mesh (all built at the same node transform), then drop the others:
// one node, one mesh, a primitive per material. For crops the game instances by the name `crop`.
export function joinInto(m, target, others) {
  const mesh = m.node(target).getMesh();
  for (const nm of others) {
    const n = m.node(nm), om = n.getMesh();
    for (const p of om.listPrimitives()) { om.removePrimitive(p); mesh.addPrimitive(p); }
    om.dispose(); n.dispose();
  }
}

// A side profile [[z, y], ...] extruded across x from x0 to x1 (bodies, shields, gables seen from the side).
export const extrudeX = (m, profile, x0, x1) => m.extrude(profile, x1 - x0).rotateY(-Math.PI / 2).translate(x1, 0, 0);

// A chunky lugged tyre on a hub node (axle along X): tyre body, lugs alternating side to side (one points straight down so
// the tread, not the tyre body, touches the ground at radius r), a rim and a hub cap. Parts are <what>_<id>.
export function wheel(m, id, { x, y, z, r }, { width, lugs, mat }) {
  const hub = m.group(`wheel_${id}`, { at: [x, y, z] });
  const lugH = r * 0.13, rb = r - lugH * 0.8, lugW = width * 0.62, lugD = Math.max(0.09, 2 * Math.PI * r / lugs * 0.42);
  m.part(`tyre_${id}`, m.cyl(rb, rb, width, 16), { parent: hub, geoRot: [0, 0, 90], material: mat.tyre });
  const pieces = [];
  for (let i = 0; i < lugs; i++) {
    const th = 2 * Math.PI * i / lugs, rho = r - lugH / 2, ox = (i % 2 ? 1 : -1) * (width - lugW) / 2;
    pieces.push({ geo: m.box(lugW, lugH, lugD), at: [ox, -rho * Math.cos(th), -rho * Math.sin(th)], rot: [th * 180 / Math.PI, 0, 0] });
  }
  m.part(`tread_${id}`, merge(pieces), { parent: hub, anchor: 'none', material: mat.tyre });
  m.part(`rim_${id}`, m.cyl(r * 0.52, r * 0.52, width + 0.03, 12), { parent: hub, geoRot: [0, 0, 90], material: mat.rim });
  m.part(`hubcap_${id}`, m.cyl(r * 0.18, r * 0.22, width + 0.09, 8), { parent: hub, geoRot: [0, 0, 90], material: mat.metal });
  // one off-centre bolt per side makes the spin readable
  m.part(`bolt_${id}`, m.box(width + 0.05, r * 0.1, r * 0.1), { parent: hub, at: [0, r * 0.34, 0], material: mat.metal });
  return hub;
}

// ---- crop building blocks on a Soup (low-tri prisms; every face points away from its own axis)
// ring: n points of radius r round (cx, y, cz), starting at angle a0 (degrees, about +Y)
export const ring = (cx, y, cz, r, n, a0 = 0) => Array.from({ length: n }, (_, i) => {
  const a = (a0 + 360 * i / n) * Math.PI / 180; return [cx + r * Math.sin(a), y, cz + r * Math.cos(a)];
});
// side walls between two rings of the same count (a tapered prism with no caps)
export function tube(s, A, B) {
  const ax = A.reduce((p, q) => p.map((v, i) => v + q[i] / A.length), [0, 0, 0]);
  const bx = B.reduce((p, q) => p.map((v, i) => v + q[i] / B.length), [0, 0, 0]);
  for (let k = 0; k < A.length; k++) {
    const k1 = (k + 1) % A.length;
    s.quad(A[k], A[k1], B[k1], B[k], c => { const t = Math.max(0, Math.min(1, (c[1] - ax[1]) / ((bx[1] - ax[1]) || 1))); return [c[0] - (ax[0] + (bx[0] - ax[0]) * t), 0, c[2] - (ax[2] + (bx[2] - ax[2]) * t)]; });
  }
  return s;
}
// a cone from a ring to an apex point, faces looking away from the ring's centre
export function fan(s, A, apex) {
  const ax = A.reduce((p, q) => p.map((v, i) => v + q[i] / A.length), [0, 0, 0]);
  for (let k = 0; k < A.length; k++) s.tri(A[k], A[(k + 1) % A.length], apex, c => c.map((v, i) => v - ax[i]));
  return s;
}
