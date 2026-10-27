// Pig Pens barn: a chunky Kenney-style red gambrel barn with white trim, a front cross-gable over the double doors (hay
// loft door + hay-hood beam), 16 straw stalls inside. Source for assets/models/custom/barn.glb (spec: barn.spec.json).
// Regenerate from exp/pig-pens with   node tools/models/barn.model.mjs   (under the usual systemd-run memory cap).
// Metres, +Y up, origin at the centre of the footprint on the ground, doors face +Z (+X is the barn's left).
// Every number comes from BARN (src/defs/buildings.js); the cutaway drives roof / walls/wall_* / door_L / door_R by name.
import { BARN } from '../../src/defs/buildings.js';
import { kenney, KIT } from './lib.mjs';
const { model } = await import(KIT);

const m = model('barn');

// ---- numbers first
const B = BARN;
const HW = B.w / 2, HZ = B.d / 2, T = B.wall, EAVE = B.eave, OV = B.overhang;
const { x0: IX0, x1: IX1, z0: IZ0, z1: IZ1 } = B.inner;
const HD = B.door.w / 2, DOOR_H = B.door.h;
const RT = 0.16;                               // roof slab thickness (perpendicular)
const LIP = 0.045, ROWS_LO = 3, ROWS_HI = 3;   // stepped shingle rows: butt height, rows on the lower / upper slope
const KNEE = [HZ - 1.3, EAVE + 1.65];          // gambrel knee (underside): z from centre, y
const CAP = 0.2, CAP_HD = CAP / Math.SQRT2;    // ridge cap: square bar turned 45 deg; half its diagonal
const TRIM = 0.18, TRIM_D = 0.035;             // white trim board width, how far it stands proud
const CG_HW = HD + 0.6, CG_S = 1.1, CG_OV = 0.5, CG_SIDE = 0.2; // cross-gable half width, slope, front overhang, side overhang
const WIN = 0.75;                              // side-wall window size (square)

// gambrel underside: peak height solved so the ridge cap's top lands on BARN.ridge
const sOf = py => (py - KNEE[1]) / KNEE[0];
let PEAK = EAVE + 2.3;
for (let i = 0; i < 30; i++) PEAK = B.ridge - CAP_HD - 0.06 - RT * Math.sqrt(1 + sOf(PEAK) ** 2);
const S_LO = (KNEE[1] - EAVE) / (HZ - KNEE[0]);
const underLo = z => EAVE + (HZ - Math.abs(z)) * S_LO;   // lower-slope underside (also past the wall, for the overhang)

const C = {
  red:   m.material('barnRed',  { color: kenney('#b8352b'), roughness: 0.9 }),
  trim:  m.material('trim',     { color: kenney('#f4ecd6'), roughness: 0.9 }),
  roof:  m.material('roofGrey', { color: kenney('#55595f'), roughness: 0.95 }),
  straw: m.material('straw',    { color: kenney('#e2bc54'), roughness: 1 }),
  wood:  m.material('wood',     { color: kenney('#7a5434'), roughness: 0.95 }),
  glow:  m.material('lampGlow', { color: kenney('#ffd66e'), roughness: 0.6 }),
};

// axis-aligned box from world extents
const box = (nm, parent, [x0, x1], [y0, y1], [z0, z1], material) =>
  m.part(nm, m.box(x1 - x0, y1 - y0, z1 - z0), { parent, world: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], material });
const area = pts => pts.reduce((a, [x, y], i) => { const [u, v] = pts[(i + 1) % pts.length]; return a + x * v - u * y; }, 0) / 2;
const ccw = pts => (area(pts) < 0 ? pts.slice().reverse() : pts);
// outline in the (z, y) plane, extruded along +X from x0 to x1
const extrudeX = (zy, x0, x1) => m.extrude(ccw(zy.map(([z, y]) => [-z, y])), x1 - x0).rotateY(Math.PI / 2).translate(x0, 0, 0);
// outline in the (x, y) plane, extruded along +Z from z0 to z1
const extrudeZ = (xy, z0, z1) => m.extrude(ccw(xy), z1 - z0).translate(0, 0, z0);

