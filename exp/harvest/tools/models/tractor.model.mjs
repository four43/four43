// Harvest compact tractor: a friendly bright-blue farm tractor with a chunky hood, an exhaust stack, big lugged rear wheels under
// arched mudguards, small front wheels, an open roll frame with a white canopy roof, a driver in a cap and a front-mounted mower
// deck. Source for assets/models/custom/tractor.glb (spec: tractor.spec.json). Regenerate from exp/harvest with
//   node tools/models/tractor.model.mjs   (under the usual systemd-run memory cap); needs the glb-author skill's kit.
// Metres, +Y up, front faces +Z (+X is the tractor's LEFT), origin bottom-centre on the ground.
// Every placement comes from TRACTOR (src/defs/models.js), so the art matches the sim's wheels, deck, cab and hitch.
// Contract nodes: body (with the deck's two arms); driver (origin on the seat top centre); deck (exactly 1 m wide, x -0.5..0.5,
// origin on its underside centre (0, TRACTOR.deck.y, TRACTOR.deck.z): the view scales it in x to the cutting width, 2.5..6 m);
// wheel_FL/FR/BL/BR (hub origin, spin about X); Socket_Hitch (TRACTOR.hitch). Material `paint` is repainted per player.
import { TRACTOR as T } from '../../src/defs/models.js';
import { kenney, KIT, out, extrudeX, wheel, loft, merge } from './lib.mjs';
const { model } = await import(KIT);

const m = model('tractor');

const mat = {
  paint: m.material('paint', { color: kenney('#2f7fd8'), roughness: 0.7 }),
  trim:  m.material('trim',  { color: kenney('#f1f1ec'), roughness: 0.75 }),
  rim:   m.material('rim',   { color: kenney('#f5c22b'), roughness: 0.7 }),
  tyre:  m.material('tyre',  { color: kenney('#2b2b2e'), roughness: 0.95 }),
  metal: m.material('metal', { color: kenney('#555a61'), roughness: 0.6 }),
  light: m.material('light', { color: kenney('#fff4c4'), roughness: 0.4 }),
  red:   m.material('red',   { color: kenney('#d8382c'), roughness: 0.7 }),
  seat:  m.material('seat',  { color: kenney('#2f2f35'), roughness: 0.8 }),
  skin:  m.material('skin',  { color: kenney('#f2c29b'), roughness: 0.8 }),
  shirt: m.material('shirt', { color: kenney('#e8584a'), roughness: 0.85 }),
  jeans: m.material('jeans', { color: kenney('#34507a'), roughness: 0.85 }),
  hat:   m.material('hat',   { color: kenney('#f5c22b'), roughness: 0.85 }),
};

