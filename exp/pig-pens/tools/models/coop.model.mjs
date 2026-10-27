// Pig Pens chicken coop: a chunky Kenney-style hen house on short stilts, hollow, with a straw floor, a two-step ladder
// roost along the back wall, a sliding pop door and a slatted ramp. Source for assets/models/custom/coop.glb
// (spec: coop.spec.json). Regenerate from exp/pig-pens with
//   node tools/models/coop.model.mjs   (under the usual systemd-run memory cap); needs the glb-author skill's kit.
// Metres, +Y up, origin at the centre of the footprint on the ground, front (+Z) has the pop door and ramp, +X is the
// coop's left. Every dimension derives from COOP in src/defs/buildings.js.
// Node contract (the view's cutaway drives these): roof (all above the eave), walls > wall_front/back/side_L/side_R
// (origins on the ground so a y-scale squashes each wall to a stub), interior (always shown), pop_door (slides up h).
import { COOP } from '../../src/defs/buildings.js';
import { kenney, KIT } from './lib.mjs';
const { model, THREE } = await import(KIT);

const m = model('coop');

// ---- numbers first
const HX = COOP.hx, HZ = COOP.hz, F = COOP.floor, EAVE = COOP.eave, RIDGE = COOP.ridge, OV = COOP.overhang;
const PD = COOP.popDoor, RAMP_Z = COOP.rampZ;
const T = 0.08;                                  // wall thickness
const WALL_H = EAVE - F;                         // walls stand on the raised floor
const SLAB = 0.09, LIP = 0.04;                   // floor slab thickness (top at F), how far it sticks out past the walls
const POST = 0.13;                               // stilt section
const STRAW = 0.035;                             // bedding depth on the floor
const CORNER = 0.11, CORNER_OUT = 0.025;         // corner boards: section, how far proud of the walls
const WIN = { x: -0.75, y: 1.3, w: 0.46, h: 0.38, frame: 0.06 };   // small window on the front (model's right of the door)
const RT = 0.07, CAP = 0.06, SHINGLE_ROWS = 3, SHINGLE_LIP = 0.035;
const RAMP_W = 0.5, RAMP_T = 0.05, SLATS = 4;
const PANEL_OVER = 0.02;                         // pop door panel overlaps the opening on each side / top
const IX = HX - T, IZ = HZ - T;                  // inner half sizes
// no two parts share a face plane where they overlap (z-fighting): touching parts are sunk EMBED into each other, each
// at its own depth, and visible trim stands >= 1 cm proud of what it sits on
const EMBED = 0.01;

// roof: underside y = Y_PK - S*|z| passes through the wall top outer corner (HZ, EAVE); top(0) + CAP = RIDGE
const XR = HX + OV, ZR = HZ + OV;
const TV_OF = s => RT * Math.sqrt(1 + s * s);
let Y_PK = RIDGE - 0.15;
for (let i = 0; i < 20; i++) Y_PK = RIDGE - CAP - TV_OF((Y_PK - EAVE) / HZ);
const S = (Y_PK - EAVE) / HZ, TV = TV_OF(S);
const under = z => Y_PK - S * Math.abs(z);
const top = z => under(z) + TV;

const C = {
  wood:  m.material('wood',  { color: kenney('#8d5639'), roughness: 0.9 }),   // stilts, slab, slats, roost legs, battens
  wall:  m.material('wall',  { color: kenney('#e07b52'), roughness: 0.9 }),
  trim:  m.material('trim',  { color: kenney('#f4e1c1'), roughness: 0.9 }),
  roof:  m.material('roof',  { color: kenney('#9c4a3c'), roughness: 0.9 }),
  plank: m.material('plank', { color: kenney('#c98b5e'), roughness: 0.9 }),   // ramp, pop door panel, perch rails
  straw: m.material('straw', { color: kenney('#e6c35c'), roughness: 0.9 }),
};

// outline [[x, y]] with optional holes, extruded `depth` along +Z (three.js world UVs, metres)
const shapeGeo = (outline, holes, depth) => {
  const sh = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const h of holes) sh.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))));
  return new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false });
};
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
// a profile in the (z, y) plane extruded along X from x0 to x1
const alongX = (profile, x0, x1) => shapeGeo(profile.map(([z, y]) => [-z, y]), [], x1 - x0).translate(0, 0, x0).rotateY(Math.PI / 2);

// ======== interior: stilts, floor, straw, roost, ramp
const interior = m.group('interior');
for (const sx of [-1, 0, 1]) for (const sz of [-1, 1])
  m.part(`stilt_${sx + 1}${sz > 0 ? 'F' : 'B'}`, m.box(POST, F - SLAB + EMBED, POST),
    { parent: interior, at: [sx * (HX - POST / 2), 0, sz * (HZ - POST / 2)], anchor: 'bottom', material: C.wood });
