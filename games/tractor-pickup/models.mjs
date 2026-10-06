// Make the first version of every model file in assets/models/ (spec X-8). After that the files belong to whoever edits them:
// this script never overwrites a file that exists. To remake some on purpose: node models.mjs --force sheep duck (or --force all).
// Kenney models come from the Kenney All-in-1 pack (KENNEY=<its 3D assets folder>), with their palette colors moved into
// vertex colors. The sheep, duck and chicken are reshaped and recolored Cube Pets. The rest are built here with three.js.
import fs from 'fs';
import { Document } from '@gltf-transform/core';
import * as THREE from 'three';
import { io, toVertexColors, readTris, writeTris, clip, centroid, faceNormal, paint, trisFromGeometry, vcMaterial, addNode } from './tools/glb.mjs';
import { TR } from './src/sim/hitch.js';
import { ROAD_HALF } from './src/sim/road.js';
import { GATE_W } from './src/sim/scenery.js';

const BARN = { width: 5, half: 6, leaf: 5 }; // as layoutYard (src/sim/track.js) places it

const OUT = 'assets/models';
const KENNEY = process.env.KENNEY || `${process.env.HOME}/Downloads/Kenney Game Assets All-in-1 3.7.0/3D assets`;
const NK = f => `${KENNEY}/Nature Kit/Models/GLTF format/${f}.glb`, PET = f => `${KENNEY}/Cube Pets/Models/GLB format/animal-${f}.glb`;
const at = process.argv.indexOf('--force'), force = new Set(at < 0 ? [] : process.argv.slice(at + 1));
const wanted = name => force.has('all') || force.has(name) || !fs.existsSync(`${OUT}/${name}.glb`);
fs.mkdirSync(OUT, { recursive: true });

async function write(name, doc) { await io.write(`${OUT}/${name}.glb`, doc); console.log('wrote', name, fs.statSync(`${OUT}/${name}.glb`).size, 'bytes'); }
async function kenney(name, file, edit) { if (!wanted(name)) return console.log('kept', name); await write(name, toVertexColors(await io.read(file), edit)); }

// Kenney models used as they are (colors moved into vertex colors)
const PLAIN = {
  oak: NK('tree_oak'), tree: NK('tree_default'), treeFat: NK('tree_fat'), bush: NK('plant_bushLarge'), bushS: NK('plant_bush'),
  fence: NK('fence_simple'), rock: NK('rock_smallC'), pumpkin: NK('crop_pumpkin'), corn: NK('crops_cornStageD'), grass: NK('grass_large'),
  flowerY: NK('flower_yellowB'), flowerR: NK('flower_redA'), log: NK('log'), stump: NK('stump_old'), hay: `${KENNEY}/Graveyard Kit/Models/GLB format/hay-bale.glb`,
  pig: PET('pig'), cow: PET('cow'), chick: PET('chick'), bunny: PET('bunny'), dog: PET('dog'),
};
for (const [name, file] of Object.entries(PLAIN)) await kenney(name, file);

// ---- Cube Pets reshaped (spec 5.1). Model space: +z is the face, +y up; the head is a cube whose top is at y = 1.25.
const isEye = c => Math.abs(c[0] - c[1]) < 8 && Math.abs(c[2] - c[1]) < 18; // white of the eye and the pupil: neutral greys
const shape = (geo, rgb) => trisFromGeometry(geo).map(t => paint(t, rgb));
const ellipsoid = (r, at, rot = [0, 0, 0], detail = 1) => new THREE.IcosahedronGeometry(1, detail).scale(...r).rotateX(rot[0]).rotateY(rot[1]).rotateZ(rot[2]).translate(...at);

