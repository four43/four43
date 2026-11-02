// The grain a combine's wagons carry (H-H3, H-H4, H-S1): wagon 1 fills first, then wagon 2, …, each with its own capacity and its
// own count of each crop. Each wagon unloads on its own (over the silo pit) and pays each grain at its crop's price.
// Sim-pure, no allocation per step.
import { CROP_IDS, CROP } from '../defs/econ.js';

const NC = CROP_IDS.length;
export function createLoad(caps) {
  const bins = caps.map(cap => ({ cap, n: 0, counts: new Array(NC).fill(0), last: 0 })); // last: the crop index poured in most recently (the heap colour)
  return {
    bins,
    total() { let n = 0; for (const b of bins) n += b.n; return n; },
    capacity() { let n = 0; for (const b of bins) n += b.cap; return n; },
    room() { let n = 0; for (const b of bins) n += b.cap - b.n; return n; },
    full() { return this.room() <= 0; },
    // one grain of crop k into the first bin with room; false when full
    add(k) {
      for (const b of bins) if (b.n < b.cap) { b.n++; b.counts[k]++; b.last = k; return true; }
      return false;
    },
    // the first bin with room (the one filling), or -1 when full
    filling() { for (let i = 0; i < bins.length; i++) if (bins[i].n < bins[i].cap) return i; return -1; },
    // take up to n grains out of bin i; returns the coins they are worth
    unloadBin(i, n) {
      const b = bins[i]; let coins = 0;
      for (let k = NC - 1; k >= 0 && n > 0; k--) { const t = Math.min(n, b.counts[k]); if (!t) continue; b.counts[k] -= t; b.n -= t; n -= t; coins += t * CROP[CROP_IDS[k]].price; }
      return coins;
    },
    // take up to n grains, last bin first; returns the coins
    unload(n) {
      let coins = 0;
      for (let i = bins.length - 1; i >= 0 && n > 0; i--) { const had = bins[i].n; coins += this.unloadBin(i, n); n -= had - bins[i].n; }
      return coins;
    },
    // new capacities (an upgrade); the grain stays, poured forward into the bins in order (any that no longer fits is dropped)
    resize(caps2) {
      const counts = new Array(NC).fill(0);
      for (const b of bins) for (let k = 0; k < NC; k++) counts[k] += b.counts[k];
      bins.length = 0;
      for (const cap of caps2) bins.push({ cap, n: 0, counts: new Array(NC).fill(0), last: 0 });
      for (let k = 0; k < NC; k++) for (let c = 0; c < counts[k]; c++) if (!this.add(k)) break;
    },
  };
}
