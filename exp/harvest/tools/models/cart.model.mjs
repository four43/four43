// Harvest grain cart: a hopper wagon on two big wheels with an A-frame tongue. Source for assets/models/custom/cart.glb
// (spec: cart.spec.json). Regenerate from exp/harvest with   node tools/models/cart.model.mjs   (under the usual
// systemd-run memory cap); needs the glb-author skill's kit.
// Metres, +Y up, front (the tongue) faces +Z (+X is the cart's LEFT), origin bottom-centre on the ground.
// Every placement comes from CART (src/defs/models.js). Contract nodes: bed, grain (scaled in Y by the game), wheel_L,
// wheel_R (spin about X), Socket_Hitch (tongue tip), Socket_Tow (the next cart's hitch). Material `paint` is repainted per player.
import { CART as C } from '../../src/defs/models.js';
import { kenney, KIT, out, wheel, bin, loft, merge } from './lib.mjs';
const { model } = await import(KIT);

const m = model('cart');

const mat = {
  paint: m.material('paint', { color: kenney('#3f9e3a'), roughness: 0.7 }),
  trim:  m.material('trim',  { color: kenney('#f5c22b'), roughness: 0.7 }),
  tyre:  m.material('tyre',  { color: kenney('#2b2b2e'), roughness: 0.95 }),
  metal: m.material('metal', { color: kenney('#555a61'), roughness: 0.6 }),
  grain: m.material('grain', { color: kenney('#eab84a'), roughness: 0.95 }),
};
mat.rim = mat.trim;

// ---- numbers first
const P = C.hopper, PZ = (P.z0 + P.z1) / 2;              // hopper centre along z
const T = 0.07;                                          // hopper wall thickness
const TOP_HX = P.half, TOP_HZ = (P.z1 - P.z0) / 2;       // hopper mouth (outer)
const FLOOR_HX = 0.55, FLOOR_HZ = TOP_HZ - 0.3;          // hopper floor (outer): a V-ish hopper, steep ends
const BIN_Y = P.floor - T, BIN_H = P.top - BIN_Y;        // the bin starts T below the floor so its inside floor is P.floor
const CH = { half: 0.42, y0: 0.6, y1: BIN_Y, z0: C.tow[2], z1: P.z1 - 0.1 };   // chassis rails
const W = C.wheels[0], TYRE_W = 0.32;
const [, HY, HZ] = C.hitch, [, TY, TZ] = C.tow;

// ---- bed: hopper, lip, chassis rails, axle, fenders, tongue, tow clevis
const bed = m.group('bed');
m.part('hopper', bin({ bhx: FLOOR_HX, bhz: FLOOR_HZ, thx: TOP_HX, thz: TOP_HZ, h: BIN_H, t: T }), { parent: bed, at: [0, BIN_Y, PZ], anchor: 'none', material: mat.paint });
const LX = TOP_HX + 0.02, LZ = TOP_HZ + 0.02;
m.part('hopper_lip', merge([
  { geo: m.box(2 * LX, 0.08, 0.1), at: [0, P.top, PZ + LZ - 0.05] }, { geo: m.box(2 * LX, 0.08, 0.1), at: [0, P.top, PZ - LZ + 0.05] },
  { geo: m.box(0.1, 0.08, 2 * LZ - 0.2), at: [LX - 0.05, P.top, PZ] }, { geo: m.box(0.1, 0.08, 2 * LZ - 0.2), at: [-LX + 0.05, P.top, PZ] },
]), { parent: bed, anchor: 'none', material: mat.trim });
// a yellow band round the hopper's middle, following the slope (a thin loft shell standing just proud of the walls)
const halfAt = (b, t, y) => b + (t - b) * (y - BIN_Y) / BIN_H;
const BAND = [1.45, 1.6];
m.part('hopper_band', loft(BAND.map(y => [y - BIN_Y, halfAt(FLOOR_HX, TOP_HX, y) + 0.015, halfAt(FLOOR_HZ, TOP_HZ, y) + 0.015]), { bottom: false, top: false }),
  { parent: bed, at: [0, BIN_Y, PZ], anchor: 'none', material: mat.trim });