// Sheep: the pig without its snout and pointed ears; cream wool with a tuft, a dark face, round black ears, dark legs.
const WOOL = [244, 238, 226], FACE = [70, 64, 62], EAR = [38, 36, 38], HOOF = [44, 40, 38];
if (wanted('sheep')) {
  const doc = await io.read(PET('pig'));
  { const snout = doc.getRoot().listNodes().find(n => n.getName() === 'Group'); snout.getMesh().dispose(); snout.dispose(); } // the snout
  toVertexColors(doc, (tris, node) => {
    if (node.startsWith('leg')) return tris.map(t => paint(t, t.c[0][1] < 140 && t.c[0][0] > 200 ? HOOF : FACE)); // orange-ish hoof band, pink leg
    if (node !== 'body') return tris;
    const ear = t => centroid(t)[1] > 1.125 || t.p.some(p => p[1] > 0.95 && p[1] < 1.12); // the ears grow out of the head cap (whose only vertex rows are y 0.938 and 1.125): the cap goes, a clean one replaces it
    const out = tris.filter(t => !ear(t)).map(t => {
      if (t.c.every(isEye)) return t;
      const c = centroid(t), n = faceNormal(t);
      return paint(t, n[2] > 0.7 && c[1] > 0.3 && c[1] < 1.12 ? FACE : WOOL);
    });
    out.push(...shape(new THREE.CylinderGeometry(0.3125 * Math.SQRT2, 0.5 * Math.SQRT2, 0.125, 4, 1).rotateY(Math.PI / 4).translate(0, 1.1875, 0), WOOL)); // bevelled cap
    for (const s of [-1, 1]) out.push(...shape(ellipsoid([0.09, 0.17, 0.25], [s * 0.66, 0.98, 0.22], [0.25, 0, s * 0.35]), EAR)); // round black ears at the sides
    for (const [x, y, z, r] of [[0, 1.33, 0.12, 0.24], [0.2, 1.3, -0.08, 0.2], [-0.2, 1.3, -0.08, 0.2], [0, 1.31, -0.25, 0.2]]) out.push(...shape(ellipsoid([r, r * 0.55, r], [x, y, z], [0, 0, 0], 0), WOOL)); // wool tuft
    return out;
  });
  await write('sheep', doc);
} else console.log('kept', 'sheep');

// The chick's beak: two orange tones on the face
const BEAK = c => c[0] > 225 && c[1] > 130 && c[1] < 170 && c[2] < 90;
// Duck: a mallard drake. Green head above the eyes' middle, a white ring, chestnut chest, grey body, a wide flat yellow bill.
if (wanted('duck')) {
  const doc = await io.read(PET('chick'));
  toVertexColors(doc, (tris, node) => {
    if (node.startsWith('leg')) return tris.map(t => paint(t, [242, 142, 40]));
    if (node.startsWith('wing')) return tris.map(t => paint(t, centroid(t)[2] < -0.1 ? [92, 78, 66] : [150, 128, 104]));
    if (node !== 'body') return tris;
    const bill = new Set(tris.filter(t => t.c.every(BEAK)));
    let out = clip(clip(tris.filter(t => !bill.has(t)), 1, 0.74), 1, 0.66).map(t => {
      if (t.c.every(isEye)) return t;
      const c = centroid(t), n = faceNormal(t);
      return paint(t, c[1] > 0.74 ? [34, 112, 58] : c[1] > 0.66 ? [246, 246, 240] : n[2] > 0.6 ? [128, 66, 38] : n[1] < -0.6 ? [200, 200, 196] : [172, 172, 168]);
    });
    for (const t of bill) { t.p = t.p.map(([x, y, z]) => [x * 1.5, 0.545 + (y - 0.545) * 0.7, z + 0.04]); out.push(paint(t, t.c[0][0] > 233 ? [250, 206, 50] : [228, 176, 32])); }
    return out;
  });
  await write('duck', doc);
} else console.log('kept', 'duck');

// Chicken: white feathers, a red comb (the chick's tuft) and a small red wattle under the orange beak, orange feet.
if (wanted('chicken')) {
  const doc = await io.read(PET('chick'));
  toVertexColors(doc, (tris, node) => {
    if (node.startsWith('wing')) return tris.map(t => paint(t, [236, 234, 226]));
    if (node !== 'body') return tris;
    const out = tris.map(t => t.c.every(isEye) || t.c.every(BEAK) ? t : paint(t, t.p.some(p => p[1] > 1.27) ? [214, 40, 40] : [248, 246, 240]));
    out.push(...shape(ellipsoid([0.09, 0.12, 0.05], [0, 0.34, 0.66], [0, 0, 0], 0), [214, 40, 40]));
    return out;
  });
  await write('chicken', doc);
} else console.log('kept', 'chicken');