// ---- gambrel profile helpers (z, y): one side's underside and stepped top, from the eave tip to the peak
function offsetLine([a, b]) { // shift segment a->b by RT along its upward normal
  const dz = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dz, dy); let nz = -dy / l, ny = dz / l; if (ny < 0) { nz = -nz; ny = -ny; }
  return [[a[0] + nz * RT, a[1] + ny * RT], [b[0] + nz * RT, b[1] + ny * RT]];
}
function intersect([p1, p2], [p3, p4]) {
  const d = (p1[0] - p2[0]) * (p3[1] - p4[1]) - (p1[1] - p2[1]) * (p3[0] - p4[0]);
  const a = p1[0] * p2[1] - p1[1] * p2[0], b = p3[0] * p4[1] - p3[1] * p4[0];
  return [(a * (p3[0] - p4[0]) - (p1[0] - p2[0]) * b) / d, (a * (p3[1] - p4[1]) - (p1[1] - p2[1]) * b) / d];
}
function side(sign, over) { // sign +1 front (+Z), -1 back; over = eave overhang past the wall face
  const tipZ = HZ + over, tip = [sign * tipZ, underLo(tipZ)], knee = [sign * KNEE[0], KNEE[1]], peak = [0, PEAK];
  const lo = offsetLine([tip, knee]), hi = offsetLine([knee, peak]);
  const tTip = intersect(lo, [[tip[0], 0], [tip[0], 1]]), tKnee = intersect(lo, hi), tPeak = intersect(hi, [[0, 0], [0, 1]]);
  const top = [];
  const rows = (a, b, n) => { for (let k = 0; k < n; k++) { const t0 = k / n, t1 = (k + 1) / n;
    top.push([a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0 + LIP], [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1]); } };
  rows(tTip, tKnee, ROWS_LO); rows(tKnee, tPeak, ROWS_HI);
  return { under: [tip, knee], top, smooth: [tTip, tKnee, tPeak] };
}
// whole cross-section (z, y): underside back tip -> front tip, then stepped top front tip -> peak -> back tip
function gambrel(overF, overB) {
  const f = side(1, overF), b = side(-1, overB);
  const top = [...f.top, ...b.top.slice(0, -1).reverse()]; // drop the back side's duplicate peak point
  return [b.under[0], b.under[1], [0, PEAK], f.under[1], f.under[0], ...top];
}

// ================= walls: four face groups, each with its origin on the ground at its base =================
const walls = m.group('walls');
const wf = m.group('wall_front', { parent: walls, at: [0, 0, HZ - T / 2] });
const wb = m.group('wall_back', { parent: walls, at: [0, 0, -HZ + T / 2] });
const wl = m.group('wall_side_L', { parent: walls, at: [HW - T / 2, 0, 0] });
const wr = m.group('wall_side_R', { parent: walls, at: [-HW + T / 2, 0, 0] });

// front wall: left piece, right piece, lintel over the door opening
box('front_L', wf, [HD, HW], [0, EAVE], [HZ - T, HZ], C.red);
box('front_R', wf, [-HW, -HD], [0, EAVE], [HZ - T, HZ], C.red);
box('front_lintel', wf, [-HD, HD], [DOOR_H, EAVE], [HZ - T, HZ], C.red);
box('back_wall', wb, [-HW, HW], [0, EAVE], [-HZ, -HZ + T], C.red);
box('side_L_wall', wl, [HW - T, HW], [0, EAVE], [-HZ + T, HZ - T], C.red);
box('side_R_wall', wr, [-HW, -HW + T], [0, EAVE], [-HZ + T, HZ - T], C.red);

