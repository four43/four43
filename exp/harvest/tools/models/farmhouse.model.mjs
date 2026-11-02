// Harvest backyard farmhouse: a cosy two-storey house, ridge along x, a covered front porch with the door facing +Z, white
// walls with sash windows and red shutters, a dark pitched roof with white fascia, and a brick chimney. Source for
// assets/models/custom/farmhouse.glb (spec: farmhouse.spec.json). Regenerate from exp/harvest with
//   node tools/models/farmhouse.model.mjs   (under the usual systemd-run memory cap); needs the glb-author skill's kit.
// Metres, +Y up, the front (porch, door) faces +Z (+X is the house's LEFT), origin bottom-centre on the ground.
// Footprint and heights from FARMHOUSE (src/defs/models.js): w along x and d along z (roof eaves and porch included),
// eave = the wall top under the roof edge, ridge = the roof's top. Static scenery: one grounded building, no interior.
import { FARMHOUSE as F } from '../../src/defs/models.js';
import { kenney, KIT, out, merge, extrudeX } from './lib.mjs';
const { model } = await import(KIT);

const m = model('farmhouse');
const mat = {
  wall:     m.material('wall',     { color: kenney('#f4e6c0'), roughness: 0.85 }),
  white:    m.material('white',    { color: kenney('#ffffff'), roughness: 0.8 }),
  red:      m.material('red',      { color: kenney('#b8352b'), roughness: 0.85 }),
  roof:     m.material('roof',     { color: kenney('#4a4652'), roughness: 0.9 }),
  glass:    m.material('glass',    { color: kenney('#a9dcef'), roughness: 0.3 }),
  wood:     m.material('wood',     { color: kenney('#9a6a3e'), roughness: 0.9 }),
  concrete: m.material('concrete', { color: kenney('#a8a39a'), roughness: 0.95 }),
  brick:    m.material('brick',    { color: kenney('#9c4a32'), roughness: 0.95 }),
  light:    m.material('light',    { color: kenney('#fff4c4'), roughness: 0.4 }),
};

// ---- numbers first
const OV = 0.35;                                       // roof overhang past the walls (sides and eaves)
const EX = F.w / 2, HX = EX - OV;                       // roof half-width, wall half-width
const Z0 = -F.d / 2, Z1 = F.d / 2;                      // roof back edge, porch front edge
const PORCH_D = 2.4;                                    // porch depth in front of the front wall
const WZ1 = Z1 - PORCH_D, WZ0 = Z0 + OV;                // front / back wall faces
const ZM = (WZ0 + WZ1) / 2;                             // the ridge line
const RT = 0.3, Y_PK = F.ridge - RT;                    // roof slab thickness (vertical); roof underside at the ridge
const slope = (Y_PK - F.eave) / (WZ1 - ZM);             // roof underside meets the walls' outer face at the eave
const under = z => Y_PK - slope * Math.abs(z - ZM), top = z => under(z) + RT;
const RZ0 = WZ0 - OV, RZ1 = WZ1 + OV;                   // roof edges along z
const PLINTH = 0.4;                                     // concrete foundation band
const WIN = { w: 1.0, h: 1.3, y0: 1.5, y1: 3.6 };      // window size; centre heights, ground and upper floor
const UP_H = 0.95;                                       // upper windows are a little shorter
const DOOR = { w: 1.1, h: 2.1 };
const PORCH = { half: 4.0, floor: 0.45, roofY0: 2.8, roofY1: 2.55, post: 0.18 };  // porch: half-width, floor top, roof underside at wall / front

// ---- house body: the side profile (z, y) extruded across x: walls up to the eaves and the gables to the ridge
const body = m.group('house');
m.part('walls', extrudeX(m, [[WZ0, PLINTH - 0.05], [WZ1, PLINTH - 0.05], [WZ1, F.eave], [ZM, Y_PK], [WZ0, F.eave]], -HX, HX), { parent: body, anchor: 'none', material: mat.wall });
m.part('plinth', m.box(2 * HX + 0.1, PLINTH, WZ1 - WZ0 + 0.1), { parent: body, at: [0, 0, (WZ0 + WZ1) / 2], anchor: 'bottom', material: mat.concrete });
m.part('corners', merge([[1, 1], [-1, 1], [1, -1], [-1, -1]].map(([sx, sz]) => ({ geo: m.box(0.24, F.eave - PLINTH, 0.24), at: [sx * (HX - 0.1), (F.eave + PLINTH) / 2, sz > 0 ? WZ1 - 0.1 : WZ0 + 0.1] }))),
  { parent: body, anchor: 'none', material: mat.white });
