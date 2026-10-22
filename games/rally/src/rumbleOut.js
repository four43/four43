// Rumble output (rally-spec R7): two motor levels → every connected pad's vibrationActuator, as a short dual-rumble effect
// re-sent each frame (a new effect replaces the playing one, so the duration is just a cut-off if frames stop coming).
// Pads without an actuator (Firefox, most of Safari) are skipped: rumble is a nice-to-have, never an error.
//
// Two kinds of quiet. Chromium queues each playEffect on a task but runs reset() at once, so a reset can cancel an effect
// sent a frame earlier.
// - A gap while driving (send() with both levels ~0, e.g. between ABS pulses) is a zero-magnitude effect only: queued
//   behind the last one, it never cuts a pulse short (playtest 2026-10-19: resets between pulses ate the lock-up pulses).
//   A gap longer than GAP_FRAMES becomes a stop.
// - A stop (stop(): menus, pause, the finish; kill(): page hide, stage exit) is a zero effect plus a reset, repeated for
//   STOP_FRAMES frames so a late effect can't leave the pad running (playtest 2026-10-19: rumbling in menus and after a
//   refresh). A pad this page hasn't seen yet gets one too, clearing whatever the previous page left playing.
const ON = 0.005, DURATION = 120; // ms: about 7 frames at 60 Hz, so a hitch doesn't leave a gap
const STOP_FRAMES = 20;           // ~1/3 s of repeated stops
const GAP_FRAMES = 15;            // ~1/4 s of driving quiet before it counts as a stop

export function rumbleOut({ getGamepads = () => globalThis.navigator?.getGamepads?.() ?? [] } = {}) {
  let stopping = 0, gap = 0, live = false;
  const seen = new Set();
  const quiet = () => {}; // playEffect resolves 'preempted' when the next frame's effect replaces it; nothing to handle
  const zeroEffect = a => a.playEffect('dual-rumble', { startDelay: 0, duration: 1, strongMagnitude: 0, weakMagnitude: 0 })?.catch?.(quiet);
  const zero = a => { zeroEffect(a); a.reset?.()?.catch?.(quiet); };
  const actuators = () => [...getGamepads()].filter(p => p?.vibrationActuator?.playEffect);
  const fresh = pad => !seen.has(pad.index) && seen.add(pad.index);

  function stop() {
    for (const pad of actuators()) if (stopping > 0 || fresh(pad)) zero(pad.vibrationActuator);
    if (stopping > 0) stopping--;
    live = false; gap = 0;
  }
  function send(m) {
    const on = m.strong > ON || m.weak > ON;
    if (!on && (!live || ++gap > GAP_FRAMES)) { stop(); return; }
    for (const pad of actuators()) {
      const a = pad.vibrationActuator;
      if (fresh(pad)) zero(a);
      if (on) a.playEffect('dual-rumble', { startDelay: 0, duration: DURATION, strongMagnitude: m.strong, weakMagnitude: m.weak })?.catch?.(quiet);
      else if (gap === 1) zeroEffect(a); // the gap's first frame: end the pulse, queued behind it
    }
    if (on) { live = true; gap = 0; stopping = STOP_FRAMES; }
  }
  function kill() { for (const pad of actuators()) zero(pad.vibrationActuator); stopping = STOP_FRAMES; live = false; gap = 0; }
  return { send, stop, kill };
}
