// Pig Pens vet clinic: a chunky Kenney-style building (cream walls, teal trim, slate gable roof, paw-print sign) with its
// rooms built in: waiting room (mint checker floor), exam room (exam table, sink, pegboard), and down the east side the vet's
// flat (wood floor; closet, hall and a tiled bathroom across the back).
// Source for assets/models/custom/clinic.glb (spec: clinic.spec.json). Regenerate from exp/pig-pens with
//   node tools/models/clinic.model.mjs   (under the usual systemd-run memory cap); needs the glb-author skill's kit.
// Metres, +Y up, origin at the footprint centre on the ground, front (+Z) faces south; +X is the model's left.
// Every dimension comes from CLINIC in src/defs/buildings.js. Furniture-Kit spots (desk, benches, bed, kitchen, plant, rug)
// are left clear: the view places those pieces.
import { kenney, KIT } from './lib.mjs';
import { CLINIC } from '../../src/defs/buildings.js';
const { model } = await import(KIT);
const { mergeGeometries } = await import('/home/smiller/.claude/skills/glb-author/node_modules/three/examples/jsm/utils/BufferGeometryUtils.js');

const m = model('clinic');

// ---- numbers: all from CLINIC
const W = CLINIC.w, D = CLINIC.d, T = CLINIC.wall, EAVE = CLINIC.eave, RIDGE = CLINIC.ridge, OV = CLINIC.overhang;
const HX = W / 2, HZ = D / 2;
const IN = CLINIC.inner;                          // inner faces of the outer walls
const P = CLINIC.partitions, PT = P.t, PH = P.h, A = CLINIC.apt;
const PW = P.walls;
const SP = CLINIC.spots;
const DOOR = CLINIC.door;
const INNER_DOOR_H = 2.1;                         // partition doorway height (header above, up to PH)
const WIN_Y0 = 1.0, WIN_Y1 = 2.3;                 // window sill / head heights
const FR = 0.1, FR_D = 0.05;                      // window/door frame band width, how far it stands proud
const PLINTH = 0.25;                              // slate base band on the outer faces
const FLOOR_T = 0.04;

const C = {
  wall:  m.material('wall',  { color: kenney('#f2efe6'), roughness: 0.9 }),
  trim:  m.material('trim',  { color: kenney('#2f9c95'), roughness: 0.9 }),
  slate: m.material('slate', { color: kenney('#4f6d73'), roughness: 0.9 }),
  mint:  m.material('mint',  { color: kenney('#a8e0cf'), roughness: 0.9 }),
  pale:  m.material('pale',  { color: kenney('#e4e9ec'), roughness: 0.9 }),
  wood:  m.material('wood',  { color: kenney('#c99a62'), roughness: 0.9 }),
  dark:  m.material('dark',  { color: kenney('#33464d'), roughness: 0.9 }),
};

// ---- a bag collects boxes (centre positions in the parent's frame) per material and flushes one merged mesh each
function bag(parent, prefix) {
  const byMat = new Map();
  const api = {
    box(mat, size, centre, geoRot) {
      const g = m.box(...size);
      if (geoRot) { const E = new m.THREE.Euler(...geoRot.map(d => d * Math.PI / 180)); g.applyMatrix4(new m.THREE.Matrix4().makeRotationFromEuler(E)); }
      g.translate(...centre);
      api.geo(mat, g);
    },
    // box by spans: [x0, x1], [y0, y1], [z0, z1]
    span(mat, [x0, x1], [y0, y1], [z0, z1]) { api.box(mat, [x1 - x0, y1 - y0, z1 - z0], [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2]); },
    geo(mat, g) { if (!byMat.has(mat)) byMat.set(mat, []); byMat.get(mat).push(g); },
    flush() {
      for (const [mat, geos] of byMat) {
        const flat = geos.map(g => { const c = (g.index ? g.toNonIndexed() : g.clone()); for (const k of Object.keys(c.attributes)) if (!['position', 'normal', 'uv'].includes(k)) c.deleteAttribute(k); c.clearGroups(); return c; });
        m.part(`${prefix}_${mat}`, mergeGeometries(flat), { parent, anchor: 'none', material: C[mat] });
      }
    },
  };
  return api;
}

