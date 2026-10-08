import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyProgress, completeShow, unlockedPaints, unlockedHats, pickSticker, clampSettings, clampProgress, hasPaintChoice, START_PAINTS, NEW_PAINTS, stickerLook, POSES, VIEWS, placeSticker, unplaceSticker, bookPages, wornHats, toggleHat, newStickers, seeBook } from '../src/sim/progress.js';

test('golden animal wins the sticker; else the most-booped type; ties go to the first landed', () => {
  assert.deepEqual(pickSticker([{ type: 'pig' }, { type: 'cow', golden: true }, { type: 'pig' }]), { type: 'cow', golden: true });
  assert.deepEqual(pickSticker([{ type: 'cow' }, { type: 'pig' }, { type: 'pig' }]), { type: 'pig', golden: false });
  assert.deepEqual(pickSticker([{ type: 'cow' }, { type: 'pig' }]), { type: 'cow', golden: false });
});
test('a new paint every 3 shows, in order, ending at rainbow; red body and yellow trim to start (W-3)', () => {
  let p = emptyProgress(), got = [];
  assert.deepEqual(p.paint, { body: 'red', trim: 'yellow' }); assert.deepEqual(unlockedPaints(p), START_PAINTS);
  for (let i = 0; i < 21; i++) { const r = completeShow(p, [{ type: 'pig' }]); p = r.progress; if (r.newPaint) got.push(r.newPaint); }
  assert.deepEqual(got, NEW_PAINTS); assert.deepEqual(unlockedPaints(p), [...START_PAINTS, ...NEW_PAINTS]);
  assert.deepEqual(p.paint, { body: 'red', trim: 'yellow' }, 'a new paint is not put on by itself');
});
test('the start screen shows only once there is a paint to choose (F-11)', () => {
  assert.equal(hasPaintChoice({ shows: 0 }), false); assert.equal(hasPaintChoice({ shows: 2 }), false); assert.equal(hasPaintChoice({ shows: 3 }), true);
});
test('hats unlock after shows 4, 8 and 12 (W-4)', () => {
  let p = emptyProgress(), got = [];
  for (let i = 0; i < 12; i++) { const r = completeShow(p, [{ type: 'pig' }]); p = r.progress; if (r.newHat) got.push([p.shows, r.newHat]); }
  assert.deepEqual(got, [[4, 'straw'], [8, 'cowboy'], [12, 'party']]); assert.deepEqual(unlockedHats(p), ['straw', 'cowboy', 'party']);
});
test('stickers accumulate with the show number (W-1, W-2)', () => {
  let p = emptyProgress(); p = completeShow(p, [{ type: 'duck' }]).progress; p = completeShow(p, [{ type: 'cow' }]).progress;
  assert.deepEqual(p.stickers.map(s => [s.show, s.type]), [[1, 'duck'], [2, 'cow']]);
});
test('settings are clamped to the spec values (P-3..P-7)', () => {
  assert.deepEqual(clampSettings({ goal: 40, power: 'turbo', voice: 'yes', music: false, seed: -3 }), { power: 'medium', voice: true, music: false, seed: null });
  assert.deepEqual(clampSettings({ power: 'high', seed: 42 }), { power: 'high', voice: true, music: true, seed: 42 });
});
test('settings that are not an object (stored null, array, string, number) give the defaults and never throw', () => {
  for (const bad of [null, undefined, [], 'x', 123, true]) assert.deepEqual(clampSettings(bad), { power: 'medium', voice: true, music: true, seed: null });
});
test('saved progress that is damaged falls back to clean values; a locked paint is not kept', () => {
  const types = ['pig', 'cow'];
  assert.deepEqual(clampProgress('junk', types), emptyProgress());
  assert.deepEqual(clampProgress({ shows: 1, paint: { body: 'rainbow', trim: 'red' }, stickers: [{ type: 'pig', show: 1 }, { type: 'dragon', show: 2 }, null] }, types),
    { shows: 1, hatsOff: [], bookSeen: 1, paint: { body: 'red', trim: 'red' }, stickers: [{ type: 'pig', golden: false, show: 1, ...stickerLook(1, 'pig'), place: null }] });
  assert.deepEqual(clampProgress({ shows: 3, paint: { body: 'green', trim: 'green' }, stickers: [] }, types).paint, { body: 'green', trim: 'green' });
  assert.deepEqual(clampProgress({ shows: 3, color: 'green', stickers: [] }, types).paint, { body: 'green', trim: 'yellow' }, 'a 1.0 save: its color becomes the body paint');
});
import { seedParam, powerParam } from '../src/sim/progress.js';
test('?seed and ?power guard invalid values', () => {
  assert.equal(seedParam('42'), 42); assert.equal(seedParam('0'), 0);
  for (const bad of [null, '', 'abc', '-1', '1.5', 'NaN', 'Infinity', '99999999999']) assert.equal(seedParam(bad), null, String(bad));
  assert.equal(powerParam('high', 'medium'), 'high'); assert.equal(powerParam('turbo', 'low'), 'low'); assert.equal(powerParam(null, 'medium'), 'medium');
});

