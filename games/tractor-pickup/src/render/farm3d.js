import * as THREE from 'three';
import { ASSETS, geoFrom, boxGeo, mergeGeos, colorGeo } from './gfx.js';
import { ROAD_HALF, FARM_HALF } from '../sim/road.js';
import { YARD_HALF } from '../sim/track.js';
import { makeGravelTexture, makeGrassTexture, worldUV } from './textures.js';
import { yardWalls, paddockWalls } from '../sim/scenery.js';

const TEX_M = 4; // one texture repeat per 4 m of ground
export function buildFarm3D(scene, farm, road, items, props, { anisotropy = 1 } = {}) {
  const matV = new THREE.MeshLambertMaterial({ vertexColors: true });
  // textured ground materials: the vertex colors tint on top of the tiling texture
  const matGrass = new THREE.MeshLambertMaterial({ vertexColors: true, map: makeGrassTexture({ anisotropy }) });
  const matGravel = new THREE.MeshLambertMaterial({ vertexColors: true, map: makeGravelTexture({ anisotropy, grid: false }) });
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), p3 = new THREE.Vector3(), s3 = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  const speckle = (g, a, b) => { const n = g.attributes.position.count, col = new Float32Array(n * 3), A = new THREE.Color(a), B = new THREE.Color(b), c = new THREE.Color(); for (let i = 0; i < n; i++) { c.copy(A).lerp(B, Math.random()); col.set([c.r, c.g, c.b], i * 3); } g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return g; };
  // grass ground with soft color variation (Pig Pens recipe)
  {
    const g = new THREE.PlaneGeometry(FARM_HALF * 2 + 120, FARM_HALF * 2 + 120, 140, 140).rotateX(-Math.PI / 2);
    const n = g.attributes.position.count, col = new Float32Array(n * 3), A = new THREE.Color('#ffffff'), B = new THREE.Color('#f2ffe0'), Cc = new THREE.Color('#cfe8c4'), c = new THREE.Color();
    for (let i = 0; i < n; i++) { const x = g.attributes.position.getX(i), z = g.attributes.position.getZ(i); const v = Math.sin(x * 0.11 + Math.sin(z * 0.07) * 2) * 0.5 + Math.sin(z * 0.13 + x * 0.05) * 0.5; c.copy(A).lerp(v > 0 ? B : Cc, Math.abs(v) * 0.6); col.set([c.r, c.g, c.b], i * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); worldUV(g, TEX_M * 2); const m = new THREE.Mesh(g, matGrass); m.receiveShadow = true; scene.add(m);
  }
  // farmyard: packed gravel square
  { const g = speckle(new THREE.PlaneGeometry(YARD_HALF * 2, YARD_HALF * 2, 60, 60).rotateX(-Math.PI / 2), '#ffffff', '#ebe3d6'); g.translate(0, 0.015, 0); worldUV(g, TEX_M); const m = new THREE.Mesh(g, matGravel); m.receiveShadow = true; scene.add(m); }
  // road ribbons (one per route; open ends meet the yard edge)
  const ribbon = (P, keep, colA, colB, y, mat) => {
    const pos = [], col = [], idx = [], A = new THREE.Color(colA), B = new THREE.Color(colB), c = new THREE.Color(); let open = false;
    for (const p of P) {
      if (!keep(p)) { open = false; continue; }
      for (const sd of [-1, 1]) { pos.push(p.x + p.tz * sd * ROAD_HALF, y, p.z - p.tx * sd * ROAD_HALF); c.copy(A).lerp(B, Math.random()); col.push(c.r, c.g, c.b); }
      const b = pos.length / 3 - 2; if (open) idx.push(b - 2, b, b - 1, b - 1, b, b + 1); open = true;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
    if (!mat) worldUV(g, TEX_M);
    const m = new THREE.Mesh(g, mat || matGravel); m.receiveShadow = true; scene.add(m);
  };
  const mudMat = new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 70, specular: '#4a3622' });
  for (const R of road.routes) {
    ribbon(R.pts, () => true, '#ffffff', '#ebe3d6', 0.02);
    ribbon(R.pts, p => farm.routes[p.r].tiles[p.k].type === 'mud' && Math.abs(p.u - 0.5) * 20 < 7, '#7a5233', '#5f3e25', 0.04, mudMat);
  }
  // ramps and sprinkler arches on route tiles
  const sprinklers = [];
  farm.routes.forEach((R, r) => R.tiles.forEach((t, k) => {
    const c = road.featureCenter(r, k);
    if (t.type === 'ramp') {
      const s = new THREE.Shape([[-5, 0], [0, 0.6], [1, 0.6], [4, 0]].map(([a, y]) => new THREE.Vector2(a, y)));
      const g = new THREE.ExtrudeGeometry(s, { depth: 7, bevelEnabled: false }); g.translate(0, 0, -3.5); g.rotateY(-Math.PI / 2);
      const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: '#c9ad7f' })); m.position.set(c.x, 0, c.z); m.rotation.y = c.yaw; m.castShadow = m.receiveShadow = true; scene.add(m);
    }
    if (t.type === 'sprinkler') {
      const g = mergeGeos([boxGeo(0.3, 4.2, 0.3, ROAD_HALF + 0.6, 2.1, 0, '#3d7fd1'), boxGeo(0.3, 4.2, 0.3, -ROAD_HALF - 0.6, 2.1, 0, '#3d7fd1'), boxGeo(ROAD_HALF * 2 + 1.5, 0.25, 0.25, 0, 4.2, 0, '#3d7fd1')]);
      const m = new THREE.Mesh(g, matV); m.position.set(c.x, 0, c.z); m.rotation.y = c.yaw; m.castShadow = true; scene.add(m); sprinklers.push({ mesh: m, ...c });
    }
  }));
  // pond
  { const p = farm.pond, m = new THREE.Mesh(new THREE.CircleGeometry(p.r, 40).rotateX(-Math.PI / 2), new THREE.MeshPhongMaterial({ color: '#5fb4e0', shininess: 90 })); m.position.set(p.x, 0.03, p.z); scene.add(m); }
  // field scenery: one InstancedMesh per kind
  const byKind = new Map(); for (const it of items) { if (!byKind.has(it.kind)) byKind.set(it.kind, []); byKind.get(it.kind).push(it); }
  for (const [kind, list] of byKind) {
    const m = new THREE.InstancedMesh(geoFrom(Object.values(ASSETS[kind])), matV, list.length);
    list.forEach((it, i) => m.setMatrixAt(i, mtx.compose(p3.set(it.x, 0, it.z), q.setFromAxisAngle(UP, it.yaw), s3.setScalar(it.scale))));
    m.castShadow = m.receiveShadow = true; scene.add(m);
  }
  // fences: farm edge, yard (with gate gaps) and paddock, all from the Kenney fence piece every 1 m
  const fenceGeo = geoFrom(Object.values(ASSETS.fence), new THREE.Matrix4().makeTranslation(0, 0.05, 0.465)), segs = [...yardWalls(farm), ...paddockWalls(farm)];
  const E = FARM_HALF; segs.push([-E, -E, E, -E], [E, -E, E, E], [E, E, -E, E], [-E, E, -E, -E]);
  const pieces = []; for (const [ax, az, bx, bz] of segs) { const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L)), yaw = Math.atan2(bx - ax, bz - az) - Math.PI / 2; for (let i = 0; i < n; i++) pieces.push([ax + (bx - ax) * (i + 0.5) / n, az + (bz - az) * (i + 0.5) / n, yaw]); }
  { const m = new THREE.InstancedMesh(fenceGeo, matV, pieces.length); pieces.forEach(([x, z, yaw], i) => m.setMatrixAt(i, mtx.compose(p3.set(x, 0, z), q.setFromAxisAngle(UP, yaw), s3.setScalar(1)))); m.castShadow = true; scene.add(m); }
  // gate posts (T-8): two tall wood posts with a cross bar at each farmyard gate
  for (const [gx, gz] of [[YARD_HALF, 0], [0, YARD_HALF], [-YARD_HALF, 0], [0, -YARD_HALF]]) {
    const across = gx === 0 ? [1, 0] : [0, 1], parts = [];
    for (const sd of [-1, 1]) parts.push(boxGeo(0.4, 3.2, 0.4, gx + across[0] * sd * 4.2, 1.6, gz + across[1] * sd * 4.2, '#8a6240'));
    parts.push(boxGeo(across[0] ? 8.8 : 0.3, 0.3, across[1] ? 8.8 : 0.3, gx, 3.1, gz, '#8a6240'));
    const m = new THREE.Mesh(mergeGeos(parts), matV); m.castShadow = true; scene.add(m);
  }
  // drive-through barn (T-28): red walls along the axis, a roof, open at both ends
  const b = farm.yard.barn, barn = new THREE.Group(); barn.position.set(b.x, 0, b.z); barn.rotation.y = b.yaw; scene.add(barn);
  const Wd = b.width, L = b.half;
  barn.add(new THREE.Mesh(mergeGeos([boxGeo(0.4, 5, L * 2, Wd, 2.5, 0, '#b8322a'), boxGeo(0.4, 5, L * 2, -Wd, 2.5, 0, '#b8322a')]), matV));
  // roof and gables are their own mesh so they fade out while the tractor is in the barn (the chase camera looks down through them)
  const roofMat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true });
  const roof = new THREE.Mesh(mergeGeos([
    boxGeo(Wd * 2 + 0.8, 0.4, L * 2 + 0.4, 0, 5.2, 0, '#7b2a22'),
    boxGeo(Wd * 2 + 0.8, 2.2, 0.4, 0, 6.4, L, '#b8322a'), boxGeo(Wd * 2 + 0.8, 2.2, 0.4, 0, 6.4, -L, '#b8322a'),
    boxGeo(1.2, 1.2, 0.1, 0, 6.4, L + 0.25, '#ffffff'), boxGeo(1.2, 1.2, 0.1, 0, 6.4, -L - 0.25, '#ffffff'),
  ]), roofMat); roof.castShadow = true; barn.add(roof);
  // stage: low wood platform (T-29)
  { const s = farm.yard.stage, m = new THREE.Mesh(boxGeo(s.x1 - s.x0, s.y, s.z1 - s.z0, (s.x0 + s.x1) / 2, s.y / 2, (s.z0 + s.z1) / 2, '#b9874f'), matV); m.receiveShadow = m.castShadow = true; scene.add(m); }
  // props (T-31)
  const PROP_GEO = {
    bale: () => new THREE.CylinderGeometry(0.75, 0.75, 1.2, 20),
    cone: () => mergeGeos([boxGeo(0.5, 0.06, 0.5, 0, -0.32, 0, '#ffffff'), colorGeo(new THREE.ConeGeometry(0.25, 0.7, 16), '#ff7a1a')]),
    barrel: () => new THREE.CylinderGeometry(0.4, 0.4, 1.0, 16),
    post: () => boxGeo(0.3, 2.4, 0.3, 0, 1.2, 0, '#8a6240'),
  };
  const COLORS = { bale: '#e7c45a', cone: '#ff7a1a', barrel: '#a5462f', post: '#8a6240' };
  const propMeshes = props.map(p => {
    if (p.kind === 'tree') { const m = new THREE.Mesh(geoFrom(Object.values(ASSETS.oak)), matV); m.position.set(p.x, 0, p.z); m.scale.setScalar(1.8); m.castShadow = true; scene.add(m); return null; }
    const m = new THREE.Mesh(PROP_GEO[p.kind](), p.kind === 'post' || p.kind === 'cone' ? matV : new THREE.MeshLambertMaterial({ color: COLORS[p.kind] }));
    m.castShadow = true; m.position.set(p.x, 0, p.z); scene.add(m); return m;
  });
  return {
    sprinklers,
    update(focus) {
      if (focus) { const a = Math.hypot(focus.x - b.x, focus.z - b.z); roofMat.opacity += ((a < L + 20 ? 0 : 1) - roofMat.opacity) * 0.15; roof.visible = roofMat.opacity > 0.03; roof.castShadow = roofMat.opacity > 0.5; }
       props.forEach((p, i) => { const m = propMeshes[i]; if (!m || !p.body) return; m.position.copy(p.body.translation()); m.quaternion.copy(p.body.rotation()); }); },
  };
}
