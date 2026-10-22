// Tyre surfaces from the material registry (lion-hawk M-10, phase 3; replaces tire.js SURFACES). An entry is a
// material's `tire` block plus its display name and plow (`game.name`, `game.plow`) and the Magic Formula B (peak at
// rho = 1), derived once per material at load. Rally's surface keys (gen/surfaces.js, the pad setting) name materials 'rally-<key>'.
import MATERIALS from './defs/materials.js';

const BLEND_KEYS = ['mu', 'C', 'kp', 'ap', 'crr', 'drag', 'plow'];
const BY_INDEX = [];
for (const id of MATERIALS.ids) {
  const m = MATERIALS.get(id), t = m.tire;
  if (!t) continue;
  const s = { id, name: m.game?.name ?? id, mu: t.mu, C: t.C, kp: t.kp, ap: t.ap, crr: t.crr, drag: t.drag, plow: m.game?.plow ?? 0 };
  s.B = Math.tan(Math.PI / (2 * s.C));
  BY_INDEX[MATERIALS.index(id)] = Object.freeze(s);
}

export const materialOf = key => `rally-${key}`;
export function surface(id) {
  const s = BY_INDEX[MATERIALS.index(id)];
  if (!s) throw new Error(`rally: material '${id}' has no tire block`);
  return s;
}
export const surfaceOfKey = key => surface(materialOf(key));

// The old TrackWorld blend: a → b at q tenths, cached per (a, b, q) so a wheel lookup allocates only the first time.
export function blendSurface(cache, A, B, q) {
  if (A === B || q === 0) return A;
  if (q === 10) return B;
  const key = `${A.id}|${B.id}|${q}`;
  let e = cache.get(key);
  if (!e) {
    const w = q / 10;
    e = { id: null, name: `${A.name}→${B.name}`, ids: [A.id, B.id], w }; // ids/w: what it blends (the rumble mixer reads them)
    for (const k of BLEND_KEYS) e[k] = A[k] + (B[k] - A[k]) * w;
    e.B = Math.tan(Math.PI / (2 * e.C));
    cache.set(key, e);
  }
  return e;
}
