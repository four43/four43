// The three buildings on the north row (v3 spec §3): pure numbers shared by layout.js (colliders, tap volumes, doors),
// the glb-author model scripts (tools/models/*.model.mjs) and the view. Each building's model is built in its own frame:
// metres, +Y up, origin at the centre of the footprint on the ground, front (+Z) facing south toward the pens; the model
// stands at world (x, 0, z) unturned, so world = (x + lx, ly, z + lz). Every `at` below is model-local [lx, ly, lz].

export const COOP = {
  x: -10.1, z: -25.05,              // east end of the chicken run, against its fence (x −8.4)
  hx: 1.5, hz: 1.15,                // footprint half sizes (as 2.5.1)
  floor: 0.35, eave: 1.8, ridge: 2.45, overhang: 0.25,
  popDoor: { x: 0.4, w: 0.62, h: 0.62 },      // pop door: local x of its centre, size; it slides up 0.62 to open
  rampZ: 2.1,                                  // local z where the ramp meets the ground (world rampZ = z + rampZ)
  perches: 12,                                 // roost bar slots (R2: one per adult bird)
};

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
    return { id, ...s, at: [cx, 0, (s.z0 + s.z1) / 2], face: s.row === 'back' ? 0 : Math.PI, plaque: [cx, B.stall.headerY + 0.18, mouth + out * 0.06] };
  });
  B.inner = { x0: -ix, x1: ix, z0: -iz, z1: iz };
  B.doorIn = [0, 0, iz - 0.6];        // just inside the doors
  B.lamps = [[-ix / 2, B.eave - 0.4, 0], [ix / 2, B.eave - 0.4, 0]];
}

export const CLINIC = {
  x: 11.9, z: -22.3,                 // x 7.4 … 16.4, butting up to the barn
  w: 9.0, d: 8.0, wall: 0.2,
  eave: 3.0, ridge: 4.3, overhang: 0.3,
  door: { x: 1.6, w: 1.4, h: 2.3 },  // front door (decorative in R1: always shut)
  // inner partitions (full height, cut to stubs whenever the clinic is in focus): one across the middle (local z 0) with a
  // doorway into each back room, one down the middle of the back half between the exam room and the studio
  partitions: {
    across: { z: 0, doors: [{ x: -2.2, w: 1.3 }, { x: 2.6, w: 1.1 }] },
    down: { x: 0, z0: -3.8, z1: 0 },
    t: 0.12, h: 2.6,
  },
  // places (model-local [lx, ly, lz], yaw facing): the view furnishes them, the vet walks between them
  spots: {
    desk:       { at: [-2.6, 0, 1.7], yaw: Math.PI / 2 },      // reception desk; the vet stands behind it at deskVet
    deskVet:    { at: [-3.5, 0, 1.7], yaw: Math.PI / 2 },
    waiting:    { at: [0.9, 0, 2.0], yaw: 0 },
    examTable:  { at: [-2.2, 0, -2.2], yaw: 0 },
    examVet:    { at: [-2.2, 0, -1.0], yaw: Math.PI },
    pegboard:   { at: [-4.25, 1.5, -2.2], yaw: Math.PI / 2 },  // on the west wall of the exam room (R3)
    sink:       { at: [-0.5, 0, -3.4], yaw: Math.PI },
    bed:        { at: [3.3, 0, -2.6], yaw: -Math.PI / 2 },
    kitchen:    { at: [1.0, 0, -3.4], yaw: Math.PI },
    kitchenVet: { at: [1.0, 0, -2.5], yaw: Math.PI },
    rug:        { at: [2.6, 0, -1.7], yaw: 0 },
    catBed:     { at: [3.6, 0, -0.7], yaw: 0 },
    plant:      { at: [-3.9, 0, 3.5], yaw: 0 },
    // 6 waiting places for patients (R3): benches along the east wall and the partition
    benches: [[3.6, 0, 0.9], [3.6, 0, 2.1], [3.6, 0, 3.3], [-0.6, 0, 0.6], [0.6, 0, 0.6], [1.8, 0, 0.6]],
  },
  // the vet's walk graph: named points (local x, z) and the links she may walk straight along
  walk: {
    // the desk (spots.desk, about 0.8 × 1.6 m along z) stands between her place behind it and the lobby: she goes round its
    // north end (deskEnd → aisle), never through it
    points: { deskVet: [-3.5, 1.7], deskEnd: [-3.5, 0.55], aisle: [-1.6, 0.55], lobby: [0.0, 2.2], waiting: [2.4, 1.8],
      examDoor: [-2.2, 0.0], examVet: [-2.2, -1.0], studioDoor: [2.6, 0.0], kitchenVet: [1.0, -2.5], bedSide: [2.4, -2.6] },
    links: [['deskVet', 'deskEnd'], ['deskEnd', 'aisle'], ['aisle', 'lobby'], ['aisle', 'examDoor'], ['lobby', 'waiting'], ['lobby', 'examDoor'], ['examDoor', 'examVet'], ['lobby', 'studioDoor'],
      ['waiting', 'studioDoor'], ['studioDoor', 'kitchenVet'], ['studioDoor', 'bedSide'], ['kitchenVet', 'bedSide']],
  },
};
CLINIC.inner = { x0: -CLINIC.w / 2 + CLINIC.wall, x1: CLINIC.w / 2 - CLINIC.wall, z0: -CLINIC.d / 2 + CLINIC.wall, z1: CLINIC.d / 2 - CLINIC.wall };

export const BUILDINGS = { coop: COOP, barn: BARN, clinic: CLINIC };

// Node names every building model must carry (test/buildings.test.mjs; the view's cutaway drives them):
//   roof            group: everything above the eave (roof, gable infill, ridge, chimney, sign on the roof)
//   walls           group holding one group per wall face: wall_front, wall_back, wall_side_L, wall_side_R (+X is the
//                   model's left), and the clinic's wall_inner_across, wall_inner_down. Each face group has its origin on
//                   the ground (y 0) so a y-scale shrinks it, and everything on it (trim, windows, door frame), to a stub
//   interior        group: floor and fittings that always show (stalls, dividers, roost bar, counters built in)
//   door_L, door_R  (barn) leaves, origin at the hinge, shut at rest; pop_door (coop); door (clinic)
export const WALL_NODES = ['wall_front', 'wall_back', 'wall_side_L', 'wall_side_R'];
