import * as THREE from 'three';
import { ASSETS, geoFrom } from './gfx.js';
import { splitShared } from './matSplit.js';
import { ROAD_HALF, CORRIDOR, FARM_HALF, MUD_HALF } from '../sim/road.js';
import { YARD_HALF, WASH } from '../sim/track.js';
import { makeGravelTexture, makeGrassTexture, makePlankTexture, makeShingleTexture, makeRockTexture, worldUV } from './textures.js';
import { yardWalls } from '../sim/scenery.js';

const TEX_M = 4; // one texture repeat per 4 m of ground
const FENCE_SY = 1.2 / 0.345; // the Kenney fence piece is 0.345 m high

// Ground mesh (T-17): the terrain grid sampled every 1 m over the farm, plus a flat skirt 60 m past the farm edge.
// Normals come from the grid; each vertex gets a soft grass tint (Pig Pens recipe) and a `rock` weight from its slope.
function buildGround(terrain) {
  const { n: gn, step, heights } = terrain.grid, S = Math.max(1, Math.round(1 / step)), n = Math.floor((gn - 1) / S) + 1, cell = step * S, F = FARM_HALF, SK = 60;
  const h = (i, j) => heights[Math.max(0, Math.min(n - 1, i)) * S * gn + Math.max(0, Math.min(n - 1, j)) * S];
  const pos = [], nrm = [], col = [], rock = [], idx = [], A = new THREE.Color('#ffffff'), B = new THREE.Color('#f2ffe0'), Cc = new THREE.Color('#cfe8c4'), R = new THREE.Color('#f4f1ea'), c = new THREE.Color();
  const vtx = (x, y, z, nx, ny, nz) => {
    const v = Math.sin(x * 0.11 + Math.sin(z * 0.07) * 2) * 0.5 + Math.sin(z * 0.13 + x * 0.05) * 0.5, r = 1 - Math.max(0, Math.min(1, (ny - 0.7) / 0.18)), rw = r * r * (3 - 2 * r);
    c.copy(A).lerp(v > 0 ? B : Cc, Math.abs(v) * 0.6).lerp(R, rw);
    pos.push(x, y, z); nrm.push(nx, ny, nz); col.push(c.r, c.g, c.b); rock.push(rw); return pos.length / 3 - 1;
  };
  const tri = (a, b, d) => { // wind each triangle so it faces up
    const P = k => [pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]], [pa, pb, pd] = [P(a), P(b), P(d)];
    const ny = (pb[2] - pa[2]) * (pd[0] - pa[0]) - (pb[0] - pa[0]) * (pd[2] - pa[2]); idx.push(...(ny >= 0 ? [a, b, d] : [a, d, b]));
  };
  const quad = (a, b, c2, d) => { tri(a, b, c2); tri(a, c2, d); };   // a b c2 d around the quad
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const dx = (h(i + 1, j) - h(i - 1, j)) / (2 * cell), dz = (h(i, j + 1) - h(i, j - 1)) / (2 * cell), l = Math.hypot(dx, 1, dz);
    vtx(-F + i * cell, h(i, j), -F + j * cell, -dx / l, 1 / l, -dz / l);
  }
  for (let i = 0; i + 1 < n; i++) for (let j = 0; j + 1 < n; j++) { const a = i * n + j; idx.push(a, a + 1, a + n, a + n, a + 1, a + n + 1); } // faces up
  // skirt: each edge row pushed straight out at its own height, and the four corner squares
  const L = n - 1;
  for (const [fixI, ox, oz] of [[0, -1, 0], [L, 1, 0], [0, 0, -1], [L, 0, 1]]) {
    for (let k = 0; k < L; k++) {
      const at = m => ox ? [fixI, m] : [m, fixI], [i0, j0] = at(k), [i1, j1] = at(k + 1);
      const e = (i, j, o) => vtx(-F + i * cell + ox * o, h(i, j), -F + j * cell + oz * o, 0, 1, 0);
      quad(e(i0, j0, 0), e(i1, j1, 0), e(i1, j1, SK), e(i0, j0, SK));
    }
  }
  for (const [i, j, sx, sz] of [[0, 0, -1, -1], [L, 0, 1, -1], [0, L, -1, 1], [L, L, 1, 1]]) {
    const x = -F + i * cell, z = -F + j * cell, y = h(i, j), e = (ex, ez) => vtx(x + ex, y, z + ez, 0, 1, 0);
    quad(e(0, 0), e(sx * SK, 0), e(sx * SK, sz * SK), e(0, sz * SK));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('rock', new THREE.Float32BufferAttribute(rock, 1)); g.setIndex(idx);
  return splitGround(g, F);
}