// ---- numbers first
const [FL, , BL] = T.wheels;                                  // a front and a back wheel (the others mirror in x)
const FRONT_W = 0.22, BACK_W = 0.28;                          // tyre widths
const D = T.deck;                                             // front mower: centre z, depth, underside y, height
const C = T.cab;                                              // roll frame + canopy over the seat
const FRAME = { half: 0.22, y0: 0.5, y1: 0.72, z0: 0.0, z1: T.z1 - 0.06 };       // chassis rails under the hood
const HOOD = { half: 0.4, y0: 0.68, z0: 0.35, back: 1.46, front: 1.3 };           // hood: half width, underside, back end, top heights
const TRANS = { half: 0.36, y0: 0.42, y1: 1.0, z0: T.z0 + 0.4, z1: 0.35 };        // transmission housing between the rear wheels
const FLOOR = { y: 0.95, t: 0.05, half: 0.6, z0: -0.3, z1: 0.15 };               // operator floor between the mudguards' inner walls
const STEP_PLATE = { half: 0.78, z0: 0.15, z1: 0.5 };                            // the wider front footplate (front posts stand on it)
const STEP = { x0: 0.62, x1: 0.9, y: 0.5, z0: 0.18, z1: 0.46 };                  // a step each side, below the footplate's ends
const FEND = { r0: BL.r + 0.08, r1: BL.r + 0.14, a0: 10, a1: 170, x0: 0.64, x1: BL.x + BACK_W / 2 + 0.03 }; // rear mudguards
const WALL_X = 0.62, WALL_T = 0.025;                         // mudguards' inner walls (between the tyre and the seat)
const SEAT = { y: C.y0 + 0.08, z: -0.62, w: 0.46, d: 0.42, t: 0.09 };          // cushion: top y, centre z
const WHEEL_C = [0, 1.76, 0.1], WHEEL_R = 0.16;              // steering wheel centre and radius
const DASH = { half: 0.3, y0: 1.0, y1: 1.6, z0: 0.28, z1: HOOD.z0 + 0.06 };
const POST = 0.08, POST_X = 0.74;                            // roll-frame post size and x
const ROOF = { y0: C.y1 - 0.12, hx: C.half + 0.1, z0: C.z0 - 0.12, z1: C.z1 + 0.1 };
const STACK = { x: -0.3, z: 0.8, y1: 2.3, r: 0.055 };       // exhaust stack (the tractor's right side, ahead of the cab)
const fendY = (z, r) => BL.y + Math.sqrt(Math.max(0, r * r - (z - BL.z) ** 2)); // the mudguard's height over a z, at radius r

// ---- body
const body = m.group('body');
m.part('frame', merge([1, -1].map(s => ({ geo: m.box(0.12, FRAME.y1 - FRAME.y0, FRAME.z1 - FRAME.z0), at: [s * FRAME.half, (FRAME.y0 + FRAME.y1) / 2, (FRAME.z0 + FRAME.z1) / 2] }))),
  { parent: body, anchor: 'none', material: mat.metal });
// chunky hood: a side profile extruded across x, its nose rounded off at the front
m.part('hood', extrudeX(m, [[HOOD.z0, HOOD.y0], [T.z1 - 0.08, HOOD.y0], [T.z1, HOOD.y0 + 0.08], [T.z1, HOOD.front - 0.1], [T.z1 - 0.1, HOOD.front], [HOOD.z0, HOOD.back]], -HOOD.half, HOOD.half),
  { parent: body, anchor: 'none', material: mat.paint });
