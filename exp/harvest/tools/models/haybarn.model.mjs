// Harvest hay barn: the meadow's sell point, a classic drive-through barn along Z (open at both ends). Weathered barn-red board
// walls (darker battens proud of them) with white corner boards, caps and set-in windows, a gable over each doorway on a white
// header beam, a dark gambrel roof with white fascia, a hayloft door with a hoist beam on the +Z gable, a blank signboard below it
// for the game's picture, and round bales stacked along both walls inside. Source for assets/models/custom/haybarn.glb
// (spec: haybarn.spec.json). Regenerate from exp/harvest with   node tools/models/haybarn.model.mjs   (under the usual
// systemd-run memory cap); needs the glb-author skill's kit. Metres, +Y up, the doorways face ±Z (+X is the barn's LEFT),
// origin bottom-centre on the ground. Every placement comes from HAYBARN and BALE (src/defs/models.js).
// Contract nodes: walls, gables, roof, signboard (front face UVs 0..1). The game hides gables, roof and signboard while a vehicle
// is inside, so walls (with the bales) must read on their own from above, and no two faces that look the same way share a plane.
import { HAYBARN as H, BALE } from '../../src/defs/models.js';
import { kenney, KIT, out, merge } from './lib.mjs';
const { model } = await import(KIT);

const m = model('haybarn');

const mat = {
  red:   m.material('red',   { color: kenney('#b23a2e'), roughness: 0.9 }),
  board: m.material('board', { color: kenney('#8e2f27'), roughness: 0.9 }),
  white: m.material('white', { color: kenney('#f3efe6'), roughness: 0.85 }),
  roof:  m.material('roof',  { color: kenney('#4a4f5a'), roughness: 0.9 }),
  glass: m.material('glass', { color: kenney('#a9dcef'), roughness: 0.3 }),
  wood:  m.material('wood',  { color: kenney('#9a6a3e'), roughness: 0.9 }),
  dark:  m.material('dark',  { color: kenney('#3a3532'), roughness: 0.8 }),
  sign:  m.material('sign',  { color: kenney('#fbf5e4'), roughness: 0.8 }),
  grain: m.material('grain', { color: kenney('#e6bf55'), roughness: 0.95 }),
  seed:  m.material('seed',  { color: kenney('#b88a32'), roughness: 0.95 }),
};

// ---- numbers first
const HX = H.half, HZ = H.depth / 2, T = H.wall, IX = HX - T;     // half width, half depth, wall thickness, walls' inner face
const EAVE = H.eave, DOOR = H.door, RIDGE = H.ridge;
const RT = 0.3, OVX = 0.5, OVZ = 0.6;                            // roof slab thickness (vertical); overhang at the sides / ends
// gambrel: the roof's underside runs from the eave up a steep lower slope to the knee, then a shallow upper slope to the ridge
const KX = 5.0, KY = 9.5, PK = RIDGE - RT;                       // knee (underside), underside at the ridge
const LOW = (KY - EAVE) / (HX - KX), UP = (PK - KY) / KX;         // slopes
const under = x => { const a = Math.abs(x); return a <= KX ? PK - UP * a : KY - LOW * (a - KX); };
const top = x => under(x) + RT, EX = HX + OVX;
const BEAM = 0.45;                                               // header beam under each gable
const BATTEN = { w: 0.08, d: 0.03, step: 0.6 };                  // darker boards proud of the red walls
const WIN = { w: 1.4, h: 1.2, y: 3.8, zs: [-5, 0, 5], ring: 0.12 }; // side windows (above the bale stacks)
const SIGN = { w: 6.0, h: 1.2, d: 0.12, y: DOOR + 0.95 };         // signboard centre y, under the hayloft door
const LOFT = { w: 2.2, y0: 7.45, y1: 9.65, ring: 0.15 };          // hayloft door
const HOIST = { y: 10.25, s: 0.3, z0: HZ - 0.6, z1: HZ + 1.5 };   // hoist beam out over the hayloft door
// bales along each wall inside, lying axis along Z: [side, z, layer]; the drive lane between them stays clear
const BR = BALE.r, BW = BALE.w, BALE_X = IX - BR - 0.06;
const BALES = [
  ...[-6.5, -5.3, -4.1, -2.9, -1.7].map(z => [1, z, 0]), ...[-5.9, -4.7, -3.5].map(z => [1, z, 1]),
  ...[6.5, 5.3, 4.1, 2.9].map(z => [-1, z, 0]), ...[5.9, 4.7].map(z => [-1, z, 1]),
];

