// The farm's layout (H-F1..H-F4, H-F7..H-F9). Sim-pure data and small geometry helpers: where the fields, the silo, the barn, the
// backyard, the meadow and the signs stand, the fences and gates between them, and the zones the vehicles drive into. +z is north;
// the yard (the grain chapter) is round the origin, the backyard south of it, the meadow south-east.
import { SILO, SHED, SIGN, FARMHOUSE, COMPOST, DOGHOUSE, FLOWERBED, GATE, GARAGE, WORKBENCH, HAYBARN } from '../defs/models.js';

export const FARM = Object.freeze({ x0: -85, x1: 140, z0: -140, z1: 85, fence: 0.3 }); // the outer fence runs round this rectangle

// Fields: an axis-aligned rectangle of w × h square cells `size` m across, x0/z0 the south-west corner. The backyard's are fine
// (0.5 m cells: the mower's deck is narrow), the grain fields 1 m.
const field = (crop, x0, z0, w, h, size = 1) => Object.freeze({ crop, x0, z0, w, h, size });
export const FIELDS = Object.freeze({
  lawn: field('lawn', -34, -66, 56, 44, 0.5),          // 28 × 22 m, west of the garden path, in front of the farmhouse
  longgrass: field('longgrass', 22, -72, 48, 40, 0.5), // 24 × 20 m, south-east
  clover: field('clover', -64, -66, 40, 40, 0.5),      // 20 × 20 m, west of the lawn
  hay: field('hay', 72, -82, 40, 32),                  // the meadow (1 m cells)
  alfalfa: field('alfalfa', 118, -82, 18, 32),
  wildflowers: field('wildflowers', 60, -130, 40, 28),
  wheat: field('wheat', -24, 22, 48, 40),
  corn: field('corn', 26, -20, 44, 52),
  sunflower: field('sunflower', -70, -20, 44, 52),
});

// The silo: its bay runs north-south, centred at (x, z). The shed is a drive-through north-south too.
export const YARD = Object.freeze({
  silo: Object.freeze({ x: 9, z: -12, yaw: 0 }), // south of the yard: its silos stay out of the lanes to the corn and the wheat
  shed: Object.freeze({ x: -12, z: -8, yaw: 0 }),
  start: Object.freeze({ x: 0, z: 14, yaw: 0 }), // the combine starts facing the wheat
});

// The backyard (H-F7): fenced off from the grain fields along z = fence (a gate in the middle opens once the combine is bought;
// H-F8). The farmhouse faces north over the lawn, the compost bins (the mower's sell point) face north, the garage (the mower's
// workshop: an open pad to drive across, a workbench against the fence facing it) east of them, a dog house and two flower beds by
// the porch. The mower starts by the
// compost, facing the lawn.
export const BACKYARD = Object.freeze({
  fence: -34.5,
  garage: Object.freeze({ x: 24, z: -41, yaw: 0 }),
  bench: Object.freeze({ x: 24, z: -35.75, yaw: Math.PI }),  // against the fence, facing the pad
  house: Object.freeze({ x: -18, z: -78, yaw: 0 }),         // behind the lawn, its porch at the end of the garden path
  compost: Object.freeze({ x: 14, z: -47, yaw: 0 }),
  doghouse: Object.freeze({ x: -34, z: -73, yaw: 0.3 }),
  beds: Object.freeze([Object.freeze({ x: -26.5, z: -71, yaw: 0 }), Object.freeze({ x: -9.5, z: -71, yaw: 0 })]), // either side of the porch
  start: Object.freeze({ x: 0, z: -50, yaw: -Math.PI / 2 }),   // on the garden path, facing the lawn
});

// The meadow (H-F9), behind its own gate east of the backyard: the hay, alfalfa and wildflower fields, the hay barn (the tractor's
// sell point, a drive-through along z) in its south-east corner, and the tractor's garage pad with a workbench by the gate.
export const MEADOW = Object.freeze({
  fence: 52,                                                        // the fence along x = 52, south of the backyard fence
  pad: Object.freeze({ x: 60, z: -41, yaw: 0 }),
  bench: Object.freeze({ x: 60, z: -35.75, yaw: Math.PI }),  // against the backyard fence, facing the pad
  barn: Object.freeze({ x: 126, z: -118, yaw: 0 }),
  start: Object.freeze({ x: 70, z: -41, yaw: Math.PI / 2 }),
});