m.part('floor', m.box(2 * (HX + LIP), SLAB, 2 * (HZ + LIP)), { parent: interior, at: [0, F - SLAB, 0], anchor: 'bottom', material: C.wood });
m.part('straw', m.box(2 * IX - 0.01, STRAW + EMBED / 2, 2 * IZ - 0.01), { parent: interior, at: [0, F - EMBED / 2, 0], anchor: 'bottom', material: C.straw });
// a few loose straw tufts so the bedding doesn't read as a flat slab from above
const TUFTS = [[-1.0, 0.45, 20], [-0.35, -0.1, -35], [0.55, 0.5, 10], [1.05, -0.2, 50], [0.1, 0.75, -15], [-0.9, -0.3, 70]];
TUFTS.forEach(([x, z, yaw], i) => m.part(`straw_tuft_${i}`, m.box(0.34, 0.07, 0.22),
  { parent: interior, at: [x, F + STRAW - 0.02, z], rot: [i % 2 ? 9 : -7, yaw, i % 3 ? 6 : -8], anchor: 'bottom', material: C.straw }));

// ladder roost along the back wall: A-frames carry two round perch rails, the high one at the back
const roost = m.group('roost', { parent: interior });
const ROOST = { span: 2 * IX - 0.3, frontZ: -0.38, backZ: -IZ + 0.05, apexZ: -0.92, apexY: F + 0.66, lowU: 0.5, rail: 0.042 };
const lowRail = [ROOST.frontZ + (ROOST.apexZ - ROOST.frontZ) * ROOST.lowU, F + (ROOST.apexY - F) * ROOST.lowU];
const LEG = 0.045, LEG_B = 0.038;   // back legs a touch thinner so the pair's side faces never share a plane at the apex
for (const [i, x] of [-ROOST.span / 2 + 0.06, 0, ROOST.span / 2 - 0.06].entries()) {
  m.beam(`roost_leg_F${i}`, [x, F, ROOST.frontZ], [x, ROOST.apexY, ROOST.apexZ], { parent: roost, size: LEG, material: C.wood });
  m.beam(`roost_leg_B${i}`, [x, F, ROOST.backZ], [x, ROOST.apexY, ROOST.apexZ], { parent: roost, size: LEG_B, material: C.wood });
}
m.part('perch_high', m.cyl(ROOST.rail, ROOST.rail, ROOST.span, 8), { parent: roost, at: [0, ROOST.apexY + ROOST.rail * 0.6, ROOST.apexZ], geoRot: [0, 0, 90], material: C.plank });
m.part('perch_low', m.cyl(ROOST.rail, ROOST.rail, ROOST.span, 8), { parent: roost, at: [0, lowRail[1] + ROOST.rail * 0.9, lowRail[0]], geoRot: [0, 0, 90], material: C.plank });

// ramp: top surface runs from the pop door sill (z HZ, y F) to the ground at RAMP_Z; the low end is cut flat on the ground
const RUN = RAMP_Z - HZ, ANG = Math.atan2(F, RUN), SIN = Math.sin(ANG), COS = Math.cos(ANG);
const rampProfile = [[HZ, F], [RAMP_Z, 0], [RAMP_Z - RAMP_T / SIN, 0], [HZ, F - RAMP_T / COS]];
m.part('ramp', alongX(rampProfile, -RAMP_W / 2, RAMP_W / 2), { parent: interior, at: [PD.x, 0, 0], anchor: 'none', material: C.plank });
for (let k = 1; k <= SLATS; k++) {
  const u = k / (SLATS + 1), z = HZ + RUN * u, y = F * (1 - u);
  // sunk EMBED into the board along its normal, and 1 cm wider each side
  m.part(`ramp_slat_${k}`, m.box(RAMP_W + 0.02, 0.03 + EMBED, 0.045), { parent: interior, at: [PD.x, y - EMBED * COS, z - EMBED * SIN], rot: [ANG * 180 / Math.PI, 0, 0], anchor: 'bottom', material: C.wood });
}

// ======== walls: one group per face, origin on the ground under that wall
const walls = m.group('walls');
const front = m.group('wall_front', { parent: walls, at: [0, 0, HZ] });
const back = m.group('wall_back', { parent: walls, at: [0, 0, -HZ] });
const sideL = m.group('wall_side_L', { parent: walls, at: [HX, 0, 0] });
const sideR = m.group('wall_side_R', { parent: walls, at: [-HX, 0, 0] });

