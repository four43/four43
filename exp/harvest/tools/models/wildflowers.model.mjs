// Harvest meadow wildflowers: one cheerful clump filling a 1 m field cell (instanced, a single mesh node `crop`, <= 110 tris).
// Source for assets/models/custom/wildflowers.glb (spec: wildflowers.spec.json). Regenerate from exp/harvest with
//   node tools/models/wildflowers.model.mjs   (under the usual systemd-run memory cap); needs the glb-author skill's kit.
// Metres, +Y up, origin bottom-centre of the cell; footprint within x, z +/-0.5; height MEADOW_CROPS.wildflowers.h.
// Low green leaf tufts and loose blades, and eight thin stems, each topped by a flat star-shaped flower head:
// red (petal), yellow (head), blue (flower) and white (seed), two of each.
import { MEADOW_CROPS } from '../../src/defs/models.js';
import { kenney, KIT, out, Soup, ring, fan, joinInto } from './lib.mjs';
const { model } = await import(KIT);

const m = model('wildflowers');
const mats = {
  crop:   m.material('crop',   { color: kenney('#5aae42'), roughness: 0.95 }),
  petal:  m.material('petal',  { color: kenney('#e2423a'), roughness: 0.9 }),
  head:   m.material('head',   { color: kenney('#f6cf2e'), roughness: 0.9 }),
  flower: m.material('flower', { color: kenney('#4f7fe0'), roughness: 0.9 }),
  seed:   m.material('seed',   { color: kenney('#f7f3ea'), roughness: 0.9 }),
};

// ---- numbers first
const H = MEADOW_CROPS.wildflowers.h;
const D2R = Math.PI / 180;
const TUFTS = [[0.02, 0.0, 0.11, 0], [-0.22, 0.18, 0.09, 40], [0.22, -0.16, 0.09, 80]];   // low leaf tufts [x, z, r, twist]
const TUFT_H = 0.28;
const BLADES = 6, BLADE_W = 0.06;
// flowers [x, z, h frac, colour]: the tallest reaches H
const FLOWERS = [[0.1, 0.18, 1, 'petal'], [-0.3, -0.1, 0.82, 'petal'], [-0.08, -0.26, 0.94, 'head'], [0.32, 0.2, 0.78, 'head'],
  [-0.2, 0.26, 0.9, 'flower'], [0.26, -0.28, 0.86, 'flower'], [0.0, 0.32, 0.74, 'seed'], [-0.34, -0.34, 0.7, 'seed']];
const BLOOM = { r: 0.08, h: 0.06 };                     // flower head: radius and thickness (a flat four-point star)

const green = new Soup(), heads = Object.fromEntries(Object.keys(mats).map(k => [k, new Soup()]));
for (const [x, z, r, tw] of TUFTS) fan(green, ring(x, 0, z, r, 3, tw), [x * 1.3, TUFT_H, z * 1.3]);
for (let i = 0; i < BLADES; i++) {
  const a = (i * 60 + 25) * D2R, ux = Math.sin(a), uz = Math.cos(a), px = uz, pz = -ux;
  const r0 = 0.08, r1 = 0.36 + 0.05 * (i % 2), h = 0.18 + 0.06 * (i % 3);
  green.both([ux * r0 + px * BLADE_W, 0, uz * r0 + pz * BLADE_W], [ux * r0 - px * BLADE_W, 0, uz * r0 - pz * BLADE_W], [ux * r1, h, uz * r1]);
}
for (const [x, z, k, col] of FLOWERS) {
  const top = H * k, cy = top - BLOOM.h / 2;
  green.both([x + 0.012, 0, z], [x - 0.012, 0, z], [x, cy, z]);       // stem
  const mid = ring(x, cy, z, BLOOM.r, 4, 45 * k * 3);                 // a flat star: a low cone up and a lower cone down
  fan(heads[col], mid, [x, top, z]);
  fan(heads[col], mid, [x, top - BLOOM.h, z]);
}
m.part('crop', green.geometry(), { anchor: 'none', material: mats.crop });
const others = [];
for (const k of ['petal', 'head', 'flower', 'seed']) { m.part(`crop_${k}`, heads[k].geometry(), { anchor: 'none', material: mats[k] }); others.push(`crop_${k}`); }
joinInto(m, 'crop', others);

await m.write(out('wildflowers'));
