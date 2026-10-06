// Make the first version of every model file in assets/models/ (spec X-8). After that the files belong to whoever edits them:
// this script never overwrites a file that exists. To remake some on purpose: node models.mjs --force sheep duck (or --force all).
// node models.mjs --hat-mounts puts every animal's hat node back on the top of its head.
// Kenney models come from the Kenney All-in-1 pack (KENNEY=<its 3D assets folder>), with their palette colors moved into
// vertex colors. The sheep, duck and chicken are reshaped and recolored Cube Pets. The rest are built here with three.js.
import fs from 'fs';
import { Document } from '@gltf-transform/core';
import * as THREE from 'three';
import { io, toVertexColors, readTris, writeTris, clip, centroid, faceNormal, paint, trisFromGeometry, vcMaterial, addNode } from './tools/glb.mjs';
import { TR } from './src/sim/hitch.js';
import { ROAD_HALF } from './src/sim/road.js';
import { GATE_W } from './src/sim/scenery.js';
import { WASH } from './src/sim/track.js';

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
  pig: PET('pig'), chick: PET('chick'), bunny: PET('bunny'), dog: PET('dog'),
};
for (const [name, file] of Object.entries(PLAIN)) await kenney(name, file);

// ---- Cube Pets reshaped (spec 5.1). Model space: +z is the face, +y up; the head is a cube whose top is at y = 1.25.
const isEye = c => Math.abs(c[0] - c[1]) < 8 && Math.abs(c[2] - c[1]) < 18; // white of the eye and the pupil: neutral greys
const shape = (geo, rgb) => trisFromGeometry(geo).map(t => paint(t, rgb));
const ellipsoid = (r, at, rot = [0, 0, 0], detail = 1) => new THREE.IcosahedronGeometry(1, detail).scale(...r).rotateX(rot[0]).rotateY(rot[1]).rotateZ(rot[2]).translate(...at);

