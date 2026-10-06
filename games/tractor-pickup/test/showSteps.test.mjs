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