// ---- walls: two side walls the full depth, battens, trim, windows, and the bale stacks inside
const walls = m.group('walls');
for (const s of [1, -1]) m.part(`wall_${s > 0 ? 'L' : 'R'}`, m.box(T, EAVE, 2 * HZ), { parent: walls, at: [s * (HX - T / 2), 0, 0], anchor: 'bottom', material: mat.red });
const nearWindow = z => WIN.zs.some(wz => Math.abs(z - wz) < WIN.w / 2 + WIN.ring + 0.1);
const battenZs = []; for (let z = -HZ + 0.6; z <= HZ - 0.59; z += BATTEN.step) battenZs.push(+z.toFixed(3));
for (const s of [1, -1]) {
  const id = s > 0 ? 'L' : 'R', xo = s * (HX + BATTEN.d / 2);
  // battens: full height between windows, split round each window
  const pieces = [];
  for (const z of battenZs) {
    if (!nearWindow(z)) pieces.push({ geo: m.box(BATTEN.d, EAVE - 0.3, BATTEN.w), at: [xo, (EAVE - 0.3) / 2 + 0.1, z] });
    else {
      const lo = WIN.y - WIN.h / 2 - WIN.ring - 0.2, hi = WIN.y + WIN.h / 2 + WIN.ring + 0.05;
      pieces.push({ geo: m.box(BATTEN.d, lo - 0.1, BATTEN.w), at: [xo, (lo + 0.1) / 2, z] });
      pieces.push({ geo: m.box(BATTEN.d, EAVE - 0.2 - hi, BATTEN.w), at: [xo, (hi + EAVE - 0.2) / 2, z] });
    }
  }
  m.part(`battens_${id}`, merge(pieces), { parent: walls, anchor: 'none', material: mat.board });
  // windows: a white frame ring proud of the battens, glass nearly flush with the wall, a sill below, a cross mullion
  const ring = [], glass = [], xw = s * HX;
  for (const z of WIN.zs) {
    const r = WIN.ring, ww = WIN.w, wh = WIN.h, d = 0.1;
    ring.push({ geo: m.box(d, r, ww + 2 * r), at: [xw + s * d / 2, WIN.y + wh / 2 + r / 2, z] }, { geo: m.box(d, r, ww + 2 * r), at: [xw + s * d / 2, WIN.y - wh / 2 - r / 2, z] },
      { geo: m.box(d, wh, r), at: [xw + s * d / 2, WIN.y, z + ww / 2 + r / 2] }, { geo: m.box(d, wh, r), at: [xw + s * d / 2, WIN.y, z - ww / 2 - r / 2] },
      { geo: m.box(0.05, 0.06, ww), at: [xw + s * 0.03, WIN.y, z] }, { geo: m.box(0.05, wh, 0.06), at: [xw + s * 0.03, WIN.y, z] },
      { geo: m.box(0.18, 0.08, ww + 2 * r + 0.16), at: [xw + s * 0.09, WIN.y - wh / 2 - r - 0.04, z] });
    glass.push({ geo: m.box(0.02, wh, ww), at: [xw + s * 0.01, WIN.y, z] });
  }
  m.part(`window_frames_${id}`, merge(ring), { parent: walls, anchor: 'none', material: mat.white });
  m.part(`window_glass_${id}`, merge(glass), { parent: walls, anchor: 'none', material: mat.glass });
}
// corner boards proud of the battens and a little taller than the wall; white caps along the wall tops (seen with the roof off)
m.part('corners', merge([[1, 1], [-1, 1], [1, -1], [-1, -1]].map(([sx, sz]) => ({ geo: m.box(T + 0.18, EAVE + 0.06, 0.36), at: [sx * (HX - T / 2), (EAVE + 0.06) / 2, sz * (HZ - 0.17)] }))),
  { parent: walls, anchor: 'none', material: mat.white });