for (const s of [1, -1]) m.part(`stripe_${s > 0 ? 'L' : 'R'}`, m.box(0.02, 0.07, 1.1), { parent: body, at: [s * (HOOD.half + 0.008), 1.2, 1.0], rot: [6, 0, 0], material: mat.trim });
// grille: a white surround with a dark grille standing proud of it; side-mounted headlights near the nose
m.part('grille_surround', m.box(0.66, 0.46, 0.03), { parent: body, at: [0, 0.98, T.z1], anchor: 'back', material: mat.trim });
m.part('grille', m.box(0.52, 0.34, 0.02), { parent: body, at: [0, 0.98, T.z1 + 0.02], anchor: 'back', material: mat.metal });
m.part('grille_bars', merge([-0.08, 0, 0.08].map(dy => ({ geo: m.box(0.5, 0.025, 0.012), at: [0, 0.98 + dy, T.z1 + 0.046] }))), { parent: body, anchor: 'none', material: mat.seat });
m.part('headlights', merge([1, -1].map(s => ({ geo: m.box(0.04, 0.1, 0.16), at: [s * (HOOD.half + 0.02), 1.08, T.z1 - 0.2] }))), { parent: body, anchor: 'none', material: mat.light });
m.part('bumper', m.box(0.78, 0.1, 0.1), { parent: body, at: [0, 0.6, T.z1 - 0.05], material: mat.metal });
// front axle on a pivot block under the frame
m.part('axle_F', m.box(2 * FL.x - FRONT_W - 0.04, 0.09, 0.1), { parent: body, at: [0, FL.y, FL.z], material: mat.metal });
m.part('axle_F_pivot', m.box(0.2, FRAME.y0 - FL.y + 0.04, 0.22), { parent: body, at: [0, FL.y, FL.z], anchor: 'bottom', material: mat.metal });
// transmission and rear axle housings
m.part('transmission', m.box(2 * TRANS.half, TRANS.y1 - TRANS.y0, TRANS.z1 - TRANS.z0), { parent: body, at: [0, TRANS.y0, (TRANS.z0 + TRANS.z1) / 2], anchor: 'bottom', material: mat.paint });
m.part('axle_B', m.box(2 * BL.x - BACK_W - 0.04, 0.18, 0.18), { parent: body, at: [0, BL.y, BL.z], material: mat.metal });
// dash and steering
m.part('dash', m.box(2 * DASH.half, DASH.y1 - DASH.y0, DASH.z1 - DASH.z0), { parent: body, at: [0, DASH.y0, (DASH.z0 + DASH.z1) / 2], anchor: 'bottom', material: mat.paint });
m.part('dash_top', m.box(2 * DASH.half + 0.04, 0.04, DASH.z1 - DASH.z0 + 0.04), { parent: body, at: [0, DASH.y1, (DASH.z0 + DASH.z1) / 2], anchor: 'bottom', material: mat.seat });
m.beam('column', [0, DASH.y1 - 0.05, DASH.z0 + 0.02], WHEEL_C, { parent: body, size: 0.045, round: true, material: mat.metal });
m.part('steering_wheel', m.torus(WHEEL_R, 0.028, 6, 14), { parent: body, at: WHEEL_C, rot: [55, 0, 0], material: mat.seat });
m.part('steering_spoke', m.box(2 * WHEEL_R, 0.03, 0.03), { parent: body, at: WHEEL_C, rot: [55, 0, 0], material: mat.seat });
// operator floor and the wider footplate, a step below each end of it
m.part('floor', m.box(2 * FLOOR.half, FLOOR.t, FLOOR.z1 - FLOOR.z0), { parent: body, at: [0, FLOOR.y - FLOOR.t, (FLOOR.z0 + FLOOR.z1) / 2], anchor: 'bottom', material: mat.seat });
m.part('footplate', m.box(2 * STEP_PLATE.half, FLOOR.t, STEP_PLATE.z1 - STEP_PLATE.z0), { parent: body, at: [0, FLOOR.y - FLOOR.t, (STEP_PLATE.z0 + STEP_PLATE.z1) / 2], anchor: 'bottom', material: mat.seat });
for (const s of [1, -1]) {
  const id = s > 0 ? 'L' : 'R', xc = s * (STEP.x0 + STEP.x1) / 2;
  m.part(`step_${id}`, m.box(STEP.x1 - STEP.x0, 0.05, STEP.z1 - STEP.z0), { parent: body, at: [xc, STEP.y, (STEP.z0 + STEP.z1) / 2], material: mat.metal });
  m.part(`step_hangers_${id}`, merge([STEP.z0 + 0.02, STEP.z1 - 0.02].map(z => ({ geo: m.box(0.04, FLOOR.y - FLOOR.t - STEP.y, 0.03), at: [s * (STEP.x0 + 0.02), (STEP.y + FLOOR.y - FLOOR.t) / 2, z] }))),
    { parent: body, anchor: 'none', material: mat.metal });
}
// rear mudguards: a thick arc over each rear tyre, with a flat inner wall down to the floor
const arc = (r0, r1, a0, a1, n) => {
  const pts = [];
  for (let i = 0; i <= n; i++) { const a = (a0 + (a1 - a0) * i / n) * Math.PI / 180; pts.push([BL.z + r1 * Math.cos(a), BL.y + r1 * Math.sin(a)]); }
  for (let i = n; i >= 0; i--) { const a = (a0 + (a1 - a0) * i / n) * Math.PI / 180; pts.push([BL.z + r0 * Math.cos(a), BL.y + r0 * Math.sin(a)]); }
  return pts;
};
const wa = Math.asin((FLOOR.y - FLOOR.t - BL.y) / FEND.r0) * 180 / Math.PI;     // where the arc meets the floor's underside
const WALL = []; for (let i = 0; i <= 8; i++) { const a = (wa + (180 - 2 * wa) * i / 8) * Math.PI / 180; WALL.push([BL.z + FEND.r0 * Math.cos(a), BL.y + FEND.r0 * Math.sin(a)]); }
for (const s of [1, -1]) {
  const id = s > 0 ? 'L' : 'R', [x0, x1] = s > 0 ? [FEND.x0, FEND.x1] : [-FEND.x1, -FEND.x0];
  m.part(`fender_${id}`, extrudeX(m, arc(FEND.r0, FEND.r1, FEND.a0, FEND.a1, 8), x0, x1), { parent: body, anchor: 'none', material: mat.paint });
  m.part(`fender_wall_${id}`, extrudeX(m, WALL, s > 0 ? WALL_X : -WALL_X - WALL_T, s > 0 ? WALL_X + WALL_T : -WALL_X), { parent: body, anchor: 'none', material: mat.paint });
  // a white trim strip along the mudguard's outer edge, and a tail light on its back end
  m.part(`fender_trim_${id}`, extrudeX(m, arc(FEND.r1 - 0.01, FEND.r1 + 0.015, FEND.a0 + 4, FEND.a1 - 4, 8), s > 0 ? FEND.x1 - 0.05 : -FEND.x1 - 0.01, s > 0 ? FEND.x1 + 0.01 : -FEND.x1 + 0.05),
    { parent: body, anchor: 'none', material: mat.trim });
  const ta = (FEND.a1 - 12) * Math.PI / 180;
  m.part(`tail_light_${id}`, m.box(0.1, 0.07, 0.05), { parent: body, at: [s * (FEND.x1 - 0.1), BL.y + (FEND.r1 + 0.02) * Math.sin(ta), BL.z + (FEND.r1 + 0.02) * Math.cos(ta)], rot: [-(FEND.a1 - 12 - 90), 0, 0], material: mat.red });
}
// seat on a pedestal over the transmission, a back leaning back a little
m.part('seat', m.box(SEAT.w, SEAT.t, SEAT.d), { parent: body, at: [0, SEAT.y - SEAT.t, SEAT.z], anchor: 'bottom', material: mat.seat });
m.part('seat_post', m.box(0.22, SEAT.y - SEAT.t - TRANS.y1 + 0.02, 0.22), { parent: body, at: [0, TRANS.y1 - 0.01, SEAT.z], anchor: 'bottom', material: mat.metal });
const sb = m.group('seat_back_pivot', { parent: body, at: [0, SEAT.y - 0.02, SEAT.z - SEAT.d / 2 + 0.04], rot: [-10, 0, 0] });
m.part('seat_back', m.box(SEAT.w, 0.4, 0.08), { parent: sb, anchor: 'bottom', material: mat.seat });
// roll frame: front posts on the footplate, back posts on the mudguards, a canopy roof over the top
for (const s of [1, -1]) {
  const id = s > 0 ? 'L' : 'R', x = s * POST_X;
  m.part(`post_F_${id}`, m.box(POST, ROOF.y0 - FLOOR.y + 0.02, POST), { parent: body, at: [x, FLOOR.y - 0.01, C.z1], anchor: 'bottom', material: mat.metal });
  const yb = fendY(C.z0, FEND.r1) - 0.03;
  m.part(`post_B_${id}`, m.box(POST, ROOF.y0 - yb + 0.02, POST), { parent: body, at: [x, yb, C.z0], anchor: 'bottom', material: mat.metal });
}
m.part('roll_bar_B', m.box(2 * POST_X + POST, POST, POST), { parent: body, at: [0, ROOF.y0 - 0.12, C.z0], material: mat.metal });
m.part('canopy', loft([[0, ROOF.hx, (ROOF.z1 - ROOF.z0) / 2], [0.06, ROOF.hx, (ROOF.z1 - ROOF.z0) / 2], [C.y1 - ROOF.y0, ROOF.hx - 0.1, (ROOF.z1 - ROOF.z0) / 2 - 0.1]]),
  { parent: body, at: [0, ROOF.y0, (ROOF.z0 + ROOF.z1) / 2], anchor: 'none', material: mat.trim });
