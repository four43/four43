// 2D gradient (Perlin-style) noise and fBm for terrain (spec tracks T-3). Pure, seeded.
import { rng } from './rng.js';

export function noise2(seed) {
  const r = rng(seed), perm = new Uint8Array(512), gx = new Float32Array(256), gz = new Float32Array(256);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(r.next() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  for (let i = 0; i < 256; i++) { const a = r.next() * Math.PI * 2; gx[i] = Math.cos(a); gz[i] = Math.sin(a); }
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const dot = (h, x, z) => gx[h] * x + gz[h] * z;
  return (x, z) => {
    const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
    const X = ix & 255, Z = iz & 255;
    const h00 = perm[X + perm[Z]], h10 = perm[X + 1 + perm[Z]], h01 = perm[X + perm[Z + 1]], h11 = perm[X + 1 + perm[Z + 1]];
    const u = fade(fx), v = fade(fz);
    const a = dot(h00, fx, fz) + u * (dot(h10, fx - 1, fz) - dot(h00, fx, fz));
    const b = dot(h01, fx, fz - 1) + u * (dot(h11, fx - 1, fz - 1) - dot(h01, fx, fz - 1));
    return (a + v * (b - a)) * 1.41; // roughly [-1, 1]
  };
}

// Fractal sum: scale is the size (m) of the largest feature.
export function fbm(n, x, z, { octaves = 4, lacunarity = 2, gain = 0.5, scale = 1 } = {}) {
  let sum = 0, amp = 1, norm = 0, f = 1 / scale;
  for (let o = 0; o < octaves; o++) { sum += amp * n(x * f + o * 17.3, z * f - o * 9.1); norm += amp; amp *= gain; f *= lacunarity; }
  return sum / norm;
}
