// exp/test/perf/counters.mjs: WebGL call counters for the frame-rate probe (overview §8 R1). installCounters runs inside
// the page (probeScript serialises its source) and in Node tests on fake prototypes, so it must stay self-contained.
export function installCounters(protos, raf) {
  const s = { draws: 0, programs: 0, last: 0, lastT: 0, perFrame: [], frameMs: [] };
  for (const proto of protos) {
    for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements']) {
      const f = proto[name];
      if (typeof f === 'function') proto[name] = function (...a) { s.draws++; return f.apply(this, a); };
    }
    const cp = proto.createProgram;
    if (typeof cp === 'function') proto.createProgram = function (...a) { s.programs++; return cp.apply(this, a); };
  }
  const tick = t => {
    if (s.lastT) { s.perFrame.push(s.draws - s.last); s.frameMs.push(t - s.lastT); }
    s.last = s.draws; s.lastT = t; raf(tick);
  };
  raf(tick);
  return {
    reset() { s.perFrame.length = 0; s.frameMs.length = 0; s.last = s.draws; s.lastT = 0; },
    read() { return { programs: s.programs, draws: s.draws, perFrame: s.perFrame.slice(), frameMs: s.frameMs.slice() }; },
  };
}
export const probeScript = () => `globalThis.__lhProbe = (${installCounters})(` +
  '[globalThis.WebGL2RenderingContext, globalThis.WebGLRenderingContext].filter(Boolean).map(c => c.prototype), f => requestAnimationFrame(f));';
