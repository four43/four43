// src/sim/progress.js: rewards after each show (spec section 9) and parent settings (section 10)
export const COLORS = ['red', 'green', 'blue', 'yellow', 'pink', 'rainbow'];
export const HATS = [{ id: 'straw', shows: 4 }, { id: 'cowboy', shows: 8 }, { id: 'party', shows: 12 }];
export const emptyProgress = () => ({ shows: 0, stickers: [], color: 'red' });
export const unlockedColors = p => COLORS.slice(0, Math.min(COLORS.length, 1 + Math.floor(p.shows / 3)));
export const unlockedHats = p => HATS.filter(h => p.shows >= h.shows).map(h => h.id);
export function pickSticker(animals) {
  const g = animals.find(a => a.golden); if (g) return { type: g.type, golden: true };
  const n = new Map(); for (const a of animals) n.set(a.type, (n.get(a.type) || 0) + 1);
  let best = null; for (const [t, c] of n) if (!best || c > n.get(best)) best = t;
  return { type: best, golden: false };
}
export function completeShow(p, animals) {
  const shows = p.shows + 1, next = { ...p, shows }, sticker = { ...pickSticker(animals), show: shows };
  next.stickers = [...p.stickers, sticker];
  const before = unlockedColors(p), after = unlockedColors(next), hatsBefore = unlockedHats(p), hatsAfter = unlockedHats(next);
  return { progress: next, sticker, newColor: after.length > before.length ? after.at(-1) : null, newHat: hatsAfter.length > hatsBefore.length ? hatsAfter.at(-1) : null };
}
// Saved progress comes from browser storage: anything odd falls back to a clean value, and the color must be one the player has unlocked.
export function clampProgress(p, types) {
  if (!p || typeof p !== 'object') return emptyProgress();
  const shows = Number.isInteger(p.shows) && p.shows >= 0 ? p.shows : 0;
  const stickers = (Array.isArray(p.stickers) ? p.stickers : []).filter(s => s && types.includes(s.type) && Number.isInteger(s.show)).map(s => ({ type: s.type, golden: !!s.golden, show: s.show }));
  const out = { shows, stickers, color: 'red' };
  return { ...out, color: unlockedColors(out).includes(p.color) ? p.color : 'red' };
}
export const DEFAULT_SETTINGS = { power: 'medium', voice: true, music: true, seed: null };
export function clampSettings(s) {
  return {
    power: ['low', 'medium', 'high'].includes(s.power) ? s.power : 'medium',
    voice: s.voice === undefined ? true : !!s.voice, music: s.music === undefined ? true : !!s.music,
    seed: Number.isInteger(s.seed) && s.seed >= 0 ? s.seed : null,
  };
}
