// Harvest farm gate: two white five-bar leaves on chunky wooden posts, closing the gap in the fence between the backyard and the
// grain fields until the combine is bought. Source for assets/models/custom/gate.glb (spec: gate.spec.json). Regenerate from
// exp/harvest with   node tools/models/gate.model.mjs   (under the usual systemd-run memory cap); needs the glb-author skill's kit.
// Metres, +Y up, the gate faces ±Z, origin bottom-centre on the ground. Numbers from GATE (src/defs/models.js).
// Contract nodes: posts, leaf_L (pivot at +x, its post), leaf_R (pivot at -x); the game turns the leaves about Y to open them.
import { GATE as G } from '../../src/defs/models.js';
import { kenney, KIT, out, merge } from './lib.mjs';
const { model } = await import(KIT);

const m = model('gate');
const mat = {
  wood:  m.material('wood',  { color: kenney('#8a5a32'), roughness: 0.9 }),
  white: m.material('white', { color: kenney('#f3efe6'), roughness: 0.85 }),
};

// ---- numbers first
const P = G.post, PH = G.h + 0.35, L = G.half - 0.05;   // post side and height; leaf length (a small gap in the middle)
const BAR = 0.09, BARS = 5;                            // bar height, how many

const posts = m.group('posts');
m.part('post_poles', merge([1, -1].map(s => ({ geo: m.box(P, PH, P), at: [s * (G.half + P / 2), PH / 2, 0] }))), { parent: posts, anchor: 'none', material: mat.wood });
m.part('post_caps', merge([1, -1].map(s => ({ geo: m.box(P + 0.06, 0.06, P + 0.06), at: [s * (G.half + P / 2), PH + 0.03, 0] }))), { parent: posts, anchor: 'none', material: mat.white });

// a leaf along -x from its hinge (at its group's origin): five bars, an upright at each end, a diagonal brace
function leaf(name, s) {
  const g = m.group(name, { at: [s * G.half, 0, 0] });
  const x = t => -s * t;                                      // distance t along the leaf from the hinge
  const ys = Array.from({ length: BARS }, (_, i) => 0.25 + i * (G.h - 0.25) / (BARS - 1));
  m.part(`${name}_bars`, merge(ys.map(y => ({ geo: m.box(L, BAR, 0.06), at: [x(L / 2), y, 0] }))), { parent: g, anchor: 'none', material: mat.white });
  m.part(`${name}_stiles`, merge([0.06, L - 0.06].map(t => ({ geo: m.box(0.12, G.h - 0.1, 0.08), at: [x(t), (G.h + 0.2) / 2, 0] }))), { parent: g, anchor: 'none', material: mat.white });
  const dx = L - 0.3, dy = G.h - 0.4, len = Math.hypot(dx, dy), a = Math.atan2(dy, dx) * 180 / Math.PI;
  m.part(`${name}_brace`, m.box(len, BAR, 0.05), { parent: g, at: [x(0.15 + dx / 2), 0.25 + dy / 2, 0.055], rot: [0, 0, s > 0 ? -a : a], material: mat.white });
  return g;
}
leaf('leaf_L', 1); leaf('leaf_R', -1);

await m.write(out('gate'));
