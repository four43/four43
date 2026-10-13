// Tractor Pickup's input devices on the engine (lion-hawk 2g G1, C-1..C-11, #81, #82): one control (R-7), point to go. The
// floating thumb stick on #c, W/A/S/D and the arrows and the pad's left stick all write the virtual pair sx/sy (x right,
// y up on the screen), which the map hook turns into the world-frame goX/goZ and the screen-relative goBack against the
// camera's heading (stickToWorld, PILOT.revCone), re-applied as the camera turns. The engine merges the three by vector
// length (#82). Horn: the button, H, pad A.
import { bindStick, bindKeyboard, bindGamepad, bindHold } from 'lion-hawk/view';
import { stickToWorld } from './sim/pilot.js';
import { HORN_SVG } from './ui/input.js';

// W/A/S/D and arrows as stick directions (diagonals: stickToWorld caps the length at 1); H the horn
export const KEYS = {
  w: ['sy', 1], arrowup: ['sy', 1], s: ['sy', -1], arrowdown: ['sy', -1], d: ['sx', 1], arrowright: ['sx', 1], a: ['sx', -1], arrowleft: ['sx', -1],
  h: 'horn',
};
// the left stick (screen up is axis 1 negative) and A; the radial dead zone 0.15 is the map's (the pad's own is off, I-2)
export const PAD = { axes: { 0: ['sx', 1], 1: ['sy', -1] }, buttons: { 0: 'horn' }, deadZone: 0 };

// The stick's markup and the horn button (ui/input.js createInput's), made once in #ui before boot
export function controls(doc) {
  const ui = doc.getElementById('ui');
  if (!doc.getElementById('stickBase')) {
    const base = doc.createElement('div'); base.id = 'stickBase'; base.className = 'tp-stick'; base.hidden = true;
    const knob = doc.createElement('div'); knob.id = 'stickKnob'; base.appendChild(knob); ui.appendChild(base);
  }
  if (!doc.getElementById('horn')) { const horn = doc.createElement('button'); horn.id = 'horn'; horn.setAttribute('aria-label', 'Horn'); horn.innerHTML = HORN_SVG; ui.appendChild(horn); }
}

// Device factories for boot({ devices }); rig.yaw is the camera heading the stick is read against (C-2)
export function devices(doc, { rig }) {
  const $ = id => doc.getElementById(id);
  controls(doc);
  const to = (x, y, out) => { stickToWorld(x, y, rig.yaw, out); };
  const map = { from: ['sx', 'sy'], to };
  return [
    // C-4, C-5, A-4: floating, radius 70 px, a radial dead zone 0.1, not within 24 px of the left edge (Safari swipes back)
    e => bindStick(e, { root: $('c'), base: $('stickBase'), knob: $('stickKnob'), x: ['sx', 1], y: ['sy', 1], map, radius: 70, edge: 24, deadZone: 0.1, doc }),
    e => bindKeyboard(e, KEYS, { target: doc.defaultView, doc, map }),
    e => bindGamepad(e, PAD, { map: { ...map, radial: 0.15 } }),
    e => bindHold(e, $('horn'), 'horn'), // U-2: a press honks once
  ];
}
