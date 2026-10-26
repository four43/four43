// Farm generator (spec 4.1-4.7): a 3x3-tile farmyard at the center, two routes that leave by one gate and come back
// by the next gate around, features on route straights, and the farmyard layout (barn, line-up, pond, lanes, obstacles).
import { makeRng } from './rng.js';
import { LINEUP, TALLY } from './showSteps.js';
export const TILE = 36, SIZE = 11, YARD_HALF = 54;
export const TREE_R = { single: 1.5, young: 0.8, bush: 0.9 }; // canopy radius of a breakable tree or bush (T-34)
export const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const C = (SIZE - 1) / 2;
export const GATES = { E: { i: C + 2, j: C, out: 0 }, S: { i: C, j: C + 2, out: 1 }, W: { i: C - 2, j: C, out: 2 }, N: { i: C, j: C - 2, out: 3 } };
const GATE_POINT = { E: [YARD_HALF, 0], S: [0, YARD_HALF], W: [-YARD_HALF, 0], N: [0, -YARD_HALF] };
export const tileCenter = (i, j) => ({ x: (i - C) * TILE, z: (j - C) * TILE });
const inYard = (i, j) => Math.abs(i - C) <= 1 && Math.abs(j - C) <= 1;
const FEATURES = ['mud', 'ramp', 'sprinkler'];
const dirOf = (a, b) => DIRS.findIndex(([di, dj]) => di === b[0] - a[0] && dj === b[1] - a[1]);

// The corner of the farm between two gates (for N and E: i >= C and j <= C), outside the yard and the outer ring.
function regionOf(a, b) {
  const si = Math.sign(GATES[a].i + GATES[b].i - 2 * C), sj = Math.sign(GATES[a].j + GATES[b].j - 2 * C);
  return (i, j) => i >= 1 && j >= 1 && i <= SIZE - 2 && j <= SIZE - 2 && !inYard(i, j) && (i - C) * si >= 0 && (j - C) * sj >= 0;
}

// Random depth-first search for a twisty route (T-24, T-25). Gate tiles are straight: the route leaves the
// first tile in the gate's outward direction and enters the last tile heading into the yard.
export function findRoute(rng, a, b, { min = 8, max = 14, curves = 4 } = {}) {
  const ok = regionOf(a, b), A = GATES[a], B = GATES[b], startIn = A.out, endOut = (B.out + 2) % 4, end = [B.i, B.j];
  const path = [[A.i, A.j]], used = new Set([`${A.i},${A.j}`]); let budget = 20000;
  const valid = () => {
    const dirs = path.map((t, k) => k + 1 < path.length ? dirOf(t, path[k + 1]) : endOut);
    const cv = path.map((t, k) => (k === 0 ? startIn : dirs[k - 1]) !== dirs[k]);
    if (cv.filter(Boolean).length < curves) return false;
    for (let k = 2; k < cv.length; k++) if (cv[k] && cv[k - 1] && cv[k - 2]) return false;
    return true;
  };
  function dfs() {
    if (--budget < 0) return false;
    const cur = path[path.length - 1];
    if (cur[0] === end[0] && cur[1] === end[1]) return path.length >= min && valid();
    if (path.length >= max) return false;
    for (const d of rng.shuffle([0, 1, 2, 3])) {
      if (path.length === 1 && d !== startIn) continue;
      const n = [cur[0] + DIRS[d][0], cur[1] + DIRS[d][1]], key = `${n[0]},${n[1]}`;
      if (used.has(key) || !ok(n[0], n[1])) continue;
      if (n[0] === end[0] && n[1] === end[1] && d !== endOut) continue;
      if (Math.abs(n[0] - end[0]) + Math.abs(n[1] - end[1]) > max - path.length - 1) continue;
      path.push(n); used.add(key);
      if (dfs()) return true;
      path.pop(); used.delete(key);
    }
    return false;
  }
  return dfs() ? path : null;
}

