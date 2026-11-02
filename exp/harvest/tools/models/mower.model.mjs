// Harvest ride-on mower: a chunky red garden-tractor-style lawn mower with a cutting deck under its middle, a grass catcher on
// the back and a friendly driver in a straw hat. Source for assets/models/custom/mower.glb (spec: mower.spec.json). Regenerate
// from exp/harvest with   node tools/models/mower.model.mjs   (under the usual systemd-run memory cap); needs the glb-author kit.
// Metres, +Y up, front faces +Z (+X is the mower's LEFT), origin bottom-centre on the ground.
// Every placement comes from MOWER (src/defs/models.js), so the art matches the sim's wheels, deck, catcher, chute and hitch.
// Contract nodes: body; driver (origin on the seat); deck (exactly 1 m wide, x -0.5..0.5, origin at the deck's underside centre
// (0, MOWER.deck.y, MOWER.deck.z), scaled in x by the view to the cutting width); grain (the clippings heap, origin on the catcher
// floor centre, scaled in y, top at MOWER.bag.top at 1); wheel_FL/FR/BL/BR (hub origin, spin about X);
// Socket_SpoutTip (MOWER.spout), Socket_Bag (the catcher opening's top centre), Socket_Hitch (MOWER.hitch).
// Material `paint` is repainted per player. The catcher's front wall is low, so the chute pours in over it at MOWER.spout.
import { MOWER as M } from '../../src/defs/models.js';
import { kenney, KIT, out, extrudeX, wheel, loft, merge } from './lib.mjs';
const { model } = await import(KIT);

const m = model('mower');

const mat = {
  paint: m.material('paint', { color: kenney('#d8382c'), roughness: 0.7 }),
  trim:  m.material('trim',  { color: kenney('#f5c22b'), roughness: 0.7 }),
  tyre:  m.material('tyre',  { color: kenney('#2b2b2e'), roughness: 0.95 }),
  metal: m.material('metal', { color: kenney('#555a61'), roughness: 0.6 }),
  light: m.material('light', { color: kenney('#fff4c4'), roughness: 0.4 }),
  seat:  m.material('seat',  { color: kenney('#2f2f35'), roughness: 0.8 }),
  grain: m.material('grain', { color: kenney('#6fc23c'), roughness: 0.95 }),
  skin:  m.material('skin',  { color: kenney('#f2c29b'), roughness: 0.8 }),
  shirt: m.material('shirt', { color: kenney('#5aa0e0'), roughness: 0.85 }),
  jeans: m.material('jeans', { color: kenney('#34507a'), roughness: 0.85 }),
  hat:   m.material('hat',   { color: kenney('#ecc766'), roughness: 0.9 }),
  red:   m.material('red',   { color: kenney('#c8302a'), roughness: 0.85 }),
};
mat.rim = mat.trim;

// ---- numbers first
const [FL, , BL] = M.wheels;                                  // a front and a back wheel (the others mirror in x)
const FRONT_W = 0.15, BACK_W = 0.2;                           // tyre widths
const D = M.deck;                                             // cutting deck: centre z, depth, underside y, height
const B = M.bag, BAG_T = 0.04, BAG_FRONT = 0.88;              // catcher, wall thickness, its low front wall's top (the chute pours over it)
const BAG_ZC = (B.z0 + B.z1) / 2;
const [, SPY, SPZ] = M.spout, CHUTE_R = 0.06;                 // chute mouth (Socket_SpoutTip), pipe radius
const CHUTE_Z = B.z1 + 0.06;                                  // the chute's riser, just in front of the catcher
const RAIL = { half: 0.22, y0: 0.36, y1: 0.46, z0: -0.62, z1: M.z1 - 0.08 };
const HOOD = { half: 0.32, y0: 0.42, z0: 0.05 };
const PLAT = { half: 0.4, y0: 0.5, y1: 0.6, z0: B.z1 + 0.03, z1: 0.0 };   // the rear deck the seat sits on
const SEAT = { w: 0.44, z0: M.seat.z - 0.12, z1: M.seat.z + 0.22, t: 0.1 }; // cushion (its top is MOWER.seat.y)
const WHEEL_C = [0, 1.02, -0.08], WHEEL_R = 0.14;            // steering wheel centre and radius (tilted 30 deg from flat)
const STEP = { x0: 0.2, x1: 0.52, y: 0.42, z0: -0.02, z1: 0.4 }; // footboards

