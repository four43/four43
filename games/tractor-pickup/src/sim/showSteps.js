// The barn show timeline (spec 3.4) and the line-up row layout
import { NUMBER_WORDS } from './words.js';
import { TYPES } from './herd.js';
export function buildShowSteps(animals) {
  const steps = [{ kind: 'intro', say: ['lets-count'] }];
  animals.forEach((a, i) => steps.push({ kind: 'hop', index: i, n: i + 1, word: (a.golden ? 'Golden ' : '') + TYPES[a.type].word, say: [NUMBER_WORDS[i + 1], ...(a.golden ? ['golden'] : []), a.type] }));
  const order = [], n = {}; for (const a of animals) { if (!(a.type in n)) { order.push(a.type); n[a.type] = 0; } n[a.type]++; }
  // R-2: every word on screen is spoken, so each group label (number + name) is read after the total
  steps.push({ kind: 'all', n: animals.length, groups: order.map(t => ({ type: t, n: n[t], word: TYPES[t].word, say: [NUMBER_WORDS[n[t]], t] })), say: [NUMBER_WORDS[animals.length], 'animals', 'hooray'] });
  return steps;
}

// Neighbours stand r + r + pad apart (no overlap), groups get an extra gap; a row longer than the 13 m line-up is scaled down to fit.
export const ROW = { pad: 0.15, groupGap: 0.45, len: 13 };
// types: animal types in landing order. Returns x along the line-up (centred on 0) per animal for the hop row and the
// regrouped row, each group's center, the uniform scale and the longest row's width (outer edge to outer edge).
export function rowLayout(types, len = ROW.len) {
  const place = (idx, gapAt) => { const xs = []; let x = 0;
    idx.forEach((k, i) => { if (i) x += TYPES[types[idx[i - 1]]].r + TYPES[types[k]].r + ROW.pad + (gapAt(i) ? ROW.groupGap : 0); xs.push(x); });
    const lo = xs[0] - TYPES[types[idx[0]]].r, hi = xs.at(-1) + TYPES[types[idx.at(-1)]].r; return { xs, lo, hi }; };
  const order = [...new Set(types)], gidx = order.flatMap(t => types.flatMap((u, k) => u === t ? [k] : []));
  const hop = place(types.map((_, k) => k), () => false), grp = place(gidx, i => types[gidx[i]] !== types[gidx[i - 1]]);
  const raw = Math.max(hop.hi - hop.lo, grp.hi - grp.lo), scale = Math.min(1, len / raw);
  const out = { hop: [], group: [], groups: [], scale, width: raw * scale };
  hop.xs.forEach((x, i) => { out.hop[i] = (x - (hop.lo + hop.hi) / 2) * scale; });
  grp.xs.forEach((x, i) => { out.group[gidx[i]] = (x - (grp.lo + grp.hi) / 2) * scale; });
  for (const t of order) { const xs = types.flatMap((u, k) => u === t ? [out.group[k]] : []); out.groups.push({ type: t, x: (Math.min(...xs) + Math.max(...xs)) / 2 }); }
  return out;
}
