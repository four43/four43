// Harvest combine: a chunky toy-like combine harvester (no header: header.glb mounts on Socket_Header). Source for
// assets/models/custom/combine.glb (spec: combine.spec.json). Regenerate from exp/harvest with
//   node tools/models/combine.model.mjs   (under the usual systemd-run memory cap); needs the glb-author skill's kit.
// Metres, +Y up, front faces +Z (+X is the combine's LEFT), origin bottom-centre on the ground.
// Every placement comes from COMBINE (src/defs/models.js), so the art matches the sim's wheels, sockets, cab, tank and spout.
// Contract nodes: body, grain (scaled in Y by the game), spout (swings about Y), nozzle (in the spout, at the pipe's end, turned by
// the game; hangs down at rest), wheel_FL/FR/BL/BR (spin about X),
// Socket_Header, Socket_Hitch, Socket_SpoutTip. Material `paint` is repainted per player.
import { COMBINE as C } from '../../src/defs/models.js';
import { kenney, KIT, out, extrudeX, wheel, bin, loft, merge } from './lib.mjs';
const { model } = await import(KIT);

const m = model('combine');

const mat = {
  paint: m.material('paint', { color: kenney('#3f9e3a'), roughness: 0.7 }),
  trim:  m.material('trim',  { color: kenney('#f5c22b'), roughness: 0.7 }),
  glass: m.material('glass', { color: kenney('#a9dcef'), roughness: 0.3 }),
  tyre:  m.material('tyre',  { color: kenney('#2b2b2e'), roughness: 0.95 }),
  metal: m.material('metal', { color: kenney('#555a61'), roughness: 0.6 }),
  grain: m.material('grain', { color: kenney('#eab84a'), roughness: 0.95 }),
  light: m.material('light', { color: kenney('#fff4c4'), roughness: 0.4 }),
};
mat.rim = mat.trim;

// ---- numbers first
const BHX = 1.0;                         // half width of the main body (the wheels sit outside it)
const BODY_Y0 = 0.6, DECK = C.cab.y0;    // body underside; top deck (the cab floor and the tank base start here)
const BZ0 = C.z0, BZ1 = 2.1;             // body rear / front (the feeder house carries on to the header)
const T = C.tank, CAB = C.cab;
const TANK_T = 0.07, TANK_FLARE = 0.08;  // tank wall thickness, how much the walls lean out at the top
const ENG = { z0: BZ0 + 0.15, z1: T.z - T.half - 0.08, top: 2.85, half: 0.88 };
const PLAT = { half: 1.32, z0: CAB.z0 - 0.25, z1: CAB.z1 + 0.15, t: 0.1 };
const FRONT_W = 0.36, BACK_W = 0.28;     // tyre widths
const [SX, SY, SZ] = C.spout.root, PIPE_R = 0.15, PIPE_X = 0.22; // spout pipe runs PIPE_X out from the pivot (clear of the tank)

// ---- body: side profile (z, y) extruded across the width: square front, sloped rear hood over the straw spreader
const body = m.group('body');
m.part('hull', extrudeX(m, [[BZ1, BODY_Y0], [BZ1, DECK], [BZ0 + 0.12, DECK], [BZ0, DECK - 0.5], [BZ0, BODY_Y0 + 0.5], [BZ0 + 0.35, BODY_Y0]], -BHX, BHX),
  { parent: body, anchor: 'none', material: mat.paint });
// yellow stripe down both sides, and a dark straw-spreader grille on the back
for (const s of [1, -1]) m.part(`stripe_${s > 0 ? 'L' : 'R'}`, m.box(0.03, 0.18, BZ1 - BZ0 - 0.3), { parent: body, at: [s * (BHX + 0.012), 1.62, (BZ0 + BZ1) / 2 + 0.05], material: mat.trim });
m.part('spreader', m.box(1.5, 0.45, 0.06), { parent: body, at: [0, 1.38, BZ0 - 0.02], material: mat.metal });
m.part('spreader_hood', m.box(1.7, 0.08, 0.5), { parent: body, at: [0, BODY_Y0 + 0.08, BZ0 + 0.1], rot: [-35, 0, 0], material: mat.metal });

