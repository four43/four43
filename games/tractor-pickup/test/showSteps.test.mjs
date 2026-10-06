import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShowSteps, showLayout, LINEUP } from '../src/sim/showSteps.js';
import { TYPES } from '../src/sim/herd.js';

test('show steps: each type is counted as its own group, in order of first landing, then the sum and the total (F-6, F-7)', () => {
  const s = buildShowSteps([{ type: 'pig' }, { type: 'cow' }, { type: 'pig', golden: true }, { type: 'chick' }]);
  assert.deepEqual(s.map(x => x.kind), ['intro', 'hop', 'hop', 'group', 'hop', 'group', 'hop', 'group', 'sum', 'all']);
  assert.deepEqual(s[0].say, ['lets-count']);
  assert.deepEqual(s.filter(x => x.kind === 'hop').map(x => [x.index, x.group, x.n, x.golden]), [[0, 0, 1, false], [2, 0, 2, true], [1, 1, 1, false], [3, 2, 1, false]]);
  assert.deepEqual(s.filter(x => x.kind === 'hop').map(x => x.say), [['one'], ['two', 'golden'], ['one'], ['one']]);
  assert.deepEqual(s.filter(x => x.kind === 'group').map(x => [x.type, x.n, x.word, x.say]), [['pig', 2, 'Pigs', ['two', 'pigs']], ['cow', 1, 'Cow', ['one', 'cow']], ['chick', 1, 'Chick', ['one', 'chick']]]);
  const sum = s.find(x => x.kind === 'sum'); assert.deepEqual(sum.terms, [2, 1, 1]); assert.equal(sum.total, 4);
  assert.deepEqual(sum.say, ['two', 'plus', 'one', 'plus', 'one', 'makes', 'four']);
  assert.deepEqual(s.at(-1).say, ['four', 'animals', 'hooray']); assert.equal(s.at(-1).n, 4);
});
test('one group has no sum; a single animal ends with just a hooray', () => {
  const s = buildShowSteps(Array.from({ length: 12 }, () => ({ type: 'sheep' })));
  assert.ok(!s.some(x => x.kind === 'sum'));
  assert.deepEqual(s.filter(x => x.kind === 'hop').at(-1).say, ['twelve']); assert.deepEqual(s.find(x => x.kind === 'group').say, ['twelve', 'sheep']);
  assert.deepEqual(s.at(-1).say, ['twelve', 'animals', 'hooray']);
  assert.deepEqual(buildShowSteps([{ type: 'dog' }]).at(-1).say, ['hooray']);
});

const overlaps = (groups, L) => { const all = groups.flatMap((g, gi) => L.spots[gi].map(p => ({ ...p, r: TYPES[g.type].r })));
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) if (Math.hypot(all[i].x - all[j].x, all[i].d - all[j].d) < all[i].r + all[j].r + 0.3) return true; return false; };
const LOADS = [
  [{ type: 'pig', n: 3 }, { type: 'cow', n: 2 }, { type: 'chicken', n: 1 }],
  [{ type: 'cow', n: 12 }],
  [{ type: 'pig', n: 2 }, { type: 'cow', n: 2 }, { type: 'sheep', n: 2 }, { type: 'duck', n: 2 }, { type: 'bunny', n: 2 }, { type: 'dog', n: 2 }],
  [{ type: 'cow', n: 4 }, { type: 'pig', n: 4 }, { type: 'sheep', n: 4 }],
  [{ type: 'pig', n: 1 }, { type: 'cow', n: 1 }, { type: 'chicken', n: 1 }, { type: 'sheep', n: 1 }, { type: 'duck', n: 1 }, { type: 'bunny', n: 1 }, { type: 'dog', n: 1 }, { type: 'chick', n: 5 }],
];
test('line-up layout: no two animals overlap, all inside the line-up length, rows of at most 4 (F-12)', () => {
  for (const groups of LOADS) {
    const L = showLayout(groups);
    assert.equal(overlaps(groups, L), false, JSON.stringify(groups));
    groups.forEach((g, gi) => {
      assert.equal(L.spots[gi].length, g.n);
      for (const p of L.spots[gi]) { assert.ok(Math.abs(p.x) + TYPES[g.type].r <= LINEUP.len / 2 + 1e-9, `x ${p.x}`); assert.ok(p.d - TYPES[g.type].r >= 0); }
      const rows = new Map(); for (const p of L.spots[gi]) rows.set(p.d.toFixed(3), (rows.get(p.d.toFixed(3)) || 0) + 1);
      for (const n of rows.values()) assert.ok(n <= 4);
      assert.ok(L.labels[gi].d > Math.max(...L.spots[gi].map(p => p.d)), 'the label stands in front of its block');
    });
    assert.ok(L.width <= LINEUP.len + 1e-9);
  }
});
test('line-up layout: a block is at least as wide as its label, so labels never collide', () => {
  for (const groups of LOADS) {
    const L = showLayout(groups), w = g => ((g.n === 1 ? TYPES[g.type].word : TYPES[g.type].plural).length + 2) * LINEUP.letter; // the number, a space and the word
    for (let i = 0; i < groups.length; i++) for (let j = i + 1; j < groups.length; j++) {
      const a = L.labels[i], b = L.labels[j]; if (Math.abs(a.d - b.d) > 0.5) continue; // labels of different lines
      assert.ok(Math.abs(a.x - b.x) >= (w(groups[i]) + w(groups[j])) / 2 - 1e-9, `${groups[i].type} and ${groups[j].type} labels collide`);
    }
    groups.forEach((g, gi) => L.spots.forEach((sp, gj) => { if (gj !== gi) for (const p of sp) assert.ok(!(p.d > L.labels[gi].d - 0.2 && p.d < L.labels[gi].d + 2.2 && Math.abs(p.x - L.labels[gi].x) < w(g) / 2 + 0.5), `an animal stands in front of the ${g.type} label`); }));
  }
});
test('line-up layout: blocks stay apart so each group reads as one group', () => {
  const groups = LOADS[0], L = showLayout(groups);
  const span = gi => [Math.min(...L.spots[gi].map((p) => p.x - TYPES[groups[gi].type].r)), Math.max(...L.spots[gi].map(p => p.x + TYPES[groups[gi].type].r))];
  for (let i = 1; i < groups.length; i++) assert.ok(span(i)[0] - span(i - 1)[1] >= LINEUP.blockGap - 1e-9);
});
