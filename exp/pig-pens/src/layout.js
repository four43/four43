// Farm layout on a 2.4 m fence-tile grid. Pure data: shared by physics, flow fields and rendering.
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

export function buildLayout() {
  // ---- fence edges ------------------------------------------------------
  const edges = [];  // {x, z, dir:'x'|'z', kind:'fence'|'gate'|'planks', len}
  const hRun = (tz, tx0, tx1, kind, gates = []) => { for (let tx = tx0; tx < tx1; tx++) edges.push({ x: TX(tx + 0.5), z: TZ(tz), dir: 'x', kind: gates.includes(tx) ? 'gate' : kind }); };
  const vRun = (tx, tz0, tz1, kind, gates = []) => { for (let tz = tz0; tz < tz1; tz++) edges.push({ x: TX(tx), z: TZ(tz + 0.5), dir: 'z', kind: gates.includes(tz) ? 'gate' : kind }); };

  // Pen complex: two rows of three pens with a lane between them.
  hRun(0, 0, 15, 'fence'); hRun(12, 0, 15, 'fence');
  hRun(5, 0, 15, 'fence', [2, 7, 12]); hRun(7, 0, 15, 'fence', [2, 7, 12]);
  vRun(0, 0, 5, 'fence', [2]); vRun(0, 5, 7, 'fence', [5, 6]); vRun(0, 7, 12, 'fence');
  vRun(15, 0, 5, 'fence'); vRun(15, 5, 7, 'fence', [5, 6]); vRun(15, 7, 12, 'fence', [9]);
  vRun(5, 0, 5, 'fence', [2]); vRun(10, 0, 5, 'fence', [2]);
  vRun(5, 7, 12, 'fence', [9]); vRun(10, 7, 12, 'fence', [9]);
  // Chicken run against the north boundary, with one gate toward the pens
  hRun(-2, 2, 9, 'fence', [6]); vRun(2, -5, -2, 'fence'); vRun(9, -5, -2, 'fence');
  // Field boundary
  hRun(-5, -5, 20, 'planks'); hRun(17, -5, 20, 'planks');
  vRun(-5, -5, 17, 'planks'); vRun(20, -5, 17, 'planks');

  // ---- regions -----------------------------------------------------------
  const rect = (tx0, tz0, tx1, tz1) => ({ x0: TX(tx0), z0: TZ(tz0), x1: TX(tx1), z1: TZ(tz1) });
  const pens = [];
  for (let row = 0; row < 2; row++) for (let col = 0; col < 3; col++) {
    const tz0 = row === 0 ? 0 : 7, tx0 = col * 5;
    const r = rect(tx0, tz0, tx0 + 5, tz0 + 5);
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    // Trough sits against the outer (back) wall of each pen.
    const back = row === 0 ? r.z0 : r.z1, inward = row === 0 ? 1 : -1;
    pens.push({ id: pens.length, row, col, ...r, cx, cz,
      trough: { x: cx + (col - 1) * 1.6, z: back + inward * 0.62, inward, len: 2.3, w: 0.62 } });
  }
  const lane = rect(0, 5, 15, 7);
  const field = rect(-5, -5, 20, 17);
  const complex = rect(0, 0, 15, 12);
  const wallow = { x: TX(-2.6), z: TZ(4.4), rx: 3.4, rz: 2.6 };
  const run = rect(2, -5, 9, -2);
  const coop = { x: -10.9, z: -25.05, hx: 1.5, hz: 1.15, h: 2.0, doorX: -10.5, doorZ: -23.9, rampZ: -22.95, open: true };
  const nests = [-0.6, 0.2, 1.0, 1.8].map((x, i) => ({ id: i, x, z: -25.95, ax: x, az: -25.2 }));
  const dust = { x: -5.6, z: -22.5, r: 1.15 };
  const tractorSpawn = { x: TX(18.2), z: TZ(7.5), yaw: -0.5 };

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
  }

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
  for (const p of pens) obstacles.push({ type: 'box', x: p.trough.x, z: p.trough.z, hx: p.trough.len / 2, hz: p.trough.w / 2, h: 0.42, trough: p.id });

  // ---- decor -------------------------------------------------------------
  const rng = mulberry32(7);
  const decor = []; // {m, x, z, rot, s, solid?:radius}
  const addSolid = (m, x, z, rot, s, r) => { decor.push({ m, x, z, rot, s }); obstacles.push({ type: 'circle', x, z, r, h: 2 }); };
  // hay bales in pen corners (away from gates)
  const hayCorners = [[0, 1], [1, 0], [1, 1], [0, 0], [1, 1], [0, 1]];
  for (const p of pens) {
    const [hx, hz] = hayCorners[p.id];
    const x = hx ? p.x1 - 1.2 : p.x0 + 1.2, z = (p.row === 0 ? (hz ? p.z1 - 1.6 : p.z0 + 2.2) : (hz ? p.z1 - 2.2 : p.z0 + 1.6));
    const rot = rng() < 0.5 ? 0 : Math.PI / 2;
    decor.push({ m: 'hay', x, z, rot, s: 2.4 });
    obstacles.push({ type: 'box', x, z, hx: rot ? 0.5 : 0.72, hz: rot ? 0.72 : 0.5, h: 0.9 });
  }
  // water barrels next to troughs
  for (const p of pens) { const t = p.trough; const bx = t.x + (t.len / 2 + 0.75) * (p.col === 2 ? -1 : 1); decor.push({ m: 'barrel', x: bx, z: t.z, rot: rng() * 6, s: 1.45, upright: true }); obstacles.push({ type: 'circle', x: bx, z: t.z, r: 0.52, h: 1.1 }); }
  // field: a few shade trees, hay stack and the tractor
  addSolid('oak', TX(-3), TZ(-3), 0.4, 3.2, 0.45);
  addSolid('tree', TX(18), TZ(14.5), 1.2, 3.4, 0.4);
  addSolid('treeFat', TX(17.5), TZ(-2.5), 2.0, 3.0, 0.45);
  addSolid('oak', TX(4), TZ(15), 2.6, 3.0, 0.45);
  decor.push({ m: 'hayB', x: TX(12), z: TZ(-3), rot: 0.3, s: 2.4 }); obstacles.push({ type: 'box', x: TX(12), z: TZ(-3), hx: 0.75, hz: 0.75, h: 1.2, rot: 0.3 });
  // chicken run props
  decor.push({ m: 'sack', x: TX(6.5) + 2.0, z: run.z1 - 0.45, rot: 0.4, s: 1.3 });
  decor.push({ m: 'sack', x: TX(6.5) + 2.5, z: run.z1 - 0.5, rot: -0.3, s: 1.2 });
  for (let i = 0; i < 9; i++) decor.push({ m: 'wheat', x: TX(-1.2) - (i % 3) * 1.2, z: TZ(-4.3) + Math.floor(i / 3) * 1.1, rot: rng() * 6, s: 2.4 });
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
  const inPenOrLane = (x, z) => (x > complex.x0 - 0.3 && x < complex.x1 + 0.3 && z > complex.z0 - 0.3 && z < complex.z1 + 0.3) || (x > run.x0 - 0.3 && x < run.x1 + 0.3 && z > run.z0 && z < run.z1 + 0.3);
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
    if (x > lane.x0 && x < lane.x1 && z > lane.z0 && z < lane.z1) return 6;
    return 7;
  }

  return { edges, gates, pens, lane, field, complex, wallow, run, coop, nests, dust, tractorSpawn, obstacles, decor, destinations, region };
}