// feeder house: the sloping throat from the header mount (Socket_Header) up into the body front
const [HX_, HY, HZ] = C.header;
m.part('feeder', extrudeX(m, [[HZ - 0.06, HY + 0.18], [HZ - 0.06, HY + 1.0], [BZ1 - 0.05, 1.75], [BZ1 - 0.05, 0.85]], -0.62, 0.62),
  { parent: body, anchor: 'none', material: mat.paint });
m.part('feeder_plate', m.box(1.45, 0.95, 0.06), { parent: body, at: [0, HY + 0.12, HZ - 0.03], anchor: 'bottom', material: mat.metal });

// front axle housing and the rear steering axle
m.part('axle_F', m.cyl(0.14, 0.14, 2 * C.wheels[0].x - 0.2, 8), { parent: body, at: [0, C.wheels[0].y, C.wheels[0].z], geoRot: [0, 0, 90], material: mat.metal });
m.part('axle_B', m.box(2 * C.wheels[2].x - 0.1, 0.16, 0.22), { parent: body, at: [0, C.wheels[2].y, C.wheels[2].z], material: mat.metal });
m.part('axle_B_post', m.box(0.3, BODY_Y0 + 0.05 - C.wheels[2].y, 0.3), { parent: body, at: [0, C.wheels[2].y, C.wheels[2].z], anchor: 'bottom', material: mat.metal });

// hitch drawbar out the back to Socket_Hitch
const [, HIY, HIZ] = C.hitch;
m.part('drawbar', m.box(0.26, 0.14, BZ0 + 0.45 - HIZ), { parent: body, at: [0, HIY, BZ0 + 0.45], anchor: 'front', material: mat.metal });
m.part('hitch_pin', m.cyl(0.05, 0.05, 0.3, 8), { parent: body, at: [0, HIY, HIZ + 0.05], material: mat.trim });

// ---- cab deck, cab, rails, ladder
m.part('deck', m.box(2 * PLAT.half, PLAT.t, PLAT.z1 - PLAT.z0), { parent: body, at: [0, DECK - PLAT.t, (PLAT.z0 + PLAT.z1) / 2], anchor: 'bottom', material: mat.metal });
m.part('cab_base', m.box(2 * CAB.half, 0.35, CAB.z1 - CAB.z0), { parent: body, at: [0, CAB.y0, (CAB.z0 + CAB.z1) / 2], anchor: 'bottom', material: mat.paint });
const ROOF_T = 0.2, GLASS_Y0 = CAB.y0 + 0.35, GLASS_Y1 = CAB.y1 - ROOF_T;
m.part('cab_glass', m.box(2 * CAB.half - 0.08, GLASS_Y1 - GLASS_Y0, CAB.z1 - CAB.z0 - 0.08), { parent: body, at: [0, GLASS_Y0, (CAB.z0 + CAB.z1) / 2], anchor: 'bottom', material: mat.glass });
m.part('cab_pillars', merge([[1, 1], [-1, 1], [1, -1], [-1, -1]].map(([sx, sz]) => ({
  geo: m.box(0.12, GLASS_Y1 - GLASS_Y0, 0.12), at: [sx * (CAB.half - 0.06), (GLASS_Y0 + GLASS_Y1) / 2, (CAB.z0 + CAB.z1) / 2 + sz * ((CAB.z1 - CAB.z0) / 2 - 0.06)] }))),
  { parent: body, anchor: 'none', material: mat.paint });
