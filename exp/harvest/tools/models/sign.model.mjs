// Harvest price sign: a board on two wooden posts for a closed field; the game draws the price on the board's front.
// Source for assets/models/custom/sign.glb (spec: sign.spec.json). Regenerate from exp/harvest with
//   node tools/models/sign.model.mjs   (under the usual systemd-run memory cap); needs the glb-author skill's kit.
// Metres, +Y up, the board's front faces +Z, origin bottom-centre on the ground. Numbers from SIGN (src/defs/models.js).
// Contract nodes: board (its own material `board`; front face UVs 0..1, u left->right, v bottom->top as three.js lays a
// BoxGeometry face, so a CanvasTexture with the default flipY reads upright), posts.
import { SIGN as S } from '../../src/defs/models.js';
import { kenney, KIT, out, merge } from './lib.mjs';
const { model } = await import(KIT);

const m = model('sign');

const mat = {
  wood:  m.material('wood',  { color: kenney('#9a6a3e'), roughness: 0.9 }),
  trim:  m.material('trim',  { color: kenney('#f3efe6'), roughness: 0.85 }),
  board: m.material('board', { color: kenney('#fbf5e4'), roughness: 0.8 }),
};

// ---- numbers first
const P = S.post, PX = S.w / 2 - 0.2;                     // post side; posts stand inside the board's ends
const BACK_T = 0.06, FACE_T = 0.03, FRAME = 0.08;          // backing plank, the board's thickness, wooden frame width
const TOP = S.y + S.h / 2 + 0.12;                           // posts rise a little above the board

const posts = m.group('posts');
m.part('post_poles', merge([1, -1].map(s => ({ geo: m.box(P, TOP, P), at: [s * PX, TOP / 2, 0] }))), { parent: posts, anchor: 'none', material: mat.wood });
m.part('post_caps', merge([1, -1].map(s => ({ geo: m.cone(P * 0.75, 0.12, 4), at: [s * PX, TOP + 0.06, 0], rot: [0, 45, 0] }))), { parent: posts, anchor: 'none', material: mat.wood });
m.part('backing', m.box(S.w + 2 * FRAME, S.h + 2 * FRAME, BACK_T), { parent: posts, at: [0, S.y, P / 2], anchor: 'back', material: mat.wood });

// the board: its front face is the price face
m.part('board', m.box(S.w, S.h, FACE_T), { at: [0, S.y, P / 2 + BACK_T], anchor: 'back', uv: 'fit', material: mat.board });

await m.write(out('sign'));
