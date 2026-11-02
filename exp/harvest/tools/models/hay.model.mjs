// Harvest meadow hay: one clump of tall meadow grass filling a 1 m field cell (instanced, a single mesh node `crop`, <= 110 tris).
// Source for assets/models/custom/hay.glb (spec: hay.spec.json). Regenerate from exp/harvest with
//   node tools/models/hay.model.mjs   (under the usual systemd-run memory cap); needs the glb-author skill's kit.
// Metres, +Y up, origin bottom-centre of the cell; footprint within x, z +/-0.5; height MEADOW_CROPS.hay.h.
// Four tall leaning golden-green tufts, ten loose two-faced blades flopping outwards, and seven thin stems with pale seed heads.
import { MEADOW_CROPS } from '../../src/defs/models.js';
import { kenney, KIT, out, Soup, ring, fan, joinInto } from './lib.mjs';
const { model } = await import(KIT);

const m = model('hay');
const crop = m.material('crop', { color: kenney('#b5c447'), roughness: 0.95 });
const head = m.material('head', { color: kenney('#ead58a'), roughness: 0.95 });

// ---- numbers first
const H = MEADOW_CROPS.hay.h;
const D2R = Math.PI / 180;
const TUFTS = [[0.05, 0.03, 0.8, 0.12, 0], [-0.2, -0.16, 0.74, 0.11, 40], [0.22, -0.2, 0.7, 0.11, 80], [-0.12, 0.22, 0.76, 0.11, 20]]; // [x, z, h frac, r, twist]
const BLADES = 10, BLADE_W = 0.07;                         // loose blades round the clump: base half-width
const SEEDS = [[0.06, 0.1, 1, 200], [-0.14, -0.04, 0.95, 120], [0.14, -0.12, 0.9, 300], [-0.04, 0.2, 0.88, 30],
  [0.26, 0.14, 0.86, 80], [-0.26, 0.1, 0.84, 250], [0.02, -0.26, 0.92, 160]];   // [x, z, h frac, lean dir]
const HEAD = { r: 0.035, len: 0.2 };                       // seed head: widest radius and length (top at H * frac)

const green = new Soup(), pale = new Soup();
// tufts: tall three-sided pyramids, apex leaning out from the centre
for (const [x, z, k, r, tw] of TUFTS) fan(green, ring(x, 0, z, r, 3, tw), [x * 1.8, H * k, z * 1.8]);
// blades: two-faced triangles from near the middle flopping out toward the cell edge
for (let i = 0; i < BLADES; i++) {
  const a = (i * 36 + 10) * D2R, ux = Math.sin(a), uz = Math.cos(a), px = uz, pz = -ux;
  const r0 = 0.1, r1 = 0.38 + 0.06 * (i % 2), h = H * (0.45 + 0.12 * ((i * 3) % 4) / 3);
  green.both([ux * r0 + px * BLADE_W, 0, uz * r0 + pz * BLADE_W], [ux * r0 - px * BLADE_W, 0, uz * r0 - pz * BLADE_W], [ux * r1, h, uz * r1]);
}
// seed stems: a thin two-faced sliver up to a four-sided spindle head
for (const [x, z, k, dir] of SEEDS) {
  const top = H * k, a = dir * D2R, tx = x + 0.08 * Math.sin(a), tz = z + 0.08 * Math.cos(a), hb = top - HEAD.len;
  green.both([x + 0.025, 0, z], [x - 0.025, 0, z], [tx, hb + 0.02, tz]);
  const mid = ring(tx, hb + HEAD.len * 0.4, tz, HEAD.r, 4, dir);
  fan(pale, mid, [tx, top, tz]);
  fan(pale, mid, [tx, hb, tz]);
}
m.part('crop', green.geometry(), { anchor: 'none', material: crop });
m.part('crop_head', pale.geometry(), { anchor: 'none', material: head });
joinInto(m, 'crop', ['crop_head']);

await m.write(out('hay'));