// Sheep: the pig without its pointed ears; cream wool with a tuft, a dark face with a short dark muzzle (the pig's snout), round
// black ears, dark legs.
const WOOL = [244, 238, 226], FACE = [70, 64, 62], EAR = [38, 36, 38], HOOF = [44, 40, 38], MUZZLE = [96, 88, 84], NOSTRIL = [30, 28, 30];
if (wanted('sheep')) {
  const doc = await io.read(PET('pig'));
  toVertexColors(doc, (tris, node) => {
    if (node === 'Group') return tris.map(t => { t.p = t.p.map(([x, y, z]) => [x, y, z * 0.7]); return paint(t, t.c[0][0] < 120 ? NOSTRIL : MUZZLE); }); // the pig's snout, shorter, as a dark muzzle
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

// Cow: Kenney's cow has spots on its left side only; more on the right side, the back and the top (flat patches 1.5 cm off the
// faces of the body cube, which spans x and z -0.63..0.63 and y up to 1.25 in body space)
const SPOT = [72, 75, 88];
await kenney('cow', PET('cow'), (tris, node) => {
  if (node !== 'body') return tris;
  const spot = (r, rot, at) => { const g = new THREE.CircleGeometry(1, 7); const p = g.attributes.position; for (let i = 1; i < p.count; i++) { const k = 0.8 + 0.4 * (((i * 2654435761) >>> 0) % 100) / 100; p.setXY(i, p.getX(i) * k, p.getY(i) * k); } return shape(g.scale(r[0], r[1], 1).rotateX(rot[0]).rotateY(rot[1]).translate(...at), SPOT); };
  const o = 0.63 + 0.015;
  return [...tris,
    ...spot([0.3, 0.24], [0, -Math.PI / 2], [-o, 0.62, -0.18]), ...spot([0.16, 0.13], [0, -Math.PI / 2], [-o, 1.0, 0.3]),   // right side
    ...spot([0.24, 0.2], [0, Math.PI], [0.2, 0.8, -o]),                                                                   // back
    ...spot([0.22, 0.18], [-Math.PI / 2, 0], [-0.22, 1.25 + 0.015, -0.25]), ...spot([0.12, 0.1], [-Math.PI / 2, 0], [0.28, 1.265, 0.1])]; // top
});

// ---- Kenney models with changes
// Edge rocks (T-17): the Nature Kit's orange rock with a teal top -> natural greys (body mid grey with a little per-vertex variation,
// top mossy grey-green, white parts light grey)
for (const k of ['rockA', 'rockB', 'rockC']) await kenney(k, NK({ rockA: 'rock_largeA', rockB: 'rock_largeB', rockC: 'rock_tallA' }[k]), tris => {
  let i = 0;
  for (const t of tris) t.c = t.c.map(([r, g, b]) => { const v = ((i++ * 3 * 2654435761) >>> 0) % 21 - 10, c = r > 200 && g < 160 ? [128, 124, 118] : g > r + 60 ? [122, 134, 108] : r > 240 && g > 240 && b > 240 ? [176, 174, 168] : [r, g, b]; return c.map(x => Math.max(0, Math.min(255, x + v))); });
  return tris;
});

// Tractor (W-3): Kenney's tractor cut into parts by shape, one node each. "body" (the cab, the hood and the frame) has material
// paint-body; "fenders" (front and back) and "roof" have paint-trim; "glass" (windows and the hood vents) and "details" (exhaust,
// lamps, the front weight) keep their colors, and so do the wheels (light grey rims). A paint area's vertex colors are greys that
// keep the model's shading: the game puts the paint on top of them.
const isGlass = ([r, g, b]) => b > 240 && r > 200, isYellow = ([r, g, b]) => r > 200 && g > 110 && b < 130, isBlueGrey = ([r, g, b]) => b > r * 1.1 && r > 60 && r < 140;
const lum = ([r, g, b]) => 0.3 * r + 0.6 * g + 0.1 * b;
export function tractorPart(t) { // t: a triangle of the body node, in that node's space (+z forward, +x left, y up from the frame)
  const c = t.c[0], [x, y, z] = centroid(t), n = faceNormal(t), ax = Math.abs(x);
  if (isGlass(c)) return 'glass';
  if (isYellow(c)) return ax < 0.32 ? 'body' : 'details';                                                   // the hood; the side lamps
  if (!isBlueGrey(c)) return 'details';                                                                      // the white front weight
  if (ax < 0.2 && y > 0.7 && z > 0.15 && z < 0.85) return 'details';                                         // exhaust and the cap on the hood
  if (y > 1.3) return 'roof';
  if (z < -0.1 && y > 0.45 && y < 1.0 && (ax > 0.5 || (ax >= 0.38 && Math.abs(n[0]) < 0.5))) return 'fenders'; // the arched back fenders (the cab side at x 0.44 stays body)
  if (ax >= 0.35 && z > 0.15 && z < 0.85 && y > 0.3) return 'fenders';                                        // the boxes over the front wheels
  return 'body';
}
if (wanted('tractor')) {
  const doc = await io.read(`${KENNEY}/Car Kit/Models/GLB format/tractor.glb`);
  toVertexColors(doc);
  const mats = { 'paint-body': vcMaterial(doc, 'paint-body'), 'paint-trim': vcMaterial(doc, 'paint-trim'), tractor: vcMaterial(doc, 'tractor') };
  const bodyNode = doc.getRoot().listNodes().find(n => n.getName() === 'body'), tris = bodyNode.getMesh().listPrimitives().flatMap(readTris);
  // paint areas to greys: each source color family (blue-grey bodywork, yellow hood) is scaled by its own brightest vertex
  const top = { grey: 1, yellow: 1 }; for (const t of tris) for (const c of t.c) { if (isBlueGrey(c)) top.grey = Math.max(top.grey, lum(c)); if (isYellow(c)) top.yellow = Math.max(top.yellow, lum(c)); }
  const toGrey = t => { t.c = t.c.map(c => { const v = Math.round(215 * lum(c) / (isYellow(c) ? top.yellow : top.grey)); return [v, v, v]; }); return t; };
  const parts = { body: [], fenders: [], roof: [], glass: [], details: [] };
  for (const t of tris) parts[tractorPart(t)].push(t);
  const AREA = { body: 'paint-body', fenders: 'paint-trim', roof: 'paint-trim' }, parent = bodyNode.getParentNode() || doc.getRoot().listScenes()[0], at = bodyNode.getTranslation();
  bodyNode.getMesh().dispose(); bodyNode.dispose();
  for (const [name, list] of Object.entries(parts)) {
    const byMat = AREA[name] ? [[mats[AREA[name]], list.map(toGrey)]] : [[mats.tractor, name === 'details' ? list.map(t => (centroid(t)[1] > 0.7 && !isYellow(t.c[0]) ? paint(t, [72, 72, 78]) : t)) : list]];
    addNode(doc, parent, name, byMat, { translation: at });
  }
  for (const node of doc.getRoot().listNodes()) { // wheels: dark tires, light grey rims, all fixed colors
    if (!node.getName().startsWith('wheel')) continue;
    const mesh = node.getMesh(), wt = mesh.listPrimitives().flatMap(readTris).map(t => { t.c = t.c.map(c => { if (lum(c) < 90) return c; const v = Math.min(235, Math.round(lum(c) * 1.2)); return [v, v, v + 4]; }); return t; });
    for (const p of mesh.listPrimitives()) { mesh.removePrimitive(p); p.dispose(); }
    mesh.addPrimitive(writeTris(doc, doc.createPrimitive().setMaterial(mats.tractor), wt));
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

// Farmyard wash (T-36), in wash space: +z along the drive-through axis, x across, ground at y = 0, sized by WASH. Node "frame":
// a concrete pad and four corner posts; node "canopy" (fades while the tractor is under it): the roof with a striped band at each
// end and rows of nozzles; node "brush": one tall round brush
// (centered on x = z = 0, standing up y), drawn at each side of the opening and spun by the game.
await built('wash', (doc, scene, add) => {
  const { half: H2, width: W2, h: HT } = WASH, px = W2 + 0.3, list = [];
  list.push(box(W2 * 2 + 2.6, 0.06, H2 * 2 + 2, 0, 0.03, 0, '#c9c4ba'));                                                            // pad
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) list.push(box(0.5, HT, 0.5, sx * px, HT / 2, sz * H2, '#3d7fd1'));          // posts
  add(scene, 'frame', tris(...list));
  const top = [box(px * 2 + 1.2, 0.5, H2 * 2 + 1.0, 0, HT + 0.25, 0, '#3d7fd1')];                                                    // canopy
  for (const sz of [-1, 1]) for (let i = 0; i < 8; i++) top.push(box((px * 2 + 1.24) / 8, 0.42, 0.04, -(px + 0.62) + (i + 0.5) * (px * 2 + 1.24) / 8, HT + 0.25, sz * (H2 + 0.52), i % 2 ? '#ffffff' : '#e84a4a')); // striped band at each end
  for (let i = -3; i <= 3; i++) for (const z of [-1.5, 0, 1.5]) top.push(col(new THREE.CylinderGeometry(0.08, 0.12, 0.2, 8).translate(i * 1.2, HT - 0.1, z), '#9aa3ad')); // nozzles
  add(scene, 'canopy', tris(...top));
  const brush = []; // stripes of bristles up the brush, with a grey cap on each end
  for (let i = 0; i < 6; i++) brush.push(cyl(0.5, 0.5, 0.56, 12, 0.6 + i * 0.56 + 0.28, ['#3fa9f5', '#ffd24a', '#ff5fa2'][i % 3]));
  brush.push(cyl(0.2, 0.2, 0.2, 10, 0.5, '#7f7a72'), cyl(0.2, 0.2, 0.2, 10, 4.0, '#7f7a72'));
  add(scene, 'brush', tris(...brush));
});

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
    for (const sz of [-1, 1]) walls.push(boardUV(bx(0.12, 4.3, LEAF - GAP - 0.1, sx * W, 2.25, sz * (L + (LEAF + GAP) / 2)), 'z')); // open door leaf; all four edges 5 cm inside its frame (coplanar faces flicker)
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

// Hat mounts (W-4): an empty node "hat" under each animal's "body" node, where the base of a hat sits. The animations move the
// body, so a hat parented here bobs with the head. It sits on the top of the head cube (body space y 1.25, see HEAD_TOP), so no hat
// cuts into a head; ears, tufts, combs and wool above it may poke through (test/hats.test.mjs checks every hat on every animal).
// This step only adds the node when a file has none, so it is safe on edited files; --hat-mounts moves existing ones back here.
const HAT_AT = [0, 1.26, 0.08], moveMounts = process.argv.includes('--hat-mounts');
for (const pet of ['pig', 'cow', 'chicken', 'sheep', 'duck', 'bunny', 'dog', 'chick']) {
  const file = `${OUT}/${pet}.glb`, doc = await io.read(file), nodes = doc.getRoot().listNodes(), hat = nodes.find(n => n.getName() === 'hat');
  if (hat && !moveMounts) continue;
  if (hat) hat.setTranslation(HAT_AT); else nodes.find(n => n.getName() === 'body').addChild(doc.createNode('hat').setTranslation(HAT_AT));
  await write(pet, doc);
}