// No two parts share a face plane where they overlap (z-fighting): trim never ends flush with the wall top or bottom,
// boards that cross each other stand at different depths, bands stop at the corner boards.
const ZF = 0.012;                              // the minimum step between faces that would otherwise share a plane
// eave band: a white board along the top of every wall face, stopping ZF short of the wall top
const BAND = [EAVE - TRIM, EAVE - ZF];
const CP = TRIM_D + 0.015;                     // corner boards stand prouder than the bands they cap
const CBX = HW + CP - TRIM, CBZ = HZ + CP - TRIM; // bands run between the corner boards' inner faces
box('band_front', wf, [-CBX, CBX], BAND, [HZ, HZ + TRIM_D], C.trim);
box('band_back', wb, [-CBX, CBX], BAND, [-HZ - TRIM_D, -HZ], C.trim);
box('band_L', wl, [HW, HW + TRIM_D], BAND, [-CBZ, CBZ], C.trim);
box('band_R', wr, [-HW - TRIM_D, -HW], BAND, [-CBZ, CBZ], C.trim);
// corner boards: wrap both walls at each corner, proud of both; ends ZF inside the wall's top and bottom
for (const [id, sx, sz] of [['FL', 1, 1], ['FR', -1, 1], ['BL', 1, -1], ['BR', -1, -1]]) {
  const g = sx > 0 ? wl : wr, cx = sx * (HW + CP - TRIM / 2), cz = sz * (HZ + CP - TRIM / 2);
  box(`corner_${id}`, g, [cx - TRIM / 2, cx + TRIM / 2], [ZF, EAVE - ZF], [cz - TRIM / 2, cz + TRIM / 2], C.trim);
}
// door frame: two jambs and a head board around the opening
box('doorframe_L', wf, [HD, HD + TRIM], [0, DOOR_H], [HZ, HZ + TRIM_D], C.trim);
box('doorframe_R', wf, [-HD - TRIM, -HD], [0, DOOR_H], [HZ, HZ + TRIM_D], C.trim);
box('doorframe_top', wf, [-HD - TRIM, HD + TRIM], [DOOR_H, DOOR_H + TRIM], [HZ, HZ + TRIM_D], C.trim);

// X braces: depth bands off the wall face (frame boards are 0 .. TRIM_D): one brace under the frame's face, one over it
const BRACE_A = [0.006, TRIM_D - ZF], BRACE_B = [0.02, TRIM_D + ZF];
// framed X-brace panel on a wall face: frame + two diagonals, in the plane z = zf (front/back) or x = xf (sides)
function xPanel(nm, parent, cx, cy, w, h, face) { // face: { axis: 'z'|'x', at, dir: +1/-1 outward }
  const t = 0.13, d = TRIM_D, out = face.dir;
  const P = (u, y, k = 0) => (face.axis === 'z' ? [cx + u, y, face.at + out * (d / 2 + k)] : [face.at + out * (d / 2 + k), y, cx + u]);
  const bar = (n2, u0, u1, y0, y1) => {
    const [a, b] = face.axis === 'z' ? [[cx + u0, cx + u1], [face.at, face.at + out * d].sort((p, q) => p - q)] : [[face.at, face.at + out * d].sort((p, q) => p - q), [cx + u0, cx + u1]];
    box(`${nm}_${n2}`, parent, a, [y0, y1], b, C.trim);
  };
  bar('top', -w / 2, w / 2, cy + h / 2 - t, cy + h / 2); bar('bot', -w / 2, w / 2, cy - h / 2, cy - h / 2 + t);
  bar('l', -w / 2, -w / 2 + t, cy - h / 2 + t, cy + h / 2 - t); bar('r', w / 2 - t, w / 2, cy - h / 2 + t, cy + h / 2 - t);
  const iw = w / 2 - t * 0.9, ih = h / 2 - t * 0.9;
  for (const [k, [k0, k1], u] of [['x1', BRACE_A, 1], ['x2', BRACE_B, -1]]) {
    const dd = k1 - k0, c = (k0 + k1) / 2 - d / 2, sz = face.axis === 'z' ? [t * 0.85, dd] : [dd, t * 0.85];
    m.beam(`${nm}_${k}`, P(-u * iw, cy - ih, c), P(u * iw, cy + ih, c), { parent, size: sz, material: C.trim });
  }
}
// small square window: dark glass, white frame, cross muntin
function windowOn(nm, parent, cx, cy, face) {
  const s = WIN, t = 0.11, d = TRIM_D, o = face.dir, at = face.at;
  const span = (u0, u1, y0, y1, k0, k1, mat, n2) => {
    const n = [at + o * k0, at + o * k1].sort((p, q) => p - q);
    if (face.axis === 'z') box(`${nm}_${n2}`, parent, [cx + u0, cx + u1], [y0, y1], n, mat);
    else box(`${nm}_${n2}`, parent, n, [y0, y1], [cx + u0, cx + u1], mat);
  };
  span(-s / 2, s / 2, cy - s / 2, cy + s / 2, 0.003, 0.015, C.roof, 'glass');
  span(-s / 2 - t, s / 2 + t, cy + s / 2, cy + s / 2 + t, 0, d, C.trim, 'top');
  span(-s / 2 - t, s / 2 + t, cy - s / 2 - t, cy - s / 2, 0, d, C.trim, 'sill');
  span(-s / 2 - t, -s / 2, cy - s / 2, cy + s / 2, 0, d, C.trim, 'l');
  span(s / 2, s / 2 + t, cy - s / 2, cy + s / 2, 0, d, C.trim, 'r');
  span(-0.03, 0.03, cy - s / 2 - t / 2, cy + s / 2 + t / 2, 0.006, 0.021, C.trim, 'mv'); // muntin ends run into the frame
  span(-s / 2 - t / 2, s / 2 + t / 2, cy - 0.03, cy + 0.03, 0.009, 0.033, C.trim, 'mh');
}
const WIN_Y = 1.9;
for (const [id, g, sx] of [['L', wl, 1], ['R', wr, -1]])
  for (const [k, z] of [['a', -2.4], ['b', 2.4]]) windowOn(`win_${id}${k}`, g, z, WIN_Y, { axis: 'x', at: sx * HW, dir: sx });