// a white band between the floors
m.part('floor_band', merge([
  { geo: m.box(2 * HX + 0.08, 0.14, 0.08), at: [0, 2.55, WZ1 + 0.02] }, { geo: m.box(2 * HX + 0.08, 0.14, 0.08), at: [0, 2.55, WZ0 - 0.02] },
  { geo: m.box(0.08, 0.14, WZ1 - WZ0 + 0.08), at: [HX + 0.02, 2.55, ZM] }, { geo: m.box(0.08, 0.14, WZ1 - WZ0 + 0.08), at: [-HX - 0.02, 2.55, ZM] },
]), { parent: body, anchor: 'none', material: mat.white });

// ---- roof: one chevron slab along x, a ridge cap, white fascia on the gable ends
const roof = m.group('roof');
m.part('roof_slab', extrudeX(m, [[RZ0, under(RZ0)], [ZM, Y_PK], [RZ1, under(RZ1)], [RZ1, top(RZ1)], [ZM, F.ridge], [RZ0, top(RZ0)]], -EX, EX), { parent: roof, anchor: 'none', material: mat.roof });
m.part('ridge_cap', m.box(2 * EX + 0.04, 0.22, 0.22), { parent: roof, at: [0, F.ridge - 0.12, ZM], rot: [45, 0, 0], material: mat.roof });
const fascia = [[RZ0 - 0.05, under(RZ0) - 0.1], [ZM, Y_PK - 0.1], [RZ1 + 0.05, under(RZ1) - 0.1], [RZ1 + 0.05, top(RZ1) + 0.05], [ZM, F.ridge + 0.05], [RZ0 - 0.05, top(RZ0) + 0.05]];
m.part('fascia', merge([1, -1].map(s => ({ geo: extrudeX(m, fascia, -0.07, 0.07), at: [s * EX, 0, 0] }))), { parent: roof, anchor: 'none', material: mat.white });
// brick chimney on the left end, through the ridge, with a cap
const CH = { x: HX - 1.3, w: 0.9, d: 0.7, top: F.ridge + 0.9 };
m.part('chimney', m.box(CH.w, CH.top - (F.eave + 0.5), CH.d), { parent: roof, at: [CH.x, F.eave + 0.5, ZM - 0.3], anchor: 'bottom', material: mat.brick });
m.part('chimney_cap', m.box(CH.w + 0.16, 0.14, CH.d + 0.16), { parent: roof, at: [CH.x, CH.top, ZM - 0.3], anchor: 'bottom', material: mat.concrete });

// ---- windows, read as set into the wall: a white frame ring standing proud (FR), the glass just off the wall face inside it, thin
// glazing bars between, a deeper sill below; red shutters on the front
const frames = [], panes = [], bars = [], shutters = [];
const FR = 0.14, FW = 0.12;                              // frame ring depth off the wall, its width
// a window's pieces in its own frame (u across, v up, n out of the wall); place() turns them onto the wall
function windowParts(h, put) {
  const W = WIN.w;
  for (const v of [1, -1]) frames.push(put([W + 2 * FW, FW, FR], 0, v * (h + FW) / 2, FR / 2));       // head and sill rails
  for (const u of [1, -1]) frames.push(put([FW, h, FR], u * (W + FW) / 2, 0, FR / 2));                // jambs
  frames.push(put([W + 2 * FW + 0.12, 0.08, FR + 0.1], 0, -(h / 2 + FW + 0.04), (FR + 0.1) / 2));       // the sill, deeper
  panes.push(put([W, h, 0.02], 0, 0, 0.012));                                                         // glass, near flush with the wall
  bars.push(put([0.05, h, 0.04], 0, 0, 0.04), put([W, 0.05, 0.04], 0, 0, 0.04));                      // glazing bars, behind the frame's face
}
// on a wall facing +Z (s=1) or -Z (s=-1) at z, or +X/-X (sx) at x
function windowZ(x, y, h, z, s, shut) {
  windowParts(h, ([a, b, c], u, v, n) => ({ geo: m.box(a, b, c), at: [x + u, y + v, z + s * n] }));
  if (shut) for (const d of [1, -1]) shutters.push({ geo: m.box(0.3, h + 0.1, 0.06), at: [x + d * (WIN.w / 2 + FW + 0.2), y, z + s * 0.03] });
}
function windowX(z, y, h, x, s) {
  windowParts(h, ([a, b, c], u, v, n) => ({ geo: m.box(c, b, a), at: [x + s * n, y + v, z + u] }));
}
for (const x of [-4.45, -2.3, 2.3, 4.45]) windowZ(x, WIN.y0, WIN.h, WZ1, 1, true);       // front, ground floor (door in the middle)
for (const x of [-4.0, -1.4, 1.4, 4.0]) windowZ(x, WIN.y1, UP_H, WZ1, 1, true);        // front, upper floor
for (const x of [-3.5, 0, 3.5]) { windowZ(x, WIN.y0, WIN.h, WZ0, -1, false); windowZ(x, WIN.y1, UP_H, WZ0, -1, false); } // back
for (const s of [1, -1]) for (const z of [ZM - 1.4, ZM + 1.4]) { windowX(z, WIN.y0, WIN.h, s * HX, s); windowX(z, WIN.y1, UP_H, s * HX, s); }
for (const s of [1, -1]) windowX(ZM, 5.4, 0.8, s * HX, s);                              // attic windows in the gables
m.part('window_frames', merge(frames), { parent: body, anchor: 'none', material: mat.white });
m.part('window_glass', merge(panes), { parent: body, anchor: 'none', material: mat.glass });
m.part('window_bars', merge(bars), { parent: body, anchor: 'none', material: mat.white });
m.part('shutters', merge(shutters), { parent: body, anchor: 'none', material: mat.red });

