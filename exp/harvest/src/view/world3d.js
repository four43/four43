// The farm's 3D (H-L1, H-L2): the painted ground (grass, lanes, the yard and its pads), each field's cell texture and its instanced
// crops, the silo, the barn, the backyard (farmhouse, compost bins, dog house, flower beds), the signs (H-F6), the fence and the trees
// round it. Built once per farm from the sim farm, which it only reads; update() redraws the cells whose growth changed since the
// last frame, greys a field and repaints its sign while it cannot be cut (its vehicle not owned, or its blades too low; H-H6), and
// lifts the barn's roof while the vehicle is in it and the silo bay's while it unloads.
import * as THREE from 'three';
import { disposeTree } from 'lion-hawk/view';
import { modelGeometry } from './geom.js';
import { makeGrassTexture, makeGravelTexture, makeDetailTexture, makeNoiseTexture, blendedGround, worldUV, withDetail } from './textures.js';
import { FARM, FIELDS, YARD, BACKYARD, MEADOW, GATES, FENCES, fenceSegments, SIGNS, ZONES } from '../sim/layout.js';
import { CROP } from '../defs/econ.js';
import { VEHICLES } from '../defs/vehicles.js';

export const SCENERY = ['oak', 'tree', 'treeFat', 'bush', 'bushL', 'rock'];
export const MODELS = ['mower', 'tipcart', 'tractor', 'baletrailer', 'bale', 'combine', 'header', 'cart', 'lawn', 'longgrass', 'clover', 'hay', 'alfalfa', 'wildflowers',
  'wheat', 'corn', 'sunflower', 'silo', 'shed', 'haybarn', 'sign',
  'farmhouse', 'compost', 'doghouse', 'flowerbed', 'gate', 'workbench', 'fence', ...SCENERY];

const hash = (i, j, s = 0) => { let h = Math.imul(i * 73856093 ^ j * 19349663 ^ s * 83492791, 0x9e3779b1); h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; return (h >>> 0) / 4294967296; };

