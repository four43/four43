// Rumble output (rally-spec R7, R8-2; lion-hawk 0.13 [C-14]): two motor levels → the seat's pads (lp.pads: the live Gamepads the
// engine refreshes each frame), as a short dual-rumble effect re-sent each frame (a new effect replaces the playing one, so the
// duration is just a cut-off if frames stop coming). Pads without an actuator (Firefox, most of Safari) are skipped: rumble is a
// nice-to-have, never an error.
//
// The engine owns stopping: page hide, blur and a pausing overlay, a pad's first sight, and the game moments it is told about
// (view.haptics.stop('menu' | 'finish' | 'exit'): a zero effect plus reset for 20 frames). stop(reason) tells it once per
// transition. While view.haptics.paused nothing is sent. What stays here is the send logic: Chromium queues each playEffect on
// a task but runs reset() at once, so a reset can cancel an effect sent a frame earlier. A gap while driving (both levels ~0,
// e.g. between ABS pulses) is a zero-magnitude effect only, queued behind the last pulse (playtest 2026-10-19); a gap longer
// than GAP_FRAMES ends with one zero effect plus reset (not a menu, finish or exit, so not the engine's).
// kill() is the ?rumble lab's (rumbleLab.js): the lab runs no engine, so on pagehide it zeroes its pads itself, once.
const ON = 0.005, DURATION = 120; // ms: about 7 frames at 60 Hz, so a hitch doesn't leave a gap
const GAP_FRAMES = 15;            // ~1/4 s of driving quiet before it ends
const NO = Object.freeze([]);
const ZERO = Object.freeze({ startDelay: 0, duration: 1, strongMagnitude: 0, weakMagnitude: 0 });

// pads(): the seat's live pads this frame; haptics(): view.haptics (null when the game turned autoStop off, or before enter)
export function rumbleOut({ pads = () => NO, haptics = () => null } = {}) {
  let gap = 0, live = false, sent = false; // sent: an effect went out since the last stop
  const quiet = () => {}; // playEffect resolves 'preempted' when the next frame's effect replaces it; nothing to handle
  const effect = { startDelay: 0, duration: DURATION, strongMagnitude: 0, weakMagnitude: 0 }; // reused: playEffect reads its params at the call
  const zeroEffect = a => a.playEffect('dual-rumble', ZERO)?.catch?.(quiet);
  const zero = a => { zeroEffect(a); a.reset?.()?.catch?.(quiet); };
  const play = a => a.playEffect('dual-rumble', effect)?.catch?.(quiet);
  const each = fn => { const list = pads() ?? NO; for (let i = 0; i < list.length; i++) { const a = list[i]?.vibrationActuator; if (typeof a?.playEffect === 'function') fn(a); } };

  function stop(reason) {
    if (sent || reason === 'exit') { haptics()?.stop(reason); sent = false; }
    live = false; gap = 0;
  }
  function send(m) {
    if (haptics()?.paused) { stop('menu'); return; } // [C-14]: a game sends no rumble while a pausing overlay is open
    if (m.strong > ON || m.weak > ON) {
      effect.strongMagnitude = m.strong; effect.weakMagnitude = m.weak; each(play);
      live = true; gap = 0; sent = true; return;
    }
    if (!live) return;
    gap++;
    if (gap === 1) each(zeroEffect); // the gap's first frame: end the pulse, queued behind it
    else if (gap > GAP_FRAMES) { each(zero); live = false; gap = 0; }
  }
  function kill() { each(zero); live = false; gap = 0; } // the lab's pagehide (B1): one zero effect + reset per pad, no engine stop
  return { send, stop, kill };
}
