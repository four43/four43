// Harvest wheat: one ripe clump filling a 1 m field cell (instanced by the thousand, so a single mesh node `crop`, <= 120
// tris). Source for assets/models/custom/wheat.glb (spec: wheat.spec.json). Regenerate from exp/harvest with
//   node tools/models/wheat.model.mjs   (under the usual systemd-run memory cap); needs the glb-author skill's kit.
// Metres, +Y up, origin bottom-centre of the cell; footprint within x, z +/-0.5; height CROPS.wheat.h.
// Seven tufts: a tapered golden stalk bundle each, topped by a paler diamond-shaped ear.
import { CROPS } from '../../src/defs/models.js';
import { kenney, KIT, out, Soup, ring, tube, fan, joinInto } from './lib.mjs';
const { model } = await import(KIT);

const m = model('wheat');
const crop = m.material('crop', { color: kenney('#d9a53a'), roughness: 0.95 });
const head = m.material('head', { color: kenney('#f2cf6b'), roughness: 0.95 });

// ---- numbers first: tufts [x, z, height scale, twist deg]: one in the middle, six round it
const H = CROPS.wheat.h;
const TUFTS = [[0, 0, 1, 0], ...[0.96, 0.9, 0.97, 0.92, 1, 0.94].map((k, i) => {
  const a = (i * 60 + 15) * Math.PI / 180, rr = 0.32 + 0.02 * (i % 2);
  return [rr * Math.sin(a), rr * Math.cos(a), k, i * 23];
})];
const R0 = 0.11, R1 = 0.06;                          // stalk bundle radius at the ground / under the ear (4-sided)
const EAR_R = 0.13, EAR_Y0 = 0.5, EAR_MID = 0.64;    // ear: widest radius; where it starts and is widest (fraction of height)

const stalks = new Soup(), ears = new Soup();
for (const [x, z, k, tw] of TUFTS) {
  const h = H * k, mid = ring(x, h * EAR_MID, z, EAR_R, 4, tw + 45);
  tube(stalks, ring(x, 0, z, R0, 4, tw), ring(x, h * EAR_Y0 + 0.03, z, R1, 4, tw + 10));
  fan(ears, mid, [x, h, z]);                 // a long pointed ear above its widest ring
  fan(ears, mid, [x, h * EAR_Y0, z]);        // and a short point down into the stalk
}
m.part('crop', stalks.geometry(), { anchor: 'none', material: crop });
m.part('crop_head', ears.geometry(), { anchor: 'none', material: head });
joinInto(m, 'crop', ['crop_head']);

await m.write(out('wheat'));
