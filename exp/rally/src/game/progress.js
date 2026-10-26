// Progress along the course (spec tracks T-24). The car's course position p is metres from the
// start line, continuous (loop wrap is unwrapped, so lap n runs base … base + lapLength).
// Checkpoints and the line count only when crossed forwards, in order, near the road, and in an
// update that moved p a plausible distance: a bigger move is a shortcut across a hairpin (the
// locator snapped to another part of the road) or a teleport, and credits nothing in between.
const mod = (a, n) => ((a % n) + n) % n;

export function makeProgress(track, { maxD = 15, jump = 50, missAfter = 30 } = {}) {
  const L = track.layout, gates = track.roadside.gates, closed = L.closed;
  const lineS = gates[0].s;
  const lapLength = closed ? L.length : gates.find((g) => g.kind === 'finish').s - lineS;
  const cps = track.roadside.checkpoints
    .map((c) => (closed ? mod(c.s - lineS, L.length) : c.s - lineS))
    .filter((p) => p > 0 && p < lapLength).sort((a, b) => a - b);

  const P = {
    lineS, lapLength, cps,
    p: 0, s: 0, lap: 0, next: 0, base: 0, missed: false, started: false, finished: false,
    reset(p0) {
      P.p = p0; P.s = closed ? mod(lineS + p0, L.length) : lineS + p0;
      P.lap = 0; P.next = 0; P.base = 0; P.missed = false; P.started = p0 >= 0; P.finished = false;
    },
    update(x, z) {
      const ev = [], { s, d } = track.locator.locate(x, z);
      let dp = s - P.s;
      if (closed) dp = mod(dp + L.length / 2, L.length) - L.length / 2;
      const prev = P.p; P.s = s; P.p += dp;
      const now = P.p, crossed = (t) => prev < t && t <= now;
      if (!P.finished && Math.abs(dp) <= jump && Math.abs(d) <= maxD) {
        if (!P.started && crossed(0)) { P.started = true; ev.push({ type: 'start' }); }
        if (P.started) {
          while (P.next < cps.length && crossed(P.base + cps[P.next])) {
            ev.push({ type: 'checkpoint', index: P.next, lap: P.lap });
            P.next++; P.missed = false;
          }
          if (crossed(P.base + lapLength)) {
            const valid = P.next === cps.length;
            if (closed) {
              ev.push({ type: 'line', lap: P.lap, valid });
              P.lap++; P.base += lapLength; P.next = 0; P.missed = false;
            } else if (valid) { P.finished = true; ev.push({ type: 'finish' }); }
            else ev.push({ type: 'blocked', index: P.next });
          }
        }
      }
      if (P.started && !P.missed && P.next < cps.length && now > P.base + cps[P.next] + missAfter) {
        P.missed = true; ev.push({ type: 'missed', index: P.next });
      }
      return ev;
    },
  };
  return P;
}