m.part('cab_roof', m.box(2 * CAB.half + 0.16, ROOF_T, CAB.z1 - CAB.z0 + 0.22), { parent: body, at: [0, GLASS_Y1, (CAB.z0 + CAB.z1) / 2 + 0.06], anchor: 'bottom', material: mat.trim });
m.part('cab_lights', merge([1, -1].map(s => ({ geo: m.box(0.26, 0.1, 0.06), at: [s * 0.55, GLASS_Y1 + ROOF_T / 2, CAB.z1 + 0.17] }))), { parent: body, anchor: 'none', material: mat.light });
m.part('mirrors', merge([1, -1].map(s => ({ geo: m.box(0.06, 0.24, 0.16), at: [s * (CAB.half + 0.22), GLASS_Y1 - 0.25, CAB.z1 - 0.05] }))), { parent: body, anchor: 'none', material: mat.metal });
for (const s of [1, -1]) m.beam(`mirror_arm_${s > 0 ? 'L' : 'R'}`, [s * CAB.half, GLASS_Y1 - 0.1, CAB.z1 - 0.05], [s * (CAB.half + 0.22), GLASS_Y1 - 0.18, CAB.z1 - 0.05], { parent: body, size: 0.04, material: mat.metal });
// handrails round the deck sides: posts + a top rail, yellow
const RAIL_Y = DECK + 0.8, RX = PLAT.half - 0.04;
for (const s of [1, -1]) {
  const id = s > 0 ? 'L' : 'R';
  m.part(`rail_posts_${id}`, merge([PLAT.z0 + 0.05, (PLAT.z0 + PLAT.z1) / 2, PLAT.z1 - 0.05].map(z => ({ geo: m.box(0.05, RAIL_Y - DECK, 0.05), at: [s * RX, (DECK + RAIL_Y) / 2, z] }))),
    { parent: body, anchor: 'none', material: mat.trim });
  m.part(`rail_top_${id}`, m.box(0.06, 0.06, PLAT.z1 - PLAT.z0 - 0.05), { parent: body, at: [s * RX, RAIL_Y, (PLAT.z0 + PLAT.z1) / 2], material: mat.trim });
}
// ladder on the left (+X) side, behind the front wheel, from near the ground up to the deck
const LAD = { x: PLAT.half + 0.02, zb: PLAT.z0 - 0.35, zt: PLAT.z0 + 0.02, yb: 0.3, yt: DECK - 0.02, w: 0.42 };
for (const [id, dx] of [['in', -LAD.w / 2], ['out', LAD.w / 2]])
  m.beam(`ladder_${id}`, [LAD.x, LAD.yb, LAD.zb + dx], [LAD.x, LAD.yt, LAD.zt + dx], { parent: body, size: 0.05, material: mat.metal });
m.part('ladder_rungs', merge(Array.from({ length: 5 }, (_, i) => {
  const f = (i + 0.5) / 5;
  return { geo: m.box(0.05, 0.04, LAD.w), at: [LAD.x, LAD.yb + f * (LAD.yt - LAD.yb), LAD.zb + f * (LAD.zt - LAD.zb)] };
})), { parent: body, anchor: 'none', material: mat.metal });

// ---- grain tank: a base block on the deck, then an open-top bin whose inside floor is exactly T.floor
m.part('tank_base', m.box(2 * T.half, T.floor - DECK, 2 * T.half), { parent: body, at: [T.x, DECK, T.z], anchor: 'bottom', material: mat.paint });
const binH = T.top - (T.floor - TANK_T);
m.part('tank', bin({ bhx: T.half, bhz: T.half, thx: T.half + TANK_FLARE, thz: T.half + TANK_FLARE, h: binH, t: TANK_T }),
  { parent: body, at: [T.x, T.floor - TANK_T, T.z], anchor: 'none', material: mat.paint });
// yellow lip round the tank top
const LIP = T.half + TANK_FLARE + 0.02;
m.part('tank_lip', merge([
  { geo: m.box(2 * LIP, 0.08, 0.1), at: [T.x, T.top, T.z + LIP - 0.05] }, { geo: m.box(2 * LIP, 0.08, 0.1), at: [T.x, T.top, T.z - LIP + 0.05] },
  { geo: m.box(0.1, 0.08, 2 * LIP - 0.2), at: [T.x + LIP - 0.05, T.top, T.z] }, { geo: m.box(0.1, 0.08, 2 * LIP - 0.2), at: [T.x - LIP + 0.05, T.top, T.z] },
]), { parent: body, anchor: 'none', material: mat.trim });
// the unloading auger's upright tube on the tank's left side, up to the spout pivot
m.part('auger_tube', m.cyl(PIPE_R + 0.02, PIPE_R + 0.02, SY - 0.1 - (DECK - 0.4), 8), { parent: body, at: [SX + PIPE_X, DECK - 0.4, SZ], anchor: 'bottom', material: mat.paint });
m.part('auger_bracket', m.box(SX + PIPE_X - BHX + 0.05, 0.2, 0.3), { parent: body, at: [BHX - 0.05, DECK - 0.3, SZ], anchor: 'left', material: mat.metal });

