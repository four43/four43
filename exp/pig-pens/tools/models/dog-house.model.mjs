// Pig Pens dog house: a Snoopy-style red wooden kennel in the Kenney low-poly style (flat colours, no textures).
// Source for assets/models/custom/dog-house.glb (spec: dog-house.spec.json). Regenerate from exp/pig-pens with
//   node tools/models/dog-house.model.mjs   (under the usual systemd-run memory cap); needs the glb-author skill's kit.
// Metres, +Y up, origin at the centre of the base on the ground, door faces +Z (+X is the house's left).
import { model } from '/home/smiller/.claude/skills/glb-author/scripts/kit.mjs';

const m = model('dog-house');

// ---- numbers first: every placement derives from these
const BW = 1.1, BD = 1.2, T = 0.08;           // wall box (outer) width x, depth z; wall thickness
const WALL_H = 0.86;                           // eave height of the walls (top of the side walls)
const OVER_X = 0.1, OVER_Z = 0.15;             // roof overhang past the walls: sides, front/back
const RT = 0.06;                               // roof thickness (perpendicular)
const CAP = 0.05;                              // ridge cap half-height above the roof top
const RIDGE = 1.5;                             // top of the ridge cap
const DOOR_W = 0.72, DOOR_SPRING = 0.6;        // door width, height where the arch starts (arch top = SPRING + W/2)
const FRAME = 0.055, FRAME_D = 0.03;            // door frame band width, how far it stands proud
const SHINGLE_ROWS = 4, SHINGLE_LIP = 0.035;   // stepped shingle rows per roof side

// roof geometry: underside line y = Y_PK - S*|x| passes through the wall top corner (BW/2, WALL_H)
const HX = BW / 2, EX = HX + OVER_X, ZR = BD / 2 + OVER_Z;
const TV_OF = s => RT * Math.sqrt(1 + s * s);   // vertical thickness for slope s
// solve Y_PK so that Y_PK + vertical thickness + CAP = RIDGE (s depends on Y_PK; a few iterations converge)
let Y_PK = 1.3;
for (let i = 0; i < 20; i++) Y_PK = RIDGE - CAP - TV_OF((Y_PK - WALL_H) / HX);
const S = (Y_PK - WALL_H) / HX, TV = TV_OF(S);
const under = x => Y_PK - S * Math.abs(x);       // roof underside
const top = x => under(x) + TV;                  // roof top surface (before shingle lips)

// Pig Pens' bake (palette 'vertex') reads baseColorFactor as Kenney's kits store it: sRGB numbers, which it then linearises.
// So the factor written here must hold the colour's sRGB values. m.material linearises a hex colour, so hand it the hex that
// linearises to those values (sRGB-encode each channel once more); the baked vertex colour is then the hex below.
const enc = c => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const kenney = hex => '#' + [1, 3, 5].map(i => Math.round(255 * enc(parseInt(hex.slice(i, i + 2), 16) / 255)).toString(16).padStart(2, '0')).join('');
const C = {
  houseRed: m.material('houseRed', { color: kenney('#c9372c'), roughness: 0.9 }),
  roofDark: m.material('roofDark', { color: kenney('#4b2a24'), roughness: 0.95 }),
  trim:     m.material('trim',     { color: kenney('#f4ecd6'), roughness: 0.9 }),
  doorDark: m.material('doorDark', { color: kenney('#1c1412'), roughness: 1 }),
};

const pentagon = (hw, eave, peak) => [[-hw, 0], [hw, 0], [hw, eave], [0, peak], [-hw, eave]];
const arc = (r, cy, n = 8) => Array.from({ length: n + 1 }, (_, i) => { const a = Math.PI * i / n; return [r * Math.cos(a), cy + r * Math.sin(a)]; });

// ---- walls: front wall is a pentagon with the arched doorway notched out of its outline, extruded T toward +Z
const walls = m.group('walls');
const dr = DOOR_W / 2;
// outline: along the bottom, up the door's left jamb, over the arch (x -dr -> +dr), down the right jamb, then round the gable
const frontOutline = [[-HX, 0], [-dr, 0], [-dr, DOOR_SPRING], ...arc(dr, DOOR_SPRING).map(([x, y]) => [-x, y]).slice(1, -1),
  [dr, DOOR_SPRING], [dr, 0], [HX, 0], [HX, WALL_H], [0, Y_PK], [-HX, WALL_H]];
m.part('wall_front', m.extrude(frontOutline, T), { parent: walls, at: [0, 0, BD / 2 - T], anchor: 'none', material: C.houseRed });
m.part('wall_back', m.extrude(pentagon(HX, WALL_H, Y_PK), T), { parent: walls, at: [0, 0, -BD / 2], anchor: 'none', material: C.houseRed });
for (const [id, s] of [['L', 1], ['R', -1]])
  m.part(`wall_${id}`, m.box(T, WALL_H, BD - 2 * T), { parent: walls, at: [s * (HX - T / 2), 0, 0], anchor: 'bottom', material: C.houseRed });