// front wall: real openings for the pop door (bottom at the floor) and the window
const d0 = PD.x - PD.w / 2, d1 = PD.x + PD.w / 2;
const FB = F - EMBED / 2;   // front/back boards sink into the floor slab
const frontOutline = [[-HX, FB], [d0, FB], [d0, F + PD.h], [d1, F + PD.h], [d1, FB], [HX, FB], [HX, EAVE], [-HX, EAVE]];
const winHole = rect(WIN.x - WIN.w / 2, WIN.y - WIN.h / 2, WIN.x + WIN.w / 2, WIN.y + WIN.h / 2).reverse();
m.part('front_board', shapeGeo(frontOutline, [winHole], T), { parent: front, at: [0, 0, -T], anchor: 'none', material: C.wall });
// window: cream frame, cross bars, sill
const fw = WIN.w / 2 + WIN.frame, fh = WIN.h / 2 + WIN.frame, FI = 0.01;   // frame lip overhangs the opening by FI
const frameHole = rect(WIN.x - WIN.w / 2 + FI, WIN.y - WIN.h / 2 + FI, WIN.x + WIN.w / 2 - FI, WIN.y + WIN.h / 2 - FI).reverse();
m.part('window_frame', shapeGeo(rect(WIN.x - fw, WIN.y - fh, WIN.x + fw, WIN.y + fh), [frameHole], 0.03 + EMBED / 2), { parent: front, at: [0, 0, -EMBED / 2], anchor: 'none', material: C.trim });
m.part('window_bar_v', m.box(0.035, WIN.h + EMBED, 0.03), { parent: front, at: [WIN.x, WIN.y, -T / 2], material: C.trim });
m.part('window_bar_h', m.box(WIN.w + EMBED, 0.035, 0.036), { parent: front, at: [WIN.x, WIN.y, -T / 2], material: C.trim });
m.part('window_sill', m.box(2 * fw + 0.06, 0.04, 0.07), { parent: front, at: [WIN.x, WIN.y - fh + EMBED, 0], anchor: 'top', material: C.trim });
// pop door guides: cream runners either side of the opening, tall enough for the panel to slide up PD.h
const GUIDE_X = PD.w / 2 + PANEL_OVER + 0.03;
for (const [id, s] of [['L', 1], ['R', -1]])
  m.part(`door_guide_${id}`, m.box(0.05, PD.h * 2 + 0.02 + 2 * EMBED, 0.06 + EMBED / 2), { parent: front, at: [PD.x + s * GUIDE_X, F - 2 * EMBED, 0], anchor: 'bottom', offset: [0, 0, (0.06 - EMBED / 2) / 2], material: C.trim });
// lintel: sunk into the guide tops, 1 cm wider and 0.5 cm proud of them
m.part('door_lintel', m.box(2 * GUIDE_X + 0.05 + 0.02, 0.05, 0.065 + 0.8 * EMBED), { parent: front, at: [PD.x, F + PD.h * 2 + 0.02 - EMBED, 0], anchor: 'bottom', offset: [0, 0, (0.065 - 0.8 * EMBED) / 2], material: C.trim });
const EAVE_TRIM = { y: EAVE - 0.02, h: 0.1, out: 0.035, half: HX + CORNER_OUT - 0.01 };
m.part('eave_trim_F', m.box(2 * EAVE_TRIM.half, EAVE_TRIM.h, EAVE_TRIM.out + EMBED / 2), { parent: front, at: [0, EAVE_TRIM.y, 0], anchor: 'top', offset: [0, 0, (EAVE_TRIM.out - EMBED / 2) / 2], material: C.trim });
for (const [id, s] of [['L', 1], ['R', -1]])
  m.part(`corner_F${id}`, m.box(CORNER, WALL_H, CORNER), { parent: front, at: [s * (HX + CORNER_OUT - CORNER / 2), F - 1.5 * EMBED, CORNER_OUT - CORNER / 2], anchor: 'bottom', material: C.trim });

// back wall
m.part('back_board', m.box(2 * HX, EAVE - FB, T), { parent: back, at: [0, FB, T / 2], anchor: 'bottom', material: C.wall });
m.part('eave_trim_B', m.box(2 * EAVE_TRIM.half, EAVE_TRIM.h, EAVE_TRIM.out + EMBED / 2), { parent: back, at: [0, EAVE_TRIM.y, 0], anchor: 'top', offset: [0, 0, -(EAVE_TRIM.out - EMBED / 2) / 2], material: C.trim });
for (const [id, s] of [['L', 1], ['R', -1]])
  m.part(`corner_B${id}`, m.box(CORNER, WALL_H, CORNER), { parent: back, at: [s * (HX + CORNER_OUT - CORNER / 2), F - 1.5 * EMBED, -(CORNER_OUT - CORNER / 2)], anchor: 'bottom', material: C.trim });