m.part('wall_caps', merge([1, -1].map(s => ({ geo: m.box(T + 0.1, 0.08, 2 * HZ - 0.8), at: [s * (HX - T / 2), EAVE + 0.04, 0] }))), { parent: walls, anchor: 'none', material: mat.white });
// bales: a 12-sided straw barrel each, a darker disc on each round face
const baleGeo = [], baleFace = [];
for (const [s, z, layer] of BALES) {
  const c = [s * BALE_X, BR + layer * 2 * BR, z];
  baleGeo.push({ geo: m.cyl(BR, BR, BW, 12), at: c, rot: [90, 0, 0] });
  baleFace.push({ geo: m.cyl(BR * 0.6, BR * 0.6, BW + 0.02, 6), at: c, rot: [90, 0, 0] });
}
m.part('bales', merge(baleGeo), { parent: walls, anchor: 'none', material: mat.grain });
m.part('bale_faces', merge(baleFace), { parent: walls, anchor: 'none', material: mat.seed });

// ---- gables: a board wall over each doorway between the side walls, from the header beam up to the roof
const gables = m.group('gables');
const gable = [[-IX, DOOR], [IX, DOOR], [IX, under(IX)], [KX, KY], [0, PK], [-KX, KY], [-IX, under(IX)]];
for (const s of [1, -1]) {
  const id = s > 0 ? 'F' : 'B', zo = s * (HZ + BATTEN.d / 2);
  m.part(`gable_${id}`, m.extrude(gable, T), { parent: gables, at: [0, 0, s > 0 ? HZ - T : -HZ], anchor: 'none', material: mat.red });
  m.part(`beam_${id}`, m.box(2 * IX, BEAM, T + 0.2), { parent: gables, at: [0, DOOR - BEAM / 2, s * (HZ - T / 2)], material: mat.white });
  // battens up the gable, stopping short of the roof line; on the front, clear of the sign and hayloft door
  const pieces = [];
  for (let x = -IX + 0.4; x <= IX - 0.39; x += BATTEN.step) {
    const y0 = DOOR + 0.05, y1 = under(Math.abs(x) + BATTEN.w) - 0.15;
    if (s > 0 && Math.abs(x) < LOFT.w / 2 + LOFT.ring + 0.1) continue;   // the hayloft door and the sign's middle
    const yb = s > 0 && Math.abs(x) < SIGN.w / 2 + 0.3 ? SIGN.y + SIGN.h / 2 + 0.25 : y0;
    if (y1 - yb > 0.2) pieces.push({ geo: m.box(BATTEN.w, y1 - yb, BATTEN.d), at: [x, (yb + y1) / 2, zo] });
  }
  m.part(`gable_battens_${id}`, merge(pieces), { parent: gables, anchor: 'none', material: mat.board });
}
// the sign's dark backing frame, standing proud of the front gable
m.part('sign_frame', m.box(SIGN.w + 0.3, SIGN.h + 0.3, 0.1), { parent: gables, at: [0, SIGN.y, HZ + 0.02], anchor: 'back', material: mat.dark });
// hayloft door on the front gable: a white frame ring proud of the wall, the wooden door nearly flush, a white X brace, a sill
const L = LOFT, LY = (L.y0 + L.y1) / 2, LH = L.y1 - L.y0, r = L.ring;
m.part('loft_frame', merge([
  { geo: m.box(L.w + 2 * r, r, 0.12), at: [0, L.y1 + r / 2, HZ + 0.06] }, { geo: m.box(L.w + 2 * r, r, 0.12), at: [0, L.y0 - r / 2, HZ + 0.06] },
  { geo: m.box(r, LH, 0.12), at: [L.w / 2 + r / 2, LY, HZ + 0.06] }, { geo: m.box(r, LH, 0.12), at: [-L.w / 2 - r / 2, LY, HZ + 0.06] },
  { geo: m.box(L.w + 2 * r + 0.2, 0.08, 0.2), at: [0, L.y0 - r - 0.04, HZ + 0.1] },
  { geo: m.box(0.12, Math.hypot(L.w, LH) - 0.1, 0.03), at: [0, LY, HZ + 0.045], rot: [0, 0, Math.atan2(L.w, LH) * 180 / Math.PI] },
  { geo: m.box(0.12, Math.hypot(L.w, LH) - 0.1, 0.03), at: [0, LY, HZ + 0.045], rot: [0, 0, -Math.atan2(L.w, LH) * 180 / Math.PI] },
  { geo: m.box(0.1, LH, 0.03), at: [0, LY, HZ + 0.045] },
]), { parent: gables, anchor: 'none', material: mat.white });
m.part('loft_door', m.box(L.w, LH, 0.03), { parent: gables, at: [0, LY, HZ + 0.015], material: mat.wood });
// hoist beam out over the hayloft door, a pulley block, a rope and a hook
m.part('hoist_beam', m.box(HOIST.s, HOIST.s, HOIST.z1 - HOIST.z0), { parent: gables, at: [0, HOIST.y, (HOIST.z0 + HOIST.z1) / 2], material: mat.wood });
const PZ = HOIST.z1 - 0.25;
m.part('pulley', m.box(0.16, 0.28, 0.24), { parent: gables, at: [0, HOIST.y - HOIST.s / 2, PZ], anchor: 'top', material: mat.dark });
m.part('rope', m.cyl(0.025, 0.025, 1.2, 6), { parent: gables, at: [0, HOIST.y - HOIST.s / 2 - 0.28, PZ], anchor: 'top', material: mat.wood });
m.part('hook', m.torus(0.1, 0.03, 4, 8, 270), { parent: gables, at: [0, HOIST.y - HOIST.s / 2 - 0.28 - 1.2 - 0.08, PZ], rot: [0, 90, 0], material: mat.dark });