// ---- Kenney models with changes
// Edge rocks (T-17): the Nature Kit's orange rock with a teal top -> natural greys (body mid grey with a little per-vertex variation,
// top mossy grey-green, white parts light grey)
for (const k of ['rockA', 'rockB', 'rockC']) await kenney(k, NK({ rockA: 'rock_largeA', rockB: 'rock_largeB', rockC: 'rock_tallA' }[k]), tris => {
  let i = 0;
  for (const t of tris) t.c = t.c.map(([r, g, b]) => { const v = ((i++ * 3 * 2654435761) >>> 0) % 21 - 10, c = r > 200 && g < 160 ? [128, 124, 118] : g > r + 60 ? [122, 134, 108] : r > 240 && g > 240 && b > 240 ? [176, 174, 168] : [r, g, b]; return c.map(x => Math.max(0, Math.min(255, x + v))); });
  return tris;
});

// Tractor (W-3): split into two paint areas by material. paint-body: Kenney's grey-blue bodywork (cab, fenders, frame);
// paint-trim: the yellow hood and the wheel rims. The game puts each area's paint on the shading it finds there.
const isHood = ([r, g, b]) => r > 200 && g > 110 && b < 130, isPaint = ([r, g, b]) => b > r * 1.1 && r > 60;
if (wanted('tractor')) {
  const doc = await io.read(`${KENNEY}/Car Kit/Models/GLB format/tractor.glb`);
  toVertexColors(doc);
  const mats = { 'paint-body': vcMaterial(doc, 'paint-body'), 'paint-trim': vcMaterial(doc, 'paint-trim'), tractor: vcMaterial(doc, 'tractor') };
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh(); if (!mesh) continue;
    const tris = mesh.listPrimitives().flatMap(readTris), wheel = node.getName().startsWith('wheel'), by = new Map(Object.keys(mats).map(k => [k, []]));
    for (const t of tris) { const c = t.c[0]; by.get(!wheel && isHood(c) || wheel && isPaint(c) ? 'paint-trim' : isPaint(c) ? 'paint-body' : 'tractor').push(t); }
    for (const p of mesh.listPrimitives()) { mesh.removePrimitive(p); p.dispose(); }
    for (const [k, list] of by) if (list.length) mesh.addPrimitive(writeTris(doc, doc.createPrimitive().setMaterial(mats[k]), list));
  }
  for (const m of doc.getRoot().listMaterials()) if (!m.listParents().some(p => p.propertyType === 'Primitive')) m.dispose();
  await write('tractor', doc);
} else console.log('kept', 'tractor');

