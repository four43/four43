// Controller rumble mixer (rally-spec R9-1): four physical channels → { strong, weak, left, right } in 0..1, once per
// rendered frame. Pure: no DOM, no gamepad; the stage view sends the result (src/rumbleOut.js) and the ?rumble panel
// (src/rumbleTune.js) edits the params and mutes and reads the meters.
//   engine:     the revs, a light hum on the weak motor
//   suspension: the road under the wheels (by surface and speed) and the real jolts
//   body:       the car's contacts, sized by their velocity change
//   aid:        slip near and past the tyres' peak, in the triggers
// Each motor is the sum of its channels through a soft clip, × the setting's gain.
import { PARAMS } from '../defs/rumble.js';
import { createEngine } from './engine.js';
import { createSuspension } from './suspension.js';
import { createBody } from './body.js';
import { createAid } from './aid.js';

export { SURFACE_OF } from './suspension.js';
export const CHANNELS = ['engine', 'suspension', 'body', 'aid'];

const ZERO = Object.freeze({ strong: 0, weak: 0, left: 0, right: 0 });

// params: a tuneParams() object (defaults in defs/rumble.js), edited in place by the panel.
export function createRumble(params = PARAMS) {
  const engine = createEngine(params.engine), suspension = createSuspension(params.suspension), body = createBody(params.body), aid = createAid(params.aid);
  const out = { strong: 0, weak: 0, left: 0, right: 0 };
  const mute = { engine: false, suspension: false, body: false, aid: false };
  // Each channel's levels this frame, before the mix (the panel's meters).
  const levels = { engine: { ...ZERO }, suspension: { ...ZERO }, body: { ...ZERO }, aid: { ...ZERO } };
  const put = (k, m) => { const l = levels[k]; l.strong = m.strong ?? 0; l.weak = m.weak ?? 0; l.left = m.left ?? 0; l.right = m.right ?? 0; };
  const clip = x => { const d = params.mix.drive; return x <= 0 ? 0 : Math.min(1, Math.tanh(x * d) / Math.tanh(d)); };

  // car: a Vehicle (or its shape: { speed, rpm, cfg.drive, dt.limiter, out.throttle, input, wheels }); impulse: the summed
  // contact impulse on the car since the last frame (N·s); gain: the Rumble setting's.
  function update(car, dt, { impulse = 0, gain = 1 } = {}) {
    put('engine', engine.update(car, dt));
    put('suspension', suspension.update(car, dt));
    put('body', body.update(impulse, car.cfg.mass, dt));
    put('aid', aid.update(car, dt));
    out.strong = 0; out.weak = 0; out.left = 0; out.right = 0;
    for (const k of CHANNELS) {
      if (mute[k]) continue;
      const l = levels[k];
      out.strong += l.strong; out.weak += l.weak; out.left += l.left; out.right += l.right;
    }
    out.strong = clip(out.strong) * gain; out.weak = clip(out.weak) * gain;
    out.left = clip(out.left) * gain; out.right = clip(out.right) * gain;
    return out;
  }
  return { update, params, levels, mute, out, aid: aid.state };
}
