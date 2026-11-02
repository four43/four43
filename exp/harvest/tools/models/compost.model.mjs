// Harvest backyard compost bins: three open-fronted wooden slatted bays in a row along x, open to +Z, each with a heap
// (dark finished compost, half-rotted brown, fresh green clippings) and a little painted sign plank on top of the middle bay.
// Source for assets/models/custom/compost.glb (spec: compost.spec.json). Regenerate from exp/harvest with
//   node tools/models/compost.model.mjs   (under the usual systemd-run memory cap); needs the glb-author skill's kit.
// Metres, +Y up, the open fronts face +Z (+X is the bins' LEFT), origin bottom-centre on the ground. Box from COMPOST
// (src/defs/models.js): w along x, d along z, h = the sign's top, `bays` bays. Static scenery.
import { COMPOST as C } from '../../src/defs/models.js';
import { kenney, KIT, out, merge, loft } from './lib.mjs';
const { model } = await import(KIT);

const m = model('compost');
const mat = {
  board: m.material('board', { color: kenney('#c08a52'), roughness: 0.9 }),
  wood:  m.material('wood',  { color: kenney('#7d5230'), roughness: 0.9 }),
  soil:  m.material('soil',  { color: kenney('#4a3020'), roughness: 1 }),
  seed:  m.material('seed',  { color: kenney('#7a5232'), roughness: 1 }),
  crop:  m.material('crop',  { color: kenney('#6cbf3c'), roughness: 0.95 }),
  sign:  m.material('sign',  { color: kenney('#4f9a3f'), roughness: 0.8 }),
  white: m.material('white', { color: kenney('#f3efe6'), roughness: 0.8 }),
};

// ---- numbers first
const HX = C.w / 2, HZ = C.d / 2, N = C.bays;
const P = 0.14, POST_H = 1.15;                         // post section, post height
const T = 0.04;                                        // slat thickness
const SLATS = 5, SLAT_H = 0.17, GAP = 0.05, SLAT_Y0 = 0.06;
const slatYs = Array.from({ length: SLATS }, (_, i) => SLAT_Y0 + i * (SLAT_H + GAP) + SLAT_H / 2);
const divX = Array.from({ length: N + 1 }, (_, i) => -HX + P / 2 + i * (2 * HX - P) / N);  // divider centres
const PZ_F = HZ - P / 2, PZ_B = -HZ + T + P / 2;     // front / back post centres (the back posts stand in front of the back slats)
const BAY_HX = ((2 * HX - P) / N - P) / 2;             // a bay's inside half-width
const HEAPS = [[0.9, mat.soil], [0.62, mat.seed], [0.4, mat.crop]];  // heap height and material, bay by bay (+X first)
const SIGN = { w: 1.7, h: 0.26, d: 0.05 };
SIGN.y = C.h - SIGN.h / 2;

// ---- posts, back slats (one long run behind the posts), divider slats (between back slats and the front posts)
m.part('posts', merge(divX.flatMap(x => [PZ_F, PZ_B].map(z => ({ geo: m.box(P, POST_H, P), at: [x, POST_H / 2, z] })))), { anchor: 'none', material: mat.wood });
m.part('back_slats', merge(slatYs.map(y => ({ geo: m.box(2 * HX - 0.02, SLAT_H, T), at: [0, y, -HZ + T / 2] }))), { anchor: 'none', material: mat.board });
const DZ0 = -HZ + T, DZ1 = HZ - 0.03;                  // divider slats stop short of the front posts' faces (no shared plane)
m.part('divider_slats', merge(divX.flatMap(x => slatYs.map(y => ({ geo: m.box(T, SLAT_H, DZ1 - DZ0), at: [x, y, (DZ0 + DZ1) / 2] })))), { anchor: 'none', material: mat.board });
// post caps: a little wider than the posts, so their tops read from above
m.part('post_caps', merge(divX.flatMap(x => [PZ_F, PZ_B].map(z => ({ geo: m.box(P + 0.04, 0.05, P + 0.04), at: [x, POST_H + 0.025, z] })))), { anchor: 'none', material: mat.board });

// ---- heaps: a lumpy loft in each bay, from the floor
for (let i = 0; i < N; i++) {
  const x = (divX[N - 1 - i] + divX[N - i]) / 2, [h, mt] = HEAPS[i], hx = BAY_HX - 0.08, hz = HZ - T - 0.25, zc = -0.08;
  m.part(`heap_${i + 1}`, loft([[0, hx, hz], [h * 0.45, hx * 0.88, hz * 0.82], [h * 0.82, hx * 0.58, hz * 0.52], [h, hx * 0.22, hz * 0.2]]),
    { at: [x, 0, zc], anchor: 'none', material: mt });
}

// ---- sign: a green plank on two stubs over the middle bay's back wall, three white strokes for lettering
const SZ = -HZ + T + SIGN.d / 2 + 0.01, top = slatYs.at(-1) + SLAT_H / 2;
m.part('sign_stubs', merge([1, -1].map(s => ({ geo: m.box(0.08, SIGN.y - top, 0.06), at: [s * (SIGN.w / 2 - 0.2), (SIGN.y + top) / 2, SZ - 0.06] }))), { anchor: 'none', material: mat.wood });
m.part('sign', m.box(SIGN.w, SIGN.h, SIGN.d), { at: [0, SIGN.y, SZ], material: mat.sign });
m.part('sign_text', merge([-0.5, 0, 0.5].map(x => ({ geo: m.box(0.38, 0.06, 0.02), at: [x, SIGN.y, SZ + SIGN.d / 2 + 0.01] }))), { anchor: 'none', material: mat.white });

await m.write(out('compost'));
