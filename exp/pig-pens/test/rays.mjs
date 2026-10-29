// Test rays (lion-hawk 2e P1): camera rays at world points, and `tool` commands built from them, so headless tests can
// tap and drag on the farm the way the view's at() will ([T-5], #54).
import { classify } from '../src/game/pick.js';

// A unit ray from an eye `up` m above and `back` m toward +z of the point, looking at it: [ox, oy, oz, dx, dy, dz].
export function rayTo([x, y, z], up = 20, back = 15) {
  const ox = x, oy = y + up, oz = z + back, dx = x - ox, dy = y - oy, dz = z - oz, l = Math.hypot(dx, dy, dz);
  return [ox, oy, oz, dx / l, dy / l, dz / l];
}
// One `tool` command (a touch, pointer 1) at a world point; `extra` overrides or adds fields (ray, aim, orbit…).
export const tool = (h, phase, at, extra = {}) => h.command('tool', { phase, pointer: 1, button: 0, kind: 'touch', ray: rayTo(at), ...extra });
// A quick tap: down, up and tap, then one step to deliver them.
export function tapAt(h, at, extra = {}) { tool(h, 'down', at, extra); tool(h, 'up', at, extra); tool(h, 'tap', at, extra); return h.step(1); }
// A pig the Hand picks when aimed at (classify gives that pig back).
export const findPig = sim => sim.pigs.find(q => { const c = classify(sim, rayTo([q.px, q.py, q.pz])); return c?.kind === 'pig' && c.i === q.i; });
// A ground point in the field with nothing under it (classify gives null), scanning a 1 m grid from the field's corner.
export function emptyAt(sim) {
  const f = sim.lay.field;
  for (let x = Math.ceil(f.x0 + 2); x < f.x1 - 2; x++) for (let z = Math.ceil(f.z0 + 2); z < f.z1 - 2; z++) if (classify(sim, rayTo([x, 0, z])) === null) return [x, 0, z];
  throw new Error('emptyAt: no empty ground in the field');
}
// Steps until a near-vertical ray at `at` classifies as `kind` (an animal may be standing on it).
export function waitFor(h, at, kind, opts = {}) {
  const sim = () => h.engine.scene.state.sim;
  return h.until(() => classify(sim(), rayTo(at, 20, 0.01))?.kind === kind, { maxSteps: 600, message: `waitFor(${kind})`, ...opts });
}
// The camera got to a building (or back out): headless there is no view, so the test sends the view's `focus` command
// itself (rig.js nearFocus, 2.10.0), as the camera would on arriving after a roof tap's flight
export function arrive(h, id) { h.command('focus', { id }); return h.step(1); }
