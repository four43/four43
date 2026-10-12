// Rally's input devices on the engine (lion-hawk 2c-rally R5, spec R4; field notes #13–#17, #29, #30): the keyboard with
// the ease ramps, the pad with its expo stick, the touch steering slider and the pedal/chip buttons. The feel is
// the removed Controls' arithmetic, moved: the engine merges the sources (largest value wins, #29; every pad, #30).
import { bindKeyboard, bindGamepad, bindStick, bindHold } from 'lion-hawk/view';

const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

// Full lock in px of sideways thumb travel, read when the thumb lands (#17).
export const steerRange = (width = globalThis.innerWidth) => Math.max(60, Math.min(110, width * 0.12));

// Keyboard steering (#14): the rate grows with how long a key is held (1.2 → 4.2 /s over 0.35 s), reversing snaps
// through centre at 6 /s, letting go returns at 4.5 /s. st.hold is the hold time. dt is capped as the old loop did.
export function steerRamp(v, t, dt, st) {
  dt = Math.min(0.1, dt);
  if (t !== 0) {
    const dir = Math.sign(t);
    st.hold = (st.hold || 0) + dt;
    const rate = 1.2 + 3.0 * Math.min(1, st.hold / 0.35);
    if (Math.sign(v) !== dir && v !== 0) v += dir * 6 * dt; // snap through centre
    else v += dir * rate * dt;
    return clamp(v, -1, 1);
  }
  st.hold = 0;
  const d = 4.5 * dt;
  return Math.abs(v) < d ? 0 : v - Math.sign(v) * d;
}

// steer +1 = left. Shift+R (restart) wins over R (back onto the road) while Shift is down (#14).
export const KEYS = {
  a: ['steer', 1], arrowleft: ['steer', 1], d: ['steer', -1], arrowright: ['steer', -1],
  w: ['throttle', 1], arrowup: ['throttle', 1], s: ['brake', 1], arrowdown: ['brake', 1], ' ': ['handbrake', 1],
  q: 'shiftDown', e: 'shiftUp', r: 'reset', 'shift+r': 'resetAll', c: 'camera', f3: 'debug', '`': 'debug',
  escape: 'pause', p: 'pause', enter: 'confirm',
};
// Pedal keys ease in and out (per second) towards 0 or 1, dt capped like the old loop (#44: the engine's { rise, fall }
// ramps take the raw frame time, so a hitch would snap a pedal to full); the handbrake is on/off.
export const pedalRamp = (rise, fall) => (v, t, dt) => {
  dt = Math.min(0.1, dt);
  return t > v ? Math.min(t, v + rise * dt) : Math.max(t, v - fall * dt);
};
export const RAMPS = { steer: steerRamp, throttle: pedalRamp(5, 8), brake: pedalRamp(6, 9) };

// Standard mapping: left stick with a slight expo, triggers, A = handbrake and confirm (#16), bumpers shift,
// Y reset, X camera, Start pause.
export const PAD = {
  deadZone: 0.08,
  axes: { 0: ['steer', -1, v => 0.35 * v * Math.abs(v) + 0.65 * v] },
  buttons: { 7: ['throttle', 1], 6: ['brake', 1], 0: [['handbrake', 1], 'confirm'], 5: 'shiftUp', 4: 'shiftDown', 3: 'reset', 2: 'camera', 9: 'pause' },
};

// Touch buttons (bindHold): pedals full on while pressed; the Reset chip is resetHold (tap = reset, held = restart).
const HOLDS = [['#gasBtn', 'throttle'], ['#brakeBtn', 'brake'], ['#hbBtn', 'handbrake'], ['#upBtn', 'shiftUp'], ['#dnBtn', 'shiftDown'],
  ['#resetBtn', 'resetHold'], ['#camBtn', 'camera'], ['#dbgBtn', 'debug']];

// Device factories for boot({ devices }).
export function devices(doc) {
  const win = doc.defaultView, $ = s => doc.querySelector(s);
  const out = [
    e => bindKeyboard(e, KEYS, { target: win, doc, ramps: RAMPS }),
    e => bindGamepad(e, PAD),
    e => bindStick(e, { root: $('#steerZone'), x: ['steer', -1], axis: 'x', radius: () => steerRange(win.innerWidth), deadZone: 0, edge: 20,
      base: $('#steerBase'), knob: $('#steerKnob'), doc }),
  ];
  for (const [sel, action] of HOLDS) {
    out.push(e => {
      const el = $(sel), h = bindHold(e, el, action);
      // As ui.js did for the pedals: a press doesn't focus the button, so Space/Enter stay the handbrake/confirm
      // keys afterwards (#15 hands both to a focused button).
      const noFocus = ev => ev.preventDefault();
      el.addEventListener('pointerdown', noFocus); el.addEventListener('mousedown', noFocus);
      return { dispose() { el.removeEventListener('pointerdown', noFocus); el.removeEventListener('mousedown', noFocus); h.dispose(); } };
    });
  }
  return out;
}