// ---- body
const body = m.group('body');
m.part('rails', merge([1, -1].map(s => ({ geo: m.box(0.08, RAIL.y1 - RAIL.y0, RAIL.z1 - RAIL.z0), at: [s * RAIL.half, (RAIL.y0 + RAIL.y1) / 2, (RAIL.z0 + RAIL.z1) / 2] }))),
  { parent: body, anchor: 'none', material: mat.metal });
// engine hood: a side profile extruded across x, rounded nose at the front
m.part('hood', extrudeX(m, [[HOOD.z0, HOOD.y0], [M.z1 - 0.07, HOOD.y0], [M.z1, 0.5], [M.z1, 0.62], [M.z1 - 0.1, 0.72], [0.35, 0.8], [HOOD.z0, 0.82]], -HOOD.half, HOOD.half),
  { parent: body, anchor: 'none', material: mat.paint });
for (const s of [1, -1]) m.part(`stripe_${s > 0 ? 'L' : 'R'}`, m.box(0.02, 0.07, 0.75), { parent: body, at: [s * (HOOD.half + 0.008), 0.62, 0.55], material: mat.trim });
m.part('grille', m.box(0.36, 0.16, 0.03), { parent: body, at: [0, 0.54, M.z1], anchor: 'back', material: mat.metal });
m.part('headlights', merge([1, -1].map(s => ({ geo: m.box(0.1, 0.07, 0.03), at: [s * 0.2, 0.6, M.z1 + 0.012] }))), { parent: body, anchor: 'none', material: mat.light });
m.part('bumper', m.box(0.76, 0.1, 0.07), { parent: body, at: [0, 0.37, M.z1 - 0.035], material: mat.metal });
// front axle on a post up into the hood; rear transaxle and gearbox under the seat deck
m.part('axle_F', m.box(2 * FL.x - 0.1, 0.07, 0.08), { parent: body, at: [0, FL.y, FL.z], material: mat.metal });
m.part('axle_F_post', m.box(0.1, HOOD.y0 - FL.y + 0.03, 0.1), { parent: body, at: [0, FL.y, FL.z], anchor: 'bottom', material: mat.metal });
m.part('axle_B', m.box(2 * BL.x - 0.12, 0.12, 0.12), { parent: body, at: [0, BL.y, BL.z], material: mat.metal });
m.part('gearbox', m.box(0.36, 0.2, 0.3), { parent: body, at: [0, BL.y + 0.06, BL.z], material: mat.metal });
// dash console between hood and seat, and the steering wheel on a column
m.part('console', m.box(0.36, 0.92 - HOOD.y0, 0.16), { parent: body, at: [0, HOOD.y0, HOOD.z0 + 0.02], anchor: 'bottom', material: mat.paint });
m.beam('column', [0, 0.9, HOOD.z0 + 0.02], WHEEL_C, { parent: body, size: 0.04, round: true, material: mat.metal });
m.part('steering_wheel', m.torus(WHEEL_R, 0.025, 6, 14), { parent: body, at: WHEEL_C, rot: [60, 0, 0], material: mat.seat });
m.part('steering_spoke', m.box(2 * WHEEL_R, 0.03, 0.03), { parent: body, at: WHEEL_C, rot: [60, 0, 0], material: mat.seat });
// footboards either side of the console
m.part('footboards', merge([1, -1].map(s => ({ geo: m.box(STEP.x1 - STEP.x0, 0.04, STEP.z1 - STEP.z0), at: [s * (STEP.x0 + STEP.x1) / 2, STEP.y, (STEP.z0 + STEP.z1) / 2] }))),
  { parent: body, anchor: 'none', material: mat.seat });
