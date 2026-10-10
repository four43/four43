// Deformable fresh snow over the pad's flat ground (spec R2-6). A grid of snow height and wear,
// stored in sparse tiles allocated the first time a tire touches them. Pure JS.
import { SURFACES } from './tire.js';

export const SNOW = {
  cell: 0.125,          // grid spacing (m)
  depth: 0.12,          // fresh snow depth above the hard ground (m)
  packed: 0.03,         // what a loaded tire presses it down to (m)
  berm: 0.03,           // ridge of snow a tire pushes up beside its rut, above fresh (m)
  fullLoad: 1500,       // tire load (N) that presses fresh snow all the way down
  tireWidth: 0.2,       // tire footprint, across and along (m)
  patchLen: 0.2,
  plowPressure: 20000,  // resistance of fresh snow to being pushed through (Pa)
  plowFade: 0.5,        // patch speed (m/s) over which the plow force fades in
  plowDensity: 120,     // effective density of snow thrown aside (kg/m^3): drag grows with v^2
  wearPerMetre: 1 / 6,  // wear per metre of tire slip at 3 kN; wear 1 is ice
};

export const TILE = 64;                       // cells per tile side (8 m)
const OFF = 128;                              // tile index offset for the map key
const LEVELS = 16;                            // packed -> ice blend steps
// Heights are stored as bytes over 0..(depth + berm), so berms fit above fresh snow.
export const H_MAX = SNOW.depth + SNOW.berm;
export const toByte = (m) => Math.round(m / H_MAX * 255);
export const H_FRESH = toByte(SNOW.depth);   // stored height of untouched snow
const H_BERM = 255;
export const W_MAX = 65535;                   // stored wear for ice (16 bit so slow wear accumulates)

// Surfaces a tire can see in snow: fresh (still full height), then packed blending to ice.
const blend = (a, b, t, name) => {
  const s = { name };
  for (const k of ['mu', 'C', 'kp', 'ap', 'crr', 'drag']) s[k] = a[k] + (b[k] - a[k]) * t;
  s.B = Math.tan(Math.PI / (2 * s.C));
  return s;
};
export const FRESH = { ...SURFACES.packed, name: 'Fresh snow' };
export const WORN = Array.from({ length: LEVELS + 1 }, (_, i) =>
  blend(SURFACES.packed, SURFACES.ice, i / LEVELS, i < LEVELS / 2 ? 'Packed snow' : 'Icy snow'));
WORN[LEVELS].name = 'Ice';

export class SnowField {
  constructor() {
    this.tiles = new Map();     // key -> { h: Uint8Array height, w: Uint16Array wear }
    this.groundHandle = null;   // only this collider is snow-covered
    this.version = 0;           // bumps on clear(); renderers do a full refresh
    this.dirty = null;          // {x0, z0, x1, z1} cell bounds changed since takeDirty()
  }

  clear() { this.tiles.clear(); this.version++; this.dirty = null; }

  tile(tx, tz, create) {
    const key = (tx + OFF) * 256 + (tz + OFF);
    let t = this.tiles.get(key);
    if (!t && create) {
      t = { h: new Uint8Array(TILE * TILE).fill(H_FRESH), w: new Uint16Array(TILE * TILE) };
      this.tiles.set(key, t);
    }
    return t;
  }

  // Raw cell values: height (0..255 of H_MAX) and wear (0..W_MAX).
  cell(ix, iz) {
    const tx = Math.floor(ix / TILE), tz = Math.floor(iz / TILE);
    const t = this.tile(tx, tz, false);
    if (!t) return FRESH_CELL;
    const i = (iz - tz * TILE) * TILE + (ix - tx * TILE);
    FRESH_CELL_OUT.h = t.h[i]; FRESH_CELL_OUT.w = t.w[i];
    return FRESH_CELL_OUT;
  }