test('each sticker has a pose and a camera angle from its show and type: varied, and the same every time (W-1)', () => {
  const looks = []; for (let show = 1; show <= 60; show++) for (const type of ['pig', 'cow', 'duck']) { const l = stickerLook(show, type); assert.deepEqual(stickerLook(show, type), l); assert.ok(POSES.includes(l.pose) && Number.isInteger(l.view) && l.view >= 0 && l.view < VIEWS); looks.push(l.pose + l.view); }
  assert.ok(new Set(looks).size >= POSES.length * VIEWS * 0.8, `only ${new Set(looks).size} looks`);
  for (const pose of POSES) assert.ok(looks.some(l => l.startsWith(pose)), `${pose} never comes up`);
  const p = completeShow(emptyProgress(), [{ type: 'duck' }]).progress; assert.deepEqual(p.stickers[0], { type: 'duck', golden: false, show: 1, ...stickerLook(1, 'duck'), place: null }); // a new sticker waits in the tray
});
test('stickers go on a page where they are dropped, come to the front when moved, and can go back to the tray (W-2)', () => {
  let p = emptyProgress(); for (const t of ['pig', 'cow', 'duck']) p = completeShow(p, [{ type: t }]).progress;
  assert.equal(bookPages(p), 1);
  p = placeSticker(p, 0, { page: 0, x: 0.3, y: 0.4 }); p = placeSticker(p, 1, { page: 0, x: 0.6, y: 0.5 });
  assert.deepEqual([p.stickers[0].place.x, p.stickers[0].place.y], [0.3, 0.4]); assert.ok(Math.abs(p.stickers[0].place.rot) <= 0.2);
  assert.ok(p.stickers[1].place.z > p.stickers[0].place.z);
  const rot = p.stickers[0].place.rot; p = placeSticker(p, 0, { page: 0, x: 0.7, y: 0.2 });
  assert.ok(p.stickers[0].place.z > p.stickers[1].place.z, 'moved sticker comes to the front'); assert.equal(p.stickers[0].place.rot, rot, 'keeps its tilt');
  assert.equal(bookPages(p), 2, 'one empty page after the last used page');
  p = placeSticker(p, 2, { page: 1, x: 2, y: -1 }); assert.deepEqual([p.stickers[2].place.x, p.stickers[2].place.y], [0.95, 0.05], 'kept on the page');
  assert.equal(bookPages(p), 3);
  p = unplaceSticker(p, 2); assert.equal(p.stickers[2].place, null); assert.equal(bookPages(p), 2);
  const saved = clampProgress(JSON.parse(JSON.stringify(p)), ['pig', 'cow', 'duck']); assert.deepEqual(saved.stickers, p.stickers, 'placements survive storage');
  const bad = clampProgress({ shows: 2, stickers: [{ type: 'pig', show: 1, pose: 'fly', view: 9, place: { page: -1, x: 'a' } }, { type: 'cow', show: 2, place: { page: 0, x: 0.5, y: 0.5, rot: 0.1, z: 3 } }] }, ['pig', 'cow']);
  assert.deepEqual(bad.stickers[0], { type: 'pig', golden: false, show: 1, ...stickerLook(1, 'pig'), place: null }, 'damaged look and place are rebuilt');
  assert.deepEqual(bad.stickers[1].place, { page: 0, x: 0.5, y: 0.5, rot: 0.1, z: 3 });
});

test('hats can be turned off and on: animals wear the unlocked hats that are on; a new hat starts on; the choice is saved (W-4)', () => {
  let p = emptyProgress(); for (let i = 0; i < 8; i++) p = completeShow(p, [{ type: 'pig' }]).progress;
  assert.deepEqual(wornHats(p), ['straw', 'cowboy']);
  p = toggleHat(p, 'straw'); assert.deepEqual(wornHats(p), ['cowboy']);
  p = toggleHat(p, 'cowboy'); assert.deepEqual(wornHats(p), [], 'all off: no hats');
  p = toggleHat(p, 'party'); assert.deepEqual(p.hatsOff, ['straw', 'cowboy'], 'a hat not unlocked yet cannot be toggled');
  for (let i = 0; i < 4; i++) p = completeShow(p, [{ type: 'pig' }]).progress;
  assert.deepEqual(wornHats(p), ['party'], 'the new hat starts on, the others stay off');
  p = toggleHat(p, 'straw'); assert.deepEqual(wornHats(p), ['straw', 'party']);
  assert.deepEqual(clampProgress(JSON.parse(JSON.stringify(p)), ['pig']).hatsOff, ['cowboy'], 'kept in storage');
  assert.deepEqual(clampProgress({ shows: 12, stickers: [], hatsOff: ['crown', 'party', 3] }, ['pig']).hatsOff, ['party'], 'unknown hats dropped');
  assert.deepEqual(clampProgress({ shows: 12, stickers: [] }, ['pig']).hatsOff, [], 'older saves: every hat on');
});

test('the badge counts only the stickers earned since the book was last opened (F-3, W-2)', () => {
  let p = emptyProgress(); assert.equal(newStickers(p), 0);
  p = completeShow(p, [{ type: 'pig' }]).progress; p = completeShow(p, [{ type: 'cow' }]).progress; assert.equal(newStickers(p), 2);
  p = seeBook(p); assert.equal(newStickers(p), 0);
  p = completeShow(p, [{ type: 'duck' }]).progress; assert.equal(newStickers(p), 1);
  p = { ...p, stickers: [] }; assert.equal(newStickers(p), 0, 'cleared stickers: nothing new');
});
test('a saved bookSeen is kept; a save without one has nothing new (F-3)', () => {
  const types = ['pig', 'cow'], stickers = [{ type: 'pig', show: 1 }, { type: 'cow', show: 2 }];
  assert.equal(clampProgress({ shows: 2, stickers, bookSeen: 1 }, types).bookSeen, 1);
  assert.equal(newStickers(clampProgress({ shows: 2, stickers }, types)), 0);
  assert.equal(clampProgress({ shows: 2, stickers, bookSeen: -3 }, types).bookSeen, 2);
});
