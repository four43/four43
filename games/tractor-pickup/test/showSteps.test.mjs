import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShowSteps } from '../src/sim/showSteps.js';

test('show steps: intro, one hop per animal with number + name, then all together with groups', () => {
  const s = buildShowSteps([{ type: 'pig' }, { type: 'cow' }, { type: 'pig', golden: true }, { type: 'chick' }]);
  assert.equal(s[0].kind, 'intro'); assert.deepEqual(s[0].say, ['lets-count']);
  const hops = s.filter(x => x.kind === 'hop');
  assert.deepEqual(hops.map(x => [x.n, x.word]), [[1, 'Pig'], [2, 'Cow'], [3, 'Golden Pig'], [4, 'Chick']]);
  assert.deepEqual(hops.map(x => x.say), [['one', 'pig'], ['two', 'cow'], ['three', 'golden', 'pig'], ['four', 'chick']]);
  const all = s.at(-1); assert.equal(all.kind, 'all'); assert.equal(all.n, 4);
  assert.deepEqual(all.groups.map(g => [g.type, g.n, g.word]), [['pig', 2, 'Pig'], ['cow', 1, 'Cow'], ['chick', 1, 'Chick']]);
  assert.deepEqual(all.say, ['four', 'animals', 'hooray']);
});
test('a full load of 12 counts to twelve', () => {
  const s = buildShowSteps(Array.from({ length: 12 }, () => ({ type: 'sheep' })));
  assert.deepEqual(s.filter(x => x.kind === 'hop').at(-1).say, ['twelve', 'sheep']); assert.deepEqual(s.at(-1).say, ['twelve', 'animals', 'hooray']);
});
import { rowLayout, ROW } from '../src/sim/showSteps.js';
import { TYPES } from '../src/sim/herd.js';

test('the "all" step reads each group label too (R-2): number + name per group', () => {
  const s = buildShowSteps([{ type: 'pig' }, { type: 'cow' }, { type: 'pig' }, { type: 'chick' }]);
  assert.deepEqual(s.at(-1).groups.map(g => g.say), [['two', 'pig'], ['one', 'cow'], ['one', 'chick']]);
});
test('row layout: neighbours never overlap (r + r + pad), groups get an extra gap, centred on 0', () => {
  const types = ['cow', 'cow', 'pig', 'cow', 'chick'], L = rowLayout(types);
  for (let i = 1; i < types.length; i++) assert.ok(L.hop[i] - L.hop[i - 1] >= TYPES[types[i - 1]].r + TYPES[types[i]].r + ROW.pad - 1e-9, `hop ${i}`);
  // group order: cow, cow, cow | pig | chick (animal indices 0, 1, 3 | 2 | 4)
  assert.ok(L.group[3] - L.group[1] >= 2 * TYPES.cow.r + ROW.pad - 1e-9);
  assert.ok(L.group[2] - L.group[3] >= TYPES.cow.r + TYPES.pig.r + ROW.pad + ROW.groupGap - 1e-9, 'gap between groups');
  assert.ok(Math.abs((L.group[0] - TYPES.cow.r) + (L.group[4] + TYPES.chick.r)) < 1e-9, 'group row centred');
  assert.deepEqual(L.groups.map(g => g.type), ['cow', 'pig', 'chick']);
  assert.ok(Math.abs(L.groups[0].x - (L.group[0] + L.group[3]) / 2) < 1e-9);
  assert.equal(L.scale, 1);
});
test('row layout: a row longer than the 13 m line-up scales down uniformly to fit', () => {
  const types = Array.from({ length: 12 }, (_, i) => i % 2 ? 'cow' : 'pig'), L = rowLayout(types);
  assert.ok(L.scale < 1); assert.ok(L.width <= ROW.len + 1e-9);
  for (const xs of [L.hop, L.group]) xs.forEach((x, k) => assert.ok(Math.abs(x) + TYPES[types[k]].r * L.scale <= ROW.len / 2 + 1e-9, `animal ${k} at ${x}`));
});