// A wall in its own frame: runs along local x from -len/2 to len/2, base at y `base`, thickness t centred on z 0, outer
// face +z. openings: [{ c, w, y0, y1, kind: 'window'|'door'|'gap' }]. Builds the solid pieces, glass and teal frames.
// No two overlapping faces share a plane (the game clips walls with a double-sided material): every add-on is sunk
// EMBED into what it sits on and lips EMBED over each opening's edge, and ends that meet another part poke into it.
const EMBED = 0.01;
function wall(b, len, t, h, openings, { outer = true, plinth = outer, base = 0 } = {}) {
  const ops = [...openings].sort((a, b2) => a.c - b2.c);
  let x = -len / 2;
  const solid = (x0, x1, y0, y1) => { if (x1 - x0 > 1e-4 && y1 - y0 > 1e-4) b.span('wall', [x0, x1], [y0, y1], [-t / 2, t / 2]); };
  for (const o of ops) {
    const a = o.c - o.w / 2, e = o.c + o.w / 2;
    solid(x, a, base, h);
    solid(a, e, base, o.y0);
    solid(a, e, o.y1, h);
    x = e;
  }
  solid(x, len / 2, base, h);
  const E = EMBED, f0 = t / 2 - E, f1 = t / 2 + FR_D - E;   // frame z span: sunk E into the face, standing FR_D - E proud
  for (const o of ops) {
    const a = o.c - o.w / 2, e = o.c + o.w / 2;
    if (o.kind === 'window') {
      b.span('dark', [a - E, e + E], [o.y0 - E, o.y1 + E], [-0.02, 0.02]);                     // glass, edges buried in the wall
      b.span('trim', [a - FR, e + FR], [o.y1 - E, o.y1 + FR], [f0, f1]);                       // head
      b.span('trim', [a - FR - 0.05, e + FR + 0.05], [o.y0 - FR, o.y0 + E], [f0, f1 + 0.08]);   // chunky sill
      for (const [x0, x1] of [[a - FR, a + E], [e - E, e + FR]]) b.span('trim', [x0, x1], [o.y0 + E / 2, o.y1 - E / 2], [f0 + 0.002, f1 - 0.002]);
      const bar = [0.035, 0.065];                                                               // glazing bars, ends buried
      for (const c of o.w > 1.3 ? [o.c - o.w / 4, o.c, o.c + o.w / 4] : [o.c]) b.span('trim', [c - 0.03, c + 0.03], [o.y0 - E, o.y1 + E], bar);
      const ty = o.y0 + (o.y1 - o.y0) * 0.62;
      b.span('trim', [a - E, e + E], [ty - 0.03, ty + 0.03], [bar[0] + 0.004, bar[1] - 0.004]);
    } else {
      // door or open doorway: frame on the outer face (both faces on partitions)
      const yb = base + 0.005;
      for (const [z0, z1] of outer ? [[f0, f1]] : [[f0, f1], [-f1, -f0]]) {
        b.span('trim', [a - FR, e + FR], [o.y1 - E, o.y1 + FR], [z0, z1]);
        for (const [x0, x1] of [[a - FR, a + E], [e - E, e + FR]]) b.span('trim', [x0, x1], [yb, o.y1 - E / 2], [z0 + 0.002 * Math.sign(z0 + z1), z1 - 0.002 * Math.sign(z0 + z1)]);
      }
      if (!outer) for (const [x0, x1] of [[a - E, a + 0.02], [e - 0.02, e + E]])                   // jamb linings, recessed 2 mm
        b.span('trim', [x0, x1], [yb, o.y1 + E], [-t / 2 + 0.002, t / 2 - 0.002]);
    }
  }
  if (plinth) {                                           // slate base band, broken at doors, its ends inside the door jambs
    const pz = [t / 2 - 0.015, t / 2 + 0.03], py = [base + 0.005, PLINTH];
    let px = -len / 2 + 0.015;                           // ends 1.5 cm in from the wall's ends, under the corner boards
    for (const o of ops.filter(o => o.kind !== 'window')) { const a = o.c - o.w / 2 - FR + 0.02; if (a > px) b.span('slate', [px, a], py, pz); px = o.c + o.w / 2 + FR - 0.02; }
    if (len / 2 > px) b.span('slate', [px, len / 2 - 0.015], py, pz);
  }
}
// corner board at the +x/-x end of a front/back wall (local frame of that wall): wraps the corner, 4 cm proud both ways
const CORNER = 0.26, CPROUD = 0.04;
const corner = (b, s) => b.span('trim', s > 0 ? [HX - CORNER + CPROUD, HX + CPROUD] : [-HX - CPROUD, -HX + CORNER - CPROUD], [0.005, EAVE - 0.01], [T / 2 + CPROUD - CORNER, T / 2 + CPROUD]);

