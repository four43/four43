// ?debug=dof: the tilt-shift's depth of field on sliders, in a lion-hawk debug window (0.16.0 [D-9], [D-11]). The sliders
// write the pass's own params (createTiltShift's TILT_DEFAULTS keys), so a change shows on the next frame. The focus
// follows the camera's distance (game.view.js frame) unless `hold` keeps the slider's value. View only: no sim state.
// "Copy values" puts the changed keys on the clipboard as createTiltShift options, ready to paste into game.view.js.
// dofPanel(fx, dist) → a panel definition; fx: the tilt-shift pass, dist(): the camera's distance to its target (m)
export const dof = { hold: false };

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function dofPanel(fx, dist) {
  const P = fx.params, start = { ...P };
  const changed = () => Object.fromEntries(Object.keys(start).filter(k => k !== 'focus' && P[k] !== start[k]).map(k => [k, P[k]]));
  return {
    id: 'dof', title: 'Depth of field', width: 300, height: 520,
    mount(el, ui) {
      ui.check('on', P, 'on');
      ui.value('camera distance', dist, { digits: 1, unit: 'm' });
      ui.value('strength', () => (P.on ? 1 - smooth(P.fullAt, P.offAt, P.focus) : 0)); // 1 = full blur, 0 = one plain render
      const f = ui.group('Focus');
      f.check('hold focus', dof, 'hold');
      f.slider('focus (m)', P, 'focus', { min: 2, max: 60, step: 0.5 });
      f.slider('sharp band', P, 'band', { min: 0, max: 0.5, step: 0.01 });
      const b = ui.group('Blur');
      b.slider('radius', P, 'blur', { min: 0, max: 0.04, step: 0.0005 });
      b.slider('far ramp', P, 'scale', { min: 0, max: 10, step: 0.1 });
      b.slider('near ramp', P, 'nearScale', { min: 0, max: 10, step: 0.1 });
      const z = ui.group('Fade with zoom');
      z.slider('full at (m)', P, 'fullAt', { min: 2, max: 60, step: 0.5 });
      z.slider('off at (m)', P, 'offAt', { min: 2, max: 80, step: 0.5 });
      const l = ui.group('Look');
      l.slider('saturation', P, 'sat', { min: 0.5, max: 1.5, step: 0.01 });
      l.slider('vignette', P, 'vig', { min: 0, max: 1, step: 0.01 });
      ui.button('Reset', () => { Object.assign(P, start); dof.hold = false; });
      ui.button('Copy values', () => {
        const text = JSON.stringify(changed()); console.info('pig-pens dof:', text);
        navigator.clipboard?.writeText(text).catch(() => {}); // no clipboard (http, no focus): the console has it
      });
    },
  };
}