function annotate(path, startIn, endOut) {
  return path.map((t, k) => {
    const inDir = k === 0 ? startIn : dirOf(path[k - 1], t), outDir = k + 1 < path.length ? dirOf(t, path[k + 1]) : endOut;
    return { i: t[0], j: t[1], inDir, outDir, type: k === 0 || k === path.length - 1 ? 'gate' : inDir === outDir ? 'straight' : 'curve' };
  });
}

export function checkRules(routes) {
  const bad = new Set(), all = routes.flatMap(r => r.tiles), count = ty => all.filter(t => t.type === ty).length;
  const isF = t => !!t && FEATURES.includes(t.type), plain = t => !!t && (t.type === 'straight' || t.type === 'gate');
  if (count('mud') < 1 || count('mud') > 2 || count('ramp') < 1 || count('ramp') > 2 || count('sprinkler') !== 1) bad.add('T-18');
  for (const r of routes) {
    const T = r.tiles; if (!T.some(isF)) bad.add('T-18');
    T.forEach((t, k) => {
      if (isF(t) && t.inDir !== t.outDir) bad.add('T-18');
      if (t.type === 'ramp' && !(plain(T[k - 1]) && plain(T[k + 1]))) bad.add('T-19');
      if (isF(t) && (isF(T[k - 1]) || isF(T[k + 1]))) bad.add('T-21');
      if ((k === 0 || k === T.length - 1) && t.type !== 'gate') bad.add('T-22');
      if (t.type === 'sprinkler' && ![2, 3, 4, 5].some(d => T[k - d]?.type === 'mud' || T[k + d]?.type === 'mud')) bad.add('T-20');
    });
  }
  return [...bad];
}

function placeFeatures(routes, rng) {
  const slots = routes.flatMap((r, n) => r.tiles.flatMap((t, k) => t.type === 'straight' ? [[n, k]] : []));
  for (let attempt = 0; attempt < 300; attempt++) {
    const want = [...Array(rng.int(1, 2)).fill('mud'), ...Array(rng.int(1, 2)).fill('ramp'), 'sprinkler'];
    if (slots.length < want.length) return false;
    const trial = routes.map(r => ({ ...r, tiles: r.tiles.map(t => ({ ...t })) }));
    rng.shuffle(slots).slice(0, want.length).forEach(([n, k], idx) => { trial[n].tiles[k].type = want[idx]; });
    if (checkRules(trial).length === 0) { trial.forEach((r, n) => { routes[n].tiles = r.tiles; }); return true; }
  }
  return false;
}