// ---- front door: white frame, red door, a brass knob, a lamp beside it
m.part('door_frame', m.box(DOOR.w + 0.3, DOOR.h + 0.15, 0.1), { parent: body, at: [0, PORCH.floor + (DOOR.h + 0.15) / 2, WZ1], anchor: 'back', material: mat.white });
m.part('door', m.box(DOOR.w, DOOR.h, 0.1), { parent: body, at: [0, PORCH.floor + DOOR.h / 2, WZ1 + 0.04], anchor: 'back', material: mat.red });
m.part('door_knob', m.box(0.08, 0.08, 0.08), { parent: body, at: [0.38, PORCH.floor + 1.05, WZ1 + 0.18], material: mat.light });
m.part('lamp', m.box(0.2, 0.3, 0.2), { parent: body, at: [-1.0, PORCH.floor + 2.0, WZ1 + 0.12], material: mat.light });

// ---- porch: a wooden deck on a plinth, steps down the middle, posts, a rail with an opening at the steps, a lean-to roof
const porch = m.group('porch');
const PZ0 = WZ1, PZ1 = Z1 - 0.45, STEP = (PORCH.floor) / 3;                     // deck front edge; the steps take the last 0.45 m
m.part('porch_deck', m.box(2 * PORCH.half, PORCH.floor, PZ1 - PZ0), { parent: porch, at: [0, 0, (PZ0 + PZ1) / 2], anchor: 'bottom', material: mat.wood });
// three steps, the lowest at the front edge, the tallest against the deck
m.part('porch_steps', merge([0, 1, 2].map(i => ({ geo: m.box(1.8, STEP * (i + 1), 0.15), at: [0, STEP * (i + 1) / 2, Z1 - 0.075 - 0.15 * i] }))),
  { parent: porch, anchor: 'none', material: mat.concrete });
const POSTS = [-PORCH.half + 0.15, -1.1, 1.1, PORCH.half - 0.15], PPZ = PZ1 - 0.15;
const roofAt = z => PORCH.roofY0 + (PORCH.roofY1 - PORCH.roofY0) * (z - PZ0) / (Z1 - PZ0);
m.part('porch_posts', merge(POSTS.map(x => ({ geo: m.box(PORCH.post, roofAt(PPZ) - PORCH.floor, PORCH.post), at: [x, (roofAt(PPZ) + PORCH.floor) / 2, PPZ] }))),
  { parent: porch, anchor: 'none', material: mat.white });
const RAIL_Y = PORCH.floor + 0.85, rails = [];
for (const [a, b] of [[POSTS[0], POSTS[1]], [POSTS[2], POSTS[3]]]) {
  rails.push({ geo: m.box(b - a, 0.08, 0.1), at: [(a + b) / 2, RAIL_Y, PPZ] });
  for (let x = a + 0.3; x < b - 0.15; x += 0.3) rails.push({ geo: m.box(0.05, 0.85, 0.05), at: [x, PORCH.floor + 0.425, PPZ] });
}
for (const s of [1, -1]) rails.push({ geo: m.box(0.1, 0.08, PPZ - PZ0 - 0.1), at: [s * (PORCH.half - 0.15), RAIL_Y, (PZ0 + PPZ) / 2 + 0.05] });
m.part('porch_rails', merge(rails), { parent: porch, anchor: 'none', material: mat.white });
// lean-to roof: a slab sloping down from the wall to past the posts
m.part('porch_roof', extrudeX(m, [[PZ0, PORCH.roofY0], [Z1, PORCH.roofY1], [Z1, PORCH.roofY1 + 0.16], [PZ0, PORCH.roofY0 + 0.16]], -PORCH.half - 0.2, PORCH.half + 0.2),
  { parent: porch, anchor: 'none', material: mat.roof });
m.part('porch_fascia', m.box(2 * PORCH.half + 0.44, 0.2, 0.06), { parent: porch, at: [0, PORCH.roofY1 + 0.08, Z1 + 0.03], material: mat.white });

await m.write(out('farmhouse'));
