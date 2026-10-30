// Farm layout on a 2.4 m fence-tile grid. Pure data: shared by physics, flow fields and rendering.
import { COOP, BARN, CLINIC } from './defs/buildings.js';
export const L = 2.4;               // one Kenney fence tile, scaled
export const FENCE_H = 0.84;        // fence height after scaling
export const TX = tx => (tx - 7.5) * L;
export const TZ = tz => (tz - 6) * L;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0; let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// lay.region's answers past the pens' ids (0–4): the T-shaped aisle, the open field, inside the barn
export const REGION = { aisle: 5, field: 6, barn: 7, count: 8 };

export function buildLayout() {
  // ---- fence edges ------------------------------------------------------
  const edges = [];  // {x, z, dir:'x'|'z', kind:'fence'|'gate'|'planks', len}
  const hRun = (tz, tx0, tx1, kind, gates = []) => { for (let tx = tx0; tx < tx1; tx++) edges.push({ x: TX(tx + 0.5), z: TZ(tz), dir: 'x', kind: gates.includes(tx) ? 'gate' : kind }); };
  const vRun = (tx, tz0, tz1, kind, gates = []) => { for (let tz = tz0; tz < tz1; tz++) edges.push({ x: TX(tx), z: TZ(tz + 0.5), dir: 'z', kind: gates.includes(tz) ? 'gate' : kind }); };

  // Pen complex (2.6.1): the aisles are an upside-down T. The lane runs across between the rows (out to the mud on the
  // west); its stem runs up the middle of the north row, open to the barn's doors. Two wide pens either side of the stem,
  // three below the lane.
  hRun(0, 0, 6, 'fence'); hRun(0, 9, 15, 'fence'); hRun(12, 0, 15, 'fence');
  hRun(5, 0, 6, 'fence', [2]); hRun(5, 9, 15, 'fence', [12]); hRun(7, 0, 15, 'fence', [2, 7, 12]);
  vRun(0, 0, 5, 'fence', [2]); vRun(0, 5, 7, 'fence', [5, 6]); vRun(0, 7, 12, 'fence');
  vRun(15, 0, 5, 'fence'); vRun(15, 5, 7, 'fence', [5, 6]); vRun(15, 7, 12, 'fence', [9]);
  vRun(6, 0, 5, 'fence', [2]); vRun(9, 0, 5, 'fence', [2]);
  vRun(5, 7, 12, 'fence', [9]); vRun(10, 7, 12, 'fence', [9]);
  // Chicken run against the north boundary, with one gate toward the pens (2.6.0: five tiles west, so the barn east of it
  // stands in the middle of the north row, v3 §3.1)
  hRun(-2, -3, 4, 'fence', [1]); vRun(-3, -5, -2, 'fence'); vRun(4, -5, -2, 'fence');
  // Field boundary
  hRun(-5, -5, 20, 'planks'); hRun(17, -5, 20, 'planks');
  vRun(-5, -5, 17, 'planks'); vRun(20, -5, 17, 'planks');

  // ---- regions -----------------------------------------------------------
  const rect = (tx0, tz0, tx1, tz1) => ({ x0: TX(tx0), z0: TZ(tz0), x1: TX(tx1), z1: TZ(tz1) });
  const pens = []; // 0, 1: the north row's two (either side of the stem); 2, 3, 4: the south row
  for (const [row, col, tx0, tx1] of [[0, 0, 0, 6], [0, 2, 9, 15], [1, 0, 0, 5], [1, 1, 5, 10], [1, 2, 10, 15]]) {
    const tz0 = row === 0 ? 0 : 7;
    const r = rect(tx0, tz0, tx1, tz0 + 5);
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    // Trough sits against the outer (back) wall of each pen.
    const back = row === 0 ? r.z0 : r.z1, inward = row === 0 ? 1 : -1;
    pens.push({ id: pens.length, row, col, ...r, cx, cz,
      trough: { x: cx + (col - 1) * 1.6, z: back + inward * 0.62, inward, len: 2.3, w: 0.62 } });
  }
  const lane = rect(0, 5, 15, 7), stem = rect(6, 0, 9, 5); // the T's bar and its stem: one aisle region
  const field = rect(-5, -5, 20, 17);
  const complex = rect(0, 0, 15, 12);
  const wallow = { x: TX(-2.6), z: TZ(4.4), rx: 3.4, rz: 2.6 };
  const run = rect(-3, -5, 4, -2);
  // the coop stands at the run's east end (v3 §3.1; src/defs/buildings.js), the nest boxes where it stood
  const coop = { x: COOP.x, z: COOP.z, hx: COOP.hx, hz: COOP.hz, h: COOP.eave, doorX: COOP.x + COOP.popDoor.x, doorZ: COOP.z + COOP.hz,
    rampZ: COOP.z + COOP.rampZ, open: true };
  // the coop door's tap volume: the whole front wall up to the eave, from just inside it out over the ramp (the roof above
  // is the coop's building volume: a tap there goes in)
  coop.pick = { x0: coop.x - coop.hx - 0.15, x1: coop.x + coop.hx + 0.15, y0: 0, y1: COOP.eave, z0: coop.z + coop.hz - 0.3, z1: coop.rampZ + 0.25 };
  // inside the coop (v3 §5.5) only the pop door itself toggles it, so a tap on the grass round it still goes back out
  { const d = COOP.popDoor, f = coop.z + coop.hz;
    coop.popPick = { x0: coop.doorX - d.w / 2 - 0.15, x1: coop.doorX + d.w / 2 + 0.15, y0: COOP.floor - 0.1, y1: COOP.floor + d.h * 2 + 0.1, z0: f - 0.3, z1: f + 0.3 }; }
  const nests = [-24.4, -23.6, -22.8, -22.0].map((x, i) => ({ id: i, x, z: -25.95, ax: x, az: -25.2 }));
  const dust = { x: -17.6, z: -22.5, r: 1.15 };

  // ---- gates: merge neighbouring gate tiles into one gate (double gates at the lane ends)
  const gates = [];
  for (const e of edges.filter(e => e.kind === 'gate')) {
    const g = gates.find(g => g.dir === e.dir && (e.dir === 'x' ? Math.abs(g.z - e.z) < 0.01 && Math.abs(g.x1 - (e.x - L / 2)) < 0.01 : Math.abs(g.x - e.x) < 0.01 && Math.abs(g.z1 - (e.z - L / 2)) < 0.01));
    if (g) { g.tiles.push(e); if (e.dir === 'x') g.x1 = e.x + L / 2; else g.z1 = e.z + L / 2; }
    else gates.push({ id: gates.length, dir: e.dir, tiles: [e], x: e.x, z: e.z, x0: e.x - L / 2, x1: e.x + L / 2, z0: e.z - L / 2, z1: e.z + L / 2, open: true });
  }
  for (const g of gates) {
    if (g.dir === 'x') { g.x = (g.x0 + g.x1) / 2; g.z0 = g.z1 = g.z; } else { g.z = (g.z0 + g.z1) / 2; g.x0 = g.x1 = g.x; }
    g.width = g.tiles.length * L;
    g.run = g.z < run.z1 + 0.1 && g.x > run.x0 && g.x < run.x1;
    // which side of its line the leaves swing to (the gate frame's n axis): −n, except gates across a lane or pen east of
    // the middle, which mirror their western twins (2.6.1: the lane's east gate swung in over the lane's fences)
    g.swing = g.dir === 'z' && g.x > 0.01 ? 1 : -1;
    // the leaves (one per tile): a double gate hinges at both ends, a single one at a side picked from its position
    const hw = g.width / 2;
    g.leaves = g.tiles.map((tile, k) => {
      const side = g.tiles.length > 1 ? (k === 0 ? -1 : 1) : (((Math.round(g.x * 7 + g.z * 3) % 2) + 2) % 2 ? 1 : -1);
      return { side, hingeX: g.tiles.length > 1 ? side * hw : side * (hw - 0.04) };
    });
    // tap volumes (world boxes { x0, x1, y0, y1, z0, z1 }), generous so a gate is easy to hit: the gateway where the
    // leaves shut, and where each leaf lies open (folded back beside the fence, on the gate's -z side as farm3d swings it)
    const box = (a0, a1, n0, n1) => g.dir === 'x' // gate frame (along a, across n) → world; dir z is the frame turned +90°
      ? { x0: g.x + a0, x1: g.x + a1, y0: 0, y1: 1.3, z0: g.z + n0, z1: g.z + n1 }
      : { x0: g.x + n0, x1: g.x + n1, y0: 0, y1: 1.3, z0: g.z - a1, z1: g.z - a0 };
    g.pick = [box(-hw - 0.1, hw + 0.1, -0.45, 0.45)];
    const [n0, n1] = g.swing < 0 ? [-0.9, 0.35] : [-0.35, 0.9];
    for (const l of g.leaves) { const a = l.hingeX, b = l.hingeX + l.side * L; g.pick.push(box(Math.min(a, b), Math.max(a, b), n0, n1)); }
  }

  // ---- the barn's double door: a gate of its own (v3 §6), two leaves hinged at the opening's sides that swing out (+z);
  // buildings3d draws it (farm3d skips kind 'barn'), the sim opens and shuts it like any gate
  const barnFront = BARN.z + BARN.d / 2;
  {
    const hw = BARN.door.w / 2, x = BARN.x, z = barnFront, y1 = BARN.door.h;
    gates.push({ id: gates.length, kind: 'barn', dir: 'x', tiles: [], x, z, x0: x - hw, x1: x + hw, z0: z, z1: z, width: BARN.door.w, run: false, open: true, swing: 1,
      leaves: [{ side: -1, hingeX: -hw }, { side: 1, hingeX: hw }],
      // the doorway where the leaves shut, and each open leaf standing out from its hinge
      pick: [{ x0: x - hw - 0.1, x1: x + hw + 0.1, y0: 0, y1, z0: z - 0.45, z1: z + 0.45 },
        ...[-1, 1].map(sd => ({ x0: x + sd * hw - 0.3, x1: x + sd * hw + 0.3, y0: 0, y1, z0: z, z1: z + hw + 0.2 }))] });
  }

  // ---- buildings (v3 §3, §5): world footprint, the walls' colliders, and two tap volumes: `roof` (everything above the
  // eave) and `body` (the whole building; the coop's is its roof only, as its front wall is the pop door's)
  const buildings = [];
  const addBuilding = (id, B, { eave, ridge, overhang }) => {
    const hx = (B.w ?? B.hx * 2) / 2, hz = (B.d ?? B.hz * 2) / 2, o = overhang + 0.1;
    const box = { x0: B.x - hx, x1: B.x + hx, z0: B.z - hz, z1: B.z + hz };
    // the coop's roof stops at its front wall and starts just above the eave: everything in front is the pop door's
    const roof = id === 'coop' ? { x0: box.x0 - o, x1: box.x1 + o, y0: eave + 0.1, y1: ridge + 0.15, z0: box.z0 - o, z1: box.z1 }
      : { x0: box.x0 - o, x1: box.x1 + o, y0: eave - 0.15, y1: ridge + 0.15, z0: box.z0 - o, z1: box.z1 + o };
    const body = id === 'coop' ? roof : { ...box, y0: 0, y1: ridge + 0.15 };
    buildings.push({ id, x: B.x, z: B.z, hx, hz, eave, ridge, ...box, roof, body });
  };
  addBuilding('coop', COOP, COOP); addBuilding('barn', BARN, BARN); addBuilding('clinic', CLINIC, CLINIC);
  const barn = buildings[1], clinic = buildings[2];
  barn.inner = { x0: BARN.x + BARN.inner.x0, x1: BARN.x + BARN.inner.x1, z0: BARN.z + BARN.inner.z0, z1: BARN.z + BARN.inner.z1 };
  // the name plaques' tap volumes (v3 §5.5: a tap on one opens its owner's card), by stall and by perch
  const plaqueBox = ([x, y, z], { w, h }, pad = 0.06) => ({ x0: x - w / 2 - pad, x1: x + w / 2 + pad, y0: y - h / 2 - pad, y1: y + h / 2 + pad, z0: z - 0.1, z1: z + 0.1 });
  barn.plaques = BARN.stalls.map(s => plaqueBox([BARN.x + s.plaque[0], s.plaque[1], BARN.z + s.plaque[2]], BARN.plaque));
  // the clinic's working things' tap volumes (2.9.0: the shower, the sinks, the toilet, the laptop, the fridge)
  clinic.props = Object.entries(CLINIC.props).map(([id, { box: [[x0, x1], [y0, y1], [z0, z1]] }]) =>
    ({ id, x0: CLINIC.x + x0, x1: CLINIC.x + x1, y0, y1, z0: CLINIC.z + z0, z1: CLINIC.z + z1 }));
  buildings[0].plaques = Array.from({ length: COOP.perches }, (_, k) => { const [x, y, z] = COOP.plaqueAt(k); return plaqueBox([COOP.x + x, y, COOP.z + z], COOP.plaque, 0.03); });

  // ---- static obstacles (physics + flow-field rasterisation) ---------------
  const obstacles = [];  // {type:'box', x,z,hx,hz,h,rot} | {type:'circle', x,z,r,h}
  const T = 0.09; // fence half-thickness
  for (const e of edges) {
    const along = e.dir === 'x';
    if (e.kind === 'gate') continue; // gates are added below as merged spans
    {
      const h = e.kind === 'planks' ? 3.0 : FENCE_H; // field boundary is tall (invisible above planks) so thrown pigs stay on the farm
      obstacles.push({ type: 'box', x: e.x, z: e.z, hx: along ? L / 2 : T, hz: along ? T : L / 2, h, fence: true });
    }
  }
  for (const g of gates) {
    const along = g.dir === 'x', hw = g.width / 2;
    for (const s of [-1, 1]) obstacles.push({ type: 'box', x: g.x + (along ? s * (hw - 0.08) : 0), z: g.z + (along ? 0 : s * (hw - 0.08)), hx: along ? 0.1 : T, hz: along ? T : 0.1, h: FENCE_H, fence: true });
    g.barrier = { type: 'box', x: g.x, z: g.z, hx: along ? hw : T, hz: along ? T : hw, h: FENCE_H, fence: true, gate: g.id, active: false };
    obstacles.push(g.barrier);
  }
  obstacles.push({ type: 'box', x: coop.x, z: coop.z, hx: coop.hx, hz: coop.hz, h: coop.h, coop: true });
  // the barn: four walls round the open doorway (the door is its gate's barrier), and the low stall dividers
  {
    const B = BARN, t = B.wall / 2, h = B.eave, hx = B.w / 2, hz = B.d / 2, hw = B.door.w / 2, x = B.x, z = B.z;
    obstacles.push({ type: 'box', x, z: z - hz + t, hx, hz: t, h, building: 'barn' });
    for (const sd of [-1, 1]) {
      obstacles.push({ type: 'box', x: x + sd * (hx - t), z, hx: t, hz, h, building: 'barn' });
      const w = (hx - hw) / 2; obstacles.push({ type: 'box', x: x + sd * (hw + w), z: z + hz - t, hx: w, hz: t, h, building: 'barn' });
    }
    // a divider on each stall's east side, unless the barn wall is there; the front rows' door-side stalls get one at the doorway
    const dv = B.stall.divider / 2;
    for (const st of B.stalls) for (const ex of [st.x0, st.x1]) {
      if (Math.abs(Math.abs(ex) - B.inner.x1) < 0.01) continue;           // the side wall
      if (ex === st.x0 && B.stalls.some(o => o !== st && o.row === st.row && Math.abs(o.x1 - ex) < 0.01)) continue; // its neighbour's
      obstacles.push({ type: 'box', x: x + ex, z: z + (st.z0 + st.z1) / 2, hx: dv, hz: (st.z1 - st.z0) / 2, h: B.stall.dividerH, building: 'barn', divider: st.id });
    }
  }
  // the clinic: one solid block (nothing walks in; patients are set down inside, v3 §9)
  obstacles.push({ type: 'box', x: clinic.x, z: clinic.z, hx: clinic.hx, hz: clinic.hz, h: CLINIC.eave, building: 'clinic' });
  for (const p of pens) obstacles.push({ type: 'box', x: p.trough.x, z: p.trough.z, hx: p.trough.len / 2, hz: p.trough.w / 2, h: 0.42, trough: p.id });

  // ---- decor -------------------------------------------------------------
  const rng = mulberry32(7);
  const decor = []; // {m, x, z, rot, s, solid?:radius}
  const addSolid = (m, x, z, rot, s, r) => { decor.push({ m, x, z, rot, s }); obstacles.push({ type: 'circle', x, z, r, h: 2 }); };
  // hay bales in pen corners (away from gates)
  const hayCorners = [[0, 1], [1, 1], [0, 0], [1, 1], [0, 1]];
  for (const p of pens) {
    const [hx, hz] = hayCorners[p.id];
    const x = hx ? p.x1 - 1.2 : p.x0 + 1.2, z = (p.row === 0 ? (hz ? p.z1 - 1.6 : p.z0 + 2.2) : (hz ? p.z1 - 2.2 : p.z0 + 1.6));
    const rot = rng() < 0.5 ? 0 : Math.PI / 2;
    decor.push({ m: 'hay', x, z, rot, s: 2.4 });
    obstacles.push({ type: 'box', x, z, hx: rot ? 0.5 : 0.72, hz: rot ? 0.72 : 0.5, h: 0.9 });
  }
  // water barrels next to troughs
  for (const p of pens) { const t = p.trough; const bx = t.x + (t.len / 2 + 0.75) * (p.col === 2 ? -1 : 1); decor.push({ m: 'barrel', x: bx, z: t.z, rot: rng() * 6, s: 1.45, upright: true }); obstacles.push({ type: 'circle', x: bx, z: t.z, r: 0.52, h: 1.1 }); }
  // field: a few shade trees, a hay stack and Biscuit's dog house on the right, its door toward the farm
  const dogHouse = { x: TX(18.4), z: -10.5, s: 1.5, rot: -0.6 }; // the door faces (sin rot, cos rot); the front wall is 0.77 s out
  { const { x, z, s, rot } = dogHouse; decor.push({ m: 'dogHouse', x, z, rot, s }); obstacles.push({ type: 'box', x, z, hx: 0.66 * s, hz: 0.77 * s, h: 1.5 * s, rot, dogHouse: true }); }
  addSolid('oak', 26.5, -21, 0.4, 3.2, 0.45); // east of the clinic (the run took its corner, 2.6.0)
  addSolid('tree', TX(18), TZ(14.5), 1.2, 3.4, 0.4);
  addSolid('treeFat', -26, 9, 2.0, 3.0, 0.45);   // moved off the clinic's corner (v3 §3.2)
  addSolid('oak', TX(4), TZ(15), 2.6, 3.0, 0.45);
  { const x = -26.5, z = -16; decor.push({ m: 'hayB', x, z, rot: 0.3, s: 2.4 }); obstacles.push({ type: 'box', x, z, hx: 0.75, hz: 0.75, h: 1.2, rot: 0.3 }); } // off the barn's floor
  // chicken run props
  decor.push({ m: 'sack', x: TX(1.5) + 2.0, z: run.z1 - 0.45, rot: 0.4, s: 1.3 });
  decor.push({ m: 'sack', x: TX(1.5) + 2.5, z: run.z1 - 0.5, rot: -0.3, s: 1.2 });
  for (let i = 0; i < 9; i++) decor.push({ m: 'wheat', x: 24.0 - (i % 3) * 1.1, // east of the clinic (2.9.0: it grew 4 m)
     z: TZ(-4.3) + Math.floor(i / 3) * 1.1, rot: rng() * 6, s: 2.4 });
  // scenery beyond the boundary (no collision)
  for (let i = 0; i < 70; i++) {
    const a = rng() * Math.PI * 2, rr = 40 + rng() * 45;
    const x = Math.cos(a) * rr * 1.15, z = Math.sin(a) * rr;
    if (Math.abs(x) < 33 && Math.abs(z) < 29) continue;
    const m = ['oak', 'tree', 'treeFat', 'treeFall', 'tree', 'oak'][Math.floor(rng() * 6)];
    decor.push({ m, x, z, rot: rng() * 6, s: 3 + rng() * 2.5 });
  }
  // corn and pumpkin patch outside the far boundary
  for (let i = 0; i < 9; i++) for (let j = 0; j < 4; j++) decor.push({ m: 'corn', x: -20 + i * 2.2 + (rng() - 0.5) * 0.3, z: -31 - j * 1.6, rot: rng() * 6, s: 2.6 });
  for (let i = 0; i < 10; i++) decor.push({ m: 'pumpkin', x: 6 + rng() * 14, z: -31 - rng() * 5, rot: rng() * 6, s: 2.5 });
  // grass tufts, flowers, rocks scattered in the field (walk-through)
  const inPenOrLane = (x, z) => (x > complex.x0 - 0.3 && x < complex.x1 + 0.3 && z > complex.z0 - 0.3 && z < complex.z1 + 0.3) || (x > run.x0 - 0.3 && x < run.x1 + 0.3 && z > run.z0 && z < run.z1 + 0.3)
    || buildings.some(b => x > b.x0 - 0.8 && x < b.x1 + 0.8 && z > b.z0 - 0.3 && z < b.z1 + 1.2);
  for (let i = 0; i < 160; i++) {
    const x = (rng() - 0.5) * 120, z = (rng() - 0.5) * 110;
    if (inPenOrLane(x, z)) continue;
    if (Math.abs(x - wallow.x) < wallow.rx + 0.5 && Math.abs(z - wallow.z) < wallow.rz + 0.5) continue;
    const r = rng();
    const m = r < 0.45 ? 'grass' : r < 0.7 ? 'grassS' : r < 0.82 ? 'flowerY' : r < 0.94 ? 'flowerR' : 'bushS';
    decor.push({ m, x, z, rot: rng() * 6, s: 2 + rng() });
  }
  for (let i = 0; i < 26; i++) {
    const x = (rng() - 0.5) * 150, z = (rng() - 0.5) * 140;
    if (Math.abs(x) < 32 && Math.abs(z) < 28) continue;
    decor.push({ m: rng() < 0.5 ? 'bush' : 'rock', x, z, rot: rng() * 6, s: 2.5 + rng() * 2 });
  }

  // Flow-field destinations
  const destinations = [
    ...pens.map(p => ({ kind: 'pen', pen: p.id, x: p.cx, z: p.cz, r: 2.4 })),
    { kind: 'wallow', x: wallow.x, z: wallow.z, r: 2.0 },
  ];

  function region(x, z) {
    for (const p of pens) if (x > p.x0 && x < p.x1 && z > p.z0 && z < p.z1) return p.id;
    if ((x > lane.x0 && x < lane.x1 && z > lane.z0 && z < lane.z1) || (x > stem.x0 && x < stem.x1 && z > stem.z0 && z < stem.z1)) return REGION.aisle;
    const b = barn.inner; if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) return REGION.barn;
    return REGION.field;
  }

  return { edges, gates, pens, lane, stem, field, complex, wallow, run, coop, nests, dust, dogHouse, buildings, barn, clinic, obstacles, decor, destinations, region };
}