m.part('rails', merge([1, -1].map(s => ({ geo: m.box(0.16, CH.y1 - CH.y0, CH.z1 - CH.z0), at: [s * CH.half, (CH.y0 + CH.y1) / 2, (CH.z0 + CH.z1) / 2] }))),
  { parent: bed, anchor: 'none', material: mat.metal });
m.part('axle', m.box(2 * W.x - 0.1, 0.14, 0.16), { parent: bed, at: [0, W.y, W.z], material: mat.metal });
m.part('axle_mounts', merge([1, -1].map(s => ({ geo: m.box(0.16, CH.y0 - W.y + 0.05, 0.2), at: [s * CH.half, (CH.y0 + W.y) / 2, W.z] }))), { parent: bed, anchor: 'none', material: mat.metal });
// mudguards over the wheels, on brackets from the hopper side
const FY = W.y + W.r + 0.32; // clear of the lugs with the suspension compressed (in play the wheel rides higher than here)
for (const s of [1, -1]) {
  const id = s > 0 ? 'L' : 'R';
  m.part(`fender_${id}`, m.box(TYRE_W + 0.12, 0.06, 2 * W.r + 0.25), { parent: bed, at: [s * W.x, FY, W.z], material: mat.paint });
  m.beam(`fender_arm_${id}`, [s * halfAt(FLOOR_HX, TOP_HX, FY + 0.1), FY + 0.1, W.z], [s * (W.x - 0.05), FY, W.z], { parent: bed, size: 0.07, material: mat.metal });
}
// tongue: an A-frame from under the hopper front to the hitch eye
for (const s of [1, -1]) m.beam(`tongue_${s > 0 ? 'L' : 'R'}`, [s * CH.half, CH.y0 + 0.08, CH.z1 - 0.2], [0, HY, HZ - 0.12], { parent: bed, size: 0.12, material: mat.paint });
m.part('hitch_eye', m.cyl(0.09, 0.09, 0.07, 8), { parent: bed, at: [0, HY, HZ - 0.08], material: mat.metal });
m.part('jack', m.cyl(0.05, 0.05, 0.45, 6), { parent: bed, at: [0, HY - 0.25, HZ - 0.7], anchor: 'bottom', material: mat.metal });
// tow clevis out the back for the next cart
m.part('tow_bar', m.box(0.18, 0.12, CH.z0 + 0.3 - TZ + 0.05), { parent: bed, at: [0, TY, CH.z0 + 0.3], anchor: 'front', material: mat.metal });
m.part('tow_pin', m.cyl(0.04, 0.04, 0.26, 6), { parent: bed, at: [0, TY, TZ + 0.04], material: mat.trim });

// ---- grain heap: origin on the hopper floor centre; at scale 1 its domed top reaches P.top
const GH = P.top - P.floor;
const gx = y => halfAt(FLOOR_HX, TOP_HX, P.floor + y) - T - 0.01, gz = y => halfAt(FLOOR_HZ, TOP_HZ, P.floor + y) - T - 0.01;
m.part('grain', loft([[0, gx(0), gz(0)], [GH * 0.75, gx(GH * 0.75), gz(GH * 0.75)], [GH * 0.92, gx(GH) * 0.72, gz(GH) * 0.75], [GH, gx(GH) * 0.35, gz(GH) * 0.5]]),
  { at: [0, P.floor, PZ], anchor: 'none', material: mat.grain });

// ---- wheels
for (const w of C.wheels) wheel(m, w.name.slice(6), w, { width: TYRE_W, lugs: 14, mat });

// ---- sockets
m.socket('Socket_Hitch', { at: C.hitch });
m.socket('Socket_Tow', { at: C.tow });

await m.write(out('cart'));
