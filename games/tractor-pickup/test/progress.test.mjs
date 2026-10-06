import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyProgress, completeShow, unlockedColors, unlockedHats, pickSticker, clampSettings, clampProgress, COLORS } from '../src/sim/progress.js';

test('golden animal wins the sticker; else the most-booped type; ties go to the first landed', () => {
  assert.deepEqual(pickSticker([{ type: 'pig' }, { type: 'cow', golden: true }, { type: 'pig' }]), { type: 'cow', golden: true });
  assert.deepEqual(pickSticker([{ type: 'cow' }, { type: 'pig' }, { type: 'pig' }]), { type: 'pig', golden: false });
  assert.deepEqual(pickSticker([{ type: 'cow' }, { type: 'pig' }]), { type: 'cow', golden: false });
});
test('a new tractor color every 3 shows, in order, ending at rainbow (W-3)', () => {
  let p = emptyProgress(), got = [];
  for (let i = 0; i < 18; i++) { const r = completeShow(p, [{ type: 'pig' }]); p = r.progress; if (r.newColor) got.push(r.newColor); }
  assert.deepEqual(got, COLORS.slice(1)); assert.deepEqual(unlockedColors(p), COLORS);
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
test('saved progress that is damaged falls back to clean values; a locked color is not kept', () => {
  const types = ['pig', 'cow'];
  assert.deepEqual(clampProgress('junk', types), emptyProgress());
  assert.deepEqual(clampProgress({ shows: 1, color: 'rainbow', stickers: [{ type: 'pig', show: 1 }, { type: 'dragon', show: 2 }, null] }, types), { shows: 1, color: 'red', stickers: [{ type: 'pig', golden: false, show: 1 }] });
  assert.equal(clampProgress({ shows: 3, color: 'green', stickers: [] }, types).color, 'green');
});