// rear deck, fenders arching over the back wheels
m.part('rear_deck', m.box(2 * PLAT.half, PLAT.y1 - PLAT.y0, PLAT.z1 - PLAT.z0), { parent: body, at: [0, PLAT.y0, (PLAT.z0 + PLAT.z1) / 2], anchor: 'bottom', material: mat.paint });
const arc = (r0, r1, a0, a1, n) => {
  const pts = [];
  for (let i = 0; i <= n; i++) { const a = (a0 + (a1 - a0) * i / n) * Math.PI / 180; pts.push([BL.z + r1 * Math.cos(a), BL.y + r1 * Math.sin(a)]); }
  for (let i = n; i >= 0; i--) { const a = (a0 + (a1 - a0) * i / n) * Math.PI / 180; pts.push([BL.z + r0 * Math.cos(a), BL.y + r0 * Math.sin(a)]); }
  return pts;
};
const FEND = arc(BL.r + 0.05, BL.r + 0.1, 15, 165, 6);
for (const s of [1, -1]) m.part(`fender_${s > 0 ? 'L' : 'R'}`, extrudeX(m, FEND, s > 0 ? PLAT.half - 0.02 : -BL.x - BACK_W / 2 - 0.04, s > 0 ? BL.x + BACK_W / 2 + 0.04 : -PLAT.half + 0.02),
  { parent: body, anchor: 'none', material: mat.paint });
// seat: cushion (top at MOWER.seat.y) and a back leaning back a little
m.part('seat', m.box(SEAT.w, SEAT.t, SEAT.z1 - SEAT.z0), { parent: body, at: [0, M.seat.y - SEAT.t, (SEAT.z0 + SEAT.z1) / 2], anchor: 'bottom', material: mat.seat });
m.part('seat_post', m.box(0.2, M.seat.y - SEAT.t - PLAT.y1 + 0.02, 0.2), { parent: body, at: [0, PLAT.y1 - 0.01, M.seat.z], anchor: 'bottom', material: mat.metal });
const sb = m.group('seat_back_pivot', { parent: body, at: [0, M.seat.y - 0.02, SEAT.z0 + 0.04], rot: [-8, 0, 0] });
m.part('seat_back', m.box(SEAT.w, 0.34, 0.08), { parent: sb, anchor: 'bottom', material: mat.seat });

// ---- grass catcher: an open-top box on the back, the front wall low so the chute pours in over it; lips round the top
const catcher = m.group('catcher', { parent: body });
const BY0 = B.floor - BAG_T, IX = B.half - BAG_T;
m.part('bag_floor', m.box(2 * IX, BAG_T, B.z1 - B.z0 - 2 * BAG_T), { parent: catcher, at: [0, BY0, BAG_ZC], anchor: 'bottom', material: mat.metal });
m.part('bag_back', m.box(2 * IX, B.top - BY0, BAG_T), { parent: catcher, at: [0, BY0, B.z0 + BAG_T / 2], anchor: 'bottom', material: mat.metal });
m.part('bag_front', m.box(2 * IX, BAG_FRONT - BY0, BAG_T), { parent: catcher, at: [0, BY0, B.z1 - BAG_T / 2], anchor: 'bottom', material: mat.metal });
const SIDE = [[B.z0, BY0], [B.z1, BY0], [B.z1, BAG_FRONT], [B.z1 - 0.2, B.top], [B.z0, B.top]];
for (const s of [1, -1]) m.part(`bag_side_${s > 0 ? 'L' : 'R'}`, extrudeX(m, SIDE, s > 0 ? IX : -B.half, s > 0 ? B.half : -IX), { parent: catcher, anchor: 'none', material: mat.metal });
m.part('bag_lips', merge([
  { geo: m.box(2 * B.half + 0.04, 0.05, 0.08), at: [0, B.top, B.z0 + 0.03] },
  { geo: m.box(2 * B.half + 0.04, 0.05, 0.08), at: [0, BAG_FRONT, B.z1 - 0.03] },
]), { parent: catcher, anchor: 'none', material: mat.paint });
m.part('bag_handle', m.box(0.3, 0.04, 0.04), { parent: catcher, at: [0, B.top - 0.12, B.z0 - 0.06], material: mat.trim });
m.part('bag_handle_ends', merge([1, -1].map(s => ({ geo: m.box(0.04, 0.04, 0.07), at: [s * 0.13, B.top - 0.12, B.z0 - 0.025] }))), { parent: catcher, anchor: 'none', material: mat.trim });
m.part('bag_frame', m.box(0.12, 0.08, B.z1 - B.z0 + 0.25), { parent: catcher, at: [0, BY0 - 0.04, BAG_ZC + 0.12], material: mat.metal });