// ---- walls
const walls = m.group('walls');
const win = (c, w, y0 = WIN_Y0, y1 = WIN_Y1) => ({ c, w, y0, y1, kind: 'window' });

// front: local x = model x (unrotated). Door at CLINIC.door; big windows either side.
{
  const g = m.group('wall_front', { parent: walls, at: [0, 0, HZ - T / 2] });
  const b = bag(g, 'front');
  // the waiting room's three, then the flat's: over the table, over the kitchen counter's end
  wall(b, W, T, EAVE, [win(-4.6, 2.0), win(-2.35, 1.3), win(1.1, 1.0), win(3.5, 1.2), win(5.3, 0.9, 1.15), { c: DOOR.x, w: DOOR.w, y0: 0, y1: DOOR.h, kind: 'door' }]);
  for (const s of [-1, 1]) corner(b, s);
  const cy = DOOR.h + 0.28, z0 = T / 2 - EMBED;                                                  // little canopy over the door
  b.span('trim', [DOOR.x - DOOR.w / 2 - 0.3, DOOR.x + DOOR.w / 2 + 0.3], [cy, cy + 0.08], [z0, T / 2 + 0.42]);
  for (const s of [-1, 1]) { const bx = DOOR.x + s * (DOOR.w / 2 + 0.2); b.span('slate', [bx - 0.025, bx + 0.025], [cy - 0.22, cy + EMBED], [T / 2 - 0.015, T / 2 + 0.32]); } // brackets
  b.span('slate', [DOOR.x - DOOR.w / 2 - 0.2, DOOR.x + DOOR.w / 2 + 0.2], [0.002, 0.06], [T / 2 - 0.015, T / 2 + 0.4]); // step (back 5 mm deeper than the jambs')
  b.flush();
  // the door: a shut slate panel with a little window and a handle, its own node
  const door = m.group('door', { parent: g, at: [DOOR.x, 0, 0] });
  const db = bag(door, 'door');
  db.span('slate', [-DOOR.w / 2 + 0.005, DOOR.w / 2 - 0.005], [0.008, DOOR.h - 0.005], [-0.015, 0.055]); // hidden 5 mm behind the frame lips
  db.box('dark', [0.56, 0.56, 0.02], [0, DOOR.h * 0.7, 0.058]);
  db.box('trim', [0.67, 0.06, 0.03], [0, DOOR.h * 0.7 + 0.305, 0.065]);
  db.box('trim', [0.67, 0.06, 0.03], [0, DOOR.h * 0.7 - 0.305, 0.065]);
  for (const s of [-1, 1]) db.box('trim', [0.06, 0.55, 0.03], [s * 0.305, DOOR.h * 0.7, 0.065]);
  db.box('pale', [0.04, 0.04, 0.2], [-DOOR.w / 2 + 0.17, 1.0, 0.1]);                            // handle (lever)
  db.box('pale', [0.08, 0.16, 0.03], [-DOOR.w / 2 + 0.17, 1.0, 0.065]);
  db.box('trim', [0.4, 0.12, 0.025], [0, DOOR.h * 0.32, 0.065]);                                // kick plate stripe
  db.flush();
}
// back: rot 180, so local x = -model x
{
  const g = m.group('wall_back', { parent: walls, at: [0, 0, -HZ + T / 2], rot: [0, 180, 0] });
  const b = bag(g, 'back');
  wall(b, W, T, EAVE, [win(4.6, 1.0), win(0, 1.0), win(-3.9, 0.6, 1.3)]); // rot 180: model x = -local x (exam room, waiting room, the flat's hall)
  for (const s of [-1, 1]) corner(b, s);
  b.flush();
}
// sides run between front and back walls; rot ±90 so local +z faces out
const SIDE_LEN = D - 2 * T;                            // butt joints (an overlap would put two wall tops in one plane)
{
  // side L (+X): rot 90, local x -> model -z. The flat's east wall: over the kitchen counter (sill above the sink), over
  // the desk, and a little high one in the bathroom over the toilet
  const g = m.group('wall_side_L', { parent: walls, at: [HX - T / 2, 0, 0], rot: [0, 90, 0] });
  const b = bag(g, 'sideL');
  wall(b, SIDE_LEN, T, EAVE, [win(-2.15, 1.0, 1.15), win(0.2, 1.2), win(1.6, 0.5, 1.6, 2.2)]);
  b.flush();
}
{
  // side R (-X): back to back with the barn's east wall (same z span), so plain: no windows, no plinth
  const g = m.group('wall_side_R', { parent: walls, at: [-HX + T / 2, 0, 0], rot: [0, -90, 0] });
  const b = bag(g, 'sideR');
  wall(b, SIDE_LEN, T, EAVE, [], { plinth: false });
  b.flush();
}
// inner partitions (CLINIC.partitions.walls): one group per wall, rot 90 for those running along z (local x -> model -z)
for (const [name, p] of Object.entries(PW)) {
  const alongX = typeof p.z === 'number', [s0, s1] = alongX ? p.x : p.z, len = s1 - s0, c = (s0 + s1) / 2;
  const g = m.group(`wall_inner_${name}`, { parent: walls, at: alongX ? [c, 0, p.z] : [p.x, 0, c], rot: alongX ? [0, 0, 0] : [0, 90, 0] });
  const b = bag(g, name);
  wall(b, len, PT, PH, (p.doors ?? []).map(([dc, dw]) => ({ c: alongX ? dc - c : -(dc - c), w: dw, y0: 0, y1: INNER_DOOR_H, kind: 'gap' })), { outer: false, base: EMBED });
  b.flush();
}