// The gates (H-F8, H-F9): each in a fence line, shut (a collider) until the vehicle it opens for is owned. yaw 0: the gate spans x.
export const GATES = Object.freeze({
  grain: Object.freeze({ x: 0, z: BACKYARD.fence, yaw: 0, half: GATE.half, opens: 'combine' }),
  meadow: Object.freeze({ x: MEADOW.fence, z: -41, yaw: Math.PI / 2, half: GATE.half, opens: 'tractor' }),
});
// The fences inside the farm, each a straight line [x0, z0, x1, z1] with its gates: the backyard's (across the farm, the grain gate)
// and the meadow's (from the south fence up to the backyard's, the meadow gate)
export const FENCES = Object.freeze([
  Object.freeze({ line: [FARM.x0, BACKYARD.fence, FARM.x1, BACKYARD.fence], gates: ['grain'] }),
  Object.freeze({ line: [MEADOW.fence, FARM.z0, MEADOW.fence, BACKYARD.fence], gates: ['meadow'] }),
]);
// a fence line's pieces between its gates (and their posts): [[x0, z0, x1, z1], …]
export function fenceSegments(fence) {
  const [x0, z0, x1, z1] = fence.line, alongX = z0 === z1, out = [];
  let a = alongX ? x0 : z0;
  const cuts = fence.gates.map(id => GATES[id]).map(g => [(alongX ? g.x : g.z) - g.half - GATE.post, (alongX ? g.x : g.z) + g.half + GATE.post]).sort((p, q) => p[0] - q[0]);
  for (const [c0, c1] of [...cuts, [alongX ? x1 : z1, alongX ? x1 : z1]]) {
    if (c0 > a) out.push(alongX ? [a, z0, c0, z0] : [x0, a, x0, c0]);
    a = c1;
  }
  return out;
}

// Field signs (H-F6): beside each field, out of the way, facing the way in (a sign's front faces +z turned by yaw).
export const SIGNS = Object.freeze({
  // the backyard's: the lawn's against the fence, facing into the backyard; the others at their fields' outer corners, clear of the
  // path between the lawn, the compost bins and the garage
  lawn: Object.freeze({ x: -20, z: -35.75, yaw: Math.PI }),
  longgrass: Object.freeze({ x: 48.5, z: -50.5, yaw: 0 }),
  clover: Object.freeze({ x: -65.5, z: -44.5, yaw: Math.PI / 2 }),
  hay: Object.freeze({ x: 69, z: -52.5, yaw: 0 }),
  alfalfa: Object.freeze({ x: 120, z: -47.8, yaw: 0 }),
  wildflowers: Object.freeze({ x: 57.5, z: -99.5, yaw: 0 }),
  wheat: Object.freeze({ x: 8, z: 19.5, yaw: Math.PI }),
  corn: Object.freeze({ x: 23.5, z: 11.5, yaw: -Math.PI / 2 }),
  sunflower: Object.freeze({ x: -23.5, z: 11.5, yaw: Math.PI / 2 }),
});

// Zones the combine's centre drives into: { x, z, yaw, hx, hz } (half sizes in the zone's own frame)
export const ZONES = Object.freeze({
  sell: Object.freeze({ x: YARD.silo.x, z: YARD.silo.z, yaw: YARD.silo.yaw, hx: SILO.bay.half - 0.6, hz: SILO.bay.len - 0.5 }),
  shop: Object.freeze({ x: YARD.shed.x, z: YARD.shed.z, yaw: YARD.shed.yaw, hx: SHED.half - 1, hz: SHED.depth / 2 - 1 }),
  garage: Object.freeze({ x: BACKYARD.garage.x, z: BACKYARD.garage.z, yaw: 0, hx: GARAGE.hx, hz: GARAGE.hz }),
  tractorshed: Object.freeze({ x: MEADOW.pad.x, z: MEADOW.pad.z, yaw: 0, hx: GARAGE.hx, hz: GARAGE.hz }),
  haybarn: Object.freeze({ x: MEADOW.barn.x, z: MEADOW.barn.z, yaw: 0, hx: HAYBARN.half - 1.5, hz: HAYBARN.depth / 2 - 1 }),
  // in front of the compost bins' open side: the mower drives along them
  compost: Object.freeze({ x: BACKYARD.compost.x, z: BACKYARD.compost.z + COMPOST.d / 2 + 2.2, yaw: 0, hx: COMPOST.w / 2, hz: 2.2 }),
});
export const SELL_ZONES = Object.freeze(['sell', 'compost', 'haybarn']); // where a bin over the zone unloads (H-S1)
export const SHOP_ZONES = Object.freeze(['shop', 'garage', 'tractorshed']); // where the workshop card opens (H-U1)
export const inZone = (z, x, zz) => {
  const dx = x - z.x, dz = zz - z.z, c = Math.cos(z.yaw), s = Math.sin(z.yaw);
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  return Math.abs(lx) <= z.hx && Math.abs(lz) <= z.hz;
};