// Split the ground into CHUNKS x CHUNKS meshes over the farm square so frustum culling drops what the camera cannot see.
// Each triangle goes to the chunk holding its centre (the skirt joins its nearest edge chunk). Vertices are copied as they are
// (same positions and normals), so the seams between chunks stay crack-free.
const CHUNKS = 6;
function splitGround(g, F) {
  const P = g.attributes, ix = g.index.array, cs = 2 * F / CHUNKS, buckets = new Map();
  const cell = v => Math.max(0, Math.min(CHUNKS - 1, Math.floor((v + F) / cs)));
  for (let t = 0; t < ix.length; t += 3) {
    let cx = 0, cz = 0; for (let k = 0; k < 3; k++) { cx += P.position.getX(ix[t + k]); cz += P.position.getZ(ix[t + k]); }
    const key = cell(cx / 3) * CHUNKS + cell(cz / 3); if (!buckets.has(key)) buckets.set(key, []); buckets.get(key).push(t);
  }
  const out = [];
  for (const tris of buckets.values()) {
    const remap = new Map(), src = [], idx = [];
    for (const t of tris) for (let k = 0; k < 3; k++) { const v = ix[t + k]; if (!remap.has(v)) { remap.set(v, src.length); src.push(v); } idx.push(remap.get(v)); }
    const c = new THREE.BufferGeometry();
    for (const [name, a] of Object.entries(P)) {
      const sz = a.itemSize, arr = new Float32Array(src.length * sz);
      src.forEach((v, i) => { for (let k = 0; k < sz; k++) arr[i * sz + k] = a.array[v * sz + k]; });
      c.setAttribute(name, new THREE.BufferAttribute(arr, sz));
    }
    c.setIndex(idx); out.push(c);
  }
  g.dispose(); return out;
}

