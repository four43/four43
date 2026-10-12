// Saved bests (spec tracks T-25), per mode, track and car. Storage can fail (private mode, full,
// blocked): then bests just aren't kept and the game carries on.
const KEY = 'rally-sim-bests';

export const bestKey = (modeId, track, carId) =>
  [modeId, track.seed, track.kind, track.style, track.theme, track.density, carId].join('|');

// In-memory default keeps the sim half pure; the view half passes localStorage.
export function memoryStore() { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, String(v)); } }; }

export function makeBests(storage = memoryStore()) {
  const load = () => { try { return JSON.parse(storage.getItem(KEY)) || {}; } catch { return {}; } };
  return {
    get: (key) => load()[key] ?? null,
    put(key, value) {
      const all = load(); all[key] = value;
      try { storage.setItem(KEY, JSON.stringify(all)); } catch { /* storage unavailable */ }
    },
  };
}
