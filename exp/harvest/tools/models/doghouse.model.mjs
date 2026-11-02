// Harvest backyard kennel: a little red dog house with a pitched roof, an arched doorway facing +Z, white trim, a name plate
// over the door and a steel food bowl in front. Source for assets/models/custom/doghouse.glb (spec: doghouse.spec.json).
// Regenerate from exp/harvest with   node tools/models/doghouse.model.mjs   (under the usual systemd-run memory cap); needs the
// glb-author skill's kit. Metres, +Y up, the door faces +Z (+X is the kennel's LEFT), origin bottom-centre on the ground.
// Overall box from DOGHOUSE (src/defs/models.js): w along x (the roof's eaves), d along z (roof back to bowl front), h = ridge.
// Static scenery.
import { DOGHOUSE as D } from '../../src/defs/models.js';
import { kenney, KIT, out, merge } from './lib.mjs';
const { model } = await import(KIT);

const m = model('doghouse');
const mat = {
  red:   m.material('red',   { color: kenney('#c8402f'), roughness: 0.85 }),
  white: m.material('white', { color: kenney('#f3efe6'), roughness: 0.85 }),
  roof:  m.material('roof',  { color: kenney('#4a5568'), roughness: 0.9 }),
  board: m.material('board', { color: kenney('#8a5a30'), roughness: 0.9 }),
  dark:  m.material('dark',  { color: kenney('#2a221e'), roughness: 1 }),
  sign:  m.material('sign',  { color: kenney('#f6d77a'), roughness: 0.8 }),
  metal: m.material('metal', { color: kenney('#aab2bb'), roughness: 0.5 }),
  seed:  m.material('seed',  { color: kenney('#8a5328'), roughness: 0.95 }),
};

// ---- numbers first
const EX = D.w / 2, RIDGE = D.h;                     // roof eave half-width (the widest point), ridge top
const OV = 0.1, HX = EX - OV;                        // roof overhang past the walls; wall half-width
const RT = 0.12;                                      // roof slab thickness (vertical)
const EAVE = 0.75, Y_PK = RIDGE - RT;                 // wall height at the sides; roof underside at the ridge (the wall peak)
const slope = (Y_PK - EAVE) / HX, under = x => Y_PK - slope * Math.abs(x), top = x => under(x) + RT;
const BOWL = { r: 0.15, h: 0.08, x: 0.3 };            // food bowl radius, height, x
const Z0 = -D.d / 2, RZ1 = Z0 + 1.16;                 // roof back / front edge
const WZ0 = Z0 + 0.07, WZ1 = RZ1 - 0.07;              // walls back / front face
BOWL.z = D.d / 2 - BOWL.r;
const BASE = 0.1;                                     // skid base under the walls
const DOOR = { w: 0.44, h: 0.56, y: BASE + 0.02 };    // arched doorway: width, height to the arch top, sill

// ---- kennel: a skid base, the gabled walls (pentagon extruded along z), white corner boards, the roof
m.part('base', m.box(2 * HX + 0.06, BASE, WZ1 - WZ0 + 0.06), { at: [0, 0, (WZ0 + WZ1) / 2], anchor: 'bottom', material: mat.board });
m.part('walls', m.extrude([[-HX, BASE - 0.02], [HX, BASE - 0.02], [HX, EAVE], [0, Y_PK], [-HX, EAVE]], WZ1 - WZ0), { at: [0, 0, WZ0], anchor: 'none', material: mat.red });
m.part('corners', merge([[1, 1], [-1, 1], [1, -1], [-1, -1]].map(([sx, sz]) => ({ geo: m.box(0.07, EAVE - BASE + 0.02, 0.07), at: [sx * (HX - 0.025), (EAVE + BASE) / 2 + 0.01, sz > 0 ? WZ1 - 0.025 : WZ0 + 0.025] }))),
  { anchor: 'none', material: mat.white });
m.part('roof', m.extrude([[-EX, under(EX)], [0, Y_PK], [EX, under(EX)], [EX, top(EX)], [0, RIDGE], [-EX, top(EX)]], RZ1 - Z0), { at: [0, 0, Z0], anchor: 'none', material: mat.roof });
m.part('ridge_cap', m.box(0.1, 0.1, RZ1 - Z0 + 0.03), { at: [0, RIDGE - 0.05, (Z0 + RZ1) / 2], rot: [0, 0, 45], material: mat.white });

// ---- doorway: a white arched frame on the front wall, the dark opening standing just proud of it
const arch = (w, h, y) => {
  const r = w / 2, pts = [[-r, y], [r, y], [r, y + h - r]];
  for (let i = 1; i < 6; i++) { const a = Math.PI * i / 6; pts.push([r * Math.cos(a), y + h - r + r * Math.sin(a)]); }
  return [...pts, [-r, y + h - r]];
};
m.part('door_frame', m.extrude(arch(DOOR.w + 0.12, DOOR.h + 0.06, DOOR.y - 0.02), 0.02), { at: [0, 0, WZ1], anchor: 'none', material: mat.white });
m.part('door', m.extrude(arch(DOOR.w, DOOR.h, DOOR.y), 0.035), { at: [0, 0, WZ1], anchor: 'none', material: mat.dark });
m.part('name_plate', m.box(0.34, 0.11, 0.03), { at: [0, DOOR.y + DOOR.h + 0.13, WZ1], anchor: 'back', material: mat.sign });

// ---- food bowl in front: a flared steel dish with a heap of kibble
m.part('bowl', m.lathe([[0, 0], [BOWL.r * 0.8, 0], [BOWL.r, BOWL.h], [BOWL.r * 0.85, BOWL.h], [BOWL.r * 0.65, 0.025], [0, 0.025]], 10),
  { at: [BOWL.x, 0, BOWL.z], anchor: 'none', material: mat.metal });
m.part('kibble', m.cyl(BOWL.r * 0.35, BOWL.r * 0.72, 0.05, 7), { at: [BOWL.x, 0.025, BOWL.z], anchor: 'bottom', material: mat.seed });

await m.write(out('doghouse'));
