// Harvest backyard flower bed: a raised wooden bed of dark soil with a row of colourful flowers. Source for
// assets/models/custom/flowerbed.glb (spec: flowerbed.spec.json). Regenerate from exp/harvest with
//   node tools/models/flowerbed.model.mjs   (under the usual systemd-run memory cap); needs the glb-author skill's kit.
// Metres, +Y up, the long side faces +Z (+X is the bed's LEFT), origin bottom-centre on the ground. Box from FLOWERBED
// (src/defs/models.js): w along x, d along z, h = the plank walls' top. Static scenery.
import { FLOWERBED as F } from '../../src/defs/models.js';
import { kenney, KIT, out, merge, bin } from './lib.mjs';
const { model } = await import(KIT);

const m = model('flowerbed');
const mat = {
  wood:   m.material('wood',   { color: kenney('#b5783f'), roughness: 0.9 }),
  board:  m.material('board',  { color: kenney('#8a5a30'), roughness: 0.9 }),
  soil:   m.material('soil',   { color: kenney('#4a3020'), roughness: 1 }),
  crop:   m.material('crop',   { color: kenney('#4fa83a'), roughness: 0.9 }),
  petal:  m.material('petal',  { color: kenney('#ffd23b'), roughness: 0.8 }),
  red:    m.material('red',    { color: kenney('#e5483b'), roughness: 0.8 }),
  white:  m.material('white',  { color: kenney('#f7f3ea'), roughness: 0.8 }),
  flower: m.material('flower', { color: kenney('#a45fd6'), roughness: 0.8 }),
  seed:   m.material('seed',   { color: kenney('#6b3f1e'), roughness: 0.9 }),
};

// ---- numbers first
const HX = F.w / 2, HZ = F.d / 2, T = 0.07;      // outer half extents, plank thickness
const SOIL = F.h - 0.06;                          // soil surface, a little below the plank tops
const POST = 0.1;                                 // corner posts stand proud of the planks
// flowers [x, z, height above the soil, colour, petals]
const COLS = [mat.red, mat.petal, mat.flower, mat.white];
const FLOWERS = Array.from({ length: 11 }, (_, i) => {
  const x = -HX + 0.3 + i * (F.w - 0.6) / 10, z = (i % 2 ? 0.17 : -0.15);
  return [x, z, 0.26 + 0.08 * ((i * 5) % 3) / 2, COLS[(i >> 1) % 4], i % 2 ? 5 : 6];
});
const HEAD_R = 0.14;

// ---- the bed: an open-top plank box (straight walls), soil inside, corner posts, a darker top rail
m.part('planks', bin({ bhx: HX, bhz: HZ, thx: HX, thz: HZ, h: F.h, t: T }), { anchor: 'none', material: mat.wood });
m.part('soil', m.box(2 * (HX - T), SOIL - T, 2 * (HZ - T)), { at: [0, T, 0], anchor: 'bottom', material: mat.soil });
m.part('posts', merge([[1, 1], [-1, 1], [1, -1], [-1, -1]].map(([sx, sz]) => ({ geo: m.box(POST + 0.02, F.h + 0.04, POST + 0.02), at: [sx * (HX - POST / 2 + 0.01), (F.h + 0.04) / 2, sz * (HZ - POST / 2 + 0.01)] }))),
  { anchor: 'none', material: mat.board });
// a plank seam line along the long sides (a thin dark strip proud of the wall)
m.part('seams', merge([1, -1].map(s => ({ geo: m.box(2 * HX - 2 * POST, 0.025, 0.02), at: [0, F.h / 2, s * (HZ + 0.005)] }))), { anchor: 'none', material: mat.board });

// ---- flowers: a green stem with two leaves, a flat star of petals facing up and out, a brown centre
const stems = [], leaves = [], centres = [], heads = new Map();
for (const [x, z, h, col, n] of FLOWERS) {
  const top = SOIL + h;
  stems.push({ geo: m.cyl(0.015, 0.02, h, 4), at: [x, SOIL + h / 2, z] });
  leaves.push({ geo: m.box(0.16, 0.012, 0.06), at: [x + 0.06, SOIL + h * 0.4, z], rot: [0, 30, 25] }, { geo: m.box(0.14, 0.012, 0.05), at: [x - 0.05, SOIL + h * 0.6, z], rot: [0, -40, -25] });
  const star = m.cyl(HEAD_R, HEAD_R, 0.03, n);
  (heads.get(col) ?? heads.set(col, []).get(col)).push({ geo: star, at: [x, top, z], rot: [25, 0, 0] });
  centres.push({ geo: m.cyl(0.04, 0.045, 0.03, 6), at: [x, top + 0.02, z + 0.01], rot: [25, 0, 0] });
}
m.part('stems', merge(stems), { anchor: 'none', material: mat.crop });
m.part('leaves', merge(leaves), { anchor: 'none', material: mat.crop });
for (const [col, ps] of heads) m.part(`flowers_${col.getName()}`, merge(ps), { anchor: 'none', material: col });
m.part('centres', merge(centres), { anchor: 'none', material: mat.seed });

await m.write(out('flowerbed'));
