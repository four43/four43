// U-3, F-8, F-13, E-5: a button that acts only after it is held for `ms` (a ring fills); a shorter press does nothing.
// The ring is the button's <i> child, drawn from its --p custom property (0deg..360deg).
export function holdToFire(btn, ms, onFire) {
  const ring = btn.querySelector('i');
  let start = 0, raf = 0;
  const stop = () => { cancelAnimationFrame(raf); raf = 0; start = 0; ring?.style.setProperty('--p', '0deg'); };
  const tick = () => {
    if (!start) return;
    const f = (performance.now() - start) / ms; ring?.style.setProperty('--p', Math.min(1, f) * 360 + 'deg');
    if (f >= 1) { stop(); onFire(); } else raf = requestAnimationFrame(tick);
  };
  btn.addEventListener('pointerdown', e => { e.stopPropagation(); btn.setPointerCapture?.(e.pointerId); start = performance.now(); raf = requestAnimationFrame(tick); });
  for (const n of ['pointerup', 'pointercancel', 'lostpointercapture']) btn.addEventListener(n, stop);
  btn.addEventListener('contextmenu', e => e.preventDefault());
  return { stop };
}
