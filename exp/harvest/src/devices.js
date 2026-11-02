// Harvest's input devices (H-C1, H-C2; after Tractor Pickup's): one control, point to go. The floating thumb stick on the canvas,
// W/A/S/D and the arrows and the pad's left stick all write the screen pair sx/sy, which the map hook turns into the world-frame
// goX/goZ and goBack against the camera's heading (stickToWorld), re-applied as the camera turns.
import { bindStick, bindKeyboard, bindGamepad } from 'lion-hawk/view';
import { stickToWorld } from './sim/pilot.js';

export const KEYS = { w: ['sy', 1], arrowup: ['sy', 1], s: ['sy', -1], arrowdown: ['sy', -1], d: ['sx', 1], arrowright: ['sx', 1], a: ['sx', -1], arrowleft: ['sx', -1], h: 'horn' };
export const PAD = { axes: { 0: ['sx', 1], 1: ['sy', -1] }, buttons: { 0: 'horn' }, deadZone: 0 };

export function devices(doc, { rig }) {
  const $ = id => doc.getElementById(id);
  const map = { from: ['sx', 'sy'], to: (x, y, out) => { stickToWorld(x, y, rig.yaw, out); } };
  return [
    // floating, radius 70 px, a dead zone 0.1, not within 24 px of the left edge (Safari swipes back); not on a card's buttons
    e => bindStick(e, { root: $('c'), base: $('stickBase'), knob: $('stickKnob'), x: ['sx', 1], y: ['sy', 1], map, radius: 70, edge: 24, deadZone: 0.1, doc }),
    e => bindKeyboard(e, KEYS, { target: doc.defaultView, doc, map }),
    e => bindGamepad(e, PAD, { map: { ...map, radial: 0.15 } }),
  ];
}
