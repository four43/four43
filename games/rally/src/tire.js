// Tire model: brush-style contact patch deflection (relaxation length) feeding a
// normalised combined-slip Magic Formula. Pure JS, no rendering imports.
// Surfaces come from the material registry (src/surface.js).

// Normalised Magic Formula: returns F/D for normalised slip rho >= 0 (E = 0).
export function mfNorm(rho, s) {
  return Math.sin(s.C * Math.atan(s.B * rho));
}

// Tire parameters shared by both cars.
export const TIRE = {
  sigmaX: 0.12,    // longitudinal relaxation length (m)
  sigmaY: 0.30,    // lateral relaxation length (m)
  loadRef: 3500,   // Fz0 (N) for load sensitivity
  loadSens: 0.12,  // kL: peak mu falls 12 % per +100 % load
  rhoMax: 4,       // clamp on normalised patch deflection (full slide)
  lowSpeed: 3,     // m/s below which the patch damper fades in
};

// Advance a wheel's contact patch state and return forces in the contact frame.
// st: {dx, dy} patch deflection state (m). vsx: longitudinal slip velocity
// (omega*r - vx). vy: lateral contact velocity. vx: longitudinal contact velocity.
// fz: normal load (N). surf: surface entry. h: substep (s). cx, cy: low-speed damper
// gains (N per m/s), chosen by the caller under each axis' stability limit.
// Returns {fx, fy, rho, kappa, alpha}.
export function tireStep(st, vsx, vy, vx, fz, surf, h, cx, cy) {
  const T = TIRE;
  const avx = Math.abs(vx);
  // Deflection dynamics: d' = slip velocity - (|vx| / sigma) d  (exact exponential decay)
  const ex = Math.exp(-avx / T.sigmaX * h), ey = Math.exp(-avx / T.sigmaY * h);
  st.dx = st.dx * ex + vsx * h;
  st.dy = st.dy * ey + (-vy) * h;
  // Effective slips implied by the deflection.
  let kappa = st.dx / T.sigmaX;          // slip ratio
  let tanA = st.dy / T.sigmaY;           // tan(slip angle), force-positive direction
  let nx = kappa / surf.kp, ny = tanA / Math.tan(surf.ap);
  let rho = Math.hypot(nx, ny);
  if (rho > T.rhoMax) { // full slide: clamp deflection so it can't wind up
    const k = T.rhoMax / rho;
    st.dx *= k; st.dy *= k; nx *= k; ny *= k; kappa *= k; tanA *= k; rho = T.rhoMax;
  }
  const load = Math.max(fz, 0);
  const mu = surf.mu * Math.max(0.5, 1 - T.loadSens * (load / T.loadRef - 1));
  const D = mu * load;
  let fx = 0, fy = 0;
  if (rho > 1e-9) {
    const f = D * mfNorm(rho, surf) / rho;
    fx = f * nx; fy = f * ny;
  }
  // Low-speed patch damper: kills rocking when nearly stopped. Gain kept under the
  // explicit stability limit for the substep and faded out with speed.
  const w = Math.max(0, 1 - Math.hypot(vx, vy) / T.lowSpeed);
  if (w > 0 && load > 0) {
    fx += cx * w * vsx; fy += -cy * w * vy;
    const fm = Math.hypot(fx, fy);
    if (fm > D) { fx *= D / fm; fy *= D / fm; }
  }
  return { fx, fy, rho, kappa, alpha: Math.atan(tanA) };
}