for (const [k, x] of [['a', -4.6], ['b', 0], ['c', 4.6]]) windowOn(`win_B${k}`, wb, x, WIN_Y, { axis: 'z', at: -HZ, dir: -1 });
// framed X panels either side of the doors
const PANEL_W = 2.4, PANEL_H = 1.9, PANEL_X = (HD + TRIM + HW - TRIM) / 2;
xPanel('xpanel_L', wf, PANEL_X, 0.25 + PANEL_H / 2, PANEL_W, PANEL_H, { axis: 'z', at: HZ, dir: 1 });
xPanel('xpanel_R', wf, -PANEL_X, 0.25 + PANEL_H / 2, PANEL_W, PANEL_H, { axis: 'z', at: HZ, dir: 1 });

// ================= doors: two leaves, origin at the hinge, shut =================
const LEAF_T = 0.08, GAP = 0.01;
for (const [id, s] of [['L', 1], ['R', -1]]) {
  const g = m.group(`door_${id}`, { world: [s * HD, 0, HZ] });
  const xs = [s * GAP, s * HD].sort((a, b) => a - b), xo = s > 0 ? xs : xs; // leaf spans centre gap .. hinge
  box(`leaf_${id}`, g, xs, [0.01, DOOR_H - 0.01], [HZ - LEAF_T, HZ], C.red);
  const t = 0.14, z = [HZ, HZ + TRIM_D], y0 = 0.01, y1 = DOOR_H - 0.01, mid = DOOR_H / 2;
  box(`leaf_${id}_top`, g, xo, [y1 - t, y1], z, C.trim);
  box(`leaf_${id}_bot`, g, xo, [y0, y0 + t], z, C.trim);
  box(`leaf_${id}_mid`, g, xo, [mid - t / 2, mid + t / 2], z, C.trim);
  for (const [k, ya, yb] of [['lo', y0 + t, mid - t / 2], ['hi', mid + t / 2, y1 - t]]) {
    box(`leaf_${id}_hinge_${k}`, g, s > 0 ? [HD - t, HD] : [-HD, -HD + t], [ya, yb], z, C.trim);
    box(`leaf_${id}_edge_${k}`, g, s > 0 ? [GAP, GAP + t] : [-GAP - t, -GAP], [ya, yb], z, C.trim);
  }
  const ia = s * (GAP + t * 0.9), ib = s * (HD - t * 0.9);
  const zA = HZ + (BRACE_A[0] + BRACE_A[1]) / 2, dA = BRACE_A[1] - BRACE_A[0], zB = HZ + (BRACE_B[0] + BRACE_B[1]) / 2, dB = BRACE_B[1] - BRACE_B[0];
  for (const [k, ya, yb] of [['lo', y0 + t * 0.9, mid - t * 0.4], ['hi', mid + t * 0.4, y1 - t * 0.9]]) {
    m.beam(`leaf_${id}_${k}1`, [ia, ya, zA], [ib, yb, zA], { parent: g, size: [t * 0.85, dA], material: C.trim });
    m.beam(`leaf_${id}_${k}2`, [ib, ya, zB], [ia, yb, zB], { parent: g, size: [t * 0.85, dB], material: C.trim });
  }
  // a dark iron handle near the meeting edge
  box(`leaf_${id}_handle`, g, s > 0 ? [0.24, 0.3] : [-0.3, -0.24], [1.0, 1.35], [HZ + TRIM_D, HZ + TRIM_D + 0.04], C.roof);
}

