// Harvest meadow alfalfa: one bushy clump filling a 1 m field cell (instanced, a single mesh node `crop`, <= 110 tris).
// Source for assets/models/custom/alfalfa.glb (spec: alfalfa.spec.json). Regenerate from exp/harvest with
//   node tools/models/alfalfa.model.mjs   (under the usual systemd-run memory cap); needs the glb-author skill's kit.
// Metres, +Y up, origin bottom-centre of the cell; footprint within x, z +/-0.5; height MEADOW_CROPS.alfalfa.h.
// Six leafy green mounds (faceted five-sided, widest low down) and eight small purple flower clusters poking out of their tops.
import { MEADOW_CROPS } from '../../src/defs/models.js';
import { kenney, KIT, out, Soup, ring, fan, joinInto } from './lib.mjs';
const { model } = await import(KIT);

const m = model('alfalfa');
const crop = m.material('crop', { color: kenney('#4fa33c'), roughness: 0.95 });
const petal = m.material('petal', { color: kenney('#9b6fd6'), roughness: 0.9 });

// ---- numbers first
const H = MEADOW_CROPS.alfalfa.h;
// bushes [x, z, r, top frac, widest frac, twist]: one in the middle, five round it
const BUSHES = [[0, 0, 0.24, 0.84, 0.3, 0], ...[0.8, 0.72, 0.76, 0.7, 0.78].map((k, i) => {
  const a = (i * 72 + 20) * Math.PI / 180, rr = 0.27;
  return [rr * Math.sin(a), rr * Math.cos(a), 0.19, k, 0.28, i * 31];
})];
// flower clusters [x, z, top frac]: little purple spindles at the bushes' crowns (the tallest reaches H)
const FLOWERS = [[0.04, 0.05, 1], [-0.08, -0.06, 0.95], [0.27, 0.16, 0.9], [-0.26, 0.14, 0.86], [0.06, -0.3, 0.88], [-0.2, -0.22, 0.8],
  [0.3, -0.12, 0.83], [-0.05, 0.3, 0.84]];
const CL = { r: 0.055, len: 0.14 };

const green = new Soup(), purple = new Soup();
for (const [x, z, r, k, w, tw] of BUSHES) {
  const mid = ring(x, H * k * w, z, r, 5, tw);
  fan(green, mid, [x + 0.04 * Math.sin(tw), H * k, z + 0.04 * Math.cos(tw)]); // crown, a little off-centre
  fan(green, mid, [x, 0, z]);           // down to the ground
}
for (const [x, z, k] of FLOWERS) {
  const top = H * k, mid = ring(x, top - CL.len * 0.55, z, CL.r, 3, 90 * k);
  fan(purple, mid, [x, top, z]);
  fan(purple, mid, [x, top - CL.len, z]);
}
m.part('crop', green.geometry(), { anchor: 'none', material: crop });
m.part('crop_petal', purple.geometry(), { anchor: 'none', material: petal });
joinInto(m, 'crop', ['crop_petal']);

await m.write(out('alfalfa'));