// side walls, between the front and back boards; a cream belt board halfway up
for (const [g, s, id] of [[sideL, 1, 'L'], [sideR, -1, 'R']]) {
  // outer face 3 mm in from the front/back boards' end faces (the corner boards cover the step)
  m.part(`side_board_${id}`, m.box(T - 0.003, WALL_H - 0.003 + EMBED, 2 * IZ + 2 * EMBED), { parent: g, at: [-s * (T + 0.003) / 2, F - EMBED, 0], anchor: 'bottom', material: C.wall });
  m.part(`side_belt_${id}`, m.box(0.03 + EMBED / 2, 0.08, 2 * IZ + EMBED), { parent: g, at: [s * (0.03 - EMBED / 2) / 2, F + WALL_H * 0.42, 0], material: C.trim });
}

// ======== roof: everything above the eave
const roof = m.group('roof');
// gable infill on the side walls, eave up to the roof underside
// (bottom sunk into the wall tops, top edge up inside the roof slab, ends inside the front/back boards, faces 6 mm inset)
const GZ = HZ - EMBED, GIN = 0.006;
const gable = [[-GZ, EAVE - EMBED], [GZ, EAVE - EMBED], [GZ, under(GZ) + EMBED / 2], [0, under(0) + 1.5 * EMBED], [-GZ, under(GZ) + EMBED / 2]];
m.part('gable_L', alongX(gable, HX - T + GIN, HX - GIN), { parent: roof, anchor: 'none', material: C.wall });
m.part('gable_R', alongX(gable, -HX + GIN, -HX + T - GIN), { parent: roof, anchor: 'none', material: C.wall });
// a cream vent diamond on each gable
for (const [id, s] of [['L', 1], ['R', -1]])
  m.part(`gable_vent_${id}`, m.box(0.03, 0.16, 0.16), { parent: roof, at: [s * HX, EAVE + (under(0) - EAVE) * 0.42, 0], rot: [45, 0, 0], material: C.trim });
// each roof side: profile in (z, y) with a stepped shingle top, extruded along the ridge (X)
function roofSide(sign) {
  const pts = [[0, under(0)], [sign * ZR, under(ZR)]];
  for (let i = SHINGLE_ROWS; i >= 1; i--) {
    const z0 = ZR * i / SHINGLE_ROWS, z1 = ZR * (i - 1) / SHINGLE_ROWS;
    pts.push([sign * z0, top(z0) + SHINGLE_LIP]);
    pts.push([sign * z1, top(z1) + (i > 1 ? 0 : SHINGLE_LIP * 0.5)]);
  }
  pts[pts.length - 1][0] = 0;
  return pts;
}
// both sides in one outline, so there is no seam face at the ridge
const roofOutline = [...roofSide(1), ...roofSide(-1).reverse().slice(1, -1)];
m.part('roof_shell', alongX(roofOutline, -XR, XR), { parent: roof, anchor: 'none', material: C.roof });
m.part('ridge_cap', m.box(2 * XR + 0.06, CAP * 1.4, CAP * 1.4), { parent: roof, at: [0, RIDGE - CAP * 1.4 / Math.SQRT2, 0], rot: [45, 0, 0], material: C.roof });
// rake trim: cream chevron boards along the gable roof edges
function rake() {
  const z = ZR + 0.01, lo = 0.04, hi = SHINGLE_LIP + 0.012;
  return [[-z, under(z) - lo], [-z, top(z) + hi], [0, top(0) + hi], [z, top(z) + hi], [z, under(z) - lo], [0, under(0) - lo]];
}
m.part('rake_L', alongX(rake(), XR - 0.02, XR + 0.025), { parent: roof, anchor: 'none', material: C.trim });
m.part('rake_R', alongX(rake(), -XR - 0.025, -XR + 0.02), { parent: roof, anchor: 'none', material: C.trim });

// ======== pop door: origin at the opening's bottom centre on the front wall face; shut at rest, slides up PD.h to open
const door = m.group('pop_door', { at: [PD.x, F, HZ] });
const PW = PD.w + 2 * PANEL_OVER, PH = PD.h + PANEL_OVER;
m.part('pop_door_panel', m.box(PW, PH, 0.04), { parent: door, at: [0, 0.004, 0.005], anchor: 'bottom', offset: [0, 0, 0.02], material: C.plank });
for (const [i, y] of [0.14, PH - 0.14].entries())
  m.part(`pop_door_batten_${i}`, m.box(PW - 0.08, 0.06, 0.024), { parent: door, at: [0, y, 0.042], offset: [0, 0, 0.012], material: C.wood });
m.part('pop_door_brace', m.box(0.05, Math.hypot(PW - 0.12, PH - 0.34), 0.02), { parent: door, at: [0, PH / 2, 0.05], rot: [0, 0, -Math.atan2(PW - 0.12, PH - 0.34) * 180 / Math.PI], material: C.wood });

await m.write(new URL('../../assets/models/custom/coop.glb', import.meta.url).pathname);
