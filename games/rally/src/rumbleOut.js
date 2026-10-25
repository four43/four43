// Rumble output (rally-spec R7-3, R8-2, R9-4; lion-hawk 0.13 [C-14]): the mixer's four levels → the seat's pads (lp.pads: the
// live Gamepads the engine refreshes each frame). A pad whose actuator lists 'trigger-rumble' gets all four motors in one
// effect; any other gets 'dual-rumble' with the triggers folded onto the weak motor (× fold). Pads without an actuator
// (Firefox, most of Safari) are skipped: rumble is a nice-to-have, never an error.
//
// Every effect is a write to the pad, and a Bluetooth pad drains them slower than one a frame: the writes queued up below the
// page, so the pad kept rumbling through a pause and after the window closed (playtest 2026-10-25). So writes are budgeted
// (PARAMS.send): a level change goes out at most every minMs, a steady level is re-sent every keepMs as an effect durMs long
// (a new effect replaces the playing one; durMs outlasts the gap, and a stop that is lost ends by itself), and a quiet is one
// zero effect. No reset here: it is a write too, and Chromium runs it at once, cancelling a pulse queued a frame earlier.
//
// The engine owns stopping: page hide, blur and a pausing overlay, a pad's first sight, and the game moments it is told about
// (view.haptics.stop('menu' | 'finish' | 'exit')). stop(reason) tells it once per transition. While view.haptics.paused
// nothing is sent.
const ON = 0.005;
const NO = Object.freeze([]);
const MOTORS = ['strong', 'weak', 'left', 'right'];
const ZERO_DUAL = Object.freeze({ startDelay: 0, duration: 1, strongMagnitude: 0, weakMagnitude: 0 });
const ZERO_TRIG = Object.freeze({ startDelay: 0, duration: 1, strongMagnitude: 0, weakMagnitude: 0, leftTrigger: 0, rightTrigger: 0 });

// Trigger motors: a pad that lists its effects (any iterable: Chromium's is a frozen array) is believed. One that doesn't
// list them is tried with trigger-rumble, and a rejection (NotSupportedError) moves that pad model (Gamepad.id) to
// dual-rumble for the page's life (playtest 2026-10-25: Brave's bench rumbled the triggers while a plain-array check
// folded Rally's aid onto the weak motor).
const listed = a => { try { return a.effects != null && typeof a.effects !== 'string' && a.effects[Symbol.iterator] ? Array.from(a.effects) : null; } catch { return null; } };

// pads(): the seat's live pads this frame; haptics(): view.haptics (null when the game turned autoStop off, or before enter);
// fold(): the triggers' share on the weak motor for pads without trigger motors; send(): PARAMS.send (both live from the
// ?rumble panel); now(): ms
export function rumbleOut({ pads = () => NO, haptics = () => null, fold = () => 0.6, send: budget = () => ({ minMs: 50, keepMs: 150, durMs: 250, delta: 0.04 }),
  now = () => performance.now() } = {}) {
  let live = false, sent = false; // live: the last write was an effect, not a zero; sent: anything went out since the last stop
  let at = -Infinity; // ms of the last write
  const last = { strong: 0, weak: 0, left: 0, right: 0 }; // the levels last written
  // What became of the writes, for the ?rumble panel: a rejected effect is never an error for the player, but it must show.
  const stats = { writes: 0, complete: 0, preempted: 0, rejected: 0, lastError: '', pads: 0, live: false };
  const done = r => { if (r === 'complete') stats.complete++; else stats.preempted++; };
  const fail = e => { stats.rejected++; stats.lastError = `${e?.name ?? 'Error'}: ${e?.message ?? e}`; };
  // reused: playEffect reads its params at the call
  const dual = { startDelay: 0, duration: 250, strongMagnitude: 0, weakMagnitude: 0 };
  const trig = { startDelay: 0, duration: 250, strongMagnitude: 0, weakMagnitude: 0, leftTrigger: 0, rightTrigger: 0 };
  const noTriggers = new Set(); // pad ids whose unlisted actuator rejected trigger-rumble
  const triggers = (a, id) => { const l = listed(a); return l ? l.includes('trigger-rumble') : !noTriggers.has(id); };
  const call = (a, type, params, id) => {
    try {
      const p = a.playEffect(type, params);
      stats.writes++;
      p?.then?.(done, e => { fail(e); if (type === 'trigger-rumble' && e?.name === 'NotSupportedError') noTriggers.add(id); });
    } catch (e) { stats.writes++; fail(e); if (type === 'trigger-rumble') noTriggers.add(id); }
  };
  const zeroEffect = (a, id) => (triggers(a, id) ? call(a, 'trigger-rumble', ZERO_TRIG, id) : call(a, 'dual-rumble', ZERO_DUAL, id));
  const play = (a, id) => (triggers(a, id) ? call(a, 'trigger-rumble', trig, id) : call(a, 'dual-rumble', dual, id));
  const each = fn => {
    const list = pads() ?? NO; stats.pads = list.length;
    for (let i = 0; i < list.length; i++) { const p = list[i], a = p?.vibrationActuator; if (typeof a?.playEffect === 'function') fn(a, p.id); }
  };

  function stop(reason) {
    if (sent || reason === 'exit') { haptics()?.stop(reason); sent = false; }
    live = false; at = -Infinity;
  }
  // m: { strong, weak, left, right } in 0..1, once per rendered frame
  function send(m) {
    if (haptics()?.paused) { stop('menu'); return; } // [C-14]: a game sends no rumble while a pausing overlay is open
    const b = budget(), t = now();
    if (t - at < b.minMs) return; // over budget: the latest level goes out on the next allowed frame
    if (m.strong > ON || m.weak > ON || m.left > ON || m.right > ON) {
      let moved = !live || t - at >= b.keepMs;
      for (let i = 0; i < 4 && !moved; i++) moved = Math.abs(m[MOTORS[i]] - last[MOTORS[i]]) >= b.delta;
      if (!moved) return;
      for (let i = 0; i < 4; i++) last[MOTORS[i]] = m[MOTORS[i]];
      trig.duration = dual.duration = b.durMs;
      trig.strongMagnitude = m.strong; trig.weakMagnitude = m.weak; trig.leftTrigger = m.left; trig.rightTrigger = m.right;
      dual.strongMagnitude = m.strong; dual.weakMagnitude = Math.min(1, m.weak + Math.max(m.left, m.right) * fold());
      each(play);
      live = stats.live = true; sent = true; at = t; return;
    }
    if (!live) return;
    each(zeroEffect); // a quiet (between ABS pulses, or the car at rest): one zero effect, queued behind the last pulse
    live = stats.live = false; at = t;
  }
  return { send, stop, stats };
}
