// Grid flow fields so pigs can route through gates instead of pressing into fences.
export class FlowGrid {
  constructor(bounds, cell, obstacles, inflate) {
    this.cell = cell; this.x0 = bounds.x0; this.z0 = bounds.z0;
    this.nx = Math.ceil((bounds.x1 - bounds.x0) / cell); this.nz = Math.ceil((bounds.z1 - bounds.z0) / cell);
    const n = this.nx * this.nz; this.blocked = new Uint8Array(n);
    for (let j = 0; j < this.nz; j++) for (let i = 0; i < this.nx; i++) {
      const x = this.x0 + (i + 0.5) * cell, z = this.z0 + (j + 0.5) * cell;
      for (const o of obstacles) if (hit(o, x, z, inflate)) { this.blocked[j * this.nx + i] = 1; break; }
    }
    this.heap = new Int32Array(n * 8); this.hk = new Float32Array(n * 8);
  }
  // re-rasterise blocked cells inside a world rect (after a gate opens or closes)
  refresh(obstacles, inflate, x0, z0, x1, z1) {
    const c = this.cell;
    const i0 = Math.max(0, Math.floor((x0 - inflate - this.x0) / c) - 1), i1 = Math.min(this.nx - 1, Math.ceil((x1 + inflate - this.x0) / c) + 1);
    const j0 = Math.max(0, Math.floor((z0 - inflate - this.z0) / c) - 1), j1 = Math.min(this.nz - 1, Math.ceil((z1 + inflate - this.z0) / c) + 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = this.x0 + (i + 0.5) * c, z = this.z0 + (j + 0.5) * c; let b = 0;
      for (const o of obstacles) if (hit(o, x, z, inflate)) { b = 1; break; }
      this.blocked[j * this.nx + i] = b;
    }
    this.version = (this.version || 0) + 1;
  }
  idx(x, z) {
    const i = Math.floor((x - this.x0) / this.cell), j = Math.floor((z - this.z0) / this.cell);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return -1;
    return j * this.nx + i;
  }
  // Dijkstra from all free cells within radius r of (x, z).
  field(x, z, r) {
    const { nx, nz, cell, blocked } = this, n = nx * nz, d = new Float32Array(n).fill(Infinity);
    const heap = this.heap, hk = this.hk; let hs = 0;
    const push = (c, k) => { let i = hs++; while (i > 0) { const p = (i - 1) >> 1; if (hk[p] <= k) break; heap[i] = heap[p]; hk[i] = hk[p]; i = p; } heap[i] = c; hk[i] = k; };
    const pop = () => { const top = heap[0]; const c = heap[--hs], k = hk[hs]; let i = 0; for (;;) { let l = 2 * i + 1; if (l >= hs) break; if (l + 1 < hs && hk[l + 1] < hk[l]) l++; if (hk[l] >= k) break; heap[i] = heap[l]; hk[i] = hk[l]; i = l; } heap[i] = c; hk[i] = k; return top; };
    const R = Math.ceil(r / cell) + 1, ci = Math.floor((x - this.x0) / cell), cj = Math.floor((z - this.z0) / cell);
    for (let j = cj - R; j <= cj + R; j++) for (let i = ci - R; i <= ci + R; i++) {
      if (i < 0 || j < 0 || i >= nx || j >= nz) continue;
      const cx = this.x0 + (i + 0.5) * cell, cz = this.z0 + (j + 0.5) * cell, c = j * nx + i;
      if (!blocked[c] && Math.hypot(cx - x, cz - z) <= r) { d[c] = 0; push(c, 0); }
    }
    const S2 = Math.SQRT2 * cell;
    while (hs > 0) {
      const k0 = hk[0], c = pop(); if (k0 > d[c]) continue;
      const i = c % nx, j = (c / nx) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue; const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
        const nc = jj * nx + ii; if (blocked[nc]) continue;
        if (di && dj && (blocked[j * nx + ii] || blocked[jj * nx + i])) continue; // no corner cutting
        const nk = Math.fround(d[c] + (di && dj ? S2 : cell)); // fround: avoid endless re-pushes from float32 rounding
        if (nk < d[nc]) { d[nc] = nk; push(nc, nk); }
      }
    }
    return d;
  }
  // distance value at a world point (searches neighbours if the point sits in a blocked cell)
  dist(d, x, z) {
    const c = this.idx(x, z); if (c < 0) return Infinity;
    if (!this.blocked[c]) return d[c];
    let best = Infinity; const i = c % this.nx, j = (c / this.nx) | 0;
    for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= this.nx || jj >= this.nz) continue; const v = d[jj * this.nx + ii]; if (v < best) best = v; }
    return best;
  }
  // Smoothed downhill direction at (x, z). Writes into out[0..1]; returns false if unreachable.
  dir(d, x, z, out) {
    const { nx, nz, cell } = this; const fi = (x - this.x0) / cell - 0.5, fj = (z - this.z0) / cell - 0.5;
    const i0 = Math.floor(fi), j0 = Math.floor(fj);
    let gx = 0, gz = 0, ok = false;
    // gradient from a 4x4 neighbourhood around the point, weighted by proximity
    let best = Infinity, bx = 0, bz = 0;
    for (let j = j0 - 1; j <= j0 + 2; j++) for (let i = i0 - 1; i <= i0 + 2; i++) {
      if (i < 0 || j < 0 || i >= nx || j >= nz) continue;
      const v = d[j * nx + i]; if (!isFinite(v)) continue;
      const cx = this.x0 + (i + 0.5) * cell - x, cz = this.z0 + (j + 0.5) * cell - z;
      if (v < best) { best = v; bx = cx; bz = cz; }
    }
    if (!isFinite(best)) return false;
    // central differences on the bilinear neighbourhood for smoothness
    const s = (i, j) => { if (i < 0 || j < 0 || i >= nx || j >= nz) return NaN; const v = d[j * nx + i]; return isFinite(v) ? v : NaN; };
    for (let j = j0; j <= j0 + 1; j++) for (let i = i0; i <= i0 + 1; i++) {
      const w = (1 - Math.abs(fi - i)) * (1 - Math.abs(fj - j)); if (w <= 0) continue;
      const c = s(i, j); if (isNaN(c)) continue;
      const l = s(i - 1, j), r = s(i + 1, j), u = s(i, j - 1), dn = s(i, j + 1);
      const dx = !isNaN(l) && !isNaN(r) ? (r - l) / 2 : !isNaN(r) ? r - c : !isNaN(l) ? c - l : 0;
      const dz = !isNaN(u) && !isNaN(dn) ? (dn - u) / 2 : !isNaN(dn) ? dn - c : !isNaN(u) ? c - u : 0;
      gx -= dx * w; gz -= dz * w; ok = true;
    }
    const gl = Math.hypot(gx, gz), bl = Math.hypot(bx, bz) || 1;
    if (ok && gl > 1e-4) { gx /= gl; gz /= gl; } else { gx = 0; gz = 0; }
    // blend with "head to lowest nearby cell", which handles walls and narrow gates robustly
    let ox = gx * 0.5 + (bx / bl) * 0.5, oz = gz * 0.5 + (bz / bl) * 0.5; const ol = Math.hypot(ox, oz) || 1;
    out[0] = ox / ol; out[1] = oz / ol; return true;
  }
}

export function hit(o, x, z, inflate) {
  if (o.active === false) return false;
  if (o.type === 'circle') return Math.hypot(x - o.x, z - o.z) < o.r + inflate;
  let lx = x - o.x, lz = z - o.z;
  if (o.rot) { const c = Math.cos(o.rot), s = Math.sin(o.rot); const ax = c * lx - s * lz, az = s * lx + c * lz; lx = ax; lz = az; }
  // rounded-box test
  const qx = Math.max(Math.abs(lx) - o.hx, 0), qz = Math.max(Math.abs(lz) - o.hz, 0);
  return Math.hypot(qx, qz) < inflate;
}
