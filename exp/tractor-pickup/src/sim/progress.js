// src/sim/progress.js: rewards after each show (spec section 9) and parent settings (section 10)
// W-3: two start paints, then one new paint every 3 shows. Each paint can go on the body or the trim.
export const START_PAINTS = ['red', 'yellow'], NEW_PAINTS = ['green', 'blue', 'pink', 'orange', 'purple', 'white', 'rainbow'];
export const HATS = [{ id: 'straw', shows: 4 }, { id: 'cowboy', shows: 8 }, { id: 'party', shows: 12 }];
export const emptyProgress = () => ({ shows: 0, stickers: [], paint: { body: 'red', trim: 'yellow' }, hatsOff: [], bookSeen: 0 });
// F-3: bookSeen is the show number of the newest sticker when the sticker book was last opened; the badge counts the stickers after it
const lastShow = p => Math.max(0, ...p.stickers.map(s => s.show));
export const newStickers = p => p.stickers.filter(s => s.show > (p.bookSeen ?? 0)).length;
export const seeBook = p => ({ ...p, bookSeen: lastShow(p) });
export const unlockedPaints = p => [...START_PAINTS, ...NEW_PAINTS.slice(0, Math.floor(p.shows / 3))];
export const hasPaintChoice = p => unlockedPaints(p).length > START_PAINTS.length; // F-11: the start screen shows only then
export const unlockedHats = p => HATS.filter(h => p.shows >= h.shows).map(h => h.id);
// W-4: the paint screen turns each unlocked hat off or on (hatsOff lists the ones turned off, so a newly unlocked hat starts on)
export const wornHats = p => unlockedHats(p).filter(id => !(p.hatsOff || []).includes(id));
export const toggleHat = (p, id) => !unlockedHats(p).includes(id) ? p : { ...p, hatsOff: (p.hatsOff || []).includes(id) ? p.hatsOff.filter(h => h !== id) : [...(p.hatsOff || []), id] };
export function pickSticker(animals) {
  const g = animals.find(a => a.golden); if (g) return { type: g.type, golden: true };
  const n = new Map(); for (const a of animals) n.set(a.type, (n.get(a.type) || 0) + 1);
  let best = null; for (const [t, c] of n) if (!best || c > n.get(best)) best = t;
  return { type: best, golden: false };
}
// W-1: a sticker's pose (an animation of the model, see ui/stickerArt.js) and camera angle (0..VIEWS-1), from its show number and type:
// varied from sticker to sticker, and the same every time it is drawn
export const POSES = ['idle', 'walk', 'run', 'dance', 'eat', 'shake'], VIEWS = 5;
const hash = str => { let h = 2166136261; for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619); h = Math.imul(h ^ (h >>> 15), 2246822507); return (h ^ (h >>> 13)) >>> 0; };
export function stickerLook(show, type) { const h = hash(`${type}:${show}`); return { pose: POSES[h % POSES.length], view: Math.floor(h / POSES.length) % VIEWS }; }
// W-2: place is null (in the tray) or { page, x, y (0..1 of the page), rot (tilt, rad), z (stacking: the last moved is on top) }
const clamp01 = v => Math.max(0.05, Math.min(0.95, v));
export function placeSticker(p, i, { page, x, y }) {
  const z = 1 + Math.max(0, ...p.stickers.map(s => s.place?.z ?? 0)), old = p.stickers[i].place, rot = old?.rot ?? ((hash(`tilt:${p.stickers[i].show}`) % 41) - 20) / 100;
  return { ...p, stickers: p.stickers.map((s, k) => k === i ? { ...s, place: { page, x: clamp01(x), y: clamp01(y), rot, z } } : s) };
}
export const unplaceSticker = (p, i) => ({ ...p, stickers: p.stickers.map((s, k) => k === i ? { ...s, place: null } : s) });
export const bookPages = p => Math.max(0, ...p.stickers.map(s => s.place ? s.place.page + 1 : 0)) + 1; // one empty page after the last one used
const validPlace = q => q && typeof q === 'object' && Number.isInteger(q.page) && q.page >= 0 && q.page < 100 && [q.x, q.y].every(v => typeof v === 'number' && v >= 0 && v <= 1)
  && typeof q.rot === 'number' && Math.abs(q.rot) <= 0.5 && Number.isInteger(q.z) && q.z >= 0 ? { page: q.page, x: q.x, y: q.y, rot: q.rot, z: q.z } : null;

export function completeShow(p, animals) {
  const shows = p.shows + 1, next = { ...p, shows }, picked = pickSticker(animals), sticker = { ...picked, show: shows, ...stickerLook(shows, picked.type), place: null };
  next.stickers = [...p.stickers, sticker];
  const before = unlockedPaints(p), after = unlockedPaints(next), hatsBefore = unlockedHats(p), hatsAfter = unlockedHats(next);
  return { progress: next, sticker, newPaint: after.length > before.length ? after.at(-1) : null, newHat: hatsAfter.length > hatsBefore.length ? hatsAfter.at(-1) : null };
}
// Saved progress comes from browser storage: anything odd falls back to a clean value, and each paint must be one the player has
// unlocked. A save from version 1.0 has one tractor color instead of the paints: it becomes the body paint.
export function clampProgress(p, types) {
  if (!p || typeof p !== 'object') return emptyProgress();
  const shows = Number.isInteger(p.shows) && p.shows >= 0 ? p.shows : 0;
  const stickers = (Array.isArray(p.stickers) ? p.stickers : []).filter(s => s && types.includes(s.type) && Number.isInteger(s.show)).map(s => {
    const look = POSES.includes(s.pose) && Number.isInteger(s.view) && s.view >= 0 && s.view < VIEWS ? { pose: s.pose, view: s.view } : stickerLook(s.show, s.type); // 1.6 and older saves: none yet
    return { type: s.type, golden: !!s.golden, show: s.show, ...look, place: validPlace(s.place) };
  });
  const have = unlockedPaints({ shows }), saved = p.paint && typeof p.paint === 'object' ? p.paint : { body: p.color }, start = emptyProgress().paint;
  const pick = area => have.includes(saved[area]) ? saved[area] : start[area];
  const hatsOff = (Array.isArray(p.hatsOff) ? p.hatsOff : []).filter((h, i, a) => HATS.some(x => x.id === h) && a.indexOf(h) === i);
  const bookSeen = Number.isInteger(p.bookSeen) && p.bookSeen >= 0 ? p.bookSeen : lastShow({ stickers }); // a save from 1.9 or before: nothing is new
  return { shows, stickers, paint: { body: pick('body'), trim: pick('trim') }, hatsOff, bookSeen };
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
