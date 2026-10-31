// The three buildings on the north row (v3 spec §3): pure numbers shared by layout.js (colliders, tap volumes, doors),
// the glb-author model scripts (tools/models/*.model.mjs) and the view. Each building's model is built in its own frame:
// metres, +Y up, origin at the centre of the footprint on the ground, front (+Z) facing south toward the pens; the model
// stands at world (x, 0, z) unturned, so world = (x + lx, ly, z + lz). Every `at` below is model-local [lx, ly, lz].

export const COOP = {
  x: -11.1, z: -25.05,              // east end of the chicken run, against its fence (x −8.4); 2.7.0: 5 m wide (was 3)
  hx: 2.5, hz: 1.15,                // footprint half sizes
  floor: 0.35, eave: 1.8, ridge: 2.45, overhang: 0.25,
  popDoor: { x: 0.4, w: 0.62, h: 0.62 },      // pop door: local x of its centre, size; it slides up 0.62 to open
  rampZ: 2.1,                                  // local z where the ramp meets the ground (world rampZ = z + rampZ)
  perches: 12,                                 // roost bar slots (R2: one per adult bird)
};

// The roost bar (coop.model.mjs builds it): two round rails along x, low at the front, high at the back. Perch k sits on
// rail k % 2, slot floor(k / 2) of 6, the high rail's slots half a slot over so every bird has its own x; its plaque hangs
// on the back wall above, in the same column, the high rail's row above the low rail's.
COOP.rails = [{ y: 0.68, z: -0.65 }, { y: 1.05, z: -0.92 }];
COOP.slot = (2 * COOP.hx - 0.9) / 6; // a perch's share of a rail
COOP.perchAt = k => { const r = COOP.rails[k % 2], slot = Math.floor(k / 2), s = COOP.slot; return [-2.75 * s + slot * s + (k % 2) * s / 2, r.y + 0.04, r.z]; };
COOP.plaqueAt = k => { const [x] = COOP.perchAt(k); return [x, k % 2 ? 1.71 : 1.54, -1.04]; }; // above the roosting birds' heads
COOP.plaque = { w: COOP.slot / 2 - 0.04, h: 0.15 };
COOP.chickZ = -0.2; // where chicks sleep: in the straw in front of the low rail (local z)

export const BARN = {
  x: -0.4, z: -22.3,                // x −8.2 … 7.4, z −26.3 … −18.3: the middle of the north row, over the pens' middle
  w: 15.6, d: 8.0, wall: 0.2,
  eave: 3.4, ridge: 6.2, overhang: 0.35,
  door: { w: 3.2, h: 2.9 },         // the double door: opening centred on the front wall; two leaves of w/2, hinged at ±w/2
  stall: { depth: 2.5, divider: 0.1, dividerH: 1.0, headerY: 1.25 }, // stall fronts open on the aisle; a header beam carries the plaque
  aisle: 2.6,                        // between the back and front rows (local z −1.3 … 1.3)
};
{
  const B = BARN, ix = B.w / 2 - B.wall, iz = B.d / 2 - B.wall, hd = B.door.w / 2;
  // 16 stalls: 8 along the back wall, then 4 + 4 along the front wall either side of the doors. Each is
  // { id, x0, x1, z0, z1, at: sleep point, face: yaw the pig lies facing (out toward the aisle), plaque: [lx, ly, lz] }
  const stalls = [];
  const back = (ix * 2) / 8;
  for (let k = 0; k < 8; k++) stalls.push({ x0: -ix + k * back, x1: -ix + (k + 1) * back, z0: -iz, z1: -iz + B.stall.depth, row: 'back' });
  const front = (ix - hd) / 4;
  for (let k = 0; k < 4; k++) stalls.push({ x0: -ix + k * front, x1: -ix + (k + 1) * front, z0: iz - B.stall.depth, z1: iz, row: 'front' });
  for (let k = 0; k < 4; k++) stalls.push({ x0: hd + k * front, x1: hd + (k + 1) * front, z0: iz - B.stall.depth, z1: iz, row: 'front' });
  B.stalls = stalls.map((s, id) => {
    const cx = (s.x0 + s.x1) / 2, out = s.row === 'back' ? 1 : -1, mouth = s.row === 'back' ? s.z1 : s.z0;
    return { id, ...s, at: [cx, 0, (s.z0 + s.z1) / 2], face: s.row === 'back' ? 0 : Math.PI, plaque: [cx, B.stall.headerY + 0.13, mouth + out * 0.09], out };
  });
  B.inner = { x0: -ix, x1: ix, z0: -iz, z1: iz };
  // the way in, in model-local [x, z]: outside the doors, just inside them, the aisle's middle; then along the aisle to the
  // stall, its mouth (just on the aisle side) and the stall itself
  B.doorOut = [0, B.d / 2 + 1.0];
  for (const st of B.stalls) { const back = st.row === 'back'; st.mouth = [st.at[0], back ? st.z1 + 0.35 : st.z0 - 0.35]; }
  B.plaque = { w: 0.78, h: 0.26 };
  B.doorIn = [0, 0, iz - 0.6];        // just inside the doors
  B.lamps = [[-ix / 2, B.eave - 0.4, 0], [ix / 2, B.eave - 0.4, 0]];
}

