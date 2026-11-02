// Harvest backyard long grass: one wild, overgrown clump filling a 0.5 m yard cell (instanced, a single mesh node `crop`,
// <= 80 tris). Source for assets/models/custom/longgrass.glb (spec: longgrass.spec.json). Regenerate from exp/harvest with
//   node tools/models/longgrass.model.mjs   (under the usual systemd-run memory cap); needs the glb-author skill's kit.
// Metres, +Y up, origin bottom-centre of the cell; footprint within x, z +/-0.25; height YARD_CROPS.longgrass.h.
// Four tall leaning yellow-green tufts, eight loose two-faced blades flopping outwards, and four thin stems with pale seed heads.
import { YARD_CROPS } from '../../src/defs/models.js';
import { kenney, KIT, out, Soup, ring, fan, joinInto } from './lib.mjs';
const { model } = await import(KIT);

const m = model('longgrass');
const crop = m.material('crop', { color: kenney('#a3c23a'), roughness: 0.95 });
const head = m.material('head', { color: kenney('#e3cf7a'), roughness: 0.95 });

// ---- numbers first
const H = YARD_CROPS.longgrass.h;
const D2R = Math.PI / 180;
const TUFTS = [[0.03, 0.02, 0.78, 0.07, 0], [-0.1, -0.08, 0.7, 0.06, 40], [0.1, -0.1, 0.66, 0.06, 80], [-0.06, 0.11, 0.72, 0.06, 20]]; // [x, z, h frac, r, twist]
const BLADES = 8, BLADE_W = 0.045;                       // loose blades round the clump: base half-width
const SEEDS = [[0.04, 0.06, 1, 200], [-0.07, -0.02, 0.93, 120], [0.06, -0.06, 0.88, 300], [-0.02, 0.1, 0.84, 30]]; // [x, z, h frac, lean dir]
const HEAD = { r: 0.028, len: 0.15 };                    // seed head: widest radius and length (top at H * frac)

const green = new Soup(), pale = new Soup();
// tufts: tall three-sided pyramids, apex leaning out from the centre
for (const [x, z, k, r, tw] of TUFTS) fan(green, ring(x, 0, z, r, 3, tw), [x * 2.2, H * k, z * 2.2]);
// blades: two-faced triangles from near the middle flopping out to the cell edge
for (let i = 0; i < BLADES; i++) {
  const a = (i * 45 + 10) * D2R, ux = Math.sin(a), uz = Math.cos(a), px = uz, pz = -ux;
  const r0 = 0.06, r1 = 0.2 + 0.03 * (i % 2), h = H * (0.5 + 0.12 * ((i * 3) % 4) / 3);
  green.both([ux * r0 + px * BLADE_W, 0, uz * r0 + pz * BLADE_W], [ux * r0 - px * BLADE_W, 0, uz * r0 - pz * BLADE_W], [ux * r1, h, uz * r1]);
}
// seed stems: a thin two-faced sliver up to a four-sided spindle head
for (const [x, z, k, dir] of SEEDS) {
  const top = H * k, a = dir * D2R, tx = x + 0.07 * Math.sin(a), tz = z + 0.07 * Math.cos(a), hb = top - HEAD.len;
  green.both([x + 0.012, 0, z], [x - 0.012, 0, z], [tx, hb + 0.02, tz]);
  const mid = ring(tx, hb + HEAD.len * 0.4, tz, HEAD.r, 4, dir);
  fan(pale, mid, [tx, top, tz]);
  fan(pale, mid, [tx, hb, tz]);
}
m.part('crop', green.geometry(), { anchor: 'none', material: crop });
m.part('crop_head', pale.geometry(), { anchor: 'none', material: head });
joinInto(m, 'crop', ['crop_head']);

await m.write(out('longgrass'));
