// Harvest round hay bale: lying on its side, axis along X (instanced by the game on the bale trailers and in the barn, so a single
// mesh node `bale`, <= 160 tris). Source for assets/models/custom/bale.glb (spec: bale.spec.json). Regenerate from exp/harvest with
//   node tools/models/bale.model.mjs   (under the usual systemd-run memory cap); needs the glb-author skill's kit.
// Metres, +Y up, origin bottom-centre (the bale's centre is at y = BALE.r); radius BALE.r, width BALE.w along X.
// A 14-sided golden straw barrel, two darker twine bands round it, and on each round face a darker ring with a pale core
// standing just proud of the face (the rolled spiral).
import { BALE } from '../../src/defs/models.js';
import { kenney, KIT, out, Soup, joinInto } from './lib.mjs';
const { model } = await import(KIT);

const m = model('roundbale');               // the root; the mesh node is `bale`
const straw = m.material('grain', { color: kenney('#e6bf55'), roughness: 0.95 });
const dark = m.material('seed', { color: kenney('#b88a32'), roughness: 0.95 });

// ---- numbers first
const R = BALE.r, HW = BALE.w / 2, N = 14;
const BANDS = [-HW * 0.45, HW * 0.45], BAND_W = 0.035, BAND_UP = 0.008;   // twine bands: x centres, half width, stand-off
const RING = { r: 0.66 * R, up: 0.006 }, CORE = { r: 0.3 * R, up: 0.012 }; // face rings: radius, stand-off from the face
// a point on the barrel at angle i (around X; i = 0 straight down so a corner, not a flat, sits on the ground)
const P = (x, r, i, n = N) => { const a = 2 * Math.PI * i / n; return [x, R - r * Math.cos(a), r * Math.sin(a)]; };

const body = new Soup(), marks = new Soup();
const away = c => [0, c[1] - R, c[2]];                     // barrel faces look away from the axis
for (let i = 0; i < N; i++) body.quad(P(-HW, R, i), P(HW, R, i), P(HW, R, i + 1), P(-HW, R, i + 1), away);
for (const s of [1, -1]) for (let i = 1; i + 1 < N; i++) body.tri(P(s * HW, R, 0), P(s * HW, R, i), P(s * HW, R, i + 1), [s, 0, 0]); // flat end caps
// twine bands: an open ring standing just off the barrel; its bottom corner stays on the barrel's, so nothing dips below the ground
const rb = i => (i % N === 0 ? R : R + BAND_UP);
for (const xc of BANDS) for (let i = 0; i < N; i++)
  marks.quad(P(xc - BAND_W, rb(i), i), P(xc + BAND_W, rb(i), i), P(xc + BAND_W, rb(i + 1), i + 1), P(xc - BAND_W, rb(i + 1), i + 1), away);
// face rings: a dark disc with a pale core over it
for (const s of [1, -1]) {
  for (let i = 1; i + 1 < 8; i++) marks.tri(P(s * (HW + RING.up), RING.r, 0, 8), P(s * (HW + RING.up), RING.r, i, 8), P(s * (HW + RING.up), RING.r, i + 1, 8), [s, 0, 0]);
  for (let i = 1; i + 1 < 6; i++) body.tri(P(s * (HW + CORE.up), CORE.r, 0.5, 6), P(s * (HW + CORE.up), CORE.r, i + 0.5, 6), P(s * (HW + CORE.up), CORE.r, i + 1.5, 6), [s, 0, 0]);
}
m.part('bale', body.geometry(), { anchor: 'none', material: straw });
m.part('bale_marks', marks.geometry(), { anchor: 'none', material: dark });
joinInto(m, 'bale', ['bale_marks']);

await m.write(out('bale'));