m.part('canopy_rim', m.box(2 * ROOF.hx + 0.03, 0.04, ROOF.z1 - ROOF.z0 + 0.03), { parent: body, at: [0, ROOF.y0 - 0.005, (ROOF.z0 + ROOF.z1) / 2], anchor: 'bottom', material: mat.paint });
// exhaust stack out of the hood, a cap on top
m.part('exhaust', m.cyl(STACK.r, STACK.r, STACK.y1 - 1.3, 8), { parent: body, at: [STACK.x, 1.3, STACK.z], anchor: 'bottom', material: mat.seat });
m.part('exhaust_cap', m.cyl(STACK.r + 0.02, STACK.r + 0.02, 0.06, 8), { parent: body, at: [STACK.x, STACK.y1, STACK.z], rot: [-12, 0, 0], material: mat.metal });
m.part('exhaust_guard', m.cyl(STACK.r + 0.025, STACK.r + 0.025, 0.3, 8), { parent: body, at: [STACK.x, HOOD.back + 0.15, STACK.z], anchor: 'bottom', material: mat.metal });
// back: drawbar out to the hitch, two lower links, a PTO shield
const [, HY, HZ] = T.hitch;
m.part('drawbar', m.box(0.14, 0.06, TRANS.z0 + 0.05 - HZ), { parent: body, at: [0, HY, TRANS.z0 + 0.05], anchor: 'front', material: mat.metal });
m.part('hitch_pin', m.cyl(0.03, 0.03, 0.18, 6), { parent: body, at: [0, HY + 0.02, HZ + 0.05], material: mat.rim });
for (const s of [1, -1]) m.beam(`link_${s > 0 ? 'L' : 'R'}`, [s * 0.3, 0.62, TRANS.z0 + 0.05], [s * 0.36, 0.42, T.z0 + 0.05], { parent: body, size: 0.06, material: mat.metal });
m.part('pto_shield', m.box(0.36, 0.06, 0.22), { parent: body, at: [0, 0.82, TRANS.z0], anchor: 'front', material: mat.paint });
// the mower deck's two arms (they stay put while the deck scales in x)
for (const s of [1, -1]) m.beam(`deck_arm_${s > 0 ? 'L' : 'R'}`, [s * 0.3, FRAME.y0 + 0.02, 1.35], [s * 0.3, D.y + D.h - 0.04, D.z - D.depth / 2 + 0.06], { parent: body, size: 0.07, material: mat.metal });

