// Harvest barn: the upgrade workshop, a drive-through along Z. Barn-red side walls with white-framed windows, a tall gable over
// each doorway on a white header beam, a dark pitched roof with white fascia, workbenches along the walls, and a big blank
// signboard over the +Z doorway that the game paints. Source for assets/models/custom/shed.glb (spec: shed.spec.json).
// Regenerate from exp/harvest with   node tools/models/shed.model.mjs   (under the usual systemd-run memory cap); needs the
// glb-author skill's kit. Metres, +Y up, the doorways face ±Z (+X is the barn's LEFT), origin bottom-centre on the ground.
// Every placement comes from SHED (src/defs/models.js). Contract nodes: walls, gables, roof, signboard (front face UVs 0..1).
// The game hides gables, roof and signboard while the combine is inside, so walls must read on their own from above, and no two
// faces that look the same way share a plane (the wall tops show then).
import { SHED as S } from '../../src/defs/models.js';
import { kenney, KIT, out, merge } from './lib.mjs';
const { model } = await import(KIT);

const m = model('shed');

const mat = {
  red:      m.material('red',      { color: kenney('#b8352b'), roughness: 0.85 }),
  white:    m.material('white',    { color: kenney('#f3efe6'), roughness: 0.85 }),
  roof:     m.material('roof',     { color: kenney('#3f3d46'), roughness: 0.9 }),
  glass:    m.material('glass',    { color: kenney('#a9dcef'), roughness: 0.3 }),
  wood:     m.material('wood',     { color: kenney('#9a6a3e'), roughness: 0.9 }),
  sign:     m.material('sign',     { color: kenney('#fbf5e4'), roughness: 0.8 }),
};

// ---- numbers first
const HX = S.half, HZ = S.depth / 2, T = S.wall;          // half width, half depth, wall thickness
const IX = HX - T;                                         // the walls' inner face
const RT = 0.3, OVX = 0.6, OVZ = 0.5;                      // roof slab thickness (vertical); overhang at the sides / ends
const RIDGE = S.height, Y_PK = RIDGE - RT;                 // roof top at the ridge = SHED.height; underside at the ridge
const EAVE = S.eave;                                       // side wall height (the roof underside meets their outer face)
const slope = (Y_PK - EAVE) / HX, under = x => Y_PK - slope * Math.abs(x);
const EX = HX + OVX;
const DOOR = S.door;                                       // top of each doorway (the header beam sits just under it)
const BEAM = 0.45;
const SIGN = { w: 6.4, h: 1.6, d: 0.12 };                  // signboard size; centred in the +Z gable above the beam
SIGN.y = DOOR + 0.25 + SIGN.h / 2 + 0.15;

// ---- walls: two side walls, the full depth, and the trim that stands proud of them
const walls = m.group('walls');
for (const s of [1, -1]) m.part(`wall_${s > 0 ? 'L' : 'R'}`, m.box(T, EAVE, 2 * HZ), { parent: walls, at: [s * (HX - T / 2), 0, 0], anchor: 'bottom', material: mat.red });
// corner boards: proud of the wall on both sides and a little taller, so no face shares a plane with the wall's
m.part('corners', merge([[1, 1], [-1, 1], [1, -1], [-1, -1]].map(([sx, sz]) => ({ geo: m.box(T + 0.16, EAVE + 0.06, 0.36), at: [sx * (HX - T / 2), (EAVE + 0.06) / 2, sz * (HZ - 0.1)] }))),
  { parent: walls, anchor: 'none', material: mat.white });
