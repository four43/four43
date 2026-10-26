// The barn show timeline (spec 3.4) and the line-up layout (F-12)
import { NUMBER_WORDS, PLURAL } from './words.js';
import { TYPES } from './herd.js';

// F-6, F-7: one group per type in order of first landing; each group's animals hop out and are counted 1, 2, 3 ..., then the
// group label ("3 Pigs") is read. With two or more groups the running sum is read from zero ("0 plus 3 makes 3", "3 plus 2 makes 5"), each
// group moving into the tally circle after its stage; then all jump for the total.
export function buildShowSteps(animals) {
  const groups = [];
  animals.forEach((a, i) => { let g = groups.find(x => x.type === a.type); if (!g) groups.push(g = { type: a.type, members: [] }); g.members.push(i); });
  const steps = [{ kind: 'intro', say: ['lets-count'] }];
  groups.forEach((g, gi) => {
    g.members.forEach((index, k) => { const golden = !!animals[index].golden; steps.push({ kind: 'hop', index, group: gi, n: k + 1, golden, say: [NUMBER_WORDS[k + 1], ...(golden ? ['golden'] : [])] }); });
    const n = g.members.length; // R-2: every word on screen is spoken
    steps.push({ kind: 'group', group: gi, type: g.type, n, word: n === 1 ? TYPES[g.type].word : TYPES[g.type].plural, say: [NUMBER_WORDS[n], n === 1 ? g.type : PLURAL[g.type]] });
  });
  const total = animals.length, terms = groups.map(g => g.members.length);
  if (groups.length > 1) { // F-7, F-14: a running sum from zero: "0 + 3 = 3", "3 + 2 = 5", ... one group added (and moved into the tally circle) at a time
    const stages = []; let run = 0;
    terms.forEach((t, g) => { const to = run + t; stages.push({ from: run, add: t, to, group: g, say: [NUMBER_WORDS[run], 'plus', NUMBER_WORDS[t], 'makes', NUMBER_WORDS[to]] }); run = to; });
    steps.push({ kind: 'sum', terms, total, stages, say: stages.flatMap(st => st.say) });
  }
  steps.push({ kind: 'all', n: total, groups: groups.map(g => ({ type: g.type, n: g.members.length })), say: total === 1 ? ['hooray'] : [NUMBER_WORDS[total], 'animals', 'hooray'] });
  return steps;
}

// F-12: each group is a block of rows of up to `cols` animals, side by side 0.4 m apart, rows 0.6 m apart edge to edge. A block is at
// least as wide as its label ("3 Chickens"), so labels never collide. Blocks stand side by side with a 1.5 m gap; if they are wider
// than the line-up, the rows get shorter, then the blocks go on more lines, far enough apart that a line's animals do not hide the
// labels of the line behind it.
// x: along the line-up, centred on 0. d: depth from the line-up's barn-side edge toward the camera (the first row is deepest in).
export const LINEUP = { portraitLen: 8, len: 16, depth: 7, pad: 0.4, rowGap: 0.6, blockGap: 1.5, lineGap: 4.8, edge: 0.3, letter: 0.5 }; // letter: label width per letter ("3 Chickens" on one line), m
export function showLayout(groups, { len = LINEUP.len } = {}) { // groups: [{ type, n }]
  const block = (g, cols) => { const r = TYPES[g.type].r, c = Math.min(cols, g.n), rows = Math.ceil(g.n / c), word = g.n === 1 ? TYPES[g.type].word : TYPES[g.type].plural, aw = c * 2 * r + (c - 1) * LINEUP.pad;
    return { g, r, c, rows, aw, w: Math.max(aw, (word.length + 2) * LINEUP.letter), h: rows * 2 * r + (rows - 1) * LINEUP.rowGap }; };
  const pack = (cols, maxLines) => { // greedy: blocks in order, a new line when the next block does not fit
    const lines = [[]]; let w = 0;
    for (const b of groups.map(g => block(g, cols))) {
      const add = (lines.at(-1).length ? LINEUP.blockGap : 0) + b.w;
      if (lines.at(-1).length && w + add > len) { lines.push([]); w = 0; lines.at(-1).push(b); w = b.w; } else { lines.at(-1).push(b); w += add; }
    }
    return lines.length <= maxLines && lines.every(l => l.reduce((s, b, i) => s + b.w + (i ? LINEUP.blockGap : 0), 0) <= len + 1e-9) ? lines : null;
  };
  let lines = null;
  for (let n = 1; n <= 3 && !lines; n++) for (const cols of [4, 3, 2]) if ((lines = pack(cols, n))) break;
  lines ||= pack(1, groups.length);
  const spots = groups.map(() => []), labels = []; let d0 = LINEUP.edge, width = 0;
  for (const line of lines) {
    const lw = line.reduce((s, b, i) => s + b.w + (i ? LINEUP.blockGap : 0), 0), lh = Math.max(...line.map(b => b.h)); let x0 = -lw / 2; width = Math.max(width, lw);
    for (const b of line) {
      const gi = groups.indexOf(b.g);
      for (let k = 0; k < b.g.n; k++) { const row = Math.floor(k / b.c), col = k % b.c; spots[gi].push({ x: x0 + (b.w - b.aw) / 2 + b.r + col * (2 * b.r + LINEUP.pad), d: d0 + b.r + row * (2 * b.r + LINEUP.rowGap) }); }
      labels[gi] = { x: x0 + b.w / 2, d: d0 + b.h + 0.5 }; // just in front of the block: below it on screen
      x0 += b.w + LINEUP.blockGap;
    }
    d0 += lh + LINEUP.lineGap;
  }
  return { spots, labels, width, depth: d0 - LINEUP.lineGap + 0.5 };
}

// F-14: the tally circle, left of the blocks: the animals of each group move into it after their stage of the running sum. Spots are
// relative to the circle's center (x along the line-up, d toward the camera), in arrival order, each at the free point nearest the
// middle; r is the circle's radius. rMax: the room the farmyard keeps clear for it (12 cows), gap: from the blocks.
export const TALLY = { pad: 0.3, edge: 0.45, gap: 1.5, tallGap: 4.5, rMax: 4.8 }; // tallGap: in front of the blocks on a tall screen, room for the count above the circle (X-12)
export function tallyLayout(radii) {
  const spots = [], cand = Array.from({ length: 3000 }, (_, k) => { const rho = 0.09 * Math.sqrt(k), th = k * 2.399963; return { x: k ? rho * Math.cos(th) : 0, d: k ? rho * Math.sin(th) : 0 }; });
  radii.forEach((r, i) => spots.push(cand.find(c => spots.every((p, j) => Math.hypot(c.x - p.x, c.d - p.d) >= r + radii[j] + TALLY.pad))));
  return { spots, r: Math.max(...spots.map((p, i) => Math.hypot(p.x, p.d) + radii[i])) + TALLY.edge };
}
