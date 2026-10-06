import * as THREE from 'three';
import { ASSETS, geoFrom, boxGeo, mergeGeos, colorGeo } from './gfx.js';
import { ROAD_HALF, CORRIDOR, FARM_HALF, MUD_HALF } from '../sim/road.js';
import { YARD_HALF } from '../sim/track.js';
import { makeGravelTexture, makeGrassTexture, makePlankTexture, makeShingleTexture, makeRockTexture, worldUV } from './textures.js';
import { yardWalls, GATE_W } from '../sim/scenery.js';

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
  return g;
}

// Lambert with the grass map, blended toward a triplanar rock map by the vertex `rock` weight (steep cut faces).
function groundMaterial(grassMap, anisotropy) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, map: grassMap }), rockMap = makeRockTexture({ anisotropy });
  m.onBeforeCompile = sh => {
    sh.uniforms.rockMap = { value: rockMap };
    sh.vertexShader = 'attribute float rock;\nvarying float vRock;\nvarying vec3 vGP;\nvarying vec3 vGN;\n' + sh.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\n  vRock = rock; vGP = position; vGN = normal;');
    sh.fragmentShader = 'uniform sampler2D rockMap;\nvarying float vRock;\nvarying vec3 vGP;\nvarying vec3 vGN;\n' + sh.fragmentShader.replace('#include <map_fragment>', `
      vec4 grassC = texture2D( map, vMapUv );
      vec3 tw = pow( abs( normalize( vGN ) ), vec3( 4.0 ) ); tw /= tw.x + tw.y + tw.z;
      vec4 rockC = texture2D( rockMap, vGP.zy * 0.33 ) * tw.x + texture2D( rockMap, vGP.xz * 0.33 ) * tw.y + texture2D( rockMap, vGP.xy * 0.33 ) * tw.z;
      diffuseColor *= mix( grassC, rockC, vRock );`);
  };
  return m;
}
export function buildFarm3D(scene, farm, road, terrain, items, props, { anisotropy = 1, trees = null } = {}) {
  const matV = new THREE.MeshLambertMaterial({ vertexColors: true });
  // textured ground materials: the vertex colors tint on top of the tiling texture
  const matGrass = new THREE.MeshLambertMaterial({ vertexColors: true, map: makeGrassTexture({ anisotropy }) });
  const matGravel = new THREE.MeshLambertMaterial({ vertexColors: true, map: makeGravelTexture({ anisotropy, grid: false }) });
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), p3 = new THREE.Vector3(), s3 = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  const speckle = (g, a, b) => { const n = g.attributes.position.count, col = new Float32Array(n * 3), A = new THREE.Color(a), B = new THREE.Color(b), c = new THREE.Color(); for (let i = 0; i < n; i++) { c.copy(A).lerp(B, Math.random()); col.set([c.r, c.g, c.b], i * 3); } g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return g; };
  // ground: high and low land with the route cuttings (T-17), one mesh from the terrain grid
  { const g = buildGround(terrain); worldUV(g, TEX_M * 2); const m = new THREE.Mesh(g, groundMaterial(matGrass.map, anisotropy)); m.receiveShadow = true; scene.add(m); }
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
      const g = mergeGeos([boxGeo(0.3, 4.2, 0.3, ROAD_HALF + 0.6, 2.1, 0, '#3d7fd1'), boxGeo(0.3, 4.2, 0.3, -ROAD_HALF - 0.6, 2.1, 0, '#3d7fd1'), boxGeo(ROAD_HALF * 2 + 1.5, 0.25, 0.25, 0, 4.2, 0, '#3d7fd1')]);
      const m = new THREE.Mesh(g, matV); m.position.set(c.x, 0, c.z); m.rotation.y = c.yaw; m.castShadow = true; scene.add(m); sprinklers.push({ mesh: m, ...c });
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
    list.forEach((it, i) => m.setMatrixAt(i, mtx.compose(p3.set(it.x, it.y, it.z), q.setFromAxisAngle(UP, it.yaw), s3.setScalar(it.scale))));
    m.castShadow = m.receiveShadow = true; scene.add(m);
  }
  // fences: the route fences on low ground (T-17), the yard (with gate gaps) and the farm edge, all from the Kenney fence
  // piece every 1 m on the ground, stretched to 1.2 m high
  const fenceGeo = geoFrom(Object.values(ASSETS.fence), new THREE.Matrix4().makeTranslation(0, 0.05, 0.465)), segs = [...yardWalls(farm), ...terrain.fences];
  const E = FARM_HALF; segs.push([-E, -E, E, -E], [E, -E, E, E], [E, E, -E, E], [-E, E, -E, -E]);
  const pieces = []; for (const [ax, az, bx, bz] of segs) { const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L)), yaw = Math.atan2(bx - ax, bz - az) - Math.PI / 2; for (let i = 0; i < n; i++) pieces.push([ax + (bx - ax) * (i + 0.5) / n, az + (bz - az) * (i + 0.5) / n, yaw]); }
  { const m = new THREE.InstancedMesh(fenceGeo, matV, pieces.length); pieces.forEach(([x, z, yaw], i) => m.setMatrixAt(i, mtx.compose(p3.set(x, terrain.height(x, z), z), q.setFromAxisAngle(UP, yaw), s3.set(1, FENCE_SY, 1)))); m.castShadow = true; scene.add(m); }
  // gate posts (T-8): two tall wood posts with a cross bar at each farmyard gate
  for (const [gx, gz] of [[YARD_HALF, 0], [0, YARD_HALF], [-YARD_HALF, 0], [0, -YARD_HALF]]) {
    const across = gx === 0 ? [1, 0] : [0, 1], parts = [];
    const o = GATE_W / 2 + 0.2;
    for (const sd of [-1, 1]) parts.push(boxGeo(0.5, 4, 0.5, gx + across[0] * sd * o, 2, gz + across[1] * sd * o, '#8a6240'));
    parts.push(boxGeo(across[0] ? o * 2 + 0.6 : 0.35, 0.35, across[1] ? o * 2 + 0.6 : 0.35, gx, 3.85, gz, '#8a6240'));
    const m = new THREE.Mesh(mergeGeos(parts), matV); m.castShadow = true; scene.add(m);
  }
  // drive-through barn (T-28); the roof group fades out while the tractor is near (the chase camera looks down through it)
  const b = farm.yard.barn, { group: barn, roofMats, roof } = buildBarn(b, anisotropy, matV); scene.add(barn); const L = b.half;
  // props (T-31)
  const PROP_GEO = {
    bale: () => new THREE.CylinderGeometry(0.75, 0.75, 1.2, 20),
    cone: () => mergeGeos([boxGeo(0.5, 0.06, 0.5, 0, -0.32, 0, '#ffffff'), colorGeo(new THREE.ConeGeometry(0.25, 0.7, 16), '#ff7a1a')]),
    barrel: () => new THREE.CylinderGeometry(0.4, 0.4, 1.0, 16),
    post: () => boxGeo(0.3, 2.4, 0.3, 0, 1.2, 0, '#8a6240'),
  };
  const COLORS = { bale: '#e7c45a', cone: '#ff7a1a', barrel: '#a5462f', post: '#8a6240' };
  const propMeshes = props.map(p => {
    const m = new THREE.Mesh(PROP_GEO[p.kind](), p.kind === 'post' || p.kind === 'cone' ? matV : new THREE.MeshLambertMaterial({ color: COLORS[p.kind] }));
    m.castShadow = true; m.position.set(p.x, 0, p.z); scene.add(m); return m;
  });
  // trees (T-34): the oak while standing (wobbling when bumped), scaling up from 0 while growing back, a stump when broken
  const treeViews = (trees?.list || []).map(t => {
    const grp = new THREE.Group(), oak = new THREE.Mesh(geoFrom(Object.values(ASSETS.oak)), matV), k = 1.8 * t.scale;
    oak.scale.setScalar(k); oak.castShadow = true;
    const stump = new THREE.Mesh(mergeGeos([colorGeo(new THREE.CylinderGeometry(0.42, 0.5, 0.5, 14, 1, true).translate(0, 0.25, 0), '#8a6240'), colorGeo(new THREE.CircleGeometry(0.42, 14).rotateX(-Math.PI / 2).translate(0, 0.5, 0), '#e8cf9f'), colorGeo(new THREE.RingGeometry(0.2, 0.3, 14).rotateX(-Math.PI / 2).translate(0, 0.505, 0), '#d2b27a')]), matV);
    stump.scale.setScalar(t.young ? 0.8 : 1.3); stump.castShadow = true; stump.visible = false;
    grp.add(oak, stump); grp.position.set(t.x, 0, t.z); scene.add(grp); return { t, grp, oak, stump };
  });
  const easeOutBack = u => { const c = 1.70158; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); };
  return {
    sprinklers,
    update(focus) {
      const now = performance.now() / 1000;
      for (const { t, grp, oak, stump } of treeViews) {
        const broken = t.state === 'broken'; oak.visible = !broken; stump.visible = broken;
        grp.scale.setScalar(t.state === 'growing' ? Math.max(0.001, easeOutBack(t.grow)) : 1);
        grp.rotation.z = t.wobble * 6 * Math.PI / 180 * Math.sin(now * 20);
      }
      if (focus) {
        const a = Math.hypot(focus.x - b.x, focus.z - b.z), o = roofMats[0].opacity + ((a < L + 20 ? 0 : 1) - roofMats[0].opacity) * 0.15;
        for (const m of roofMats) m.opacity = o; roof.visible = o > 0.03; roof.traverse(m => { m.castShadow = o > 0.5; });
      }
       props.forEach((p, i) => { const m = propMeshes[i]; if (!m || !p.body) return; m.position.copy(p.body.translation()); m.quaternion.copy(p.body.rotation()); }); },
  };
}

