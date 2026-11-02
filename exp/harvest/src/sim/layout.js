// The farm's layout (H-F1..H-F4, H-F7). Sim-pure data and small geometry helpers: where the fields, the silo, the barn, the backyard
// and the signs stand, and the zones the vehicles drive into. +z is north; the yard is round the origin, the backyard south of it.
import { SILO, SHED, SIGN, FARMHOUSE, COMPOST, DOGHOUSE, FLOWERBED, GATE, GARAGE, WORKBENCH } from '../defs/models.js';

export const FARM = Object.freeze({ half: 80, fence: 0.3 }); // the fence runs round ±half

// Fields: an axis-aligned rectangle of w × h square cells `size` m across, x0/z0 the south-west corner. The backyard's are fine
// (0.5 m cells: the mower's deck is narrow), the grain fields 1 m.
const field = (crop, x0, z0, w, h, size = 1) => Object.freeze({ crop, x0, z0, w, h, size });
export const FIELDS = Object.freeze({
  lawn: field('lawn', -26, -61, 60, 48, 0.5),          // 30 × 24 m, between the backyard fence and the farmhouse
  longgrass: field('longgrass', 22, -72, 48, 40, 0.5), // 24 × 20 m, south-east
  clover: field('clover', -52, -72, 40, 40, 0.5),      // 20 × 20 m, south-west
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
// workshop: an open pad to drive across, a workbench on its east side facing it) east of them, a dog house and two flower beds by
// the porch. The mower starts by the
// compost, facing the lawn.
export const BACKYARD = Object.freeze({
  fence: -34.5, gate: Object.freeze({ x: 0, z: -34.5, half: GATE.half }),
  garage: Object.freeze({ x: 24, z: -41, yaw: 0 }),
  bench: Object.freeze({ x: 24 + GARAGE.hx + 0.3 + WORKBENCH.d / 2, z: -41, yaw: -Math.PI / 2 }),
  house: Object.freeze({ x: -6, z: -70, yaw: 0 }),
  compost: Object.freeze({ x: 14, z: -47, yaw: 0 }),
  doghouse: Object.freeze({ x: -22, z: -62, yaw: 0.3 }),
  beds: Object.freeze([Object.freeze({ x: -14, z: -62.5, yaw: 0 }), Object.freeze({ x: 2, z: -62.5, yaw: 0 })]),
  start: Object.freeze({ x: 7, z: -41, yaw: -Math.PI / 2 }),
});

// Field signs (H-F6): beside each field, out of the way, facing the way in (a sign's front faces +z turned by yaw).
export const SIGNS = Object.freeze({
  // the backyard's: the lawn's against the fence, facing into the backyard; the others at their fields' outer corners, clear of the
  // path between the lawn, the compost bins and the garage
  lawn: Object.freeze({ x: -14, z: -35.4, yaw: Math.PI }),
  longgrass: Object.freeze({ x: 48.5, z: -50.5, yaw: 0 }),
  clover: Object.freeze({ x: -54.5, z: -50.5, yaw: 0 }),
  wheat: Object.freeze({ x: 8, z: 19.5, yaw: Math.PI }),
  corn: Object.freeze({ x: 23.5, z: 11.5, yaw: -Math.PI / 2 }),
  sunflower: Object.freeze({ x: -23.5, z: 11.5, yaw: Math.PI / 2 }),
});

// Zones the combine's centre drives into: { x, z, yaw, hx, hz } (half sizes in the zone's own frame)
export const ZONES = Object.freeze({
  sell: Object.freeze({ x: YARD.silo.x, z: YARD.silo.z, yaw: YARD.silo.yaw, hx: SILO.bay.half - 0.6, hz: SILO.bay.len - 0.5 }),
  shop: Object.freeze({ x: YARD.shed.x, z: YARD.shed.z, yaw: YARD.shed.yaw, hx: SHED.half - 1, hz: SHED.depth / 2 - 1 }),
  garage: Object.freeze({ x: BACKYARD.garage.x, z: BACKYARD.garage.z, yaw: 0, hx: GARAGE.hx, hz: GARAGE.hz }),
  // in front of the compost bins' open side: the mower drives along them
  compost: Object.freeze({ x: BACKYARD.compost.x, z: BACKYARD.compost.z + COMPOST.d / 2 + 2.2, yaw: 0, hx: COMPOST.w / 2, hz: 2.2 }),
});
export const SELL_ZONES = Object.freeze(['sell', 'compost']); // where a bin over the zone unloads (H-S1)
export const SHOP_ZONES = Object.freeze(['shop', 'garage']);  // where the workshop card opens (H-U1)
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
  // the backyard fence, either side of the gate (the gate itself is the farm's: it opens)
  const H = FARM.half, f = FARM.fence, gx0 = B.gate.x - B.gate.half - GATE.post, gx1 = B.gate.x + B.gate.half + GATE.post;
  out.push({ box: [(gx0 + H) / 2, 0.6, f], at: [(gx0 - H) / 2, 0.6, B.fence], wall: true }, { box: [(H - gx1) / 2, 0.6, f], at: [(H + gx1) / 2, 0.6, B.fence], wall: true });
  for (const [hx, hz, x, z] of [[H, f, 0, H], [H, f, 0, -H], [f, H, H, 0], [f, H, -H, 0]]) out.push({ box: [hx, 0.6, hz], at: [x, 0.6, z], wall: true });
  return out;
}
