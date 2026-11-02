// Harvest backyard lawn: one short grass clump filling a 0.5 m yard cell (instanced by the thousand, so a single mesh node
// `crop`, <= 24 tris). Source for assets/models/custom/lawn.glb (spec: lawn.spec.json). Regenerate from exp/harvest with
//   node tools/models/lawn.model.mjs   (under the usual systemd-run memory cap); needs the glb-author skill's kit.
// Metres, +Y up, origin bottom-centre of the cell; footprint within x, z +/-0.25; height YARD_CROPS.lawn.h.
// Seven bright-green three-sided tufts, each a little pyramid leaning a different way.
import { YARD_CROPS } from '../../src/defs/models.js';
import { kenney, KIT, out, Soup, ring, fan } from './lib.mjs';
const { model } = await import(KIT);

const m = model('lawn');
const crop = m.material('crop', { color: kenney('#5cc23f'), roughness: 0.95 });

// ---- numbers first: tufts [x, z, height scale, base radius, twist deg, lean x, lean z]
const H = YARD_CROPS.lawn.h;
const TUFTS = [
  [0, 0, 1, 0.075, 0, 0.02, 0.01],
  ...[0.85, 0.95, 0.8, 0.9, 1, 0.82].map((k, i) => {
    const a = (i * 60 + 30) * Math.PI / 180, rr = 0.165;
    return [rr * Math.sin(a), rr * Math.cos(a), k, 0.065, i * 37, 0.035 * Math.sin(a), 0.035 * Math.cos(a)];
  }),
];

const s = new Soup();
for (const [x, z, k, r, tw, lx, lz] of TUFTS) fan(s, ring(x, 0, z, r, 3, tw), [x + lx, H * k, z + lz]);
m.part('crop', s.geometry(), { anchor: 'none', material: crop });

await m.write(out('lawn'));
