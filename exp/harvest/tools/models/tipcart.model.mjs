// Harvest garden tip cart: a small open box trailer on two wheels that the ride-on mower tows. Source for
// assets/models/custom/tipcart.glb (spec: tipcart.spec.json). Regenerate from exp/harvest with
//   node tools/models/tipcart.model.mjs   (under the usual systemd-run memory cap); needs the glb-author skill's kit.
// Metres, +Y up, front (the tongue) faces +Z (+X is the cart's LEFT), origin bottom-centre on the ground.
// Every placement comes from TIPCART (src/defs/models.js). The cart's contract: bed, grain (the clippings heap, scaled in Y by the
// game, origin on the hopper floor centre), wheel_L, wheel_R (hub origin, spin about X), Socket_Hitch (tongue tip), Socket_Tow
// (the next cart's hitch). Material `paint` is repainted per player.
import { TIPCART as C } from '../../src/defs/models.js';
import { kenney, KIT, out, wheel, bin, loft, merge } from './lib.mjs';
const { model } = await import(KIT);

const m = model('tipcart');

const mat = {
  paint: m.material('paint', { color: kenney('#d8382c'), roughness: 0.7 }),
  trim:  m.material('trim',  { color: kenney('#f5c22b'), roughness: 0.7 }),
  tyre:  m.material('tyre',  { color: kenney('#2b2b2e'), roughness: 0.95 }),
  metal: m.material('metal', { color: kenney('#555a61'), roughness: 0.6 }),
  grain: m.material('grain', { color: kenney('#6fc23c'), roughness: 0.95 }),
};
mat.rim = mat.trim;

// ---- numbers first
const P = C.hopper, PZ = (P.z0 + P.z1) / 2;               // hopper centre along z
const T = 0.04;                                           // hopper wall thickness
const TOP_HX = P.half, TOP_HZ = (P.z1 - P.z0) / 2;        // hopper mouth (outer)
const FLARE = 0.05, FLOOR_HX = TOP_HX - FLARE, FLOOR_HZ = TOP_HZ - FLARE; // walls lean out a little
const BIN_Y = P.floor - T, BIN_H = P.top - BIN_Y;         // the inside floor is P.floor
const W = C.wheels[0], TYRE_W = 0.12;
const [, HY, HZ] = C.hitch, [, TY, TZ] = C.tow;
const halfAt = (b, t, y) => b + (t - b) * (y - BIN_Y) / BIN_H;

// ---- bed: hopper, lip, axle and brackets, mudguards, tongue, tow bar, a little stand
const bed = m.group('bed');
m.part('hopper', bin({ bhx: FLOOR_HX, bhz: FLOOR_HZ, thx: TOP_HX, thz: TOP_HZ, h: BIN_H, t: T }), { parent: bed, at: [0, BIN_Y, PZ], anchor: 'none', material: mat.paint });
const LX = TOP_HX + 0.015, LZ = TOP_HZ + 0.015;
m.part('hopper_lip', merge([
  { geo: m.box(2 * LX, 0.05, 0.06), at: [0, P.top, PZ + LZ - 0.03] }, { geo: m.box(2 * LX, 0.05, 0.06), at: [0, P.top, PZ - LZ + 0.03] },
  { geo: m.box(0.06, 0.05, 2 * LZ - 0.12), at: [LX - 0.03, P.top, PZ] }, { geo: m.box(0.06, 0.05, 2 * LZ - 0.12), at: [-LX + 0.03, P.top, PZ] },
]), { parent: bed, anchor: 'none', material: mat.trim });
// yellow corner straps up the hopper's front corners
m.part('hopper_band', loft([0.6, 0.66].map(y => [y - BIN_Y, halfAt(FLOOR_HX, TOP_HX, y) + 0.01, halfAt(FLOOR_HZ, TOP_HZ, y) + 0.01]), { bottom: false, top: false }),
  { parent: bed, at: [0, BIN_Y, PZ], anchor: 'none', material: mat.trim });
m.part('axle', m.box(2 * W.x - 0.06, 0.06, 0.07), { parent: bed, at: [0, W.y, W.z], material: mat.metal });
m.part('axle_mounts', merge([1, -1].map(s => ({ geo: m.box(0.06, BIN_Y - W.y + 0.02, 0.12), at: [s * 0.3, (BIN_Y + W.y) / 2 + 0.01, W.z] }))), { parent: bed, anchor: 'none', material: mat.metal });
const FY = W.y + W.r + 0.06;
for (const s of [1, -1]) {
  const id = s > 0 ? 'L' : 'R', inner = halfAt(FLOOR_HX, TOP_HX, FY) - 0.01, outer = W.x + TYRE_W / 2 + 0.04;
  m.part(`fender_${id}`, m.box(outer - inner, 0.035, 2 * W.r + 0.1), { parent: bed, at: [s * (inner + outer) / 2, FY, W.z], material: mat.metal });
}
// tongue: a single bar from under the hopper floor to the hitch eye
m.part('tongue', m.box(0.07, 0.06, HZ - 0.05 - 0.1), { parent: bed, at: [0, HY, 0.1], anchor: 'back', material: mat.paint });
m.part('hitch_eye', m.cyl(0.05, 0.05, 0.04, 8), { parent: bed, at: [0, HY, HZ - 0.05], material: mat.metal });
m.part('stand', m.cyl(0.02, 0.02, HY - 0.05, 6), { parent: bed, at: [0, 0.05, P.z1 + 0.12], anchor: 'bottom', material: mat.metal });
m.part('stand_foot', m.box(0.1, 0.02, 0.06), { parent: bed, at: [0, 0.04, P.z1 + 0.12], anchor: 'bottom', material: mat.metal });
// tow bar out the back for the next cart
m.part('tow_bar', m.box(0.07, 0.06, P.z0 + 0.25 - TZ), { parent: bed, at: [0, TY, P.z0 + 0.25], anchor: 'front', material: mat.metal });
m.part('tow_pin', m.cyl(0.025, 0.025, 0.14, 6), { parent: bed, at: [0, TY, TZ + 0.03], material: mat.trim });

// ---- clippings heap: origin on the hopper floor centre; at scale 1 its domed top reaches P.top
const GH = P.top - P.floor;
const gx = y => halfAt(FLOOR_HX, TOP_HX, P.floor + y) - T - 0.01, gz = y => halfAt(FLOOR_HZ, TOP_HZ, P.floor + y) - T - 0.01;
m.part('grain', loft([[0, gx(0), gz(0)], [GH * 0.72, gx(GH * 0.72), gz(GH * 0.72)], [GH * 0.9, gx(GH) * 0.72, gz(GH) * 0.75], [GH, gx(GH) * 0.35, gz(GH) * 0.5]]),
  { at: [0, P.floor, PZ], anchor: 'none', material: mat.grain });

// ---- wheels
for (const w of C.wheels) wheel(m, w.name.slice(6), w, { width: TYRE_W, lugs: 12, mat });

// ---- sockets
m.socket('Socket_Hitch', { at: C.hitch });
m.socket('Socket_Tow', { at: C.tow });

await m.write(out('tipcart'));