export const segDist = (x, z, l) => {
  const dx = l.bx - l.ax, dz = l.bz - l.az, t = Math.max(0, Math.min(1, ((x - l.ax) * dx + (z - l.az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - l.ax - dx * t, z - l.az - dz * t);
};
export const barnLocal = (barn, x, z) => {
  const fx = Math.sin(barn.yaw), fz = Math.cos(barn.yaw), dx = x - barn.x, dz = z - barn.z;
  return { a: dx * fx + dz * fz, s: dx * fz - dz * fx };
};
// T-36: the drive-through wash in the farmyard: open at both ends along its axis (yaw like the barn's), `half` m from its center to
// each end and `width` m from its center line to each side of the opening; posts stand at the four corners, a brush at each side.
export const WASH = { half: 3.5, width: 4.5, h: 4.4 };
export const inWash = (yard, x, z) => { if (!yard.wash) return false; const { a, s } = barnLocal(yard.wash, x, z); return Math.abs(a) < WASH.half + 1 && Math.abs(s) < WASH.width; };
const inRect = (x, z, R, m) => x > R.x0 - m && x < R.x1 + m && z > R.z0 - m && z < R.z1 + m;
export function yardFree(yard, x, z, r) {
  const b = barnLocal(yard.barn, x, z);
  return Math.abs(x) < YARD_HALF - 2 - r && Math.abs(z) < YARD_HALF - 2 - r && !(Math.abs(b.a) < yard.barn.half + yard.barn.leaf + 2 + r && Math.abs(b.s) < 7 + r)
    && !inRect(x, z, yard.lineup, 2 + r) && !(yard.tally && inRect(x, z, yard.tally, 1 + r)) && !(yard.wash && Math.abs(barnLocal(yard.wash, x, z).a) < WASH.half + 4 + r && Math.abs(barnLocal(yard.wash, x, z).s) < WASH.width + 3 + r) && Math.hypot(x - yard.pond.x, z - yard.pond.z) > yard.pond.r + 2 + r && yard.lanes.every(l => segDist(x, z, l) > 5 + r);
}

// Farmyard (4.7): drive-through barn at the center, the line-up (bare ground, T-29) beside one exit, the duck pond in a corner, clear lanes
// from each gate to a barn end, then obstacles placed at random outside all of those.
export function layoutYard(rng) {
  const yaw = rng.chance(0.5) ? 0 : Math.PI / 2, f = [Math.sin(yaw), Math.cos(yaw)], r = [Math.cos(yaw), -Math.sin(yaw)];
  const end = rng.chance(0.5) ? 1 : -1, side = rng.chance(0.5) ? 1 : -1;
  const W = (a, s) => ({ x: f[0] * a + r[0] * s, z: f[1] * a + r[1] * s });
  const rect = (a0, a1, s0, s1) => { const p = W(a0, s0), q = W(a1, s1); return { x0: Math.min(p.x, q.x), x1: Math.max(p.x, q.x), z0: Math.min(p.z, q.z), z1: Math.max(p.z, q.z) }; };
  const barn = { x: 0, z: 0, yaw, half: 6, width: 5, leaf: 5 }; // leaf: the open door leaves stand this far out from each end, in line with the walls
  const lineup = rect(end * 8, end * 24, side * 8.5, side * 15.5); // where the animals stand for the show (16 x 7 m, F-12): ground only
  // F-14: room for the tally circle, past the line-up on the show's screen-left (the show camera looks back along -side, so screen left is +side along the axis)
  const reach = LINEUP.len / 2 + TALLY.gap + 2 * TALLY.rMax, tally = rect(end * 16 + side * LINEUP.len / 2, end * 16 + side * reach, side * (12 - TALLY.rMax), side * (12 + TALLY.rMax));
  const lanes = Object.entries(GATE_POINT).map(([gate, [gx, gz]]) => {
    const along = gx * f[0] + gz * f[1], e = W(Math.abs(along) > 1 ? Math.sign(along) * 6 : -end * 6, 0); // side gates use the far end, away from the line-up
    return { gate, ax: gx, az: gz, bx: e.x, bz: e.z };
  });
  const pc = YARD_HALF - 14, pond = { x: (rng.chance(0.5) ? 1 : -1) * pc, z: (rng.chance(0.5) ? 1 : -1) * pc, r: 7 }; // A-5: a corner, 7 m in from the fence
  const wp = W(end * 12, -side * 16), wash = { x: wp.x, z: wp.z, yaw }; // T-36: beside the barn on the side away from the line-up, parallel to it, clear of the lanes
  const yard = { half: YARD_HALF, barn, end, side, lineup, tally, pond, wash, lanes, obstacles: [] };
  for (const [kind, n, rad] of [['bale', 8, 0.9], ['cone', 16, 0.3], ['barrel', 8, 0.45]]) { // no fixed posts (T-31)
    for (let m = 0, placed = 0; placed < n && m < 2000; m++) {
      const x = rng.range(-YARD_HALF, YARD_HALF), z = rng.range(-YARD_HALF, YARD_HALF);
      if (!yardFree(yard, x, z, rad) || yard.obstacles.some(o => Math.hypot(o.x - x, o.z - z) < o.r + rad + 2)) continue;
      yard.obstacles.push({ kind, x, z, yaw: rng.range(0, Math.PI * 2), r: rad }); placed++;
    }
  }
  // T-31, T-34: 18 trees (10 large singles and young trees in groups of 3, 3 and 2, each group placed as one blob) and 16 bushes
  const spaced = (x, z, rad) => yardFree(yard, x, z, rad) && !yard.obstacles.some(o => Math.hypot(o.x - x, o.z - z) < o.r + rad + 2);
  const find = rad => { for (let m = 0; m < 2000; m++) { const x = rng.range(-YARD_HALF, YARD_HALF), z = rng.range(-YARD_HALF, YARD_HALF); if (spaced(x, z, rad)) return { x, z }; } return null; };
  for (let i = 0; i < 10; i++) { const c = find(TREE_R.single); if (c) yard.obstacles.push({ kind: 'tree', x: c.x, z: c.z, yaw: rng.range(0, Math.PI * 2), r: TREE_R.single, scale: 1 }); }
  for (const [g, n] of [[0, 3], [1, 3], [2, 2]]) {
    const c = find(2.8), a0 = rng.range(0, Math.PI * 2); if (!c) continue;
    for (let k = 0; k < n; k++) { const a = a0 + k * Math.PI * 2 / n; yard.obstacles.push({ kind: 'tree', young: true, group: g, x: c.x + Math.cos(a) * 1.1, z: c.z + Math.sin(a) * 1.1, yaw: rng.range(0, Math.PI * 2), r: TREE_R.young, scale: 0.62 }); }
  }
  for (let i = 0; i < 16; i++) { const c = find(TREE_R.bush); if (c) yard.obstacles.push({ kind: 'bush', x: c.x, z: c.z, yaw: rng.range(0, Math.PI * 2), r: TREE_R.bush, scale: rng.range(0.85, 1.15) }); }
  const s0 = W(-end * 12, 0);
  yard.start = { x: s0.x, z: s0.z, yaw: Math.atan2(-end * f[0], -end * f[1]) }; // facing out of the far exit; the train sits in the barn
  return yard;
}

const HIDE_OFF = 7.8; // m from the centerline: on the shoulder (road 7 + shoulder 1.5), in front of the bank
export function generateFarm(seed) {
  const rng = makeRng(seed);
  for (let tries = 0; tries < 200; tries++) {
    const pairs = rng.chance(0.5) ? [['N', 'E'], ['S', 'W']] : [['N', 'W'], ['S', 'E']];
    const paths = pairs.map(([a, b]) => findRoute(rng, a, b));
    if (paths.some(p => !p)) continue;
    const routes = pairs.map(([a, b], n) => ({ from: a, to: b, tiles: annotate(paths[n], GATES[a].out, (GATES[b].out + 2) % 4) }));
    if (!placeFeatures(routes, rng)) continue;
    const grid = Array.from({ length: SIZE }, (_, j) => Array.from({ length: SIZE }, (_, i) => inYard(i, j) ? 'yard' : 'field'));
    for (const r of routes) for (const t of r.tiles) grid[t.j][t.i] = 'road';
    const yard = layoutYard(rng);
    // A-13: two hiding bushes on the shoulder of plain straight or gate tiles, in front of the edge
    const plain = routes.flatMap(r => r.tiles.filter(t => t.type === 'straight' || t.type === 'gate'));
    const hideSpots = rng.shuffle(plain).slice(0, 2).map(t => { const c = tileCenter(t.i, t.j), [dx, dz] = DIRS[t.outDir], sd = rng.chance(0.5) ? 1 : -1; return { x: c.x - dz * sd * HIDE_OFF, z: c.z + dx * sd * HIDE_OFF }; });
    return { seed, size: SIZE, tile: TILE, routes, grid, yard, start: yard.start, pond: yard.pond, hideSpots };
  }
  throw new Error('generateFarm: no valid farm for seed ' + seed);
}
