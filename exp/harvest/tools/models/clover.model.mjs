// Harvest backyard clover: one low clover patch filling a 0.5 m yard cell (instanced, a single mesh node `crop`, <= 80 tris).
// Source for assets/models/custom/clover.glb (spec: clover.spec.json). Regenerate from exp/harvest with
//   node tools/models/clover.model.mjs   (under the usual systemd-run memory cap); needs the glb-author skill's kit.
// Metres, +Y up, origin bottom-centre of the cell; footprint within x, z +/-0.25; height YARD_CROPS.clover.h.
// Three trefoils (three two-faced leaflets on a stem) and three round flower heads on stems: two pink (petal), one white (head).
import { YARD_CROPS } from '../../src/defs/models.js';
import { kenney, KIT, out, Soup, ring, fan, joinInto } from './lib.mjs';
const { model } = await import(KIT);

const m = model('clover');
const crop = m.material('crop', { color: kenney('#3f9e45'), roughness: 0.95 });
const petal = m.material('petal', { color: kenney('#ef7fb4'), roughness: 0.9 });
const head = m.material('head', { color: kenney('#f7f3ea'), roughness: 0.9 });

// ---- numbers first
const H = YARD_CROPS.clover.h;
const D2R = Math.PI / 180;
const LEAVES = [[0.09, 0.08, 0.15, 10], [-0.11, 0.04, 0.12, 70], [0.02, -0.12, 0.13, 40]];     // trefoils [x, z, y, turn deg]
const LEAFLET = { len: 0.12, w: 0.055, tip: 0.015 };                                           // leaflet length, half-width, tip droop
const FLOWERS = [[-0.04, 0.13, 1, petal], [0.13, -0.08, 0.85, petal], [-0.15, -0.12, 0.75, head]]; // [x, z, h frac, material]
const BALL = { r: 0.05, h: 0.1 };                                                              // flower head: radius, height

const green = new Soup(), pink = new Soup(), white = new Soup();
const stem = (x, z, top) => green.both([x + 0.01, 0, z], [x - 0.01, 0, z], [x, top, z]);
for (const [x, z, y, turn] of LEAVES) {
  stem(x, z, y);
  for (let i = 0; i < 3; i++) {   // leaflets: flat diamonds, broad end out (a heart-ish blade), tilted up a little
    const a = (turn + i * 120) * D2R, ux = Math.sin(a), uz = Math.cos(a), px = uz, pz = -ux, L = LEAFLET.len;
    green.both([x, y, z],
      [x + ux * L * 0.6 + px * LEAFLET.w, y + 0.02, z + uz * L * 0.6 + pz * LEAFLET.w],
      [x + ux * L, y + 0.01 - LEAFLET.tip, z + uz * L],
      [x + ux * L * 0.6 - px * LEAFLET.w, y + 0.02, z + uz * L * 0.6 - pz * LEAFLET.w]);
  }
}
for (const [x, z, k, mat] of FLOWERS) {
  const top = H * k, mid = ring(x, top - BALL.h * 0.45, z, BALL.r, 4, 20), s = mat === petal ? pink : white;
  stem(x, z, top - BALL.h + 0.01);
  fan(s, mid, [x, top, z]);
  fan(s, mid, [x, top - BALL.h, z]);
}
m.part('crop', green.geometry(), { anchor: 'none', material: crop });
m.part('crop_petal', pink.geometry(), { anchor: 'none', material: petal });
m.part('crop_head', white.geometry(), { anchor: 'none', material: head });
joinInto(m, 'crop', ['crop_petal', 'crop_head']);

await m.write(out('clover'));