// a white cap along each wall top (seen from above while the roof is off)
m.part('wall_caps', merge([1, -1].map(s => ({ geo: m.box(T + 0.1, 0.08, 2 * HZ - 0.8), at: [s * (HX - T / 2), EAVE + 0.04, 0] }))), { parent: walls, anchor: 'none', material: mat.white });
// windows: three per side, white frames round pale glass, both proud of the wall
for (const s of [1, -1]) {
  const id = s > 0 ? 'L' : 'R', zs = [-4, 0, 4];
  m.part(`window_frames_${id}`, merge(zs.map(z => ({ geo: m.box(0.1, 1.5, 1.9), at: [s * (HX + 0.05), 3.0, z] }))), { parent: walls, anchor: 'none', material: mat.white });
  m.part(`window_glass_${id}`, merge(zs.map(z => ({ geo: m.box(0.1, 1.2, 1.6), at: [s * (HX + 0.09), 3.0, z] }))), { parent: walls, anchor: 'none', material: mat.glass });
}
// workbenches against both walls inside, clear of the drive lane
for (const s of [1, -1]) {
  const x = s * (IX - 0.45);
  m.part(`bench_${s > 0 ? 'L' : 'R'}`, merge([
    { geo: m.box(0.9, 0.12, 3.2), at: [x, 0.95, -2] },
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => ({ geo: m.box(0.1, 0.89, 0.1), at: [x + a * 0.35, 0.445, -2 + b * 1.45] })),
    { geo: m.box(0.06, 1.4, 3.0), at: [s * (IX - 0.03), 1.75, -2] },
  ]), { parent: walls, anchor: 'none', material: mat.wood });
}

// ---- gables: a wall over each doorway, between the side walls, from the beam up to the roof; the header beams
const gables = m.group('gables');
const gable = [[-IX, DOOR], [IX, DOOR], [IX, under(IX)], [0, Y_PK], [-IX, under(IX)]];
for (const s of [1, -1]) {
  m.part(`gable_${s > 0 ? 'F' : 'B'}`, m.extrude(gable, T), { parent: gables, at: [0, 0, s > 0 ? HZ - T : -HZ], anchor: 'none', material: mat.red });
  m.part(`beam_${s > 0 ? 'F' : 'B'}`, m.box(2 * IX, BEAM, T + 0.2), { parent: gables, at: [0, DOOR - BEAM / 2, s * (HZ - T / 2)], material: mat.white });
}
m.part('sign_frame', m.box(SIGN.w + 0.3, SIGN.h + 0.3, 0.1), { parent: gables, at: [0, SIGN.y, HZ], anchor: 'back', material: mat.roof });

// ---- roof: one chevron slab extruded front to back, a ridge cap and white fascia boards on the gable ends
const roof = m.group('roof');
const top = x => under(x) + RT;
m.part('roof_slab', m.extrude([[-EX, under(EX)], [0, Y_PK], [EX, under(EX)], [EX, top(EX)], [0, RIDGE], [-EX, top(EX)]], 2 * (HZ + OVZ)),
  { parent: roof, at: [0, 0, -(HZ + OVZ)], anchor: 'none', material: mat.roof });
m.part('ridge_cap', m.box(0.3, 0.3, 2 * (HZ + OVZ) + 0.04), { parent: roof, at: [0, RIDGE - 0.1, 0], rot: [0, 0, 45], material: mat.roof });
const fasciaPts = [[-EX - 0.05, under(EX) - 0.1], [0, Y_PK - 0.1], [EX + 0.05, under(EX) - 0.1], [EX + 0.05, top(EX) + 0.05], [0, RIDGE + 0.05], [-EX - 0.05, top(EX) + 0.05]];
m.part('fascia', merge([1, -1].map(s => ({ geo: m.extrude(fasciaPts, 0.12), at: [0, 0, s * (HZ + OVZ) - 0.06] }))), { parent: roof, anchor: 'none', material: mat.white });

// ---- signboard: a flat light board facing +Z on the front gable; uv 'fit' maps its front face 0..1 for the game's picture
m.part('signboard', m.box(SIGN.w, SIGN.h, SIGN.d), { at: [0, SIGN.y, HZ + 0.1], anchor: 'back', uv: 'fit', material: mat.sign });

await m.write(out('shed'));