// ---- interior: floors and built-ins
const interior = m.group('interior');
const FY = [0.005, FLOOR_T];                      // floor slab y span (bottom lifted off the ground plane)
{
  const b = bag(interior, 'floor'), E = 0.015;        // floors run 1.5 cm under the outer walls
  const EX = PW.exam_down.x, EZ = PW.exam_across.z, BX = PW.bath_down.x, BZ = PW.bath_across.z;
  // checker tiles 3 mm proud of a slab, every other one, 3 mm in from the region's edges (no face on a slab's edge plane)
  const checker = (mat, [x0, x1], [z0, z1], nx, nz) => {
    const tx = (x1 - x0) / nx, tz = (z1 - z0) / nz, i3 = (v, lo, hi) => Math.min(hi - 0.003, Math.max(lo + 0.003, v));
    for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) if ((i + k) % 2)
      b.span(mat, [i3(x0 + i * tx, x0, x1), i3(x0 + (i + 1) * tx, x0, x1)], [0.012, FLOOR_T + 0.004], [i3(z0 + k * tz, z0, z1), i3(z0 + (k + 1) * tz, z0, z1)]);
  };
  // the waiting room: pale slab with mint squares, an L round the exam room: the front strip and the back bay beside it
  b.span('pale', [IN.x0 - E, A], FY, [EZ, IN.z1 + E]);
  b.span('pale', [EX, A], FY, [IN.z0 - E, EZ]);
  checker('mint', [IN.x0, A], [EZ, IN.z1], 8, 4);
  checker('mint', [EX, A], [IN.z0, EZ], 4, 4);
  // exam room: pale
  b.span('pale', [IN.x0 - E, EX], FY, [IN.z0 - E, EZ]);
  // the flat: wood planks along x (alternate planks 6 mm proud) over a dark base that shows in the gaps; the bathroom's
  // corner is left out for its own pale floor with a slate checker
  const NP = 14, z0 = IN.z0 - E, z1 = IN.z1 + E, pw = (z1 - z0) / NP;
  for (let k = 0; k < NP; k++) {
    const a = z0 + k * pw + (k ? 0.01 : 0), e = z0 + (k + 1) * pw - (k < NP - 1 ? 0.01 : 0), y = [FY[0], FLOOR_T + (k % 2) * 0.006];
    if (a < BZ) b.span('wood', [A, BX], y, [a, Math.min(e, BZ)]);
    if (e > BZ) b.span('wood', [A, IN.x1 + E], y, [Math.max(a, BZ), e]);
  }
  b.span('dark', [A + 0.005, BX - 0.005], [0.012, FLOOR_T - 0.004], [z0 + 0.008, BZ]);
  b.span('dark', [A + 0.005, IN.x1 + E - 0.005], [0.012, FLOOR_T - 0.004], [BZ, z1 - 0.008]);
  b.span('pale', [BX, IN.x1 + E], FY, [IN.z0 - E, BZ]);
  checker('slate', [BX, IN.x1], [IN.z0, BZ], 5, 7);
  b.flush();
}
{
  // exam table at spots.examTable (yaw 0: long side along x): steel-grey pedestal and top, mint pad; each piece sunk 1 cm into the next
  const [ex, , ez] = SP.examTable.at;
  const g = m.group('exam_table', { parent: interior, at: [ex, 0, ez] });
  const b = bag(g, 'exam');
  b.span('slate', [-0.475, 0.475], [0.03, 0.1], [-0.3, 0.3]);         // foot plate
  b.span('pale', [-0.225, 0.225], [0.09, 0.72], [-0.2, 0.2]);         // pedestal
  b.span('slate', [-0.66, 0.66], [0.67, 0.71], [-0.385, 0.385]);      // rim under the top
  b.span('pale', [-0.65, 0.65], [0.7, 0.8], [-0.375, 0.375]);         // top slab
  b.span('mint', [-0.6, 0.6], [0.79, 0.87], [-0.325, 0.325]);         // pad
  b.flush();
}
{
  // sink unit at spots.sink; local z 0 = the back wall's inner face, +z into the room. Every piece overlaps the next by 1 cm
  // and no two share a face plane where they overlap.
  const [sx] = SP.sink.at;
  const g = m.group('sink', { parent: interior, at: [sx, 0, IN.z0] });
  const b = bag(g, 'sink');
  b.span('pale', [-0.4, 0.4], [0.02, 0.83], [-0.01, 0.56]);           // cabinet (back sunk into the wall)
  b.span('trim', [-0.34, 0.34], [0.1, 0.74], [0.55, 0.58]);           // teal door front
  b.span('pale', [0.17, 0.22], [0.45, 0.65], [0.57, 0.61]);           // handle
  b.span('pale', [-0.42, 0.42], [0.82, 0.9], [0.44, 0.6]);            // counter rim: front
  b.span('pale', [-0.42, 0.42], [0.82, 0.9], [-0.012, 0.16]);         // back
  for (const [x0, x1] of [[-0.42, -0.26], [0.26, 0.42]]) b.span('pale', [x0, x1], [0.821, 0.899], [0.15, 0.45]); // sides (1 mm shy of the rim's top/bottom planes)
  b.span('dark', [-0.27, 0.27], [0.8, 0.86], [0.155, 0.445]);           // basin: water/dark well below the rim top
  b.span('pale', [-0.4, 0.4], [0.89, 1.25], [-0.015, 0.03]);          // splashback
  b.span('slate', [-0.025, 0.025], [0.89, 1.08], [0.05, 0.1]);        // tap column
  b.span('slate', [-0.03, 0.03], [1.04, 1.09], [0.06, 0.26]);         // spout
  b.flush();
}
{
  // pegboard at spots.pegboard on the exam room's west wall (inner face x = IN.x0), facing +x; backing and board sunk into the wall
  const [, py, pz] = SP.pegboard.at, PW = 1.6, PHt = 1.0;
  const g = m.group('pegboard', { parent: interior, at: [IN.x0, py, pz] });
  const b = bag(g, 'peg');
  b.span('trim', [-EMBED, 0.03], [-PHt / 2 - 0.04, PHt / 2 + 0.04], [-PW / 2 - 0.04, PW / 2 + 0.04]); // teal border
  b.span('wood', [-0.005, 0.04], [-PHt / 2, PHt / 2], [-PW / 2, PW / 2]);
  const NZ = 7, NY = 4, hs = 0.0225;
  for (let i = 0; i < NZ; i++) for (let k = 0; k < NY; k++) {
    const y = -PHt / 2 + (k + 0.5) * PHt / NY, z = -PW / 2 + (i + 0.5) * PW / NZ;
    b.span('dark', [0.035, 0.05], [y - hs, y + hs], [z - hs, z + hs]);
  }
  b.flush();
}
// animal benches in the waiting room: chunky wooden slat seat (top 0.28) with a mint cushion strip (top 0.33), a low back rail
// against the wall, two stringers on short sturdy legs. Built in a local frame: u along the bench (0..L), v = depth out from the
// wall (0 at the back, 5 mm off the wall face), y up.
const BENCH_D = 0.7;
function bench(name, at, rotY, L) {
  const g = m.group(name, { parent: interior, at, rot: [0, rotY, 0] });
  const b = bag(g, name);
  const box = (mat, u, y, v) => b.span(mat, u, y, v);                 // local x = u, local z = v
  box('wood', [0.02, L - 0.02], [0.25, 0.44], [0, 0.06]);              // back rail
  const NS = 4, gap = 0.025, sw = (BENCH_D - 0.02 - (NS - 1) * gap) / NS;
  for (let k = 0; k < NS; k++) box('wood', [0, L], [0.22, 0.28], [0.02 + k * (sw + gap), 0.02 + k * (sw + gap) + sw]);
  box('mint', [0.06, L - 0.06], [0.27, 0.33], [0.2, 0.62]);            // cushion strip
  for (const v of [0.12, 0.58]) box('wood', [0.05, L - 0.05], [0.15, 0.23], [v - 0.04, v + 0.04]);   // stringers
  const n = Math.ceil((L - 0.2) / 1.6) + 1;
  for (let i = 0; i < n; i++) {
    const u = 0.1 + i * (L - 0.2) / (n - 1);
    for (const v of [0.125, 0.585]) box('wood', [u - 0.06, u + 0.06], [0.03, 0.2], [v - 0.06, v + 0.06]); // legs
  }
  b.flush();
}
// two facing each other across the waiting room's back bay, z -3.75 .. -0.4 (spots.benches):
// (a) on the flat's wall, back 5 mm off its west face; rot -90: local x -> model +z, local z -> model -x
bench('bench_apt', [A - PT / 2 - 0.005, 0, -3.75], -90, 3.35);
// (b) on the exam room's east wall; rot 90: local x -> model -z, local z -> model +x
bench('bench_exam', [PW.exam_down.x + PT / 2 + 0.005, 0, -0.4], 90, 3.35);

