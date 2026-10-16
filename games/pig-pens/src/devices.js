// Pig Pens' input devices on the engine (lion-hawk 2e P6/P7, #5, #52, #53, #54): the tools are `tool` commands from
// bindPointer on #c; the keyboard, the fixed thumb pad and the horn feed actions. at() sends camera rays, never hits,
// so the sim does all the picking and a replay reproduces it.
import { bindPointer, bindKeyboard, bindStick, bindHold } from 'lion-hawk/view';
import { PRESS, TAP, LIFT } from './game/farm.js';
import { rig } from './view/rig.js';

// The `tool` payload for one phase (plan "Interfaces"): silent while driving or before the camera exists; the Hand sends
// no moves, and once the view turned its drag into an orbit no press and an `orbit` tap; a finger on a lifting tool also
// sends `aim`, the ray LIFT[tool] px above it (#54). Fresh arrays per command (#72).
export function toolAt(engine) {
  let tool = 'hand', touch = false, orbitSent = false; // the gesture's own, from its down
  const ray = (cx, cy) => rig.orbit.ray(cx, cy); // a fresh array per call (#72)
  return (cx, cy, ev, phase) => {
    if (!rig.orbit) return null;
    if (phase === 'down') {
      const s = engine.scene.state; rig.downDriving = s.driving; if (s.driving) return null;
      tool = s.tool; touch = ev?.pointerType !== 'mouse';
      rig.downTool = tool; rig.pressAt = { x: cx, y: cy }; orbitSent = false; // the rig resets orbiting on its capturing pointerdown
    }
    if (tool === 'hand') {
      const orbiting = rig.orbit.orbiting;
      if (phase === 'move') { if (orbiting && !orbitSent) { orbitSent = true; return { ray: ray(cx, cy), orbit: true }; } return null; } // once: the sim drops the press target
      if (orbiting && phase === 'press') return null;
      if (orbiting && phase === 'tap') return { ray: ray(cx, cy), orbit: true };
    }
    const lift = touch ? LIFT[tool] : undefined;
    return lift ? { ray: ray(cx, cy), aim: ray(cx, cy - lift) } : { ray: ray(cx, cy) };
  };
}

// Keys (no ramps: today's keys are instant). 1–5 tools, B bell, Escape back (deselect, or get out while driving),
// E get out, H horn; WASD/arrows drive (throttle +1 forward, steer +1 left). The sim decides what applies when.
export const KEYS = {
  1: 'hand', 2: 'shoo', 3: 'feed', 4: 'hose', 5: 'grab', b: 'bell', escape: 'back', e: 'getOut', h: 'horn',
  w: ['throttle', 1], arrowup: ['throttle', 1], s: ['throttle', -1], arrowdown: ['throttle', -1],
  a: ['steer', 1], arrowleft: ['steer', 1], d: ['steer', -1], arrowright: ['steer', -1],
};

// Device factories for boot({ devices }).
export function devices(doc) {
  const $ = id => doc.getElementById(id);
  return [
    e => bindPointer(e, { surface: $('c'), type: 'tool', at: toolAt(e), filter: { button: [0] }, press: PRESS, tap: TAP, uncapped: true, doc }),
    e => bindKeyboard(e, KEYS, { target: doc.defaultView, doc }),
    // the fixed drive pad (#53): deflects from its own centre, travel 36% of its width, no dead zone (main.js stickMove)
    e => bindStick(e, { root: $('stick'), base: $('stick'), knob: $('knob'), origin: 'centre', x: ['steer', -1], y: ['throttle', 1],
      radius: () => $('stick').getBoundingClientRect().width * 0.36, deadZone: 0, edge: 0, doc }),
    e => bindHold(e, $('horn'), 'horn'),
  ];
}