// ---- engine at the back, behind the tank, with side grilles and an exhaust stack
m.part('engine', m.box(2 * ENG.half, ENG.top - DECK, ENG.z1 - ENG.z0), { parent: body, at: [0, DECK, (ENG.z0 + ENG.z1) / 2], anchor: 'bottom', material: mat.paint });
m.part('engine_grilles', merge([1, -1].flatMap(s => [0, 1, 2].map(i => ({ geo: m.box(0.04, 0.09, ENG.z1 - ENG.z0 - 0.3), at: [s * (ENG.half + 0.01), DECK + 0.18 + i * 0.16, (ENG.z0 + ENG.z1) / 2] })))),
  { parent: body, anchor: 'none', material: mat.metal });
m.part('engine_cap', m.box(2 * ENG.half + 0.06, 0.07, ENG.z1 - ENG.z0 + 0.06), { parent: body, at: [0, ENG.top, (ENG.z0 + ENG.z1) / 2], anchor: 'bottom', material: mat.metal });
m.part('exhaust', m.cyl(0.08, 0.08, 0.55, 8), { parent: body, at: [-0.5, ENG.top + 0.07, ENG.z1 - 0.3], anchor: 'bottom', material: mat.metal });
m.part('exhaust_cap', m.cyl(0.11, 0.09, 0.08, 8), { parent: body, at: [-0.5, ENG.top + 0.62, ENG.z1 - 0.3], anchor: 'bottom', material: mat.metal });
// cradle the folded spout rests on, at the back corner
m.beam('spout_rest', [ENG.half, ENG.top - 0.1, ENG.z0 + 0.3], [SX + PIPE_X, SY - PIPE_R - 0.02, ENG.z0 + 0.3], { parent: body, size: 0.08, material: mat.metal });

// ---- grain heap: origin on the tank floor centre; at scale 1 its domed top reaches T.top
const GI = T.half - TANK_T - 0.01, GH = T.top - T.floor;               // inside half at the floor; heap height
const lean = y => GI + TANK_FLARE * (y + TANK_T) / binH;               // inside half up the flared wall
m.part('grain', loft([[0, GI, GI], [GH * 0.72, lean(GH * 0.72), lean(GH * 0.72)], [GH * 0.9, lean(GH) * 0.72, lean(GH) * 0.72], [GH, lean(GH) * 0.35, lean(GH) * 0.35]]),
  { at: [T.x, T.floor, T.z], anchor: 'none', material: mat.grain });

// ---- unloading spout: pivot at C.spout.root, folded along -Z; Socket_SpoutTip at the open end of the down-turned nozzle
const spout = m.group('spout', { at: C.spout.root });
const L = C.spout.length;
m.part('spout_elbow', m.sphere(PIPE_R + 0.05, 8, 6), { parent: spout, at: [PIPE_X, 0, 0], material: mat.metal });
m.part('spout_pipe', m.cyl(PIPE_R, PIPE_R, L, 8), { parent: spout, at: [PIPE_X, 0, 0], geoRot: [90, 0, 0], anchor: 'front', material: mat.paint });
m.part('spout_bands', merge([0.6, 1.2, 1.8].map(d => ({ geo: m.cyl(PIPE_R + 0.025, PIPE_R + 0.025, 0.1, 8), at: [PIPE_X, 0, -d], rot: [90, 0, 0] }))), { parent: spout, anchor: 'none', material: mat.trim });
// the nozzle: its own node pivoting at the pipe's end (a ball joint), hanging down at rest; the game turns it along the grain stream
const NOZ = 0.42;
const nozzle = m.group('nozzle', { parent: spout, at: [PIPE_X, 0, -L] });
m.part('nozzle_joint', m.sphere(PIPE_R + 0.04, 8, 6), { parent: nozzle, at: [0, 0, 0], material: mat.metal });
m.part('spout_nozzle', m.cyl(PIPE_R + 0.03, PIPE_R + 0.06, NOZ, 8), { parent: nozzle, at: [0, 0.08, 0], anchor: 'top', material: mat.metal });
m.socket('Socket_SpoutTip', { parent: nozzle, at: [0, 0.08 - NOZ, 0] });

// ---- wheels: big drive wheels at the front, small steering wheels at the back
for (const w of C.wheels) wheel(m, w.name.slice(6), w, { width: w.front ? FRONT_W : BACK_W, lugs: w.front ? 18 : 14, mat });

// ---- sockets
m.socket('Socket_Header', { at: C.header });
m.socket('Socket_Hitch', { at: C.hitch });

await m.write(out('combine'));