// ================= roof: everything above the eave =================
const roof = m.group('roof');
const RX = HW + OV;                                        // roof runs past the gable walls by the overhang
// main gambrel: three segments along X; the middle one stops just behind the front wall face (the cross-gable takes over there)
m.part('roof_main_L', extrudeX(gambrel(OV, OV), CG_HW, RX), { parent: roof, anchor: 'none', material: C.roof });
m.part('roof_main_R', extrudeX(gambrel(OV, OV), -RX, -CG_HW), { parent: roof, anchor: 'none', material: C.roof });
m.part('roof_main_M', extrudeX(gambrel(-0.03, OV), -CG_HW, CG_HW), { parent: roof, anchor: 'none', material: C.roof });
const topPeak = side(1, OV).smooth[2][1];
m.part('ridge_cap', m.box(2 * RX + 0.06, CAP, CAP), { parent: roof, at: [0, topPeak + 0.06, 0], rot: [45, 0, 0], material: C.roof });

// gable-end infill above the eave on both side walls (red), each with a small white-framed loft window
const infill = [[-HZ, EAVE], [HZ, EAVE], [KNEE[0], KNEE[1] - 0.01], [0, PEAK - 0.01], [-KNEE[0], KNEE[1] - 0.01]];
m.part('gable_L', extrudeX(infill, HW - T, HW), { parent: roof, anchor: 'none', material: C.red });
m.part('gable_R', extrudeX(infill, -HW, -HW + T), { parent: roof, anchor: 'none', material: C.red });
for (const [id, sx] of [['L', 1], ['R', -1]]) windowOn(`gablewin_${id}`, roof, 0, EAVE + 1.3, { axis: 'x', at: sx * HW, dir: sx });
// rake trim: a white band round each roof end, just past the roof
function rake(over) {
  const f = side(1, over), b = side(-1, OV), up = LIP + 0.03, dn = 0.09;
  const top = [...f.smooth, ...b.smooth.slice(0, -1).reverse()].map(([z, y]) => [z, y + up]);
  const bot = [b.under[0], b.under[1], [0, PEAK], f.under[1], f.under[0]].map(([z, y]) => [z, y - dn]);
  return [...bot, ...top];
}
m.part('rake_L', extrudeX(rake(OV), RX, RX + 0.05), { parent: roof, anchor: 'none', material: C.trim });
m.part('rake_R', extrudeX(rake(OV), -RX - 0.05, -RX), { parent: roof, anchor: 'none', material: C.trim });
// eave fascia boards under the eave tips (front split round the cross-gable)
const tipY = underLo(HZ + OV), FAS = 0.12;
const FX = RX + 0.05 + 0.015;                // fascia ends stand past the rake boards
box('fascia_back', roof, [-FX, FX], [tipY - FAS / 2, tipY + 0.06], [-HZ - OV - 0.04, -HZ - OV + 0.02], C.trim);
box('fascia_front_L', roof, [CG_HW + CG_SIDE, FX], [tipY - FAS / 2, tipY + 0.06], [HZ + OV - 0.02, HZ + OV + 0.04], C.trim);
box('fascia_front_R', roof, [-FX, -CG_HW - CG_SIDE], [tipY - FAS / 2, tipY + 0.06], [HZ + OV - 0.02, HZ + OV + 0.04], C.trim);

