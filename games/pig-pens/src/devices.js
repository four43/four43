// Pig Pens' input devices on the engine (lion-hawk 2e P6/P7, #5, #52, #54): the tools are `tool` commands from
// bindPointer on #c. at() sends camera rays, never hits, so the sim does all the picking and a replay reproduces it.
import { bindPointer } from 'lion-hawk/view';
import { PRESS, TAP, LIFT } from './game/farm.js';
import { rig, ray } from './view/rig.js';

// The `tool` payload for one phase (plan "Interfaces"): silent while driving or before the camera exists; the Hand sends
// no moves, and once the view turned its drag into an orbit no press and an `orbit` tap; a finger on a lifting tool also
// sends `aim`, the ray LIFT[tool] px above it (#54). Fresh arrays per command (#72).
export function toolAt(engine) {
  let tool = 'hand', touch = false; // the gesture's own, from its down
  return (cx, cy, ev, phase) => {
    if (!rig.ready) return null;
    if (phase === 'down') {
      const s = engine.scene.state; if (s.driving) return null;
      tool = s.tool; touch = ev?.pointerType !== 'mouse';
    }
    if (tool === 'hand') {
      if (phase === 'move') return null;
      if (rig.orbiting && phase === 'press') return null;
      if (rig.orbiting && phase === 'tap') return { ray: ray(cx, cy), orbit: true };
    }
    const lift = touch ? LIFT[tool] : undefined;
    return lift ? { ray: ray(cx, cy), aim: ray(cx, cy - lift) } : { ray: ray(cx, cy) };
  };
}

// Device factories for boot({ devices }).
export function devices(doc) {
  const $ = id => doc.getElementById(id);
  return [
    e => bindPointer(e, { surface: $('c'), type: 'tool', at: toolAt(e), filter: { button: [0] }, press: PRESS, tap: TAP, doc }),
  ];
}