// Lambert with the grass map, blended toward a triplanar rock map by the vertex `rock` weight (steep cut faces).
function groundMaterial(grassMap, anisotropy) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, map: grassMap }), rockMap = makeRockTexture({ anisotropy });
  m.userData.textures = [rockMap]; // freed with the farm (render/dispose.js)
  m.onBeforeCompile = sh => {
    sh.uniforms.rockMap = { value: rockMap };
    sh.vertexShader = 'attribute float rock;\nvarying float vRock;\nvarying vec3 vGP;\nvarying vec3 vGN;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n  vRock = rock; vGP = position; vGN = normal;');
    sh.fragmentShader = 'uniform sampler2D rockMap;\nvarying float vRock;\nvarying vec3 vGP;\nvarying vec3 vGN;\n' + sh.fragmentShader.replace('#include <map_fragment>', `
      vec4 grassC = texture2D( map, vMapUv );
      vec3 tw = pow( abs( normalize( vGN ) ), vec3( 4.0 ) ); tw /= tw.x + tw.y + tw.z;
      vec3 p3 = vGP * 0.33, dx3 = dFdx( p3 ), dy3 = dFdy( p3 ); // gradients outside the branch keep the mip level right
      vec4 rockC = vec4( 1.0 );
      if ( vRock > 0.001 ) { // flat grass skips the three triplanar reads
        rockC = textureGrad( rockMap, p3.zy, dx3.zy, dy3.zy ) * tw.x + textureGrad( rockMap, p3.xz, dx3.xz, dy3.xz ) * tw.y + textureGrad( rockMap, p3.xy, dx3.xy, dy3.xy ) * tw.z;
      }
      diffuseColor *= mix( grassC, rockC, vRock );`);
  };
  return m;
}
export function buildFarm3D(scene, farm, road, terrain, items, props, { anisotropy = 1, trees = null } = {}) {
  const matV = new THREE.MeshLambertMaterial({ vertexColors: true });
  // textured ground materials: the vertex colors tint on top of the tiling texture
  const matGrass = new THREE.MeshLambertMaterial({ vertexColors: true, map: makeGrassTexture({ anisotropy }) });
  const matGravel = new THREE.MeshLambertMaterial({ vertexColors: true, map: makeGravelTexture({ anisotropy, grid: false }) });
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), p3 = new THREE.Vector3(), s3 = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), eul = new THREE.Euler();
  const speckle = (g, a, b) => { const n = g.attributes.position.count, col = new Float32Array(n * 3), A = new THREE.Color(a), B = new THREE.Color(b), c = new THREE.Color(); for (let i = 0; i < n; i++) { c.copy(A).lerp(B, Math.random()); col.set([c.r, c.g, c.b], i * 3); } g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return g; };
  // ground: high and low land with the route cuttings (T-17), one mesh from the terrain grid
  { const mat = groundMaterial(matGrass.map, anisotropy); for (const g of buildGround(terrain)) { worldUV(g, TEX_M * 2); const m = new THREE.Mesh(g, mat); m.receiveShadow = true; scene.add(m); } }
  // farmyard: packed gravel square
  { const g = speckle(new THREE.PlaneGeometry(YARD_HALF * 2, YARD_HALF * 2, 60, 60).rotateX(-Math.PI / 2), '#ffffff', '#ebe3d6'); g.translate(0, 0.015, 0); worldUV(g, TEX_M); const m = new THREE.Mesh(g, matGravel); m.receiveShadow = true; scene.add(m); }
  // ribbons along a route between two signed offsets o0 < o1 from the centerline (open ends meet the yard edge)
  const ribbon = (P, keep, o0, o1, colA, colB, y, mat, texM = TEX_M) => {
    const pos = [], col = [], idx = [], A = new THREE.Color(colA), B = new THREE.Color(colB), c = new THREE.Color(); let open = false;
    for (const p of P) {
      if (!keep(p)) { open = false; continue; }
      for (const o of [o0, o1]) { pos.push(p.x + p.tz * o, y, p.z - p.tx * o); c.copy(A).lerp(B, Math.random()); col.push(c.r, c.g, c.b); }
      const b = pos.length / 3 - 2; if (open) idx.push(b - 2, b, b - 1, b - 1, b, b + 1); open = true;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
    if (mat !== mudMat) worldUV(g, texM);
    const m = new THREE.Mesh(g, mat); m.receiveShadow = true; scene.add(m);
  };
  const mudMat = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 70, specular: '#4a3622' });
  for (const R of road.routes) {
    ribbon(R.pts, () => true, -ROAD_HALF, ROAD_HALF, '#ffffff', '#ebe3d6', 0.02, matGravel);
    for (const [o0, o1] of [[-CORRIDOR, -ROAD_HALF], [ROAD_HALF, CORRIDOR]]) ribbon(R.pts, () => true, o0, o1, '#e2f2cf', '#cfe6bd', 0.018, matGrass, TEX_M * 2); // grass shoulder
    ribbon(R.pts, p => farm.routes[p.r].tiles[p.k].type === 'mud' && Math.abs(p.u - 0.5) < MUD_HALF, -ROAD_HALF, ROAD_HALF, '#7a5233', '#5f3e25', 0.04, mudMat);
  }
  // grey rocks along the crest of the high cuttings (T-17)
  {
    const byRock = new Map(); for (const k of terrain.banks) { if (!byRock.has(k.kind)) byRock.set(k.kind, []); byRock.get(k.kind).push(k); }
    for (const [kind, list] of byRock) {
      const m = new THREE.InstancedMesh(geoFrom(Object.values(ASSETS[kind])), matV, list.length);
      list.forEach((k, i) => m.setMatrixAt(i, mtx.compose(p3.set(k.x, k.y - 0.15 * k.scale, k.z), q.setFromAxisAngle(UP, k.yaw), s3.setScalar(k.scale))));
      m.castShadow = m.receiveShadow = true; scene.add(m);
    }
  }
  // ramps and sprinkler arches on route tiles
  const sprinklers = [];
  farm.routes.forEach((R, r) => R.tiles.forEach((t, k) => {
    const c = road.featureCenter(r, k);
    if (t.type === 'ramp') {
      const s = new THREE.Shape([[-5, 0], [0, 0.6], [1, 0.6], [4, 0]].map(([a, y]) => new THREE.Vector2(a, y)));
      const g = new THREE.ExtrudeGeometry(s, { depth: ROAD_HALF * 2, bevelEnabled: false }); g.translate(0, 0, -ROAD_HALF); g.rotateY(-Math.PI / 2);
      const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: '#c9ad7f' })); m.position.set(c.x, 0, c.z); m.rotation.y = c.yaw; m.castShadow = m.receiveShadow = true; scene.add(m);
    }
    if (t.type === 'sprinkler') {
      const m = new THREE.Mesh(geoFrom(Object.values(ASSETS.sprinkler)), matV); // sprinkler.glb: the arch across the road (x)
      m.position.set(c.x, 0, c.z); m.rotation.y = c.yaw; m.castShadow = true; scene.add(m); sprinklers.push({ mesh: m, ...c });
    }
  }));
  // duck pond in a farmyard corner (T-29, A-5), with a sandy rim
  { const p = farm.pond, rim = new THREE.Mesh(new THREE.CircleGeometry(p.r + 1, 40).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#d9c79c' }));
    const m = new THREE.Mesh(new THREE.CircleGeometry(p.r, 40).rotateX(-Math.PI / 2), new THREE.MeshPhongMaterial({ color: '#5fb4e0', shininess: 90 }));
    rim.position.set(p.x, 0.025, p.z); m.position.set(p.x, 0.035, p.z); rim.receiveShadow = m.receiveShadow = true; scene.add(rim, m); }
  // field scenery: one InstancedMesh per kind
  const byKind = new Map(); for (const it of items) { if (!byKind.has(it.kind)) byKind.set(it.kind, []); byKind.get(it.kind).push(it); }
  for (const [kind, list] of byKind) {
    const m = new THREE.InstancedMesh(geoFrom(Object.values(ASSETS[kind])), matV, list.length);
    list.forEach((it, i) => m.setMatrixAt(i, mtx.compose(p3.set(it.x, it.y, it.z), q.setFromAxisAngle(UP, it.yaw), s3.set(it.scale, it.scale * (it.sy || 1), it.scale))));
    m.castShadow = m.receiveShadow = true; scene.add(m);
  }
  // fences: the route fences on low ground (T-17), the yard (with gate gaps) and the farm edge, all from the Kenney fence
  // piece every 1 m on the ground, stretched to 1.2 m high
  const fenceGeo = geoFrom(Object.values(ASSETS.fence), new THREE.Matrix4().makeTranslation(0, 0.05, 0.465)), segs = [...yardWalls(farm), ...terrain.fences];
  const E = FARM_HALF; segs.push([-E, -E, E, -E], [E, -E, E, E], [E, E, -E, E], [-E, E, -E, -E]);
  const pieces = []; for (const [ax, az, bx, bz] of segs) { const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L)), yaw = Math.atan2(bx - ax, bz - az) - Math.PI / 2; for (let i = 0; i < n; i++) pieces.push([ax + (bx - ax) * (i + 0.5) / n, az + (bz - az) * (i + 0.5) / n, yaw]); }
  { const m = new THREE.InstancedMesh(fenceGeo, matV, pieces.length); pieces.forEach(([x, z, yaw], i) => m.setMatrixAt(i, mtx.compose(p3.set(x, terrain.height(x, z), z), q.setFromAxisAngle(UP, yaw), s3.set(1, FENCE_SY, 1)))); m.castShadow = true; scene.add(m); }
  // gate arches (T-8): gate.glb (x across the opening) at each farmyard gate
  { const g = geoFrom(Object.values(ASSETS.gate));
    for (const [gx, gz] of [[YARD_HALF, 0], [0, YARD_HALF], [-YARD_HALF, 0], [0, -YARD_HALF]]) { const m = new THREE.Mesh(g, matV); m.position.set(gx, 0, gz); m.rotation.y = gx === 0 ? 0 : Math.PI / 2; m.castShadow = true; scene.add(m); } }
  // farmyard wash (T-36): wash.glb's frame, and its brush at each side of the opening; water falls from the canopy like a sprinkler
  const w = farm.yard.wash, brushes = []; let washTop = null;
  if (w) {
    const wg = new THREE.Group(); wg.position.set(w.x, 0, w.z); wg.rotation.y = w.yaw; scene.add(wg);
    const frame = new THREE.Mesh(geoFrom([ASSETS.wash.frame]), matV); frame.castShadow = frame.receiveShadow = true; wg.add(frame);
    washTop = new THREE.Mesh(geoFrom([ASSETS.wash.canopy]), new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true })); washTop.castShadow = true; wg.add(washTop);
    const bg = geoFrom([ASSETS.wash.brush]);
    for (const sd of [-1, 1]) { const m = new THREE.Mesh(bg, matV); m.position.set(sd * (WASH.width + 0.3), 0, 0); m.castShadow = true; wg.add(m); brushes.push(m); }
    sprinklers.push({ x: w.x, z: w.z, yaw: w.yaw, h: WASH.h - 0.2, spread: WASH.width * 2 - 1, depth: WASH.half * 2 - 1 });
  }
  // drive-through barn (T-28); the roof group fades out while the tractor is near (the chase camera looks down through it)
  const b = farm.yard.barn, { group: barn, roofMats, roof } = buildBarn(b, anisotropy, matV); scene.add(barn); const L = b.half;
  // props (T-31): bale.glb, cone.glb and barrel.glb, centered on their bodies
  const propGeo = Object.fromEntries(['bale', 'cone', 'barrel'].map(k => [k, geoFrom(Object.values(ASSETS[k]))]));
  const propMeshes = props.map(p => { const m = new THREE.Mesh(propGeo[p.kind], matV); m.castShadow = true; m.position.set(p.x, 0, p.z); scene.add(m); return m; });
  // trees and bushes (T-34, T-35), one InstancedMesh per look: the oak while a tree stands (wobbling when bumped), the bush, and
  // the cut stump a broken tree leaves; each scales up from 0 while it grows back
  const tList = trees?.list || [], hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  const inst = (model, n) => { const m = new THREE.InstancedMesh(geoFrom(Object.values(ASSETS[model])), matV, Math.max(1, n)); m.castShadow = true; m.count = n; for (let i = 0; i < n; i++) m.setMatrixAt(i, hidden); scene.add(m); return m; };
  const treeOnes = tList.filter(t => t.kind === 'tree'), bushOnes = tList.filter(t => t.kind === 'bush');
  const oaks = inst('oak', treeOnes.length), stumps = inst('stump-cut', treeOnes.length), bushes = inst('shrub', bushOnes.length);
  const TREE_K = 2.6, BUSH_K = 1, BUSH_SY = 1; // model scale: the oak at 2.6 (young trees 1.6, from their scale); shrub.glb is already bush size
  const easeOutBack = u => { const c = 1.70158; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); };
  splitShared(scene, matV); // X-4: no program look-ups between instanced and plain users (render/matSplit.js)
  return {
    sprinklers,
    update(focus) {
      const now = performance.now() / 1000;
      const sway = Math.sin(now * 20) * 6 * Math.PI / 180;
      treeOnes.forEach((t, i) => {
        const g = t.state === 'growing' ? Math.max(0.001, easeOutBack(t.grow)) : 1, k = TREE_K * t.scale * g;
        oaks.setMatrixAt(i, t.state === 'broken' ? hidden : mtx.compose(p3.set(t.x, 0, t.z), q.setFromEuler(eul.set(0, t.yaw, t.wobble * sway)), s3.setScalar(k)));
        stumps.setMatrixAt(i, t.state === 'broken' ? mtx.compose(p3.set(t.x, 0, t.z), q.setFromAxisAngle(UP, t.yaw), s3.setScalar(t.young ? 0.8 : 1.3)) : hidden);
      });
      bushOnes.forEach((t, i) => { const g = t.state === 'growing' ? Math.max(0.001, easeOutBack(t.grow)) : 1, k = BUSH_K * t.scale * g;
        bushes.setMatrixAt(i, t.state === 'broken' ? hidden : mtx.compose(p3.set(t.x, 0, t.z), q.setFromAxisAngle(UP, t.yaw), s3.set(k, k * BUSH_SY, k))); });
      for (const m of [oaks, stumps, bushes]) { m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); }
      if (focus && w) { // the brushes whirl while the tractor is near; the canopy fades while it is close (the chase camera looks down through it)
        const d = Math.hypot(focus.x - w.x, focus.z - w.z); brushes.forEach((m, i) => { m.rotation.y += (i ? -1 : 1) * (d < 15 ? 0.35 : 0.04); });
        const m = washTop.material; m.opacity += ((d < WASH.half + 8 ? 0.15 : 1) - m.opacity) * 0.15; m.depthWrite = m.opacity > 0.9; washTop.castShadow = m.opacity > 0.5;
      }
      if (focus) {
        const a = Math.hypot(focus.x - b.x, focus.z - b.z), o = roofMats[0].opacity + ((a < L + 20 ? 0 : 1) - roofMats[0].opacity) * 0.15;
        for (const m of roofMats) m.opacity = o; roof.visible = o > 0.03; roof.traverse(m => { m.castShadow = o > 0.5; });
      }
       props.forEach((p, i) => { const m = propMeshes[i]; if (!m || !p.body) return; m.position.copy(p.body.translation()); m.quaternion.copy(p.body.rotation()); }); },
  };
}