// front cross-gable over the doors: red gable face, two-sided stepped roof running back into the gambrel
const CG_PEAK = EAVE + CG_HW * CG_S, CG_TV = RT * Math.sqrt(1 + CG_S * CG_S);
const cgUnder = x => CG_PEAK - CG_S * Math.abs(x), cgTop = x => cgUnder(x) + CG_TV;
const CG_EX = CG_HW + CG_SIDE, CG_Z0 = 0.4, CG_Z1 = HZ + CG_OV, CG_ROWS = 4;
m.part('crossgable_face', extrudeZ([[-CG_HW, EAVE], [CG_HW, EAVE], [0, CG_PEAK - 0.01]], HZ - T, HZ), { parent: roof, anchor: 'none', material: C.red });
function cgSide(sign) {
  const pts = [[0, cgUnder(0)], [sign * CG_EX, cgUnder(CG_EX)]];
  for (let i = CG_ROWS; i >= 1; i--) {
    const x0 = CG_EX * i / CG_ROWS, x1 = CG_EX * (i - 1) / CG_ROWS;
    pts.push([sign * x0, cgTop(x0) + LIP], [sign * x1, cgTop(x1)]);
  }
  return pts;
}
m.part('crossgable_roof_L', extrudeZ(cgSide(1), CG_Z0, CG_Z1), { parent: roof, anchor: 'none', material: C.roof });
m.part('crossgable_roof_R', extrudeZ(cgSide(-1), CG_Z0, CG_Z1), { parent: roof, anchor: 'none', material: C.roof });
m.part('crossgable_cap', m.box(CAP * 0.8, CAP * 0.8, CG_Z1 - CG_Z0 + 0.04), { parent: roof, at: [0, cgTop(0) + 0.03, (CG_Z0 + CG_Z1) / 2], rot: [0, 0, 45], material: C.roof });
{ // rake chevron on the cross-gable's front edge
  const x = CG_EX + 0.01, up = LIP + 0.03, dn = 0.09;
  m.part('crossgable_rake', extrudeZ([[-x, cgUnder(x) - dn], [0, cgUnder(0) - dn], [x, cgUnder(x) - dn], [x, cgTop(x) + up], [0, cgTop(0) + up], [-x, cgTop(x) + up]], CG_Z1 - 0.01, CG_Z1 + 0.04), { parent: roof, anchor: 'none', material: C.trim });
}
// hay-loft door: red leaf proud of the gable face, white frame and X brace
const LOFT_W = 1.2, LOFT_H = 1.1, LOFT_Y = EAVE + 0.3;
box('loft_door', roof, [-LOFT_W / 2, LOFT_W / 2], [LOFT_Y, LOFT_Y + LOFT_H], [HZ, HZ + 0.03], C.red);
xPanel('loft', roof, 0, LOFT_Y + LOFT_H / 2, LOFT_W + 0.16, LOFT_H + 0.16, { axis: 'z', at: HZ + 0.03, dir: 1 });
// hay-hood beam out of the gable peak, with a pulley block and a rope
const HOOD_Y = CG_PEAK - 0.42, HOOD_Z1 = HZ + CG_OV + 0.1;
box('hayhood_beam', roof, [-0.09, 0.09], [HOOD_Y - 0.09, HOOD_Y + 0.09], [HZ - T / 2, HOOD_Z1], C.wood);
m.part('hayhood_pulley', m.cyl(0.1, 0.1, 0.06, 8), { parent: roof, world: [0, HOOD_Y - 0.2, HOOD_Z1 - 0.12], geoRot: [0, 0, 90], material: C.roof });
box('hayhood_rope', roof, [-0.015, 0.015], [LOFT_Y + LOFT_H + 0.05, HOOD_Y - 0.28], [HOOD_Z1 - 0.13, HOOD_Z1 - 0.1], C.wood);