  // Snow surface height above the hard ground (m), bilinear between cell centres.
  height(x, z) {
    const c = SNOW.cell, fx = x / c - 0.5, fz = z / c - 0.5;
    const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
    const h00 = this.cell(ix, iz).h, h10 = this.cell(ix + 1, iz).h;
    const h01 = this.cell(ix, iz + 1).h, h11 = this.cell(ix + 1, iz + 1).h;
    const h = (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
    return h / 255 * H_MAX;
  }

  // Surface normal under a tire heading along (hx, hz). Only the slope across the tire counts:
  // rut walls beside it stand firm, but snow ahead of it is squashed as it rolls (that cost is
  // the plow force), so it never has to climb out of its own footprint.
  normal(x, z, hx, hz) {
    const e = SNOW.tireWidth / 2, l = Math.hypot(hx, hz) || 1, ax = hz / l, az = -hx / l;
    const g = (this.height(x + ax * e, z + az * e) - this.height(x - ax * e, z - az * e)) / (2 * e);
    const n = Math.hypot(g, 1);
    return { x: -g * ax / n, y: 1 / n, z: -g * az / n };
  }

  surface(x, z) {
    const { h, w } = this.cell(Math.floor(x / SNOW.cell), Math.floor(z / SNOW.cell));
    if (h / 255 * H_MAX > SNOW.packed + 0.02) return FRESH;
    return WORN[Math.round(w / W_MAX * LEVELS)];
  }

  // A tire footprint centred at (x, z) heading along (dx, dz) with load (N) and patch slip
  // speed (m/s) for dt seconds: press the snow down, push a berm up beside it, and polish what
  // is already packed.
  // ahead (m) stretches the footprint forward to cover where the tire will be next step.
  press(x, z, dx, dz, load, slip, dt, ahead = 0) {
    if (load <= 0) return;
    const S = SNOW, c = S.cell;
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const target = S.packed + (S.depth - S.packed) * Math.max(0, 1 - load / S.fullLoad);
    const hT = toByte(target), berm = hT < H_FRESH - 10;
    const dw = Math.round(S.wearPerMetre * (load / 3000) * slip * dt * W_MAX);
    const packedB = toByte(S.packed + 0.02);
    const hw = S.tireWidth / 2, hl = S.patchLen / 2, r = Math.hypot(hw + c, hl + ahead) + c;
    const ix0 = Math.floor((x - r) / c), ix1 = Math.floor((x + r) / c);
    const iz0 = Math.floor((z - r) / c), iz1 = Math.floor((z + r) / c);
    let touched = false;
    for (let iz = iz0; iz <= iz1; iz++) {
      for (let ix = ix0; ix <= ix1; ix++) {
        const px = (ix + 0.5) * c - x, pz = (iz + 0.5) * c - z;
        const along = px * dx + pz * dz, across = px * dz - pz * dx;
        // Full press under the tire, fading out over one cell beyond its edge: a flat-bottomed rut
        // with sloped walls whose width doesn't flicker as a track drifts across the grid.
        const cov = clamp01((hw - Math.abs(across)) / c + 1)
          * clamp01((along + hl) / c + 1) * clamp01((hl + ahead - along) / c + 1);
        // Berm: the cell just beyond the rut wall on either side, if it is still untouched.
        const side = cov <= 0 && berm && Math.abs(across) < hw + 2 * c && along >= -hl && along <= hl + ahead;
        if (cov <= 0 && !side) continue;
        const tx = Math.floor(ix / TILE), tz = Math.floor(iz / TILE);
        const t = this.tile(tx, tz, true), i = (iz - tz * TILE) * TILE + (ix - tx * TILE);
        if (side) { if (t.h[i] >= H_FRESH && t.h[i] < H_BERM) { t.h[i] = H_BERM; touched = true; } continue; }
        const hC = Math.round(hT + (H_FRESH - hT) * (1 - cov));
        if (t.h[i] > hC) { t.h[i] = hC; touched = true; }
        if (dw > 0 && cov > 0.5 && t.h[i] <= packedB && t.w[i] < W_MAX) { t.w[i] = Math.min(W_MAX, t.w[i] + dw); touched = true; }
      }
    }
    if (touched) {
      const d = this.dirty;
      if (!d) this.dirty = { x0: ix0, z0: iz0, x1: ix1, z1: iz1 };
      else { d.x0 = Math.min(d.x0, ix0); d.z0 = Math.min(d.z0, iz0); d.x1 = Math.max(d.x1, ix1); d.z1 = Math.max(d.z1, iz1); }
    }
  }

  takeDirty() { const d = this.dirty; this.dirty = null; return d; }
}

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const FRESH_CELL = Object.freeze({ h: H_FRESH, w: 0 });
const FRESH_CELL_OUT = { h: 0, w: 0 };