// ---- roof: one gambrel slab extruded front to back, a ridge cap, white fascia boards on the gable ends
const roof = m.group('roof');
const xs = [EX, HX, KX, 0, -KX, -HX, -EX];
const profile = [...xs.map(x => [x, under(x)]), ...xs.slice().reverse().map(x => [x, top(x)])];
m.part('roof_slab', m.extrude(profile, 2 * (HZ + OVZ)), { parent: roof, at: [0, 0, -(HZ + OVZ)], anchor: 'none', material: mat.roof });
m.part('ridge_cap', m.box(0.5, 0.12, 2 * (HZ + OVZ) + 0.04), { parent: roof, at: [0, RIDGE - 0.02, 0], material: mat.roof });
const F = 0.12;   // fascia: the roof's edge outline grown by F, as a board in front of each gable end
const fx = [EX + 0.05, HX, KX, 0, -KX, -HX, -EX - 0.05];
const fascia = [...fx.map(x => [x, under(Math.min(Math.abs(x), EX)) - F]), ...fx.slice().reverse().map(x => [x, top(Math.min(Math.abs(x), EX)) + F * 0.5])];
m.part('fascia', merge([1, -1].map(s => ({ geo: m.extrude(fascia, 0.12), at: [0, 0, s * (HZ + OVZ) - 0.06] }))), { parent: roof, anchor: 'none', material: mat.white });

// ---- signboard: a flat light board facing +Z on the front gable; uv 'fit' maps its front face 0..1 for the game's picture
m.part('signboard', m.box(SIGN.w, SIGN.h, SIGN.d), { at: [0, SIGN.y, HZ + 0.12], anchor: 'back', uv: 'fit', material: mat.sign });

await m.write(out('haybarn'));