// ---- chute: from the deck's back chute up a riser in front of the catcher, over the low front wall, mouth at MOWER.spout
m.beam('chute_low', [0, 0.32, D.z - D.depth / 2 - 0.02], [0, 0.6, CHUTE_Z], { parent: body, size: 2 * CHUTE_R, round: true, sides: 8, material: mat.seat });
m.part('chute_riser', m.cyl(CHUTE_R, CHUTE_R, SPY - 0.6, 8), { parent: body, at: [0, 0.6, CHUTE_Z], anchor: 'bottom', material: mat.seat });
m.part('chute_elbow', m.sphere(CHUTE_R + 0.01, 8, 6), { parent: body, at: [0, SPY, CHUTE_Z], material: mat.seat });
m.part('chute_mouth', m.cyl(CHUTE_R + 0.02, CHUTE_R, CHUTE_Z - SPZ, 8), { parent: body, at: [0, SPY, CHUTE_Z], geoRot: [90, 0, 0], anchor: 'front', material: mat.seat });

// ---- hitch drawbar under the catcher, out to MOWER.hitch
const [, HY, HZ] = M.hitch;
m.part('drawbar', m.box(0.1, 0.06, RAIL.z0 + 0.1 - HZ), { parent: body, at: [0, HY, RAIL.z0 + 0.1], anchor: 'front', material: mat.metal });
m.part('hitch_pin', m.cyl(0.03, 0.03, 0.16, 6), { parent: body, at: [0, HY, HZ + 0.04], material: mat.trim });

// ---- cutting deck: 1 m wide (x -0.5..0.5); origin on its underside centre; a dark skirt, a red domed housing, a yellow front
// stripe and a chute out of the back centre (it widens with the deck, the body's pipe carries on from it)
const deck = m.group('deck', { at: [0, D.y, D.z] });
const DH = D.h, DZ = D.depth / 2;
m.part('deck_skirt', m.box(1, 0.06, D.depth), { parent: deck, anchor: 'bottom', material: mat.metal });
m.part('deck_shell', loft([[0.06, 0.49, DZ - 0.01], [DH - 0.07, 0.49, DZ - 0.01], [DH, 0.42, DZ - 0.08]]), { parent: deck, anchor: 'none', material: mat.paint });
m.part('deck_stripe', m.box(0.96, 0.04, 0.015), { parent: deck, at: [0, 0.1, DZ - 0.01], anchor: 'back', material: mat.trim });
m.part('deck_chute', m.box(0.18, 0.1, 0.16), { parent: deck, at: [0, DH - 0.02, -DZ + 0.06], rot: [-30, 0, 0], material: mat.seat });

// ---- clippings heap: origin on the catcher floor centre; at scale 1 its top reaches MOWER.bag.top
const GH = B.top - B.floor, GX = IX - 0.01, GZ = (B.z1 - B.z0) / 2 - BAG_T - 0.01;
m.part('grain', loft([[0, GX, GZ], [GH * 0.62, GX, GZ], [GH * 0.88, GX * 0.72, GZ * 0.72], [GH, GX * 0.35, GZ * 0.4]]), { at: [0, B.floor, BAG_ZC], anchor: 'none', material: mat.grain });