// ---- roof: low gable, ridge along x. Underside line y = Y_PK - S*|z| passes through the wall top at the outer face (z = HZ)
const roof = m.group('roof');
const RT = 0.16, CAP = 0.06;
const TV_OF = s => RT * Math.sqrt(1 + s * s);
let Y_PK = RIDGE - 0.3;
for (let i = 0; i < 20; i++) Y_PK = RIDGE - CAP - TV_OF((Y_PK - EAVE) / HZ);
const S = (Y_PK - EAVE) / HZ, TV = TV_OF(S);
const under = z => Y_PK - S * Math.abs(z), top = z => under(z) + TV;
const EZ = HZ + OV, EX = HX + OV, EXR = HX;     // the -X end is flush: it butts the barn, an overhang would poke through its wall
// profile in (u, y) where u = -z (geoRot [0,90,0] maps shape x -> -z... see below), extruded along x
// rotation +90 about Y maps (x, y, z) -> (z, y, -x): shape x becomes model -z, extrude depth (shape z) becomes model x.
const yzExtrude = (pts, x0, x1) => { const g = m.extrude(pts.map(([z, y]) => [-z, y]), x1 - x0); g.rotateY(Math.PI / 2); g.translate(x0, 0, 0); return g; };
{
  const b = bag(roof, 'roof');
  for (const s of [1, -1]) {
    const pts = [[0, under(0)], [s * EZ, under(EZ)], [s * EZ, top(EZ)], [0, top(0)]];
    b.geo('slate', yzExtrude(s > 0 ? pts.reverse() : pts, -EXR, EX));
  }
  // ridge cap: its -X end stops 1 cm short of the slabs' flush end so the two end faces don't share a plane
  b.box('slate', [EX + EXR + 0.01, CAP * 1.6, CAP * 1.6], [(EX + 0.02 - EXR + 0.01) / 2, top(0) + CAP * 0.2, 0], [45, 0, 0]);
  // gable infill above the eave on both side walls (cream): dips 1.5 cm into the wall tops (below the corner boards' tops),
  // its sloped top 2 cm up inside the roof slabs, its ends 1 cm inside the front/back walls, and 5 mm proud of the side
  // walls' faces either way, so none of its faces lies on a wall, corner-board or roof face
  const GZ = HZ - EMBED, GB = EAVE - 0.015;
  const gab = [[-GZ, GB], [GZ, GB], [GZ, under(GZ) + 0.02], [0, under(0) + 0.02], [-GZ, under(GZ) + 0.02]];
  for (const s of [1, -1]) b.geo('wall', yzExtrude(s > 0 ? gab : [...gab].reverse(), s > 0 ? HX - T - 0.005 : -HX - 0.005, s > 0 ? HX + 0.005 : -HX + T + 0.005));
  const RZ = EZ - 0.005;                         // rake ends 5 mm short of the slab ends, inside the fascia boards
  const rake = [[-RZ, under(EZ) - 0.06], [-RZ, top(EZ) + 0.03], [0, top(0) + 0.03], [RZ, top(EZ) + 0.03], [RZ, under(EZ) - 0.06], [0, under(0) - 0.06]];
  b.geo('trim', yzExtrude([...rake].reverse(), EX - 0.03, EX + 0.03));
  // eave fascia boards front and back (teal) and a teal band along the wall top under them
  // (back sunk 1 cm into the slab's edge; +X end 1 cm past the rake board, -X end 5 mm inside the flush slab end)
  for (const s of [1, -1]) b.span('trim', [-EXR + 0.005, EX + 0.04], [under(EZ) - 0.06, top(EZ) + 0.03], s > 0 ? [EZ - EMBED, EZ + 0.05] : [-EZ - 0.05, -EZ + EMBED]);
  // square vent on the left gable (the visible one), sunk 1 cm into the gable face (HX + 5 mm)
  const vy = EAVE + (under(0) - EAVE) * 0.4;
  b.span('trim', [HX - 0.005, HX + 0.045], [vy - 0.25, vy + 0.25], [-0.25, 0.25]);
  b.span('dark', [HX + 0.035, HX + 0.065], [vy - 0.18, vy + 0.18], [-0.18, 0.18]);
  // sign: white board on a teal backing standing on the front slope, a teal paw print and a teal cross
  const SZ = 2.9, SWd = 2.6, SHt = 0.85, SDp = 0.08, sy0 = top(SZ) - 0.06;
  const sc = sy0 + SHt / 2;
  // board z [SZ - SDp, SZ]; the backing behind it and the posts behind that each overlap the next by 1 cm
  b.span('trim', [-SWd / 2 - 0.07, SWd / 2 + 0.07], [sc - SHt / 2 - 0.07, sc + SHt / 2 + 0.07], [SZ - 2 * SDp + 0.01 - 0.01, SZ - SDp + 0.01]);
  b.span('pale', [-SWd / 2, SWd / 2], [sc - SHt / 2, sc + SHt / 2], [SZ - SDp, SZ]);
  for (const s of [-0.8, 0.8]) b.span('slate', [s - 0.04, s + 0.04], [sy0 - 0.3, sy0 + 0.2], [SZ - 3 * SDp + 0.02, SZ - 2 * SDp + 0.01]); // posts into the roof
  const px = -0.6, fz = SZ + 0.02;                                         // paw and cross: 1 cm into the board, 5 cm proud
  const disc = (r, h, x, y, sx = 1) => { const g = m.cyl(r, r, h, 12); g.rotateX(Math.PI / 2); g.scale(sx, 1, 1); g.translate(x, y, fz); b.geo('trim', g); };
  disc(0.2, 0.06, px, sc - 0.12, 1.25);                                     // pad
  for (const [dx, dy] of [[-0.27, 0.07], [-0.1, 0.22], [0.1, 0.22], [0.27, 0.07]]) disc(0.075, 0.06, px + dx, sc - 0.06 + dy);
  const cx = 0.65;
  b.box('trim', [0.56, 0.18, 0.06], [cx, sc, fz]);
  b.box('trim', [0.18, 0.56, 0.06], [cx, sc, fz]);
  b.flush();
}

await m.write(new URL('../../assets/models/custom/clinic.glb', import.meta.url).pathname);
