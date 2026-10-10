// Nearest-centreline queries (spec tracks T-7): position -> distance along (s) and across (d,
// + = left) the road. Samples sit in a uniform 16 m hash; the nearest sample is refined by
// projecting onto its two adjacent segments for sub-metre s. Left of a segment with direction
// (sx, sz) = (sin h, cos h) is (cos h, -sin h) = (sz, -sx).

const CELL = 16, cellKey = (cx, cz) => cx * 65536 + cz;

export function makeLocator(layout) {
  const { x, z, n, ds, closed, length } = layout;
  const cells = new Map();
  for (let i = 0; i < n; i++) {
    const k = cellKey(Math.floor(x[i] / CELL), Math.floor(z[i] / CELL));
    const l = cells.get(k); l ? l.push(i) : cells.set(k, [i]);
  }
  // Nearest sample: scan rings of cells outward until no unvisited cell can hold a closer one.
  function nearest(px, pz) {
    const cx = Math.floor(px / CELL), cz = Math.floor(pz / CELL);
    let best = -1, bd = Infinity;
    const scan = (a, b) => {
      const l = cells.get(cellKey(cx + a, cz + b)); if (!l) return;
      for (let q = 0; q < l.length; q++) {
        const i = l[q], dx = x[i] - px, dz = z[i] - pz, d2 = dx * dx + dz * dz;
        if (d2 < bd) { bd = d2; best = i; }
      }
    };
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) scan(a, b);
    // Ring r's cells are at least (r - 1) * CELL away; stop once the best beats that.
    for (let r = 2; best < 0 || bd > ((r - 1) * CELL) ** 2; r++) {
      if (r > 4096) break;
      for (let a = -r; a <= r; a++) { scan(a, -r); scan(a, r); }
      for (let b = -r + 1; b < r; b++) { scan(-r, b); scan(r, b); }
    }
    return best;
  }

  // Project p onto segment i -> i+1: returns [t in [0,1], squared distance, signed d].
  function proj(i, px, pz) {
    const j = (i + 1) % n, sx = x[j] - x[i], sz = z[j] - z[i], L2 = sx * sx + sz * sz || 1e-12;
    const t = Math.max(0, Math.min(1, ((px - x[i]) * sx + (pz - z[i]) * sz) / L2));
    const qx = px - (x[i] + sx * t), qz = pz - (z[i] + sz * t);
    return [t, qx * qx + qz * qz, (qx * sz - qz * sx) / Math.sqrt(L2)];
  }

  function locate(px, pz) {
    const i = nearest(px, pz);
    const segs = [];
    if (closed || i > 0) segs.push((i - 1 + n) % n);
    if (closed || i < n - 1) segs.push(i);
    let s = i * ds, d = 0, bd = Infinity;
    for (const g of segs) {
      const [t, d2, sd] = proj(g, px, pz);
      if (d2 < bd) { bd = d2; s = (g + t) * ds; d = sd; }
    }
    if (closed) { s %= length; if (s < 0) s += length; }
    return { s, d, i };
  }

  return { locate };
}
