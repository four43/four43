// Seeded random numbers for the generators (spec tracks T-2). mulberry32 over a 32-bit state;
// string seeds are hashed (FNV-1a). fork(label) gives an independent, repeatable sub-stream, so
// adding a draw in one generator never shifts another generator's output.

const fnv = (str) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
};

export function rng(seed) {
  const base = typeof seed === 'number' ? seed >>> 0 : fnv(String(seed));
  let a = base;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    seed: base,
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    fork: (label) => rng(fnv(`${base}:${label}`)),
  };
}
