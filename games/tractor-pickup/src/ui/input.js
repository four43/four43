// Circular stick travel -> square, so a full diagonal gives full throttle and full steer together (playtest 2):
// scale by |v| / max(|x|, |y|), then clamp each axis to +-1.
export function circleToSquare(x, y) {
  const m = Math.max(Math.abs(x), Math.abs(y)); if (m === 0) return [0, 0];
  const k = Math.hypot(x, y) / m, c = v => Math.max(-1, Math.min(1, v * k));
  return [c(x), c(y)];
}

// U-2: a classic bulb horn: a red rubber squeeze bulb on a brass horn with a flared bell
export const HORN_SVG = `<svg viewBox="0 0 100 100" aria-hidden="true">
<path d="M44 44 L66 41 Q78 38 92 18 L92 82 Q78 62 66 59 L44 56 Z" fill="#f2c230" stroke="#4a2c14" stroke-width="4" stroke-linejoin="round"/>
<ellipse cx="91" cy="50" rx="6" ry="32" fill="#c98a1e" stroke="#4a2c14" stroke-width="4"/>
<path d="M50 47 L70 45" stroke="#fff3b0" stroke-width="3" stroke-linecap="round"/>
<rect x="36" y="41" width="10" height="18" rx="2" fill="#c98a1e" stroke="#4a2c14" stroke-width="4"/>
<ellipse cx="22" cy="50" rx="17" ry="21" fill="#e04a3a" stroke="#4a2c14" stroke-width="4"/>
<ellipse cx="16" cy="41" rx="5" ry="7" fill="#ff9a8a"/></svg>`;
// One control (R-7): a floating thumb stick on the left two-thirds, W/A/S/D + arrows, gamepad left stick. Horn: button, H, pad A.
export function createInput(root) {
  const stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 }, keys = new Set(); let hornFns = [], hornHeld = false;
  const R = 70, dz = (v, z = 0.1) => Math.abs(v) < z ? 0 : (v - Math.sign(v) * z) / (1 - z);
  const base = document.createElement('div'); base.id = 'stickBase'; base.hidden = true;
  const knob = document.createElement('div'); knob.id = 'stickKnob'; base.appendChild(knob); root.appendChild(base);
  const horn = document.createElement('button'); horn.id = 'horn'; horn.setAttribute('aria-label', 'Horn'); horn.innerHTML = HORN_SVG; root.appendChild(horn);
  const fireHorn = () => hornFns.forEach(f => f());
  horn.addEventListener('pointerdown', e => { e.stopPropagation(); fireHorn(); });
  const surface = document.getElementById('c');
  surface.addEventListener('pointerdown', e => {
    if (stick.id !== null || e.clientX > innerWidth * 2 / 3) return;
    stick.id = e.pointerId; stick.ox = e.clientX; stick.oy = e.clientY; surface.setPointerCapture(e.pointerId);
    base.hidden = false; base.style.left = (e.clientX - R) + 'px'; base.style.top = (e.clientY - R) + 'px'; knob.style.transform = '';
  });
  surface.addEventListener('pointermove', e => {
    if (e.pointerId !== stick.id) return;
    let dx = e.clientX - stick.ox, dy = e.clientY - stick.oy; const d = Math.hypot(dx, dy);
    if (d > R) { dx *= R / d; dy *= R / d; }
    const [sx, sy] = circleToSquare(dx / R, dy / R); stick.x = dz(sx); stick.y = dz(sy); knob.style.transform = `translate(${dx}px, ${dy}px)`;
  });
  const end = e => { if (e.pointerId !== stick.id) return; stick.id = null; stick.x = stick.y = 0; base.hidden = true; };
  surface.addEventListener('pointerup', end); surface.addEventListener('pointercancel', end);
  addEventListener('keydown', e => { const k = e.key.toLowerCase(); if (k === 'h' && !e.repeat) fireHorn(); keys.add(k); });
  addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  addEventListener('blur', () => keys.clear());
  return {
    onHorn(fn) { hornFns.push(fn); },
    read() {
      let thr = -stick.y, steer = -stick.x;
      const k = n => keys.has(n);
      if (k('w') || k('arrowup')) thr = 1; if (k('s') || k('arrowdown')) thr = -1;
      if (k('a') || k('arrowleft')) steer = 1; if (k('d') || k('arrowright')) steer = -1;
      for (const pad of navigator.getGamepads?.() || []) {
        if (!pad) continue; const [ax, ay] = circleToSquare(pad.axes[0] || 0, pad.axes[1] || 0), px = dz(ax, 0.15), py = dz(ay, 0.15);
        if (px || py) { steer = -px; thr = -py; }
        const a = pad.buttons[0]?.pressed; if (a && !hornHeld) fireHorn(); hornHeld = !!a;
      }
      steer = Math.sign(steer) * Math.pow(Math.abs(steer), 1.4); // C-2 curve
      return { thr, steer };
    },
  };
}