// The ground (H-L2): tiled grass sampled in world space with gravel blended in along the paths (a soft mask drawn from wobbly lines,
// its edge frayed by noise in the shader, after Rally's road edges), a soil border round each grain field, and each zone's pad as its
// own sharp decal. Planes a little apart in height, with polygon offset.
const MASK_BOX = [-100, -160, 160, 100], MASK_PX = 1024; // the mask's ground box [x0, z0, x1, z1] and its size in pixels
// paths: [width m, points [x, z]…]; the yard is a rounded block
const PATHS = [
  [10, [0, 16], [0, 24]], [10, [20, 4], [28, 4]], [10, [-22, 4], [-28, 4]],                 // the yard to the wheat, the corn, the sunflowers
  [7, [0, -18], [0, -30], [-1, -36], [0, -40]],                                             // the yard through the backyard gate
  [5, [0, -40], [0.5, -56], [-0.5, -70.5], [-18, -71]],                                     // the garden path, past the lawn to the porch
  [8.5, [-2, -40], [10, -42], [20, -41], [31, -41]],                                        // along the compost bins to the garage
  [8, [31, -41], [52, -41], [80, -41.5], [100, -40.5], [116, -42]],                         // through the meadow gate, the meadow's north edge
  [5.5, [115.5, -42], [114.5, -60], [115.5, -80], [114.8, -100]],                           // down between the hay and the alfalfa
  [8, [114.8, -100], [122, -104], [126, -108]],                                             // to the hay barn's door
];
function pathMask() {
  const c = document.createElement('canvas'); c.width = c.height = MASK_PX; const g = c.getContext('2d');
  const [x0, z0, x1] = MASK_BOX, K = MASK_PX / (x1 - x0), X = x => (x - x0) * K, Z = z => (z - z0) * K;
  g.fillStyle = '#000'; g.fillRect(0, 0, MASK_PX, MASK_PX);
  g.filter = 'blur(3px)'; g.fillStyle = g.strokeStyle = '#fff'; g.lineCap = g.lineJoin = 'round';
  g.beginPath(); g.roundRect(X(-24), Z(-20), 46 * K, 38 * K, 5 * K); g.fill();                  // the yard
  let seed = 0;
  for (const [w, ...pts] of PATHS) {
    // every ~3 m along the line: the centre nudged sideways and the width varied a little, so it wanders
    const way = [];
    for (let k = 0; k + 1 < pts.length; k++) {
      const [ax, az] = pts[k], [bx, bz] = pts[k + 1], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / 3)), nx = -(bz - az) / L, nz = (bx - ax) / L;
      for (let i = 0; i <= n; i++) { const t = i / n, j = i === 0 || i === n ? 0 : (hash(seed, i, 5) - 0.5) * 1.2; way.push([ax + (bx - ax) * t + nx * j, az + (bz - az) * t + nz * j, w * (0.85 + hash(seed, i, 6) * 0.3)]); }
      seed++;
    }
    for (let k = 0; k + 1 < way.length; k++) { g.lineWidth = (way[k][2] + way[k + 1][2]) / 2 * K; g.beginPath(); g.moveTo(X(way[k][0]), Z(way[k][1])); g.lineTo(X(way[k + 1][0]), Z(way[k + 1][1])); g.stroke(); }
  }
  const t = new THREE.CanvasTexture(c); t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; return t;
}
const flat = (w, d, x, y, z, mat, tile) => {
  const geo = new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2); if (tile) worldUV(geo, x, z, tile);
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.receiveShadow = true; return m;
};
const lift = (mat, k) => { mat.polygonOffset = true; mat.polygonOffsetFactor = -k; mat.polygonOffsetUnits = -k; return mat; };
// a pad: a rounded coloured panel, a dashed edge and its word, drawn at 32 px a metre
function padTexture(z, col, text) {
  const K = 32, w = Math.round(2 * z.hx * K), h = Math.round(2 * z.hz * K), c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = col; g.globalAlpha = 0.88; g.beginPath(); g.roundRect(0, 0, w, h, 18); g.fill(); g.globalAlpha = 1;
  g.strokeStyle = '#fff8e6'; g.lineWidth = 8; g.setLineDash([24, 16]); g.strokeRect(10, 10, w - 20, h - 20);
  // the text reads upright from the north (the pads are driven into heading south): the canvas's top lies to the south
  // the word as large as fits: at most 2.6 m tall and 55 % of the pad's height, at most 80 % of its width
  g.fillStyle = '#fff8e6'; g.textAlign = 'center'; g.textBaseline = 'middle';
  let px = Math.min(2.6 * K, h * 0.55);
  const font = () => `800 ${Math.round(px)}px Sniglet, system-ui, sans-serif`;
  g.font = font(); const tw = g.measureText(text).width; if (tw > w * 0.8) { px *= w * 0.8 / tw; g.font = font(); }
  g.fillText(text, w / 2, h / 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function buildGround(group, renderer) {
  const an = renderer.capabilities.getMaxAnisotropy();
  group.add(flat(420, 420, 0, 0, 0, blendedGround(makeGrassTexture(an), makeGravelTexture(an), pathMask(), makeNoiseTexture(), MASK_BOX), 8));
  const soil = lift(new THREE.MeshLambertMaterial({ color: '#7a5634' }), 2);
  for (const f of Object.values(FIELDS)) if (CROP[f.crop].vehicle === 'combine') group.add(flat(f.w + 1, f.h + 1, f.x0 + f.w / 2, 0.012, f.z0 + f.h / 2, soil)); // a soil border round the grain fields
  for (const [z, col, text] of [[ZONES.sell, '#e8a21a', 'SELL'], [ZONES.shop, '#3a7bd5', 'UPGRADE'], [ZONES.garage, '#3a7bd5', 'GARAGE'], [ZONES.compost, '#6f8f2e', 'COMPOST'],
    [ZONES.tractorshed, '#3a7bd5', 'GARAGE'], [ZONES.haybarn, '#e8a21a', 'SELL HAY']]) {
    const m = flat(2 * z.hx, 2 * z.hz, z.x, 0.016, z.z, lift(new THREE.MeshLambertMaterial({ map: padTexture(z, col, text), transparent: true }), 3));
    m.rotation.y = z.yaw; group.add(m);
  }
}

// a field's cell colours: the ground under the ripe crop, just cut, and greening as it grows back. Grain: soil, pale stubble.
// The backyard's and the meadow's: dark grass under the crop, a pale mown stripe.
const GRAIN_GROUND = { ripe: [122, 86, 52], cut: [214, 190, 120], sprout: [104, 150, 60] };
const GROUND = {
  lawn: { ripe: [70, 132, 44], cut: [156, 208, 98], sprout: [104, 168, 66] },
  longgrass: { ripe: [92, 124, 48], cut: [172, 196, 104], sprout: [116, 160, 70] },
  clover: { ripe: [66, 120, 52], cut: [150, 196, 108], sprout: [100, 160, 72] },
  hay: { ripe: [96, 118, 50], cut: [196, 186, 112], sprout: [120, 160, 70] },
  alfalfa: { ripe: [78, 112, 48], cut: [176, 186, 108], sprout: [110, 158, 68] },
  wildflowers: { ripe: [84, 120, 54], cut: [184, 190, 116], sprout: [116, 162, 74] },
};
function cellColour(P, g, out, o) {
  const a = g < 0.3 ? 0 : Math.min(1, (g - 0.3) / 0.5), b = g >= 1 ? 1 : 0;
  for (let k = 0; k < 3; k++) { const v = P.cut[k] + (P.sprout[k] - P.cut[k]) * a; out[o + k] = v + (P.ripe[k] - v) * b; }
  out[o + 3] = 255;
}

// One field: the cell texture under it and the crops as instanced chunks of 16 × 16 cells (culled by the camera)
const CH = 16;
function buildField(group, f, { assets, detail }) {
  const geo = modelGeometry(assets, f.crop), mat = firstMaterial(assets.get(f.crop).scene), Z = f.size, P0 = GROUND[f.crop] ?? GRAIN_GROUND;
  const data = new Uint8Array(f.w * f.h * 4), tex = new THREE.DataTexture(data, f.w, f.h); tex.magFilter = THREE.LinearFilter; tex.colorSpace = THREE.SRGBColorSpace;
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(f.w * Z, f.h * Z).rotateX(-Math.PI / 2), lift(withDetail(new THREE.MeshLambertMaterial({ map: tex }), detail, 2.5), 4)); // over the ground's layers
  plane.position.set(f.x0 + f.w * Z / 2, 0.02, f.z0 + f.h * Z / 2); plane.receiveShadow = true; group.add(plane);
  const chunks = [], shown = new Int8Array(f.w * f.h).fill(-1), M = new THREE.Matrix4(), P = new THREE.Vector3(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  const grey = new THREE.Color(0.62, 0.62, 0.58), white = new THREE.Color(1, 1, 1);
  for (let cj = 0; cj < f.h; cj += CH) for (let ci = 0; ci < f.w; ci += CH) {
    const w = Math.min(CH, f.w - ci), h = Math.min(CH, f.h - cj);
    const m = new THREE.InstancedMesh(geo, mat, w * h); m.castShadow = false; m.receiveShadow = true;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.setColorAt(0, white);
    chunks.push({ m, ci, cj, w, h }); group.add(m);
  }
  const chunkOf = (i, j) => chunks[Math.floor(j / CH) * Math.ceil(f.w / CH) + Math.floor(i / CH)];
  let version = -1, shownLocked = null;
  const sunflower = f.crop === 'sunflower';
  function draw(field, locked) {
    if (field.version === version && locked === shownLocked) return;
    const recolour = shownLocked !== locked; version = field.version; shownLocked = locked;
    const g = field.grow, dirty = new Set();
    for (let j = 0; j < f.h; j++) for (let i = 0; i < f.w; i++) {
      const c = j * f.w + i, v = g[c], lvl = v >= 1 ? 20 : Math.floor(v * 20);
      if (shown[c] === lvl && !recolour) continue;
      shown[c] = lvl; cellColour(P0, v, data, ((f.h - 1 - j) * f.w + i) * 4);
      const ch = chunkOf(i, j), k = (j - ch.cj) * ch.w + (i - ch.ci);
      const r1 = hash(i, j, 1), r2 = hash(i, j, 2), r3 = hash(i, j, 3);
      const s = v < 0.35 ? 0 : v >= 1 ? 1 : 0.2 + 0.6 * (v - 0.35) / 0.65;
      P.set(f.x0 + (i + 0.5 + (r1 - 0.5) * 0.2) * Z, 0, f.z0 + (j + 0.5 + (r2 - 0.5) * 0.2) * Z);
      Q.setFromAxisAngle(Y, sunflower ? (r3 - 0.5) * 0.6 : r3 * Math.PI * 2);
      S.set(s ? 0.92 + r1 * 0.16 : 0, s * (0.88 + r2 * 0.24), s ? 0.92 + r3 * 0.16 : 0);
      ch.m.setMatrixAt(k, M.compose(P, Q, S));
      if (recolour) ch.m.setColorAt(k, locked ? grey : white);
      dirty.add(ch);
    }
    for (const ch of dirty) { ch.m.instanceMatrix.needsUpdate = true; if (recolour) ch.m.instanceColor.needsUpdate = true; ch.m.computeBoundingSphere(); }
    tex.needsUpdate = true;
  }
  return { draw };
}
const firstMaterial = root => { let m = null; root.traverse(o => { if (!m && o.isMesh) m = o.material; }); return m; };

// A board's canvas: a light face in a wooden frame, then the picture
const FONT = 'Sniglet, system-ui, sans-serif';
function boardCanvas(w, h, paint) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  g.fillStyle = '#fff8e6'; g.fillRect(0, 0, w, h); g.strokeStyle = '#6b4428'; g.lineWidth = 16; g.strokeRect(8, 8, w - 16, h - 16);
  g.textAlign = 'center'; g.textBaseline = 'middle'; paint(g);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
const COIN = (g, x, y, r) => { g.fillStyle = '#f5c84c'; g.strokeStyle = '#b07a12'; g.lineWidth = r * 0.22; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.stroke(); };
// a field sign (H-F6): the crop's name and colour, what a grain sells for; when it cannot be cut, why: `need` (the vehicle or blades)
function fieldSign(f, need) {
  const crop = CROP[f.crop];
  return boardCanvas(512, 256, g => {
    g.fillStyle = crop.grain; g.beginPath(); g.arc(76, 72, 38, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#5a3820'; g.font = `800 ${crop.label.length > 8 ? 54 : 68}px ${FONT}`; g.textAlign = 'left'; g.fillText(crop.label.toUpperCase(), 132, 74);
    g.font = `800 40px ${FONT}`;
    COIN(g, 62, 146, 22); g.fillStyle = '#5a3820'; g.fillText(`${crop.price} a ${f.vehicle === 'mower' ? 'clipping' : 'grain'}`, 98, 148);
    if (need) { g.fillStyle = '#9a3a2a'; g.fillText(need, 40, 204); }
  });
}
const buildingSign = (w, h, title, sub) => boardCanvas(w, h, g => {
  g.fillStyle = '#5a3820'; g.font = `800 ${Math.round(h * 0.5)}px ${FONT}`; g.fillText(title, w / 2, h * (sub ? 0.42 : 0.53));
  if (sub) { g.fillStyle = '#9a6a3e'; g.font = `800 ${Math.round(h * 0.22)}px ${FONT}`; g.fillText(sub, w / 2, h * 0.8); }
});
// every mesh under a node gets the board's picture. The bake keeps no UVs (palette 'vertex'), so the board's front face (+z, the
// model's) gets them here: u along x, v along y, 0..1 over the board.
const fitUV = g => {
  if (g.userData.hvFit) return; g.userData.hvFit = true;
  g.computeBoundingBox(); const b = g.boundingBox, P = g.attributes.position, uv = new Float32Array(P.count * 2);
  for (let i = 0; i < P.count; i++) { uv[2 * i] = (P.getX(i) - b.min.x) / (b.max.x - b.min.x); uv[2 * i + 1] = (P.getY(i) - b.min.y) / (b.max.y - b.min.y); }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
};
const paintBoard = (node, tex) => node?.traverse(o => { if (o.isMesh) { fitUV(o.geometry); o.material = new THREE.MeshLambertMaterial({ map: tex }); } });

// rig(): the player's rig (its vehicle and every vehicle's levels)
export function buildWorld({ view, farm, rig }) {
  const { renderer, scene } = view.gfx, assets = view.assets;
  const group = new THREE.Group(); scene.add(group);
  buildGround(group, renderer);
  const detail = makeDetailTexture(renderer.capabilities.getMaxAnisotropy());
  const fields = farm.fields.list.map(f => buildField(group, f, { assets, detail }));
  const place = (key, x, z, yaw) => { const o = assets.clone(key); o.position.set(x, 0, z); o.rotation.y = yaw; group.add(o); return o; };
  const silo = place('silo', YARD.silo.x, YARD.silo.z, YARD.silo.yaw), siloTop = ['roof', 'gables', 'fascia', 'signboard'].map(n => silo.getObjectByName(n)).filter(Boolean);
  const shed = place('shed', YARD.shed.x, YARD.shed.z, YARD.shed.yaw), shedTop = ['roof', 'gables', 'signboard'].map(n => shed.getObjectByName(n)).filter(Boolean);
  paintBoard(silo.getObjectByName('signboard'), buildingSign(512, 160, 'SELL GRAIN'));
  paintBoard(shed.getObjectByName('signboard'), buildingSign(1024, 256, 'WORKSHOP', 'upgrades & vehicles'));
  // the backyard
  const B = BACKYARD;
  for (const [key, p] of [['farmhouse', B.house], ['compost', B.compost], ['doghouse', B.doghouse], ['workbench', B.bench], ...B.beds.map(b => ['flowerbed', b])]) place(key, p.x, p.z, p.yaw);
  // the meadow: the hay barn (its top comes off while a trailer unloads in it) and the tractor's workbench
  const haybarn = place('haybarn', MEADOW.barn.x, MEADOW.barn.z, MEADOW.barn.yaw), haybarnTop = ['roof', 'gables', 'signboard'].map(n => haybarn.getObjectByName(n)).filter(Boolean);
  paintBoard(haybarn.getObjectByName('signboard'), buildingSign(1024, 256, 'HAY BARN', 'sell your bales'));
  place('workbench', MEADOW.bench.x, MEADOW.bench.z, MEADOW.bench.yaw);
  // H-F8, H-F9: the gates, their leaves swinging open once the vehicle each opens for is owned
  const gates = Object.values(GATES).map(g => {
    const o = place('gate', g.x, g.z, g.yaw);
    return { g, open: 0, leaves: [[o.getObjectByName('leaf_L'), 1], [o.getObjectByName('leaf_R'), -1]].filter(([l]) => l) };
  });
  // field signs, repainted when what the field needs changes
  const signs = farm.fields.list.map(f => {
    const s = SIGNS[f.id], o = place('sign', s.x, s.z, s.yaw);
    return { f, board: o.getObjectByName('board'), need: undefined };
  });
  // why a field cannot be cut yet: its vehicle not owned, or that vehicle's blades too low; '' when it can
  const needOf = f => {
    const r = rig(); if (!r) return '';
    if (!farm.prog.owned[f.vehicle]) return `Needs the ${VEHICLES[f.vehicle].label.toLowerCase()}`;
    return f.tough > r.levelsOf[f.vehicle].blades ? `Needs blades ${f.tough}` : '';
  };
  // the fence round the farm and trees outside it, instanced
  const scatter = (key, spots) => {
    if (!spots.length) return;
    const m = new THREE.InstancedMesh(modelGeometry(assets, key), firstMaterial(assets.get(key).scene), spots.length), M = new THREE.Matrix4(), Q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0);
    spots.forEach(([x, z, yaw, s], i) => m.setMatrixAt(i, M.compose(new THREE.Vector3(x, 0, z), Q.setFromAxisAngle(Y, yaw), new THREE.Vector3(s, s, s))));
    m.castShadow = true; m.receiveShadow = true; group.add(m);
  };
  const fenceBox = new THREE.Box3().setFromBufferAttribute(modelGeometry(assets, 'fence').attributes.position), len = Math.max(0.5, fenceBox.max.x - fenceBox.min.x);
  const fence = [], { x0, x1, z0, z1 } = FARM;
  // fence pieces along a straight line from (ax, az) to (bx, bz), each `len` long
  const FS = 1.6; // the kit's fence is knee-high: scaled up to a proper farm fence
  const line = (ax, az, bx, bz) => { const L = Math.hypot(bx - ax, bz - az), yaw = az === bz ? 0 : Math.PI / 2, step = len * FS;
    for (let a = step / 2; a < L; a += step) fence.push([ax + (bx - ax) * a / L, az + (bz - az) * a / L, yaw, FS]); };
  line(x0, z1, x1, z1); line(x0, z0, x1, z0); line(x0, z0, x0, z1); line(x1, z0, x1, z1);
  for (const f of FENCES) for (const s of fenceSegments(f)) line(...s);
  scatter('fence', fence);
  // trees in a band round the outside of the fence
  const trees = Object.fromEntries(SCENERY.map(k => [k, []])), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, hx = (x1 - x0) / 2, hz = (z1 - z0) / 2;
  for (let n = 0; n < 700; n++) {
    const a = hash(n, 11) * Math.PI * 2, r = 1.02 + hash(n, 12) * 0.35, x = cx + Math.cos(a) * hx * r * 1.15, z = cz + Math.sin(a) * hz * r * 1.15;
    if (x > x0 - 3 && x < x1 + 3 && z > z0 - 3 && z < z1 + 3) continue;
    const pick = hash(n, 13), key = pick < 0.35 ? 'tree' : pick < 0.55 ? 'oak' : pick < 0.7 ? 'treeFat' : pick < 0.85 ? 'bushL' : pick < 0.95 ? 'bush' : 'rock';
    trees[key].push([x, z, hash(n, 14) * 6.3, key.startsWith('bush') || key === 'rock' ? 2 + hash(n, 15) * 2 : 3 + hash(n, 15) * 2.5]);
  }
  for (const [k, spots] of Object.entries(trees)) scatter(k, spots);
  return {
    group,
    // zone: the vehicle's; selling: the sell zone it unloads in, or null. In the workshop or a sell bay that roof comes off, so the
    // camera sees in
    update(zone, selling, dt = 0) {
      for (const g of gates) {
        g.open += ((farm.prog.owned[g.g.opens] ? 1 : 0) - g.open) * Math.min(1, dt * 2);
        for (const [o, s] of g.leaves) o.rotation.y = s * g.open * Math.PI / 2;
      }
      for (let k = 0; k < fields.length; k++) fields[k].draw(farm.fields.list[k], !!needOf(farm.fields.list[k]));
      for (const s of signs) {
        const need = needOf(s.f); if (need === s.need) continue;
        s.board?.material?.map?.dispose(); paintBoard(s.board, fieldSign(s.f, need)); s.need = need;
      }
      for (const o of shedTop) o.visible = zone !== 'shop';
      for (const o of siloTop) o.visible = zone !== 'sell' && selling !== 'sell';
      for (const o of haybarnTop) o.visible = zone !== 'haybarn' && selling !== 'haybarn';
    },
    dispose() { scene.remove(group); disposeTree(group, { keepShared: r => r.userData?.lhShared }); },
  };
}
