// Harvest corn (maize): one clump filling a 1 m field cell (instanced by the thousand, so a single mesh node `crop`,
// <= 120 tris). Source for assets/models/custom/corn.glb (spec: corn.spec.json). Regenerate from exp/harvest with
//   node tools/models/corn.model.mjs   (under the usual systemd-run memory cap); needs the glb-author skill's kit.
// Metres, +Y up, origin bottom-centre of the cell; footprint within x, z +/-0.5; height CROPS.corn.h.
// Three green stalks with pale tassels, broad two-faced leaves arching out, and two yellow cobs.
import { CROPS } from '../../src/defs/models.js';
import { kenney, KIT, out, Soup, ring, tube, fan, joinInto } from './lib.mjs';
const { model } = await import(KIT);

const m = model('corn');
const crop = m.material('crop', { color: kenney('#4fa83d'), roughness: 0.9 });
const cob = m.material('cob', { color: kenney('#f6cf3a'), roughness: 0.9 });
const tassel = m.material('tassel', { color: kenney('#e2d08a'), roughness: 0.95 });

// ---- numbers first: stalks [x, z, height scale, twist deg]
const H = CROPS.corn.h, TAS = 0.16;                    // full height; tassel length on top of the tallest stalk
const STALKS = [[-0.17, -0.12, 1, 20], [0.2, -0.08, 0.92, 70], [0.0, 0.22, 0.96, 140]];
const SR0 = 0.07, SR1 = 0.04;                          // stalk radius at ground / top (4-sided)
const LEAF = { len: 0.5, w: 0.13, lift: 0.16, droop: 0.2 };    // leaf reach, half-width at the bend, rise to the bend, drop to the tip
const LEAVES = [[0.2, 0], [0.35, 145], [0.5, 290], [0.65, 75], [0.8, 215]]; // [height fraction, direction deg] per stalk (twisted per stalk)
const COBS = [[0, 0.5, 0.13], [2, 0.45, -0.13]];       // [stalk index, height fraction, offset along x]
const COB_R = 0.09, COB_L = 0.36;                      // cob radius and length
const CELL = 0.48;                                     // leaves stay inside +/-CELL so tiled cells don't overlap much

const green = new Soup(), yellow = new Soup(), top = new Soup();
for (const [x, z, k, tw] of STALKS) {
  const h = H * k - TAS;
  tube(green, ring(x, 0, z, SR0, 4, tw), ring(x, h, z, SR1, 4, tw));
  fan(top, ring(x, h, z, 0.06, 3, tw), [x, h + TAS, z]);  // tassel: a three-sided spike
  for (const [f, dir] of LEAVES) {
    const a = (dir + tw) * Math.PI / 180, ux = Math.sin(a), uz = Math.cos(a), px = uz, pz = -ux; // out, and across the leaf
    let reach = LEAF.len;                                  // shorten a leaf that would leave the cell
    for (const [p, u] of [[x, ux], [z, uz]]) if (Math.abs(u) > 1e-6) reach = Math.min(reach, ((u > 0 ? CELL : -CELL) - p) / u);
    const L = reach, y = h * f, bx = x + ux * L * 0.5, bz = z + uz * L * 0.5, by = y + LEAF.lift;
    const base = [x + ux * SR0, y, z + uz * SR0];
    const bendL = [bx + px * LEAF.w, by, bz + pz * LEAF.w], bendR = [bx - px * LEAF.w, by, bz - pz * LEAF.w];
    const tip = [x + ux * L, y + LEAF.lift - LEAF.droop, z + uz * L];
    green.both(base, bendL, bendR).both(bendL, tip, bendR);   // two two-faced triangles: rising blade, drooping tip
  }
}
for (const [si, f, off] of COBS) {
  const [x, z, k, tw] = STALKS[si], y = H * k * f, cx = x + off, mid = ring(cx, y + COB_L * 0.35, z, COB_R, 4, tw + 45);
  fan(yellow, mid, [cx, y + COB_L, z]);     // a cob: two long four-sided points, tipped slightly away from the stalk
  fan(yellow, mid, [x + off * 0.4, y, z]);
}
m.part('crop', green.geometry(), { anchor: 'none', material: crop });
m.part('crop_cob', yellow.geometry(), { anchor: 'none', material: cob });
m.part('crop_tassel', top.geometry(), { anchor: 'none', material: tassel });
joinInto(m, 'crop', ['crop_cob', 'crop_tassel']);

await m.write(out('corn'));
