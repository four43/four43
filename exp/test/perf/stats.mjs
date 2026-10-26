// exp/test/perf/stats.mjs: probe summaries and the phase 3 budgets (overview §8): R1 programs ≤ today + 2 and draw calls
// (median per frame) ≤ today; R3 total gzip ≤ today + 10% and Playwright desktop time to settled() ≤ today + 20%.
const at = (a, p) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
export function summarise({ programs, perFrame, frameMs }) {
  return { programs, drawsMedian: at(perFrame, 0.5), drawsMax: perFrame.length ? Math.max(...perFrame) : null,
    frameMsMedian: at(frameMs, 0.5), frameMsP95: at(frameMs, 0.95), frames: perFrame.length };
}
export function judge(base, now) {
  if (!base) return ['no baseline'];
  const out = [];
  if (now.programs > base.programs + 2) out.push(`R1 programs ${now.programs} > ${base.programs} + 2`);
  if (now.drawsMedian > base.drawsMedian) out.push(`R1 draw calls ${now.drawsMedian} > ${base.drawsMedian}`);
  if (now.size.gzip > base.size.gzip * 1.10) out.push(`R3 gzip ${now.size.gzip} > ${base.size.gzip} × 1.10`);
  if (now.settledMs > base.settledMs * 1.20) out.push(`R3 settled ${Math.round(now.settledMs)} ms > ${Math.round(base.settledMs)} ms × 1.20`);
  return out;
}
