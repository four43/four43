// src/sim/progress.js: rewards after each show (spec section 9) and parent settings (section 10)
// W-3: two start paints, then one new paint every 3 shows. Each paint can go on the body or the trim.
export const START_PAINTS = ['red', 'yellow'], NEW_PAINTS = ['green', 'blue', 'pink', 'orange', 'purple', 'white', 'rainbow'];
export const HATS = [{ id: 'straw', shows: 4 }, { id: 'cowboy', shows: 8 }, { id: 'party', shows: 12 }];
export const emptyProgress = () => ({ shows: 0, stickers: [], paint: { body: 'red', trim: 'yellow' } });
export const unlockedPaints = p => [...START_PAINTS, ...NEW_PAINTS.slice(0, Math.floor(p.shows / 3))];
export const hasPaintChoice = p => unlockedPaints(p).length > START_PAINTS.length; // F-11: the start screen shows only then
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
  const before = unlockedPaints(p), after = unlockedPaints(next), hatsBefore = unlockedHats(p), hatsAfter = unlockedHats(next);
  return { progress: next, sticker, newPaint: after.length > before.length ? after.at(-1) : null, newHat: hatsAfter.length > hatsBefore.length ? hatsAfter.at(-1) : null };
}
// Saved progress comes from browser storage: anything odd falls back to a clean value, and each paint must be one the player has
// unlocked. A save from version 1.0 has one tractor color instead of the paints: it becomes the body paint.
export function clampProgress(p, types) {
  if (!p || typeof p !== 'object') return emptyProgress();
  const shows = Number.isInteger(p.shows) && p.shows >= 0 ? p.shows : 0;
  const stickers = (Array.isArray(p.stickers) ? p.stickers : []).filter(s => s && types.includes(s.type) && Number.isInteger(s.show)).map(s => ({ type: s.type, golden: !!s.golden, show: s.show }));
  const have = unlockedPaints({ shows }), saved = p.paint && typeof p.paint === 'object' ? p.paint : { body: p.color }, start = emptyProgress().paint;
  const pick = area => have.includes(saved[area]) ? saved[area] : start[area];
  return { shows, stickers, paint: { body: pick('body'), trim: pick('trim') } };
}
export const DEFAULT_SETTINGS = { power: 'medium', voice: true, music: true, seed: null };
export function clampSettings(s) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) s = {}; // storage can hold anything
  return {
    power: ['low', 'medium', 'high'].includes(s.power) ? s.power : 'medium',
    voice: s.voice === undefined ? true : !!s.voice, music: s.music === undefined ? true : !!s.music,
    seed: Number.isInteger(s.seed) && s.seed >= 0 ? s.seed : null,
  };
}

// ?seed=… and ?power=… from the address bar: anything that is not a whole number / a power preset is ignored
export const seedParam = v => { const n = v === null || v === undefined || String(v).trim() === '' ? NaN : Number(v); return Number.isInteger(n) && n >= 0 && n <= 0xffffffff ? n : null; };
export const powerParam = (v, fallback) => ['low', 'medium', 'high'].includes(v) ? v : fallback;
