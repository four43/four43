// Pig Pens' input devices on the engine (lion-hawk 2e P6/P7, #5, #52, #53, #54): the tools are `tool` commands from
// bindPointer on #c; the keyboard feeds actions. at() sends camera rays, never hits,
// so the sim does all the picking and a replay reproduces it.
import { bindPointer } from 'lion-hawk/view';
import { TAP, LIFT } from './game/farm.js';
import { rig } from './view/rig.js';

// The `tool` payload for one phase (plan "Interfaces"): silent before the camera exists; the Hand sends no moves, and once
// the view turned its drag into an orbit an `orbit` tap; a finger on a lifting tool also
// sends `aim`, the ray LIFT[tool] px above it (#54). Fresh arrays per command (#72).
export function toolAt(engine) {
  let tool = 'hand', touch = false, orbitSent = false; // the gesture's own, from its down
  const ray = (cx, cy) => rig.orbit.ray(cx, cy); // a fresh array per call (#72)
  return (cx, cy, ev, phase) => {
    if (!rig.orbit) return null;
    if (phase === 'down') {
      tool = engine.scene.state.tool; touch = ev?.pointerType !== 'mouse';
      rig.downTool = tool; orbitSent = false; // the rig resets orbiting on its capturing pointerdown
    }
    if (tool === 'hand' && !rig.locked) { // in the exam room the Hand carries tools: every move goes to the sim
      const orbiting = rig.orbit.orbiting;
      if (phase === 'move') { if (orbiting && !orbitSent) { orbitSent = true; return { ray: ray(cx, cy), orbit: true }; } return null; } // once: the sim drops the press target
      if (orbiting && phase === 'tap') return { ray: ray(cx, cy), orbit: true };
    }
    const lift = touch ? LIFT[tool] : undefined;
    return lift ? { ray: ray(cx, cy), aim: ray(cx, cy - lift) } : { ray: ray(cx, cy) };
  };
}

// Keys (no ramps: today's keys are instant). 1–5 tools, B bell, Escape back (deselect).
export const KEYS = { 1: 'hand', 2: 'shoo', 3: 'feed', 4: 'hose', 5: 'grab', b: 'bell', escape: 'back' };

// lion-hawk 0.13 (C-5, C-10): the keys are the 'farm' mapping context on the seat's controller. No gamepad entry: Pig
// Pens reads no pad, as before.
export function farmContext() {
  return { keys: { all: { bindings: KEYS } } };
}
// One player: any pad joins seat 0 (and binds nothing); the context starts there.
export function useSeats(view, doc) {
  view.context('farm', farmContext());
  return view.seats({ max: 1, join: () => 0, contexts: ['farm'] });
}
// Device factories for boot({ devices }): the tools are `tool` commands (toolAt reads the scene state), not a seat's input.
export function devices(doc) {
  const $ = id => doc.getElementById(id);
  return [e => bindPointer(e, { surface: $('c'), type: 'tool', at: toolAt(e), filter: { button: [0] }, tap: TAP, uncapped: true, doc })];
}
