import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyProgress, completeShow, unlockedPaints, unlockedHats, pickSticker, clampSettings, clampProgress, hasPaintChoice, START_PAINTS, NEW_PAINTS } from '../src/sim/progress.js';

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
    { shows: 1, paint: { body: 'red', trim: 'red' }, stickers: [{ type: 'pig', golden: false, show: 1 }] });
  assert.deepEqual(clampProgress({ shows: 3, paint: { body: 'green', trim: 'green' }, stickers: [] }, types).paint, { body: 'green', trim: 'green' });
  assert.deepEqual(clampProgress({ shows: 3, color: 'green', stickers: [] }, types).paint, { body: 'green', trim: 'yellow' }, 'a 1.0 save: its color becomes the body paint');
});
import { seedParam, powerParam } from '../src/sim/progress.js';
test('?seed and ?power guard invalid values', () => {
  assert.equal(seedParam('42'), 42); assert.equal(seedParam('0'), 0);
  for (const bad of [null, '', 'abc', '-1', '1.5', 'NaN', 'Infinity', '99999999999']) assert.equal(seedParam(bad), null, String(bad));
  assert.equal(powerParam('high', 'medium'), 'high'); assert.equal(powerParam('turbo', 'low'), 'low'); assert.equal(powerParam(null, 'medium'), 'medium');
});