// ---- Models that version 1.4 built in code (sizes from the sim, so they fit the colliders)
const col = (g, hex) => { const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
const box = (w, h, d, x, y, z, hex) => col(new THREE.BoxGeometry(w, h, d).translate(x, y, z), hex);
const tris = (...geos) => geos.flatMap(g => trisFromGeometry(g));
async function built(name, make) {
  if (!wanted(name)) return console.log('kept', name);
  const doc = new Document(); doc.createBuffer(); const scene = doc.createScene(name); doc.getRoot().setDefaultScene(scene);
  make(doc, scene, (parent, node, list, mat = 'color') => addNode(doc, parent, node, [[vcMaterial(doc, mat, mat === 'planks' || mat === 'shingles' ? { keepUV: true } : undefined), list]]));
  await write(name, doc);
}

// Trailer and wagon (B-13): the wooden bed with rails and the tongue (node "bed"), and one wheel (node "wheel", axle along z)
await built('trailer', (doc, scene, add) => {
  const { x: hx, y: hy, z: hz } = TR.half;
  add(scene, 'bed', tris(box(hx * 2, hy * 2, hz * 2, 0, 0, 0, '#9a6a3f'), box(hx * 2, 0.45, 0.08, 0, 0.37, hz, '#c08a55'), box(hx * 2, 0.45, 0.08, 0, 0.37, -hz, '#c08a55'),
    box(0.08, 0.45, hz * 2, hx, 0.37, 0, '#c08a55'), box(0.08, 0.45, hz * 2, -hx, 0.37, 0, '#c08a55'), box(1.9, 0.1, 0.12, hx + 0.95, -0.15, 0, '#555555')));
  add(scene, 'wheel', tris(col(new THREE.CylinderGeometry(TR.wheelR, TR.wheelR, 0.3, 16).rotateX(Math.PI / 2), '#333333')));
});

// Hats (W-4): about 0.7 m wide with the base at y = 0
const cyl = (rt, rb, h, seg, y, hex) => col(new THREE.CylinderGeometry(rt, rb, h, seg).translate(0, y, 0), hex);
await built('hat-straw', (doc, scene, add) => add(scene, 'hat', tris(cyl(0.5, 0.5, 0.05, 20, 0.025, '#f2c85a'), cyl(0.22, 0.26, 0.25, 16, 0.17, '#e0b040'), cyl(0.265, 0.265, 0.06, 16, 0.1, '#c0392b'))));
await built('hat-cowboy', (doc, scene, add) => add(scene, 'hat', tris(cyl(0.55, 0.55, 0.05, 20, 0.025, '#7a4a26'), cyl(0.2, 0.27, 0.42, 16, 0.25, '#8a5530'))));
await built('hat-party', (doc, scene, add) => add(scene, 'hat', tris(col(new THREE.ConeGeometry(0.26, 0.6, 16).translate(0, 0.3, 0), '#ff5fa2'),
  ...[0.12, 0.28, 0.44].map((y, i) => { const r = 0.26 * (1 - y / 0.6) + 0.012; return cyl(r, r + 0.03, 0.06, 16, y, i % 2 ? '#ffd24a' : '#3fa9f5'); }),
  col(new THREE.SphereGeometry(0.06, 8, 6).translate(0, 0.62, 0), '#ffffff'))));

// Farmyard props (T-31), centered on their physics bodies: the bale lies along x after the game's rotation (a cylinder along y here)
await built('bale', (doc, scene, add) => add(scene, 'bale', tris(cyl(0.75, 0.75, 1.2, 20, 0, '#e7c45a'))));
await built('cone', (doc, scene, add) => add(scene, 'cone', tris(box(0.5, 0.06, 0.5, 0, -0.32, 0, '#ffffff'), col(new THREE.ConeGeometry(0.25, 0.7, 16), '#ff7a1a'))));
await built('barrel', (doc, scene, add) => add(scene, 'barrel', tris(cyl(0.4, 0.4, 1.0, 16, 0, '#a5462f'))));
// Breakable bush (T-34): a round leafy mound of low-poly blobs in the oak's greens, about 1.8 m wide and 1.2 m tall
await built('shrub', (doc, scene, add) => add(scene, 'shrub', [[0.6, 0, 0.5, 0, '#2fbf9c'], [0.5, 0.45, 0.42, 0.2, '#38cfa9'], [0.48, -0.4, 0.4, -0.3, '#29b392'], [0.4, 0.05, 0.75, -0.05, '#3fd6b4'], [0.38, -0.1, 0.38, 0.45, '#33c7a3']]
  .flatMap(([r, x, y, z, hex]) => trisFromGeometry(col(new THREE.IcosahedronGeometry(r, 0).scale(1.3, 1, 1.3).translate(x * 1.2, y, z * 1.2), hex)))));
// What a broken tree leaves (T-34): a cut stump with rings
await built('stump-cut', (doc, scene, add) => add(scene, 'stump', tris(col(new THREE.CylinderGeometry(0.42, 0.5, 0.5, 14, 1, true).translate(0, 0.25, 0), '#8a6240'),
  col(new THREE.CircleGeometry(0.42, 14).rotateX(-Math.PI / 2).translate(0, 0.5, 0), '#e8cf9f'), col(new THREE.RingGeometry(0.2, 0.3, 14).rotateX(-Math.PI / 2).translate(0, 0.505, 0), '#d2b27a'))));
// Sprinkler arch (T-15): across a road of ROAD_HALF, centered on the road, x across it
await built('sprinkler', (doc, scene, add) => add(scene, 'arch', tris(box(0.3, 4.2, 0.3, ROAD_HALF + 0.6, 2.1, 0, '#3d7fd1'), box(0.3, 4.2, 0.3, -ROAD_HALF - 0.6, 2.1, 0, '#3d7fd1'), box(ROAD_HALF * 2 + 1.5, 0.25, 0.25, 0, 4.2, 0, '#3d7fd1'))));
// Gate arch (T-8): two tall posts and a cross bar over a gate GATE_W wide, x across the opening
await built('gate', (doc, scene, add) => { const o = GATE_W / 2 + 0.2; add(scene, 'arch', tris(box(0.5, 4, 0.5, -o, 2, 0, '#8a6240'), box(0.5, 4, 0.5, o, 2, 0, '#8a6240'), box(o * 2 + 0.6, 0.35, 0.35, 0, 3.85, 0, '#8a6240'))); });

// Drive-through barn (T-28), in barn space: +z along the drive-through axis, +x across, ground at y = 0, sized for the sim's barn
// (10 m wide and 12 m long inside, door leaves standing open in line with the walls). Nodes: "walls" (planks: walls and door
// leaves), "trim" (white trim and the door frames), and under "roof" the parts that fade when the tractor is near:
// "roof-shingles" (shingles), "roof-gables" (planks) and "roof-trim".
await built('barn', (doc, scene, add) => {
  const W = BARN.width, L = BARN.half, LEAF = BARN.leaf, GAP = 0.2, H = 5, WHITE = '#f4f1ea', T60 = Math.tan(Math.PI / 3), T30 = Math.tan(Math.PI / 6);
  const bx = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  // board UVs: u along the wall (x or z), v up; one texture repeat per 2 m
  const boardUV = (g, along) => { const p = g.attributes.position, uv = new Float32Array(p.count * 2); for (let i = 0; i < p.count; i++) { uv[i * 2] = (along === 'x' ? p.getX(i) : p.getZ(i)) / 2; uv[i * 2 + 1] = p.getY(i) / 2; } g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return col(g, '#ffffff'); };
  // X-braced white frame on a w x h panel in a plane 'x' (across) or 'z' (along). No two faces coplanar (z-fighting): rails run
  // full width, stiles butt between them, the braces are 3 and 6 cm thinner than the frame.
  const frameX = (along, w, h, cx, cy, cz, t = 0.3, bar = 0.2) => {
    const P = (a, y, len, hh) => along === 'x' ? box(len, hh, t, cx + a, cy + y, cz, WHITE) : box(t, hh, len, cx, cy + y, cz + a, WHITE);
    const out = [P(0, h / 2 - bar / 2, w, bar), P(0, -h / 2 + bar / 2, w, bar), P(-w / 2 + bar / 2, 0, bar, h - bar * 2), P(w / 2 - bar / 2, 0, bar, h - bar * 2)];
    const iw = w - bar * 2, ih = h - bar * 2, len = Math.hypot(iw, ih), ang = Math.atan2(ih, iw);
    for (const sg of [-1, 1]) { const tb = t - (sg > 0 ? 0.03 : 0.06), g = new THREE.BoxGeometry(along === 'x' ? len : tb, bar * 0.9, along === 'x' ? tb : len);
      if (along === 'x') g.rotateZ(sg * ang); else g.rotateX(-sg * ang); out.push(col(g.translate(cx, cy, cz), WHITE)); }
    return out;
  };
  const walls = [], trim = [];
  for (const sx of [-1, 1]) {
    walls.push(boardUV(bx(0.4, H, L * 2, sx * W, H / 2, 0), 'z'));
    for (const sz of [-1, 1]) walls.push(boardUV(bx(0.12, 4.3, LEAF - GAP, sx * W, 2.25, sz * (L + (LEAF + GAP) / 2)), 'z')); // open door leaf; top and bottom 5 cm inside its frame (coplanar faces flicker)
    trim.push(box(0.62, 0.44, L * 2 + 0.4, sx * W, H - 0.18, 0, WHITE));                                               // eave band
    for (const sz of [-1, 1]) {
      trim.push(box(0.55, H - 0.06, 0.32, sx * W, (H - 0.06) / 2, sz * (L - 0.06), WHITE));                             // corner trim
      trim.push(...frameX('z', LEAF - GAP, 4.4, sx * W, 2.25, sz * (L + (LEAF + GAP) / 2)));                              // door leaf frame and X
    }
  }
  add(scene, 'walls', tris(...walls), 'planks'); add(scene, 'trim', tris(...trim));
  // gambrel roof: steep ~60 degree lower pitch, ~30 degree upper, profile breaks at |x| = 3.5 m
  const roof = doc.createNode('roof'); scene.addChild(roof);
  const KNEE = 3.5, OVER = 0.45, eaveX = W + 0.2 + OVER;
  const yAt = ax => ax >= KNEE ? H + (W + 0.2 - ax) * T60 : H + (W + 0.2 - KNEE) * T60 + (KNEE - ax) * T30;
  const prof = [[-eaveX, yAt(eaveX)], [-KNEE, yAt(KNEE)], [0, yAt(0)], [KNEE, yAt(KNEE)], [eaveX, yAt(eaveX)]], RL = L + 0.6, TH = 0.22, slabs = [];
  for (let i = 0; i < 4; i++) { // alternating slab depths keep the overlapping slab ends off one plane
    const [x0, y0] = prof[i], [x1, y1] = prof[i + 1], len = Math.hypot(x1 - x0, y1 - y0) + 0.12, ang = Math.atan2(y1 - y0, x1 - x0);
    const g = new THREE.BoxGeometry(len, TH, RL * 2 + (i % 2) * 0.06), p = g.attributes.position, uv = new Float32Array(p.count * 2);
    for (let k = 0; k < p.count; k++) { uv[k * 2] = p.getZ(k) / 2; uv[k * 2 + 1] = p.getX(k) / 2; }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    slabs.push(col(g.rotateZ(ang).translate((x0 + x1) / 2 - Math.sin(ang) * TH / 2, (y0 + y1) / 2 + Math.cos(ang) * TH / 2, 0), '#ffffff'));
  }
  slabs.push(boardUV(bx(0.45, 0.3, RL * 2 + 0.2, 0, yAt(0) + TH, 0), 'z')); // ridge cap
  add(roof, 'roof-shingles', tris(...slabs), 'shingles');
  const gShape = new THREE.Shape([[-W - 0.2, H], [-KNEE, yAt(KNEE) - 0.05], [0, yAt(0) - 0.05], [KNEE, yAt(KNEE) - 0.05], [W + 0.2, H]].map(([x, y]) => new THREE.Vector2(x, y)));
  add(roof, 'roof-gables', tris(...[-1, 1].map(sz => { const g = new THREE.ExtrudeGeometry(gShape, { depth: 0.3, bevelEnabled: false }); g.translate(0, 0, sz * L - 0.15); return boardUV(g, 'x'); })), 'planks');
  const rt = [], ridgeY = yAt(0) + TH;
  for (const sz of [-1, 1]) {
    const z = sz * (L + 0.2);
    rt.push(box(W * 2 + 0.7, 0.4, 0.3, 0, H + 0.12, z, WHITE));                                                         // header over the opening
    for (let i = 0; i < 4; i++) { const [x0, y0] = prof[i], [x1, y1] = prof[i + 1], len = Math.hypot(x1 - x0, y1 - y0), ang = Math.atan2(y1 - y0, x1 - x0);
      rt.push(col(new THREE.BoxGeometry(len, 0.28, 0.2).rotateZ(ang).translate((x0 + x1) / 2, (y0 + y1) / 2 - 0.05, sz * (RL - 0.02 + (i % 2) * 0.04)), WHITE)); } // rake trim
    rt.push(box(2.0, 2.0, 0.08, 0, 7.2, z - sz * 0.02, '#7a2620'));                                                       // hay-loft door
    rt.push(...frameX('x', 2.4, 2.4, 0, 7.2, z + sz * 0.08, 0.2, 0.18));
  }
  rt.push(box(1.5, 1.3, 1.5, 0, ridgeY + 0.5, 0, WHITE));                                                                 // cupola
  for (const [x, z, w, d] of [[0.79, 0, 0.05, 0.9], [-0.79, 0, 0.05, 0.9], [0, 0.79, 0.9, 0.05], [0, -0.79, 0.9, 0.05]]) rt.push(box(w, 0.75, d, x, ridgeY + 0.55, z, '#7f7a72')); // louvers
  rt.push(col(new THREE.ConeGeometry(1.3, 0.95, 4).rotateY(Math.PI / 4).translate(0, ridgeY + 1.57, 0), '#5a2b25'));
  rt.push(box(0.06, 0.7, 0.06, 0, ridgeY + 2.4, 0, '#3b3b3b'), box(0.06, 0.06, 0.8, 0, ridgeY + 2.6, 0, '#3b3b3b'));   // weather vane
  add(roof, 'roof-trim', tris(...rt));
});
