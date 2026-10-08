// Point to go (C-1): the stick is a direction and a length. A radial dead zone, then the length rescaled to 0..1 (never more).
export function radial(x, y, dz = 0.1) {
  const m = Math.hypot(x, y); if (m <= dz) return [0, 0];
  const k = Math.min(1, (m - dz) / (1 - dz)) / m;
  return [x * k, y * k];
}

// U-2: a classic bulb horn: a red rubber squeeze bulb on a brass horn with a flared bell
export const HORN_SVG = `<svg viewBox="0 0 100 100" aria-hidden="true">
<path d="M44 44 L66 41 Q78 38 92 18 L92 82 Q78 62 66 59 L44 56 Z" fill="#f2c230" stroke="#4a2c14" stroke-width="4" stroke-linejoin="round"/>
<ellipse cx="91" cy="50" rx="6" ry="32" fill="#c98a1e" stroke="#4a2c14" stroke-width="4"/>
<path d="M50 47 L70 45" stroke="#fff3b0" stroke-width="3" stroke-linecap="round"/>
<rect x="36" y="41" width="10" height="18" rx="2" fill="#c98a1e" stroke="#4a2c14" stroke-width="4"/>
<ellipse cx="22" cy="50" rx="17" ry="21" fill="#e04a3a" stroke="#4a2c14" stroke-width="4"/>
<ellipse cx="16" cy="41" rx="5" ry="7" fill="#ff9a8a"/></svg>`;
// One control (R-7): a floating thumb stick anywhere on the screen (A-4; not within EDGE px of the left edge, where Safari swipes back), W/A/S/D + arrows, gamepad left stick. Horn: button, H, pad A.
// read() gives the stick on the screen: { x, y }, x right, y up, length 0..1 (C-1, C-4, C-5); the pilot (sim/pilot.js) turns it into driving.
export function createInput(root) {
  const stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 }, keys = new Set(); let hornFns = []; const hornHeld = []; // A-6: per pad, so a second pad (or one pad listed twice) cannot fire the horn every frame
  const R = 70, EDGE = 24, out = { x: 0, y: 0 };
  const base = document.createElement('div'); base.id = 'stickBase'; base.hidden = true;
  const knob = document.createElement('div'); knob.id = 'stickKnob'; base.appendChild(knob); root.appendChild(base);
  const horn = document.createElement('button'); horn.id = 'horn'; horn.setAttribute('aria-label', 'Horn'); horn.innerHTML = HORN_SVG; root.appendChild(horn);
  const fireHorn = () => hornFns.forEach(f => f());
  horn.addEventListener('pointerdown', e => { e.stopPropagation(); fireHorn(); });
  const surface = document.getElementById('c');
  surface.addEventListener('pointerdown', e => {
    if (stick.id !== null || e.clientX < EDGE) return;
    stick.id = e.pointerId; stick.ox = e.clientX; stick.oy = e.clientY; surface.setPointerCapture(e.pointerId);
    base.hidden = false; base.style.left = (e.clientX - R) + 'px'; base.style.top = (e.clientY - R) + 'px'; knob.style.transform = '';
  });
  surface.addEventListener('pointermove', e => {
    if (e.pointerId !== stick.id) return;
    let dx = e.clientX - stick.ox, dy = e.clientY - stick.oy; const d = Math.hypot(dx, dy);
    if (d > R) { dx *= R / d; dy *= R / d; }
    const [sx, sy] = radial(dx / R, -dy / R); stick.x = sx; stick.y = sy; knob.style.transform = `translate(${dx}px, ${dy}px)`;
  });
  const end = e => { if (e.pointerId !== stick.id) return; stick.id = null; stick.x = stick.y = 0; base.hidden = true; };
  surface.addEventListener('pointerup', end); surface.addEventListener('pointercancel', end);
  addEventListener('keydown', e => { const k = e.key.toLowerCase(); if (k === 'h' && !e.repeat) fireHorn(); keys.add(k); });
  addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  // A-10: iOS can hide the page mid-touch without a pointercancel: let go of everything, or the tractor drives by itself on return
  const letGo = () => { keys.clear(); stick.id = null; stick.x = stick.y = 0; base.hidden = true; };
  addEventListener('blur', letGo); document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') letGo(); });
  return {
    onHorn(fn) { hornFns.push(fn); },
    read() {
      let x = stick.x, y = stick.y;
      const k = n => keys.has(n), kx = (k('d') || k('arrowright') ? 1 : 0) - (k('a') || k('arrowleft') ? 1 : 0), ky = (k('w') || k('arrowup') ? 1 : 0) - (k('s') || k('arrowdown') ? 1 : 0);
      if (kx || ky) { const m = Math.hypot(kx, ky); x = kx / m; y = ky / m; }
      for (const pad of navigator.getGamepads?.() || []) {
        if (!pad) continue; const [px, py] = radial(pad.axes[0] || 0, -(pad.axes[1] || 0), 0.15);
        if (px || py) { x = px; y = py; }
        const a = !!pad.buttons[0]?.pressed; if (a && !hornHeld[pad.index]) fireHorn(); hornHeld[pad.index] = a;
      }
      out.x = x; out.y = y; return out;
    },
  };
}
