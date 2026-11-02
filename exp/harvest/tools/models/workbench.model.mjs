// Harvest workbench: the mower's garage, out in the open. A sturdy wooden bench with a vice and a few tools on it, a pegboard of
// hanging tools on two posts behind it, a red toolbox and an oil drum at its ends. Source for assets/models/custom/workbench.glb
// (spec: workbench.spec.json). Regenerate from exp/harvest with   node tools/models/workbench.model.mjs   (under the usual
// systemd-run memory cap); needs the glb-author skill's kit. Metres, +Y up, the bench's front faces +Z, origin bottom-centre.
// Numbers from WORKBENCH (src/defs/models.js). Contract nodes: bench, board.
import { WORKBENCH as W } from '../../src/defs/models.js';
import { kenney, KIT, out, merge } from './lib.mjs';
const { model } = await import(KIT);

const m = model('workbench');
const mat = {
  wood:  m.material('wood',  { color: kenney('#9a6a3e'), roughness: 0.9 }),
  dark:  m.material('dark',  { color: kenney('#5b3b22'), roughness: 0.9 }),
  metal: m.material('metal', { color: kenney('#4f545a'), roughness: 0.6 }),
  red:   m.material('red',   { color: kenney('#c8372d'), roughness: 0.7 }),
  trim:  m.material('trim',  { color: kenney('#f5c22b'), roughness: 0.7 }),
  board: m.material('board', { color: kenney('#d9c29a'), roughness: 0.85 }),
};

// ---- numbers first
const HX = W.w / 2, D = W.d, TOP = W.h, T = 0.08;           // half width, depth, top height, top thickness
const BZ = -D / 2 - 0.2;                                      // the pegboard's plane, behind the bench

const bench = m.group('bench');
m.part('bench_top', m.box(W.w, T, D), { parent: bench, at: [0, TOP - T, 0], anchor: 'bottom', material: mat.wood });
m.part('bench_legs', merge([[1, 1], [-1, 1], [1, -1], [-1, -1]].map(([sx, sz]) => ({ geo: m.box(0.12, TOP - T, 0.12), at: [sx * (HX - 0.12), (TOP - T) / 2, sz * (D / 2 - 0.1)] }))),
  { parent: bench, anchor: 'none', material: mat.dark });
m.part('bench_shelf', m.box(W.w - 0.3, 0.05, D - 0.2), { parent: bench, at: [0, 0.25, 0], anchor: 'bottom', material: mat.dark });
// on the bench: a vice at the right end, a hammer, a can
m.part('vice', merge([{ geo: m.box(0.22, 0.16, 0.3), at: [-HX + 0.4, TOP + 0.08, D / 2 - 0.15] }, { geo: m.box(0.3, 0.04, 0.04), at: [-HX + 0.4, TOP + 0.1, D / 2 + 0.04] }]),
  { parent: bench, anchor: 'none', material: mat.metal });
m.part('hammer', merge([{ geo: m.box(0.4, 0.04, 0.04), at: [0.3, TOP + 0.02, 0.1] }, { geo: m.box(0.06, 0.06, 0.16), at: [0.5, TOP + 0.03, 0.1] }]), { parent: bench, anchor: 'none', material: mat.metal });
m.part('can', m.cyl(0.08, 0.08, 0.2, 10), { parent: bench, at: [0.9, TOP, -0.15], anchor: 'bottom', material: mat.red });
// a toolbox on the shelf's left end and an oil drum beside the bench
m.part('toolbox', merge([{ geo: m.box(0.6, 0.3, 0.32), at: [HX - 0.55, 0.45, 0] }]), { parent: bench, anchor: 'none', material: mat.red });
m.part('toolbox_handle', m.box(0.3, 0.04, 0.04), { parent: bench, at: [HX - 0.55, 0.62, 0], material: mat.metal });
m.part('drum', m.cyl(0.3, 0.3, 0.9, 12), { parent: bench, at: [HX + 0.45, 0, -0.05], anchor: 'bottom', material: mat.trim });
m.part('drum_bands', merge([0.25, 0.65].map(y => ({ geo: m.cyl(0.31, 0.31, 0.04, 12), at: [HX + 0.45, y, -0.05] }))), { parent: bench, anchor: 'none', material: mat.metal });

// ---- pegboard on two posts behind the bench, with hanging tools
const board = m.group('board');
m.part('board_posts', merge([1, -1].map(s => ({ geo: m.box(0.12, W.board, 0.12), at: [s * (HX - 0.1), W.board / 2, BZ] }))), { parent: board, anchor: 'none', material: mat.dark });
m.part('board_panel', m.box(W.w - 0.1, 1.0, 0.04), { parent: board, at: [0, W.board - 0.55, BZ + 0.08], material: mat.board });
m.part('board_tools', merge([
  { geo: m.box(0.06, 0.45, 0.04), at: [-1.1, W.board - 0.55, BZ + 0.13] },   // a spanner
  { geo: m.box(0.08, 0.35, 0.04), at: [-0.7, W.board - 0.5, BZ + 0.13] },    // a screwdriver
  { geo: m.box(0.35, 0.06, 0.04), at: [-0.2, W.board - 0.35, BZ + 0.13] },   // a saw's back
  { geo: m.box(0.5, 0.18, 0.02), at: [-0.2, W.board - 0.48, BZ + 0.13] },    // its blade
  { geo: m.box(0.06, 0.5, 0.04), at: [0.45, W.board - 0.55, BZ + 0.13] },    // a wrench
  { geo: m.box(0.25, 0.25, 0.04), at: [1.0, W.board - 0.55, BZ + 0.13] },    // a coil of hose
]), { parent: board, anchor: 'none', material: mat.metal });
m.part('board_sign', m.box(1.2, 0.3, 0.04), { parent: board, at: [0, W.board - 0.15, BZ + 0.12], material: mat.red });

await m.write(out('workbench'));
