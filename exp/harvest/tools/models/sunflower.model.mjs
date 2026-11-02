// Harvest sunflower: one clump filling a 1 m field cell (instanced by the thousand, so a single mesh node `crop`,
// <= 120 tris). Source for assets/models/custom/sunflower.glb (spec: sunflower.spec.json). Regenerate from exp/harvest with
//   node tools/models/sunflower.model.mjs   (under the usual systemd-run memory cap); needs the glb-author skill's kit.
// Metres, +Y up, origin bottom-centre of the cell; footprint within x, z +/-0.5; height CROPS.sunflower.h.
// Two stalks with two leaves each, each topped by a big face (yellow star of petals, raised brown seed disc) facing +Z.
import { CROPS } from '../../src/defs/models.js';
import { kenney, KIT, out, Soup, ring, tube, joinInto } from './lib.mjs';
const { model } = await import(KIT);

const m = model('sunflower');
const crop = m.material('crop', { color: kenney('#4c9a3a'), roughness: 0.9 });
const petal = m.material('petal', { color: kenney('#ffd93b'), roughness: 0.8 });
const seed = m.material('seed', { color: kenney('#6b3f1e'), roughness: 0.95 });

// ---- numbers first: flowers [x, z, face radius, height scale, turn deg about Y]
const H = CROPS.sunflower.h;
const FLOWERS = [[-0.2, -0.12, 0.3, 1, -8], [0.22, 0.14, 0.24, 0.8, 10]];
const SR0 = 0.05, SR1 = 0.035;         // stalk radius at ground / under the face (4-sided)
const PETALS = 6, INNER = 0.62;        // star points; the notch radius between petals (fraction of the face radius)
const DISC = 0.5, DISC_D = 0.06;       // seed disc radius (fraction of the face radius) and how far it stands proud
const TILT = -20;                      // faces tip back to the sky a little (negative = up) so they catch the light and show from above
const LEAVES = [[0.35, 40], [0.6, 220]];  // [height fraction, direction deg] (mirrored for the second flower, so they stay in the cell)
const LEAF = { len: 0.32, w: 0.11 };

const green = new Soup(), yellow = new Soup(), brown = new Soup();
const D2R = Math.PI / 180;
for (const [fi, [x, z, R, k, turn]] of FLOWERS.entries()) {
  const top = H * k - R * Math.cos(TILT * D2R);      // the face's centre height, so its top edge reaches H * k
  tube(green, ring(x, 0, z, SR0, 4, 0), ring(x, top, z, SR1, 4, 15));
  // face frame: n = facing (+Z, nodded down by TILT, turned about Y), u = across, v = up the face
  const t = TILT * D2R, r = turn * D2R;
  const n = [Math.cos(t) * Math.sin(r), -Math.sin(t), Math.cos(t) * Math.cos(r)];
  const u = [Math.cos(r), 0, -Math.sin(r)];
  const v = [u[1] * n[2] - u[2] * n[1], u[2] * n[0] - u[0] * n[2], u[0] * n[1] - u[1] * n[0]];
  const c = [x, top, z + 0.04];
  const at = (a, rad, off = 0) => c.map((cc, i) => cc + rad * (Math.cos(a) * u[i] + Math.sin(a) * v[i]) + off * n[i]);
  // petals: a star fan, two-faced so it shows from behind too
  for (let i = 0; i < PETALS; i++) {
    const a0 = 2 * Math.PI * i / PETALS, a1 = a0 + Math.PI / PETALS, a2 = a0 + 2 * Math.PI / PETALS;
    yellow.both(c, at(a0, R * INNER), at(a1, R)).both(c, at(a1, R), at(a2, R * INNER));
  }
  // seed disc: a hexagon raised DISC_D off the petals toward the front, with a slanted rim
  const rim0 = Array.from({ length: 6 }, (_, i) => at(2 * Math.PI * i / 6, R * DISC, 0.005));
  const rim1 = Array.from({ length: 6 }, (_, i) => at(2 * Math.PI * i / 6, R * DISC * 0.8, DISC_D));
  const cc = at(0, 0, DISC_D);
  for (let i = 0; i < 6; i++) {
    const j = (i + 1) % 6;
    brown.quad(rim0[i], rim0[j], rim1[j], rim1[i], p => p.map((q, ix) => q - c[ix]));
    brown.tri(rim1[i], rim1[j], cc, n);
  }
  // leaves: two-faced diamonds
  for (const [f, dir] of LEAVES) {
    const a = (fi ? -dir : dir) * D2R, ux = Math.sin(a), uz = Math.cos(a), px = uz, pz = -ux, y = top * f;
    const base = [x + ux * SR0, y, z + uz * SR0], mid = [x + ux * LEAF.len * 0.5, y + 0.06, z + uz * LEAF.len * 0.5];
    green.both(base, [mid[0] + px * LEAF.w, mid[1], mid[2] + pz * LEAF.w], [x + ux * LEAF.len, y - 0.02, z + uz * LEAF.len], [mid[0] - px * LEAF.w, mid[1], mid[2] - pz * LEAF.w]);
  }
}
m.part('crop', green.geometry(), { anchor: 'none', material: crop });
m.part('crop_petal', yellow.geometry(), { anchor: 'none', material: petal });
m.part('crop_seed', brown.geometry(), { anchor: 'none', material: seed });
joinInto(m, 'crop', ['crop_petal', 'crop_seed']);

await m.write(out('sunflower'));