export const CLINIC = {
  x: 13.9, z: -22.3,                 // x 7.4 … 20.4, butting up to the barn (13 m wide since 2.9.0: the vet's flat runs down the east side)
  w: 13.0, d: 8.0, wall: 0.2,
  eave: 3.0, ridge: 4.3, overhang: 0.3,
  door: { x: -0.4, w: 1.4, h: 2.3 }, // front door (decorative: always shut)
  apt: 2.0,                          // the flat's west wall (local x): the clinic west of it, Dr. Emmy's flat east of it
  // inner partitions (full height, cut to stubs whenever the clinic is in focus), by centre line in local x/z: `x` and a
  // z span, or `z` and an x span. Ends that meet an outer wall run 2 cm into it; ends that meet another partition butt its
  // face. Each doorway is [centre along the wall, width].
  partitions: {
    t: 0.12, h: 2.6,
    walls: {
      exam_down:   { x: -2.0, z: [-3.82, 0.06] },                         // the exam room's east wall
      exam_across: { z: 0, x: [-6.32, -2.06], doors: [[-4.2, 1.6]] },    // the exam room's front wall, its doorway on the lobby (wide: the vet and a patient pass)
      apt:         { x: 2.0, z: [-3.82, 3.82], doors: [[1.2, 1.0]] },     // the flat's west wall: a doorway from the waiting room by the table
      closet_down: { x: 3.4, z: [-3.82, -1.54], doors: [[-2.55, 0.8]] },  // the closet's east wall, its doorway on the hall
      closet_across: { z: -1.6, x: [2.06, 3.34] },
      bath_down:   { x: 4.4, z: [-3.82, -0.94], doors: [[-2.0, 0.75]] },  // the bathroom's west wall, its doorway on the hall
      bath_across: { z: -1.0, x: [4.46, 6.32] },
    },
  },
  // places (model-local [lx, ly, lz], yaw facing): the view furnishes them, the vet walks between them
  spots: {
    desk:       { at: [-4.6, 0, 1.7], yaw: Math.PI / 2 },      // reception desk; the vet stands behind it at deskVet
    deskVet:    { at: [-5.5, 0, 1.7], yaw: Math.PI / 2 },
    waiting:    { at: [0.0, 0, -1.2], yaw: 0 },
    examTable:  { at: [-4.2, 0, -2.2], yaw: 0 },
    examVet:    { at: [-4.6, 0, -1.05], yaw: Math.PI },          // at the table's west half: patients come round its east end
    pegboard:   { at: [-6.25, 2.15, -2.2], yaw: Math.PI / 2, size: [3.0, 1.1] }, // on the west wall of the exam room (R3); 2.12.0: wide and up high, over the patient's head in the close-up (size: along the wall, up)
    sink:       { at: [-2.5, 0, -3.4], yaw: Math.PI },
    // the flat (2.9.0): closet and bathroom across a little hall at the back, the bed below the closet (pillow to the back
    // wall), her desk across from it, the kitchenette down the east wall, a table for two by the doorway
    bed:        { at: [2.64, 0, -0.45], yaw: 0 },              // the bed's middle; yaw 0: the pillow at -z
    study:      { at: [4.95, 0, -0.2], yaw: Math.PI / 2 },     // in front of her desk on the east wall
    kitchenVet: { at: [5.0, 0, 2.15], yaw: Math.PI / 2 },      // at the kitchen sink
    dining:     { at: [3.7, 0, 1.0], yaw: 0 },                 // at the head of the table
    table:      { at: [3.7, 0, 2.05], yaw: Math.PI / 2 },      // long side along z (2.15.0: 35 cm north, for Biscuit's bed)
    rug:        { at: [4.2, 0, -0.3], yaw: Math.PI / 2 },
    catBed:     { at: [2.45, 0, 3.4], yaw: 0 },
    dogBed:     { at: [3.45, 0, 3.3], yaw: 1.75 },             // 2.15.0: Biscuit's, beside the cat's (yaw: he lies along the south wall, his head to the east)
    // 2.13.0: the bathroom (through the hall's doorway): in front of the toilet (she lifts its lid and flushes it from here),
    // on its seat (y: the seat's top; facing out), at the basin, under the shower (facing out of it)
    bathroom:   { at: [5.12, 0, -1.55], yaw: Math.PI / 2 },
    seat:       { at: [5.8, 0.41, -1.55], yaw: -Math.PI / 2 },
    washVet:    { at: [5.45, 0, -2.3], yaw: Math.PI / 2 },
    shower:     { at: [5.7, 0.17, -3.15], yaw: 0 },              // y: the tray's floor
    plant:      { at: [-5.9, 0, 3.5], yaw: 0 },
    // her rounds outside (2.9.0): along the north pens' fence (world z -15.3, 0.9 m out from it) and at the chicken run's
    // south fence, facing them; the pigs and hens come to the fence to say hello
    penEast:    { at: [-2.9, 0, 7.0], yaw: 0 },
    penWest:    { at: [-23.4, 0, 7.0], yaw: 0 },
    run:        { at: [-26.4, 0, 3.7], yaw: Math.PI },
    // 6 waiting places for patients (R3) on the two animal benches facing each other across the waiting room (clinic.model.mjs
    // bench_apt on the flat's wall, bench_exam on the exam room's; seat top 0.33): [x, seat y, z, yaw]
    benches: [[1.59, 0.33, -3.15, -Math.PI / 2], [1.59, 0.33, -2.05, -Math.PI / 2], [1.59, 0.33, -0.95, -Math.PI / 2],
      [-1.59, 0.33, -3.15, Math.PI / 2], [-1.59, 0.33, -2.05, Math.PI / 2], [-1.59, 0.33, -0.95, Math.PI / 2]],
    tableTop: 0.87,                                              // the exam table's pad (clinic.model.mjs)
    frontDoor: [-0.4, 0, 4.9],                                   // just outside the front door: where patients come out
  },
  // the vet's walk graph: named points (local x, z) and the links she may walk straight along
  walk: {
    // the desk (spots.desk, about 0.8 × 1.6 m along z) stands between her place behind it and the lobby: she goes round its
    // north end (deskEnd → aisle), never through it. In the flat everything hangs off `hub`, clear of the bed's foot and the table
    points: { deskVet: [-5.5, 1.7], deskEnd: [-5.5, 0.55], aisle: [-3.6, 0.55], lobby: [-1.0, 2.0], waiting: [0.0, -1.2],
      examDoor: [-4.6, 0.0], examVet: [-4.6, -1.05], aptDoor: [2.0, 1.2], aptIn: [2.7, 1.2], hub: [3.9, 0.85],
      bedSide: [3.65, -0.45], study: [4.95, -0.2], dining: [3.7, 1.0], kitchenVet: [5.0, 2.15],
      // 2.13.0: down the hall, through the bathroom's doorway, to the toilet, the basin and into the shower
      dogWay: [2.4, 2.45], dogBed: [3.45, 3.3],
      hall: [3.9, -2.0], bathIn: [4.85, -2.0], bathroom: [5.12, -1.55], washVet: [5.45, -2.3], showerStep: [5.55, -2.45], shower: [5.7, -3.15],
      // out of the front door (it opens for her) and along the strip of field between the buildings and the pens
      frontIn: [-0.4, 3.0], frontOut: [-0.4, 5.0], yard: [-0.4, 6.6], penEast: [-2.9, 7.0], barnFront: [-14.3, 6.6], penWest: [-23.4, 7.0], run: [-26.4, 3.7] },
    links: [['deskVet', 'deskEnd'], ['deskEnd', 'aisle'], ['aisle', 'lobby'], ['aisle', 'examDoor'], ['lobby', 'waiting'], ['lobby', 'examDoor'], ['examDoor', 'examVet'],
      ['lobby', 'aptDoor'], ['waiting', 'aptDoor'], ['aptDoor', 'aptIn'], ['aptIn', 'hub'], ['hub', 'bedSide'], ['hub', 'study'], ['hub', 'dining'],
      ['hub', 'kitchenVet'], ['bedSide', 'study'], ['dining', 'kitchenVet'],
      ['hub', 'hall'], ['bedSide', 'hall'], ['hall', 'bathIn'], ['bathIn', 'bathroom'], ['bathIn', 'washVet'], ['bathroom', 'washVet'],
      ['bathIn', 'showerStep'], ['showerStep', 'shower'],
      // 2.15.0: Biscuit's way to his bed, down the flat's west wall past the table
      ['aptIn', 'dogWay'], ['dogWay', 'dogBed'],
      ['lobby', 'frontIn'], ['frontIn', 'frontOut'], ['frontOut', 'yard'], ['yard', 'penEast'], ['penEast', 'barnFront'], ['barnFront', 'penWest'], ['penWest', 'run']],
  },
};
// The pegboard's tools (R3, vet-tools.model.mjs): where each hangs (its peg, model-local [x, y, z]; the board faces +x on
// the exam room's west wall): the check-ups along the top, the treatments below. A tool hangs down from its peg, ~0.4 m.
CLINIC.pegs = [
  ...['stethoscope', 'otoscope', 'thermometer', 'magnifier'].map((tool, k) => ({ tool, at: [-6.22, 2.6, -2.2 - 0.9 + k * 0.6] })),
  ...['shot', 'drops', 'spoon', 'tweezers', 'bandage'].map((tool, k) => ({ tool, at: [-6.22, 2.12, -2.2 - 1.0 + k * 0.5] })),
];
// The flat's (and the exam room's) things a tap works (2.9.0, clinic.js PROPS): each one's tap box (local [x0, x1], [y0, y1],
// [z0, z1]); the shower's and the exam sink's spout (local [x, y, z]: the shower head, a tap) and basin (local [x, y, z,
// radius]: where its water lands). The view furnishes the Kenney pieces at these places; the Kenney basins' and taps'
// water is placed on the pieces themselves (flat3d.js FIXTURE).
CLINIC.props = {
  shower:      { box: [[5.1, 6.3], [0, 2.3], [-3.8, -2.6]], spout: [5.7, 2.12, -3.2], basin: [5.7, 0.1, -3.2, 0.5] },
  bathSink:    { box: [[5.75, 6.3], [0.55, 1.25], [-2.6, -2.0]] },
  toilet:      { box: [[5.4, 6.3], [0, 0.9], [-1.85, -1.25]] },
  laptop:      { box: [[5.55, 6.1], [0.78, 1.25], [-0.2, 0.3]] },
  fridge:      { box: [[5.65, 6.3], [0, 1.3], [0.75, 1.65]] },
  kitchenSink: { box: [[5.35, 6.3], [0.6, 1.2], [1.65, 2.55]] },
  examSink:    { box: [[-2.95, -2.05], [0.5, 1.3], [-3.8, -3.2]], spout: [-2.5, 1.06, -3.54], basin: [-2.5, 0.88, -3.5, 0.24] },
};
// the exam room (local x0..x1, z0..z1) and the exam close-up's framing (the camera east of the table, looking west at it and the board)
CLINIC.examRoom = { x0: -6.3, x1: -2.06, z0: -3.8, z1: -0.06 };
CLINIC.examView = { target: [-5.0, 1.0, -2.2], dist: 5.4, pitch: 0.5, yaw: Math.PI / 2 };
CLINIC.inner = { x0: -CLINIC.w / 2 + CLINIC.wall, x1: CLINIC.w / 2 - CLINIC.wall, z0: -CLINIC.d / 2 + CLINIC.wall, z1: CLINIC.d / 2 - CLINIC.wall };

export const BUILDINGS = { coop: COOP, barn: BARN, clinic: CLINIC };

// Node names every building model must carry (test/buildings.test.mjs; the view's cutaway drives them):
//   roof            group: everything above the eave (roof, gable infill, ridge, chimney, sign on the roof)
//   walls           group holding one group per wall face: wall_front, wall_back, wall_side_L, wall_side_R (+X is the
//                   model's left), and the clinic's wall_inner_<name> per CLINIC.partitions.walls. Each face group has its origin on
//                   the ground (y 0) so a y-scale shrinks it, and everything on it (trim, windows, door frame), to a stub
//   interior        group: floor and fittings that always show (stalls, dividers, roost bar, counters built in)
//   door_L, door_R  (barn) leaves, origin at the hinge, shut at rest; pop_door (coop); door (clinic)
export const WALL_NODES = ['wall_front', 'wall_back', 'wall_side_L', 'wall_side_R'];
