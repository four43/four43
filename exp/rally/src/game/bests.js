// Saved bests (spec tracks T-25), per mode, track and car. Storage can fail (private mode, full,
// blocked): then bests just aren't kept and the game carries on.
import { styleLevel, obstacleLevel } from '../gen/levels.js';

const KEY = 'rally-sim-bests';

// Style 2 and 4 and obstacles 2 are the old twisty, flowing and mild tracks, so they keep the old names in the key (and
// their bests); the old wild bests were on taller obstacles and are not carried over (rally spec R14-4).
const styleName = (v) => ({ 2: 'twisty', 4: 'flowing' })[styleLevel(v)] ?? `style${v}`, obstaclesName = (v) => (obstacleLevel(v) === 2 ? 'mild' : `obstacles${obstacleLevel(v)}`);
export const bestKey = (modeId, track, carId) =>
  [modeId, track.seed, track.kind, styleName(track.style), track.theme, obstaclesName(track.obstacles), carId].join('|') +
  (!track.size || track.size === 'medium' ? '' : `|${track.size}`); // medium: the tracks (and keys) from before R14-5

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