// The drive-through barn (T-28) from barn.glb, in barn space (+z along the drive-through axis). walls and roof-gables take the
// plank texture, roof-shingles the shingles; the roof-* parts fade while the tractor is near (the chase camera looks down through it).
function buildBarn(b, anisotropy, matV) {
  const group = new THREE.Group(); group.position.set(b.x, 0, b.z); group.rotation.y = b.yaw;
  const planks = makePlankTexture({ anisotropy }), part = n => geoFrom([ASSETS.barn[n]]), fade = m => { m.transparent = true; return m; };
  const solid = new THREE.Mesh(part('walls'), new THREE.MeshLambertMaterial({ map: planks })), trim = new THREE.Mesh(part('trim'), matV);
  solid.castShadow = solid.receiveShadow = trim.castShadow = true; group.add(solid, trim);
  const roof = new THREE.Group(); group.add(roof);
  const shingleMat = fade(new THREE.MeshLambertMaterial({ map: makeShingleTexture({ anisotropy }) })), gableMat = fade(new THREE.MeshLambertMaterial({ map: planks })), roofTrimMat = fade(new THREE.MeshLambertMaterial({ vertexColors: true }));
  roof.add(new THREE.Mesh(part('roof-shingles'), shingleMat), new THREE.Mesh(part('roof-gables'), gableMat), new THREE.Mesh(part('roof-trim'), roofTrimMat));
  roof.traverse(m => { m.castShadow = true; });
  return { group, roof, roofMats: [shingleMat, gableMat, roofTrimMat] };
}