// dark interior seen through the doorway: an inner-gable-shaped block filling the cavity
const IN_HX = HX - T - 0.005, IN_D = BD - 2 * T - 0.01;
m.part('door_hole', m.extrude(pentagon(IN_HX, WALL_H, under(0) - 0.02), IN_D),
  { at: [0, 0.005, -IN_D / 2], anchor: 'none', material: C.doorDark });

// door frame: cream arch band standing proud of the front wall
const fr = dr + FRAME;
const frameOutline = [[-fr, 0], [-dr, 0], [-dr, DOOR_SPRING], ...arc(dr, DOOR_SPRING).map(([x, y]) => [-x, y]).slice(1, -1),
  [dr, DOOR_SPRING], [dr, 0], [fr, 0], [fr, DOOR_SPRING], ...arc(fr, DOOR_SPRING).slice(1, -1), [-fr, DOOR_SPRING]];
m.part('door_frame', m.extrude(frameOutline, FRAME_D), { at: [0, 0, BD / 2], anchor: 'none', material: C.trim });

// name plate above the door, with a dark "lettering" bar
const ARCH_TOP = DOOR_SPRING + fr;
const PLATE_H = 0.09, PLATE_Y = ARCH_TOP + 0.025 + PLATE_H / 2;
m.part('name_plate', m.box(0.28, PLATE_H, 0.03), { at: [0, PLATE_Y, BD / 2], anchor: 'back', material: C.trim });
m.part('name_letters', m.box(0.18, 0.022, 0.01), { at: [0, PLATE_Y, BD / 2 + 0.03], anchor: 'back', material: C.doorDark });

// corner boards: cream, a hair proud of both walls they wrap
for (const [id, sx, sz] of [['FL', 1, 1], ['FR', -1, 1], ['BL', 1, -1], ['BR', -1, -1]])
  m.part(`corner_${id}`, m.box(0.08, WALL_H - 0.01, 0.08), { at: [sx * (HX - 0.03), 0, sz * (BD / 2 - 0.03)], anchor: 'bottom', material: C.trim });

// ---- roof: each side is one extruded profile (in XY, along Z) with a stepped shingle top
function roofSide(sign) {
  const pts = [[0, under(0)]];                        // ridge underside, then out along the underside to the eave
  pts.push([sign * EX, under(EX)]);
  // top surface from eave back up to the ridge, stepped: each row's lower edge (butt) stands SHINGLE_LIP proud
  for (let i = SHINGLE_ROWS; i >= 1; i--) {
    const x0 = EX * i / SHINGLE_ROWS, x1 = EX * (i - 1) / SHINGLE_ROWS;
    pts.push([sign * x0, top(x0) + SHINGLE_LIP]);
    pts.push([sign * x1, top(x1) + (i > 1 ? 0 : SHINGLE_LIP * 0.5)]);
  }
  pts[pts.length - 1][0] = 0;
  return sign > 0 ? pts : pts.reverse();               // keep the outline counter-clockwise for outward faces
}
m.part('roof_L', m.extrude(roofSide(1), 2 * ZR), { at: [0, 0, -ZR], anchor: 'none', material: C.roofDark });
m.part('roof_R', m.extrude(roofSide(-1), 2 * ZR), { at: [0, 0, -ZR], anchor: 'none', material: C.roofDark });
// ridge cap: a square bar turned 45 degrees along the ridge
m.part('ridge_cap', m.box(CAP * 1.5, CAP * 1.5, 2 * ZR + 0.04), { at: [0, top(0) + CAP * 0.45, 0], rot: [0, 0, 45], material: C.roofDark });

// rake trim: a cream chevron board on each gable face, just under the roof edge
function rake() {
  const x = EX + 0.01, lo = 0.035, hi = SHINGLE_LIP + 0.012;
  return [[-x, under(x) - lo], [-x, top(x) + hi], [0, top(0) + hi], [x, top(x) + hi], [x, under(x) - lo], [0, under(0) - lo]]
    .reverse(); // counter-clockwise
}
m.part('rake_F', m.extrude(rake(), 0.04), { at: [0, 0, ZR - 0.02], anchor: 'none', material: C.trim });
m.part('rake_B', m.extrude(rake(), 0.04), { at: [0, 0, -ZR - 0.02], anchor: 'none', material: C.trim });

await m.write(new URL('../../assets/models/custom/dog-house.glb', import.meta.url).pathname);