// ---- deck: 1 m wide (x -0.5..0.5), origin on its underside centre; a dark skirt, a blue shell with sloped front and back,
// two ribs across the top and a white stripe along the front. Nothing round in x, so it reads scaled 2.5..6x
const deck = m.group('deck', { at: [0, D.y, D.z] });
const DZ = D.depth / 2;
m.part('deck_skirt', m.box(1, 0.08, D.depth), { parent: deck, anchor: 'bottom', material: mat.metal });
m.part('deck_shell', loft([[0.08, 0.495, DZ - 0.01], [D.h - 0.1, 0.495, DZ - 0.01], [D.h, 0.46, DZ - 0.16]]), { parent: deck, anchor: 'none', material: mat.paint });
m.part('deck_ribs', merge([-0.2, 0.2].map(z => ({ geo: m.box(0.9, 0.04, 0.08), at: [0, D.h + 0.02, z] }))), { parent: deck, anchor: 'none', material: mat.metal });
m.part('deck_stripe', m.box(0.97, 0.05, 0.015), { parent: deck, at: [0, 0.16, DZ - 0.01], anchor: 'back', material: mat.trim });

// ---- driver: a chunky friendly figure in a cap on the seat; the node's origin is the seat top centre
const S = SEAT.y, SZ = SEAT.z;
const drv = m.group('driver', { world: [0, S, SZ] });
const P = (name, geo, world, opts) => m.part(name, geo, { parent: drv, world, ...opts });
const TZ = SZ + 0.02;                                         // torso centre z
P('torso', m.box(0.34, 0.42, 0.22), [0, S + 0.21, TZ], { rot: [6, 0, 0], material: mat.shirt });
P('bib', m.box(0.26, 0.2, 0.03), [0, S + 0.14, TZ + 0.12], { rot: [6, 0, 0], material: mat.jeans });
P('hips', m.box(0.34, 0.12, 0.26), [0, S + 0.06, TZ], { material: mat.jeans });
for (const s of [1, -1]) {
  const id = s > 0 ? 'L' : 'R';
  const hip = [s * 0.1, S + 0.07, TZ], knee = [s * 0.14, S + 0.1, SZ + 0.46], foot = [s * 0.2, FLOOR.y + 0.08, SZ + 0.7];
  m.beam(`thigh_${id}`, hip, knee, { parent: drv, size: 0.13, material: mat.jeans });
  m.beam(`shin_${id}`, knee, foot, { parent: drv, size: 0.12, material: mat.jeans });
  P(`boot_${id}`, m.box(0.13, 0.1, 0.22), [s * 0.2, FLOOR.y + 0.05, SZ + 0.73], { material: mat.seat });
  const shoulder = [s * 0.2, S + 0.38, TZ + 0.02], elbow = [s * 0.24, S + 0.22, TZ + 0.3], hand = [s * 0.13, WHEEL_C[1] + 0.02, WHEEL_C[2] - 0.03];
  m.beam(`arm_${id}`, shoulder, elbow, { parent: drv, size: 0.09, material: mat.shirt });
  m.beam(`forearm_${id}`, elbow, hand, { parent: drv, size: 0.08, material: mat.skin });
  P(`hand_${id}`, m.sphere(0.05, 6, 4), hand, { material: mat.skin });
}
const HEAD = [0, S + 0.53, TZ + 0.03];
P('head', m.sphere(0.12, 8, 6), HEAD, { material: mat.skin });
P('nose', m.box(0.05, 0.05, 0.05), [0, HEAD[1] - 0.01, HEAD[2] + 0.12], { material: mat.skin });
P('eyes', merge([1, -1].map(s => ({ geo: m.box(0.03, 0.04, 0.02), at: [s * 0.05, 0.03, 0.105] }))), HEAD, { anchor: 'none', material: mat.seat });
// cap: a domed crown and a peak sticking out the front
P('cap_crown', m.lathe([[0.128, 0], [0.126, 0.04], [0.1, 0.09], [0, 0.11]], 10), [0, HEAD[1] + 0.03, HEAD[2] - 0.01], { anchor: 'bottom', material: mat.hat });
P('cap_peak', m.box(0.2, 0.02, 0.13), [0, HEAD[1] + 0.045, HEAD[2] + 0.16], { rot: [-8, 0, 0], material: mat.hat });
P('cap_button', m.cyl(0.02, 0.02, 0.02, 6), [0, HEAD[1] + 0.14, HEAD[2] - 0.01], { anchor: 'bottom', material: mat.red });

// ---- wheels
for (const w of T.wheels) wheel(m, w.name.slice(6), w, { width: w.front ? FRONT_W : BACK_W, lugs: w.front ? 12 : 18, mat });

// ---- sockets
m.socket('Socket_Hitch', { at: T.hitch });

await m.write(out('tractor'));