// The static colliders (boxes { half, at, yaw } and cylinders { r, h, at }) of the yard buildings and the fence
export function staticShapes() {
  const out = [], sy = YARD.silo, sh = YARD.shed, b = SILO.bay;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push({ box: [b.post / 2 + 0.1, b.roof / 2, b.post / 2 + 0.1], at: [sy.x + sx * (b.half + 0.2), b.roof / 2, sy.z + sz * b.len] });
  for (const s of SILO.silos) out.push({ cyl: [s.r, s.h], at: [sy.x + s.x, s.h / 2, sy.z + s.z] });
  const w = SHED.wall, d = SHED.depth; // the barn's side walls (both ends are open)
  for (const sx of [-1, 1]) out.push({ box: [w / 2, SHED.eave / 2, d / 2], at: [sh.x + sx * (SHED.half - w / 2), SHED.eave / 2, sh.z] });
  for (const [, s] of Object.entries(SIGNS)) for (const k of [-1, 1]) {
    const c = Math.cos(s.yaw), sn = Math.sin(s.yaw), px = k * (SIGN.w / 2 - 0.2);
    out.push({ box: [SIGN.post, SIGN.y / 2 + SIGN.h / 2, SIGN.post], at: [s.x + px * c, (SIGN.y + SIGN.h / 2) / 2, s.z - px * sn] });
  }
  // the backyard: the farmhouse, the compost bins' back and sides, the dog house, the flower beds (each a box turned by its yaw)
  const turned = (p, hx, hy, hz) => out.push({ box: [hx, hy, hz], at: [p.x, hy, p.z], yaw: p.yaw });
  const B = BACKYARD;
  turned(B.house, FARMHOUSE.w / 2, FARMHOUSE.eave / 2, FARMHOUSE.d / 2);
  turned({ ...B.compost, z: B.compost.z }, COMPOST.w / 2, COMPOST.h / 2, COMPOST.d / 2);
  turned(B.doghouse, DOGHOUSE.w / 2, DOGHOUSE.h / 2, DOGHOUSE.d / 2);
  for (const b of B.beds) turned(b, FLOWERBED.w / 2, FLOWERBED.h / 2 + 0.1, FLOWERBED.d / 2);
  turned(B.bench, WORKBENCH.w / 2 + 0.5, WORKBENCH.h / 2, WORKBENCH.d / 2 + 0.25); // the workbench, its drum and its pegboard
  // the meadow: the hay barn's side walls, the tractor's workbench
  const M = MEADOW, hb = HAYBARN;
  for (const sx of [-1, 1]) out.push({ box: [hb.wall / 2, hb.eave / 2, hb.depth / 2], at: [M.barn.x + sx * (hb.half - hb.wall / 2), hb.eave / 2, M.barn.z] });
  turned(M.bench, WORKBENCH.w / 2 + 0.5, WORKBENCH.h / 2, WORKBENCH.d / 2 + 0.25);
  // the inner fences between their gates (the gates themselves are the farm's: they open), and the outer fence
  const f = FARM.fence;
  for (const fence of FENCES) for (const [x0, z0, x1, z1] of fenceSegments(fence)) out.push({ box: [Math.max(f, (x1 - x0) / 2), 0.6, Math.max(f, (z1 - z0) / 2)], at: [(x0 + x1) / 2, 0.6, (z0 + z1) / 2], wall: true });
  const { x0, x1, z0, z1 } = FARM, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, hx = (x1 - x0) / 2, hz = (z1 - z0) / 2;
  for (const [bx, bz, x, z] of [[hx, f, cx, z1], [hx, f, cx, z0], [f, hz, x1, cz], [f, hz, x0, cz]]) out.push({ box: [bx, 0.6, bz], at: [x, 0.6, z], wall: true });
  return out;
}
