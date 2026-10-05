// One control (R-7): a floating thumb stick on the left two-thirds, W/A/S/D + arrows, gamepad left stick. Horn: button, H, pad A.
export function createInput(root) {
  const stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 }, keys = new Set(); let hornFns = [], hornHeld = false;
  const R = 70;
  const base = document.createElement('div'); base.id = 'stickBase'; base.hidden = true;
  const knob = document.createElement('div'); knob.id = 'stickKnob'; base.appendChild(knob); root.appendChild(base);
  const horn = document.createElement('button'); horn.id = 'horn'; horn.setAttribute('aria-label', 'Horn'); horn.textContent = '📯'; root.appendChild(horn);
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
    stick.x = dx / R; stick.y = dy / R; knob.style.transform = `translate(${dx}px, ${dy}px)`;
  });
  const end = e => { if (e.pointerId !== stick.id) return; stick.id = null; stick.x = stick.y = 0; base.hidden = true; };
  surface.addEventListener('pointerup', end); surface.addEventListener('pointercancel', end);
  addEventListener('keydown', e => { const k = e.key.toLowerCase(); if (k === 'h' && !e.repeat) fireHorn(); keys.add(k); });
  addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  addEventListener('blur', () => keys.clear());
  const dz = v => Math.abs(v) < 0.15 ? 0 : (v - Math.sign(v) * 0.15) / 0.85;
  return {
    onHorn(fn) { hornFns.push(fn); },
    read() {
      let thr = -stick.y, steer = -stick.x;
      const k = n => keys.has(n);
      if (k('w') || k('arrowup')) thr = 1; if (k('s') || k('arrowdown')) thr = -1;
      if (k('a') || k('arrowleft')) steer = 1; if (k('d') || k('arrowright')) steer = -1;
      for (const pad of navigator.getGamepads?.() || []) {
        if (!pad) continue; const px = dz(pad.axes[0] || 0), py = dz(pad.axes[1] || 0);
        if (px || py) { steer = -px; thr = -py; }
        const a = pad.buttons[0]?.pressed; if (a && !hornHeld) fireHorn(); hornHeld = !!a;
      }
      steer = Math.sign(steer) * Math.pow(Math.abs(steer), 1.4); // C-2 curve
      return { thr, steer };
    },
  };
}