// Copy x/y/z of a barn-local geometry into board UVs: u runs along the wall (x or z), v up; one texture repeat per 2 m.
const boardUV = (g, along) => { const p = g.attributes.position, uv = new Float32Array(p.count * 2); for (let i = 0; i < p.count; i++) { uv[i * 2] = (along === 'x' ? p.getX(i) : p.getZ(i)) / 2; uv[i * 2 + 1] = p.getY(i) / 2; } g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g; };
function mergeUV(list) { // position + normal + uv (no color), for the textured barn parts
  const parts = list.map(g => g.index ? g.toNonIndexed() : g), out = new THREE.BufferGeometry();
  for (const [k, n] of [['position', 3], ['normal', 3], ['uv', 2]]) { const a = new Float32Array(parts.reduce((s, g) => s + g.attributes[k].array.length, 0)); let o = 0; for (const g of parts) { a.set(g.attributes[k].array, o); o += g.attributes[k].array.length; } out.setAttribute(k, new THREE.BufferAttribute(a, n)); }
  return out;
}

// A classic red barn in barn-local space (+z along the drive-through axis, +x across), 12 m long and 10 m wide inside,
// walls 5 m high. Solid: board walls, white corner and eave trim, and the door leaves standing open 90 degrees out in line
// with the walls (where the sim puts their colliders). Fading roof group: the gambrel roof, the gables with hay-loft doors,
// and the cupola.
function buildBarn(b, anisotropy, matV) {
  const group = new THREE.Group(); group.position.set(b.x, 0, b.z); group.rotation.y = b.yaw;
  const W = b.width, L = b.half, LEAF = b.leaf, GAP = 0.2, H = 5, WHITE = '#f4f1ea', T60 = Math.tan(Math.PI / 3), T30 = Math.tan(Math.PI / 6);
  const planks = makePlankTexture({ anisotropy }), plankMat = new THREE.MeshLambertMaterial({ map: planks });
  const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  // X-braced white frame on a w x h panel in a plane: 'x' (across the barn) or 'z' (along it), centered at (cx, cy, cz).
  // No two faces may be coplanar (z-fighting): the rails run full width and the stiles butt between them; the two braces
  // are 3 and 6 cm thinner than the frame, so each layer stands at least 1.5 cm off the one below it on both faces.
  const frameX = (along, w, h, cx, cy, cz, t = 0.3, bar = 0.2) => {
    const P = (a, y, len, hh) => along === 'x' ? boxGeo(len, hh, t, cx + a, cy + y, cz) : boxGeo(t, hh, len, cx, cy + y, cz + a);
    const out = [P(0, h / 2 - bar / 2, w, bar), P(0, -h / 2 + bar / 2, w, bar), P(-w / 2 + bar / 2, 0, bar, h - bar * 2), P(w / 2 - bar / 2, 0, bar, h - bar * 2)];
    const iw = w - bar * 2, ih = h - bar * 2, len = Math.hypot(iw, ih), ang = Math.atan2(ih, iw);
    for (const sg of [-1, 1]) {
      const tb = t - (sg > 0 ? 0.03 : 0.06), g = new THREE.BoxGeometry(along === 'x' ? len : tb, bar * 0.9, along === 'x' ? tb : len);
      if (along === 'x') g.rotateZ(sg * ang); else g.rotateX(-sg * ang);
      out.push(colorGeo(g.translate(cx, cy, cz), WHITE));
    }
    return out;
  };
  // solid: board walls and door leaf panels
  const walls = [], leaves = [];
  for (const sx of [-1, 1]) {
    walls.push(boardUV(box(0.4, H, L * 2, sx * W, H / 2, 0), 'z'));
    for (const sz of [-1, 1]) leaves.push(boardUV(box(0.12, 4.3, LEAF - GAP, sx * W, 2.25, sz * (L + (LEAF + GAP) / 2)), 'z')); // a gap from the wall end; top 5 cm below the frame's top face (was coplanar: flicker), bottom 5 cm above its bottom
  }
  const solid = new THREE.Mesh(mergeUV([...walls, ...leaves]), plankMat); solid.castShadow = solid.receiveShadow = true; group.add(solid);
  const trim = [];
  for (const sx of [-1, 1]) {
    trim.push(boxGeo(0.62, 0.44, L * 2 + 0.4, sx * W, H - 0.18, 0, WHITE));                                  // eave band under the roof: its top sits 4 cm above the wall top
    for (const sz of [-1, 1]) {
      trim.push(boxGeo(0.55, H - 0.06, 0.32, sx * W, (H - 0.06) / 2, sz * (L - 0.06), WHITE));                // corner trim: proud of the wall faces, top hidden in the eave band
      trim.push(...frameX('z', LEAF - GAP, 4.4, sx * W, 2.25, sz * (L + (LEAF + GAP) / 2)));                                 // open door leaf: frame and X
    }
  }
  const trimMesh = new THREE.Mesh(mergeGeos(trim), matV); trimMesh.castShadow = true; group.add(trimMesh);

  // fading roof group: gambrel roof (steep ~60 degree lower pitch, ~30 degree upper), gables, loft doors and cupola
  const roof = new THREE.Group(); group.add(roof);
  const fade = m => { m.transparent = true; return m; };
  const shingleMat = fade(new THREE.MeshLambertMaterial({ map: makeShingleTexture({ anisotropy }) })), gableMat = fade(new THREE.MeshLambertMaterial({ map: planks })), roofTrimMat = fade(new THREE.MeshLambertMaterial({ vertexColors: true }));
  const KNEE = 3.5, OVER = 0.45, eaveX = W + 0.2 + OVER;                                                    // profile breaks at |x| = 3.5 m
  const yAt = ax => ax >= KNEE ? H + (W + 0.2 - ax) * T60 : H + (W + 0.2 - KNEE) * T60 + (KNEE - ax) * T30;   // outer roof line at |x|
  const prof = [[-eaveX, yAt(eaveX)], [-KNEE, yAt(KNEE)], [0, yAt(0)], [KNEE, yAt(KNEE)], [eaveX, yAt(eaveX)]], RL = L + 0.6, TH = 0.22;
  const slabs = [];
  for (let i = 0; i < 4; i++) { // alternating slab depths keep the overlapping slab ends off one plane
    const [x0, y0] = prof[i], [x1, y1] = prof[i + 1], len = Math.hypot(x1 - x0, y1 - y0) + 0.12, ang = Math.atan2(y1 - y0, x1 - x0);
    const g = new THREE.BoxGeometry(len, TH, RL * 2 + (i % 2) * 0.06), p = g.attributes.position, uv = new Float32Array(p.count * 2);
    for (let k = 0; k < p.count; k++) { uv[k * 2] = p.getZ(k) / 2; uv[k * 2 + 1] = p.getX(k) / 2; }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.rotateZ(ang).translate((x0 + x1) / 2 - Math.sin(ang) * TH / 2, (y0 + y1) / 2 + Math.cos(ang) * TH / 2, 0); slabs.push(g);
  }
  const ridge = box(0.45, 0.3, RL * 2 + 0.2, 0, yAt(0) + TH, 0); boardUV(ridge, 'z'); slabs.push(ridge);
  const shingles = new THREE.Mesh(mergeUV(slabs), shingleMat); roof.add(shingles);
  const gShape = new THREE.Shape([[-W - 0.2, H], [-KNEE, yAt(KNEE) - 0.05], [0, yAt(0) - 0.05], [KNEE, yAt(KNEE) - 0.05], [W + 0.2, H]].map(([x, y]) => new THREE.Vector2(x, y)));
  const gables = [-1, 1].map(sz => { const g = new THREE.ExtrudeGeometry(gShape, { depth: 0.3, bevelEnabled: false }); g.translate(0, 0, sz * L - 0.15); return boardUV(g, 'x'); });
  roof.add(new THREE.Mesh(mergeUV(gables), gableMat));
  const rt = [], ridgeY = yAt(0) + TH;
  for (const sz of [-1, 1]) {
    const z = sz * (L + 0.2);
    rt.push(boxGeo(W * 2 + 0.7, 0.4, 0.3, 0, H + 0.12, z, WHITE));                                             // header over the drive-through opening
    for (let i = 0; i < 4; i++) {                                                                            // rake trim along the gable edge
      const [x0, y0] = prof[i], [x1, y1] = prof[i + 1], len = Math.hypot(x1 - x0, y1 - y0), ang = Math.atan2(y1 - y0, x1 - x0);
      rt.push(colorGeo(new THREE.BoxGeometry(len, 0.28, 0.2).rotateZ(ang).translate((x0 + x1) / 2, (y0 + y1) / 2 - 0.05, sz * (RL - 0.02 + (i % 2) * 0.04)), WHITE));
    }
    rt.push(boxGeo(2.0, 2.0, 0.08, 0, 7.2, z - sz * 0.02, '#7a2620'));                                      // hay-loft door panel
    rt.push(...frameX('x', 2.4, 2.4, 0, 7.2, z + sz * 0.08, 0.2, 0.18));                                   // its white frame and X brace
  }
  rt.push(boxGeo(1.5, 1.3, 1.5, 0, ridgeY + 0.5, 0, WHITE));                                                 // cupola
  for (const [x, z, w, d] of [[0.79, 0, 0.05, 0.9], [-0.79, 0, 0.05, 0.9], [0, 0.79, 0.9, 0.05], [0, -0.79, 0.9, 0.05]]) rt.push(boxGeo(w, 0.75, d, x, ridgeY + 0.55, z, '#7f7a72')); // louvers
  rt.push(colorGeo(new THREE.ConeGeometry(1.3, 0.95, 4).rotateY(Math.PI / 4).translate(0, ridgeY + 1.57, 0), '#5a2b25'));
  rt.push(boxGeo(0.06, 0.7, 0.06, 0, ridgeY + 2.4, 0, '#3b3b3b'), boxGeo(0.06, 0.06, 0.8, 0, ridgeY + 2.6, 0, '#3b3b3b'));   // weather vane
  roof.add(new THREE.Mesh(mergeGeos(rt), roofTrimMat));
  roof.traverse(m => { m.castShadow = true; });
  return { group, roof, roofMats: [shingleMat, gableMat, roofTrimMat] };
}
