// The crop cells (H-H1, H-H2, H-F5). Each field is a grid of square cells (`size` m: 0.5 in the backyard, 1 in the grain fields); a
// cell's growth runs 0 (just cut, stubble) to 1 (ripe). Only ripe cells cut, and only by the crop's own vehicle with blades that
// reach the crop's toughness (H-H6). Cut cells stay stubble until their field is
// done (DONE_AT of its cells cut); then the whole field grows back, and once it is all ripe it is a fresh field again: cut cells
// stay stubble until it is done again. Growth advances in batches every
// GROW_EVERY steps, so the per-step cost is the header's few cells. Sim-pure, deterministic, no allocation per step.
import { FIELDS } from './layout.js';
import { CROP_IDS, CROP, TUNE, DONE_AT } from '../defs/econ.js';

export const GROW_EVERY = 30; // steps between growth batches (0.5 s at 60 Hz)

export function createFields() {
  const list = Object.entries(FIELDS).map(([id, f], k) => ({ id, k, crop: f.crop, cropK: CROP_IDS.indexOf(f.crop), tough: CROP[f.crop].tough,
    vehicle: CROP[f.crop].vehicle, x0: f.x0, z0: f.z0, w: f.w, h: f.h, size: f.size, total: f.w * f.h, grow: new Float32Array(f.w * f.h).fill(1), done: false, ripe: f.w * f.h, version: 0 }));
  const byId = Object.fromEntries(list.map(f => [f.id, f]));
  let tick = 0;
  const fields = {
    list, byId,
    // the share of the field cut: 0 … 1 (done at DONE_AT)
    progress(f) { return 1 - f.ripe / f.total; },
    // the field and cell under a world point, or -1
    cellAt(f, x, z) { const i = Math.floor((x - f.x0) / f.size), j = Math.floor((z - f.z0) / f.size); return i < 0 || j < 0 || i >= f.w || j >= f.h ? -1 : j * f.w + i; },
    // a field of `vehicle`'s crops under a world point (cut or not), or null
    under(x, z, vehicle) {
      for (const f of list) if (f.vehicle === vehicle && fields.cellAt(f, x, z) >= 0) return f;
      return null;
    },
    // the field with ripe crop under a world point, or null
    ripeAt(x, z) {
      for (const f of list) { const c = fields.cellAt(f, x, z); if (c >= 0 && f.grow[c] >= 1) return f; }
      return null;
    },
    // Cut the ripe cells whose centres are inside the header strip: the rectangle centred at (cx, cz) with heading (fx, fz),
    // half width hw across and half depth hd along, in the fields of `vehicle`'s crops no tougher than `tough`. room() says how
    // many more grains fit; take(field) takes one. Returns the number of cells cut.
    cutStrip(cx, cz, fx, fz, hw, hd, vehicle, tough, room, take) {
      const ex = Math.abs(fz) * hw + Math.abs(fx) * hd, ez = Math.abs(fx) * hw + Math.abs(fz) * hd; // the strip's bounding half extents
      let n = 0;
      for (let k = 0; k < list.length; k++) {
        const f = list[k];
        if (f.vehicle !== vehicle || f.tough > tough) continue;
        const S = f.size;
        const i0 = Math.max(0, Math.floor((cx - ex - f.x0) / S)), i1 = Math.min(f.w - 1, Math.floor((cx + ex - f.x0) / S));
        const j0 = Math.max(0, Math.floor((cz - ez - f.z0) / S)), j1 = Math.min(f.h - 1, Math.floor((cz + ez - f.z0) / S));
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
          const c = j * f.w + i; if (f.grow[c] < 1) continue;
          const dx = f.x0 + (i + 0.5) * S - cx, dz = f.z0 + (j + 0.5) * S - cz;
          const along = dx * fx + dz * fz, across = dx * fz - dz * fx;
          if (Math.abs(along) > hd || Math.abs(across) > hw) continue;
          if (room() <= 0) return n;
          f.grow[c] = 0; f.ripe--; f.version++; take(f); n++;
        }
      }
      return n;
    },
    // H-F5: a field is done once DONE_AT of it is cut (each harvest of it). Returns a field just done (one a call), or null.
    finish() {
      for (const f of list) if (!f.done && fields.progress(f) >= DONE_AT) { f.done = true; f.version++; return f; }
      return null;
    },
    // H-H2: every GROW_EVERY steps, every cut cell of a done field grows by that time over TUNE.growS; all ripe, it is fresh again
    step(dt) {
      if (++tick < GROW_EVERY) return;
      tick = 0;
      const d = dt * GROW_EVERY / TUNE.growS;
      for (let k = 0; k < list.length; k++) {
        const f = list[k]; if (!f.done || f.ripe === f.total) continue;
        const g = f.grow;
        for (let c = 0; c < g.length; c++) if (g[c] < 1) { g[c] = Math.min(1, g[c] + d); if (g[c] === 1) f.ripe++; }
        if (f.ripe === f.total) f.done = false;
        f.version++;
      }
    },
    // the saved records: which fields are done, and each field's cut cells as run lengths (ripe, cut, ripe, …)
    done() { return Object.fromEntries(list.map(f => [f.id, f.done])); },
    cutRuns(f) {
      const runs = []; let want = 1, n = 0;
      for (let c = 0; c < f.total; c++) { const ripe = f.grow[c] >= 1 ? 1 : 0; if (ripe === want) n++; else { runs.push(n); want = ripe; n = 1; } }
      runs.push(n); return runs;
    },
    // restore saved records { <id>: { done, cut } }: each field's done flag and cut cells (runs that do not fit are ignored)
    restore(saved) {
      for (const f of list) {
        const rec = saved?.[f.id];
        if (rec?.done === true) { f.done = true; f.version++; }
        const runs = rec?.cut; if (!Array.isArray(runs)) continue;
        let sum = 0, ok = true;
        for (const r of runs) { if (!Number.isInteger(r) || r < 0) { ok = false; break; } sum += r; }
        if (!ok || sum !== f.total) continue; // a save from another layout: the field starts afresh
        let c = 0;
        runs.forEach((r, i) => { if (i % 2) f.grow.fill(0, c, c + r); c += r; });
        f.ripe = 0; for (let k = 0; k < f.total; k++) if (f.grow[k] >= 1) f.ripe++;
        f.version++;
      }
    },
    ripeCount() { let n = 0; for (const f of list) n += f.ripe; return n; },
  };
  return fields;
}