// ---- driver: a chunky friendly figure on the seat; the node's origin is the seat top centre
const drv = m.group('driver', { world: [0, M.seat.y, M.seat.z] });
const P = (name, geo, world, opts) => m.part(name, geo, { parent: drv, world, ...opts });
const TZ = M.seat.z + 0.05;                                   // torso centre z
P('torso', m.box(0.34, 0.42, 0.22), [0, M.seat.y + 0.21, TZ], { rot: [6, 0, 0], material: mat.shirt });
P('bib', m.box(0.26, 0.2, 0.03), [0, M.seat.y + 0.14, TZ + 0.12], { rot: [6, 0, 0], material: mat.jeans });
P('hips', m.box(0.34, 0.12, 0.26), [0, M.seat.y + 0.06, TZ], { material: mat.jeans });
for (const s of [1, -1]) {
  const id = s > 0 ? 'L' : 'R';
  const hip = [s * 0.1, M.seat.y + 0.07, TZ], knee = [s * 0.13, M.seat.y + 0.09, 0.05], foot = [s * 0.3, STEP.y + 0.08, 0.17];
  m.beam(`thigh_${id}`, hip, knee, { parent: drv, size: 0.13, material: mat.jeans });
  m.beam(`shin_${id}`, knee, foot, { parent: drv, size: 0.12, material: mat.jeans });
  P(`boot_${id}`, m.box(0.13, 0.1, 0.22), [s * 0.3, STEP.y + 0.02 + 0.05, 0.2], { material: mat.seat });
  const shoulder = [s * 0.2, M.seat.y + 0.38, TZ + 0.02], elbow = [s * 0.23, M.seat.y + 0.24, -0.15], hand = [s * 0.13, WHEEL_C[1] + 0.02, WHEEL_C[2] + 0.01];
  m.beam(`arm_${id}`, shoulder, elbow, { parent: drv, size: 0.09, material: mat.shirt });
  m.beam(`forearm_${id}`, elbow, hand, { parent: drv, size: 0.08, material: mat.skin });
  P(`hand_${id}`, m.sphere(0.05, 6, 4), hand, { material: mat.skin });
}
const HEAD = [0, M.seat.y + 0.53, TZ + 0.03];
P('head', m.sphere(0.12, 8, 6), HEAD, { material: mat.skin });
P('nose', m.box(0.05, 0.05, 0.05), [0, HEAD[1] - 0.01, HEAD[2] + 0.12], { material: mat.skin });
P('eyes', merge([1, -1].map(s => ({ geo: m.box(0.03, 0.04, 0.02), at: [s * 0.05, 0.03, 0.105] }))), HEAD, { anchor: 'none', material: mat.seat });
P('hat_brim', m.cyl(0.24, 0.24, 0.025, 12), [0, HEAD[1] + 0.08, HEAD[2]], { rot: [-6, 0, 0], material: mat.hat });
P('hat_crown', m.cyl(0.11, 0.13, 0.1, 8), [0, HEAD[1] + 0.09, HEAD[2] - 0.01], { anchor: 'bottom', rot: [-6, 0, 0], material: mat.hat });
P('hat_band', m.cyl(0.135, 0.137, 0.03, 8), [0, HEAD[1] + 0.105, HEAD[2] - 0.01], { anchor: 'bottom', rot: [-6, 0, 0], material: mat.red });

// ---- wheels
for (const w of M.wheels) wheel(m, w.name.slice(6), w, { width: w.front ? FRONT_W : BACK_W, lugs: w.front ? 12 : 14, mat });

// ---- sockets
m.socket('Socket_SpoutTip', { at: M.spout });
m.socket('Socket_Bag', { at: [0, B.top, BAG_ZC] });
m.socket('Socket_Hitch', { at: M.hitch });

await m.write(out('mower'));
