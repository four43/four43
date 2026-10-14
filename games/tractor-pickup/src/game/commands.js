// The local commands (lion-hawk 2f T4–T5, [I-7], #84, #85): view → sim, game-wide, so a pausing overlay never drops them (#49).
// The sim owns the player's records: each command validates or clamps its data, changes them and emits the record that
// changed (`progress`, `settings`), which the view saves. Outside the farm (the sandbox) they do nothing.
import { toggleHat, wornHats, placeSticker, unplaceSticker, seeBook, unlockedPaints, clampSettings } from '../sim/progress.js';
import { setBedtime } from '../sim/bedtime.js';
import { play, showDone, closeReward, open } from './flow.js';
import { createWarnOnce } from 'lion-hawk/sim';
import { tuneSet, TUNE_POWERS } from '../sim/tune.js';

const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v < hi;
const progress = (e, s) => e.emit('progress', { progress: structuredClone(s.progress) }); // a copy: the event log never sees later changes

// handler(engine, farm state, data) → a game-wide command that runs only while the farm is the main scene
const farm = fn => (e, d, ctx) => { if (ctx?.name === 'farm' && ctx.state.game) fn(e, ctx.state, d ?? {}); };

// D-5, G4b: ?tune's commands run on the farm and on the sandbox pad, for a solo player or the host. A guest's are dropped: the feel
// constants are module-level, so a guest tuning its own copy would only drive differently from the host's farm (its panel is hidden)
const tuner = (warn, fn) => (e, d, ctx) => {
  if ((ctx?.name !== 'farm' && ctx?.name !== 'sandbox') || !ctx.state.game) return;
  if (ctx.state.net?.role === 'guest') return warn('tune: a guest cannot tune', new Error('tune is the host\'s (or a solo player\'s)'));
  fn(e, ctx.state, d ?? {});
};

// api: the farm's (newFarm)
export const makeCommands = (api, warn = createWarnOnce()) => ({
  play: farm((e, s) => play(e, s)), // F-11, A-7: the view's first gesture
  // W-3: a pot on the paint screen; both paints must be unlocked
  paint: farm((e, s, d) => {
    const have = unlockedPaints(s.progress); if (!have.includes(d.body) || !have.includes(d.trim)) return;
    s.progress.paint = { body: d.body, trim: d.trim }; s.net?.sync?.setPaint(s.progress.paint); // M-60: the others see it
    progress(e, s);
  }),
  // W-4: a hat on or off (only an unlocked one changes anything)
  hat: farm((e, s, d) => {
    if (typeof d.id !== 'string') return;
    s.progress = toggleHat(s.progress, d.id); s.game.wearHats(wornHats(s.progress));
    progress(e, s);
  }),
  // W-2: a sticker dragged onto a page (x, y clamped by placeSticker) or back to the tray
  'sticker.place': farm((e, s, d) => {
    if (!isInt(d.i, 0, s.progress.stickers.length) || !isInt(d.page, 0, 100) || !Number.isFinite(d.x) || !Number.isFinite(d.y)) return;
    s.progress = placeSticker(s.progress, d.i, { page: d.page, x: d.x, y: d.y }); progress(e, s);
  }),
  'sticker.unplace': farm((e, s, d) => {
    if (!isInt(d.i, 0, s.progress.stickers.length)) return;
    s.progress = unplaceSticker(s.progress, d.i); progress(e, s);
  }),
  'book.seen': farm((e, s) => { s.progress = seeBook(s.progress); progress(e, s); }), // F-3: the drive button's badge
  // P-6: in place (an open screen holds this same object, so its next save cannot bring the stickers back); a screen left
  // open would show stickers that are gone, so it closes the way its own close button would. The parent menu it came from
  // closes too (main.js's done())
  'stickers.clear': farm((e, s) => {
    s.progress.stickers.length = 0; progress(e, s);
    for (const n of ['parent', 'paint', 'book']) if (e.isOpen(n)) e.close(n);
    if (e.isOpen('reward')) closeReward(e, s);
  }),
  // P-3..P-5: power applies at once, voice and music in the view, a seed with the next new farm
  settings: farm((e, s, d) => {
    s.settings = clampSettings({ ...s.settings, ...d }); s.power = s.settings.power; s.game.tractor.setPower?.(s.power);
    e.emit('settings', { settings: s.settings });
  }),
  // F-10, #79: the view's show is over; where each rider stands
  'show.done': farm((e, s, d) => showDone(e, s, d.spots, d.gen)),
  // #85: the view's wall date (epoch ms), once a second and on coming back to the page; the farm step checks bedtime against it
  clock: farm((e, s, d) => { if (Number.isFinite(d.date)) s.date = d.date; }),
  // E-5: the parent's bedtime (minutes: one of BEDTIME_CHOICES, or null to cancel), counted from the date it was set
  'bed.set': farm((e, s, d) => {
    if (!Number.isFinite(d.date)) return;
    setBedtime(s.bed, d.minutes ?? null, d.date); s.date = d.date; e.emit('bed', { bed: { ...s.bed } });
  }),
  // M-34: a join link (?r=) opens the Multiplayer panel over the farm (the panel itself is the view's)
  'multiplayer.open': farm(e => open(e, 'multiplayer')),
  // D-5, G4b: a ?tune slider. key: a sim/tune.js row id (value clamped to its range and written where the sim reads it), or 'power'
  // (the tractor's preset, not the parent's saved setting). Unknown keys and bad values are warned and dropped; the tune event
  // carries what was written (the panel shows it and logs it)
  tune: tuner(warn, (e, s, d) => {
    let value = null;
    if (d.key === 'power') { if (TUNE_POWERS.includes(d.value)) s.game.tractor.setPower(value = d.value); }
    else value = tuneSet(s.game, d.key, d.value);
    if (value === null) return warn(`tune: dropped ${JSON.stringify(d.key)}`, new Error(`tune: unknown key or bad value ${JSON.stringify(d)}`));
    e.emit('tune', { key: d.key, value });
  }),
  // D-5: the panel's reset button: knocked props and broken trees stand again
  'tune.reset': tuner(warn, (e, s) => { s.game.yardProps?.reset(); s.game.trees?.reset(); e.emit('tune.reset', {}); }),
  'farm.new': (e, d, ctx) => { if (ctx?.name === 'farm' && ctx.state.game) api.newFarm(e, ctx); }, // P-8, M-19, [S-6]
});
