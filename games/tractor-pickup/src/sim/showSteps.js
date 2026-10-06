// The barn show timeline (spec 3.4)
import { NUMBER_WORDS } from './words.js';
import { TYPES } from './herd.js';
export function buildShowSteps(animals) {
  const steps = [{ kind: 'intro', say: ['lets-count'] }];
  animals.forEach((a, i) => steps.push({ kind: 'hop', index: i, n: i + 1, word: (a.golden ? 'Golden ' : '') + TYPES[a.type].word, say: [NUMBER_WORDS[i + 1], ...(a.golden ? ['golden'] : []), a.type] }));
  const order = [], n = {}; for (const a of animals) { if (!(a.type in n)) { order.push(a.type); n[a.type] = 0; } n[a.type]++; }
  steps.push({ kind: 'all', n: animals.length, groups: order.map(t => ({ type: t, n: n[t], word: TYPES[t].word })), say: [NUMBER_WORDS[animals.length], 'animals', 'hooray'] });
  return steps;
}