// ================= interior: always visible =================
const inside = m.group('interior');
const FLOOR = 0.02, STRAW = 0.05;
box('floor', inside, [IX0, IX1], [0, FLOOR], [IZ0, IZ1], C.wood);
for (const s of B.stalls) box(`stall_${s.id}_straw`, inside, [s.x0, s.x1], [FLOOR, STRAW], [s.z0, s.z1], C.straw);
const DV = B.stall.divider, DVH = B.stall.dividerH, HDY = B.stall.headerY, HDR_H = 0.25, POST = 0.14;
// dividers between neighbouring stalls of a row (and at the door passage), wall to mouth
const rows = { back: B.stalls.filter(s => s.row === 'back'), frontR: B.stalls.filter(s => s.row === 'front' && s.x1 <= 0), frontL: B.stalls.filter(s => s.row === 'front' && s.x0 >= 0) };
const dividerXs = [];
for (const [rid, list] of Object.entries(rows)) {
  const xs = list.map(s => s.x0).concat(list.at(-1).x1).sort((a, b) => a - b);
  const { z0, z1 } = list[0], mouth = rid === 'back' ? z1 : z0, wallZ = rid === 'back' ? z0 : z1;
  xs.forEach((x, i) => {
    const atWall = Math.abs(Math.abs(x) - IX1) < 1e-6, atDoor = Math.abs(Math.abs(x) - HD) < 1e-6;
    // stall-side x of the post / divider: inner dividers centred, the door-side one inside its stall, end ones against the side wall
    const cx = atWall ? x - Math.sign(x) * (POST / 2 + ZF) : atDoor ? x + Math.sign(x) * (POST / 2 + ZF) : x;
    if (!atWall) box(`divider_${rid}_${i}`, inside, [cx - DV / 2, cx + DV / 2], [STRAW, DVH], [Math.min(wallZ, mouth), Math.max(wallZ, mouth)], C.wood);
    box(`post_${rid}_${i}`, inside, [cx - POST / 2, cx + POST / 2], [ZF, HDY], [mouth - POST / 2, mouth + POST / 2], C.wood);
    dividerXs.push(cx);
  });
  const hx = x => (Math.abs(Math.abs(x) - IX1) < 1e-6 ? x - Math.sign(x) * ZF : x); // stop short of the side walls
  box(`header_${rid}`, inside, [hx(xs[0]), hx(xs.at(-1))], [HDY, HDY + HDR_H], [mouth - 0.05, mouth + 0.05], C.trim);
}
// two hanging lanterns at BARN.lamps, on rods up to the eave line
B.lamps.forEach(([x, y, z], i) => {
  const L = `lamp_${i}`;
  box(`${L}_base`, inside, [x - 0.17, x + 0.17], [y - 0.24, y - 0.18], [z - 0.17, z + 0.17], C.roof);
  box(`${L}_glass`, inside, [x - 0.14, x + 0.14], [y - 0.18, y + 0.12], [z - 0.14, z + 0.14], C.glow);
  m.part(`${L}_cap`, m.cone(0.13, 0.14, 4), { parent: inside, world: [x, y + 0.12, z], anchor: 'bottom', geoRot: [0, 45, 0], material: C.roof });
  box(`${L}_rod`, inside, [x - 0.015, x + 0.015], [y + 0.26, EAVE - 0.02], [z - 0.015, z + 0.015], C.roof);
});
// hay bales at each aisle end, against the side walls
const BALE = [0.5, 0.42, 0.9];
for (const [id, sx] of [['L', 1], ['R', -1]]) {
  const bx = sx * (IX1 - BALE[0] / 2 - 0.05);
  for (const [k, bz, by] of [['a', -0.48, 0], ['b', 0.48, 0], ['c', 0, BALE[1]]]) {
    const y0 = FLOOR + by;
    box(`bale_${id}${k}`, inside, [bx - BALE[0] / 2, bx + BALE[0] / 2], [y0, y0 + BALE[1]], [bz - BALE[2] / 2, bz + BALE[2] / 2], C.straw);
    const tw = by > 0 ? 0.01 + 0.012 : 0.01; // the top bale's twine stands further out than the bottom ones'
    for (const [j, dz] of [[0, -0.22], [1, 0.22]])
      box(`bale_${id}${k}_twine${j}`, inside, [bx - BALE[0] / 2 - tw, bx + BALE[0] / 2 + tw], [y0 - 0.005, y0 + BALE[1] + 0.01], [bz + dz - 0.025, bz + dz + 0.025], C.wood);
  }
}

// optional preview without the roof (for judging the cutaway): BARN_NO_ROOF=<path.glb>
if (process.env.BARN_NO_ROOF) { m.node('roof').dispose(); }
await m.write(process.env.BARN_NO_ROOF || new URL('../../assets/models/custom/barn.glb', import.meta.url).pathname);
