// Tire model: brush-style contact patch deflection (relaxation length) feeding a
// normalised combined-slip Magic Formula. Pure JS, no rendering imports.

// Surface table. mu = peak friction coefficient for rally tyres: gravel tyres on loose surfaces,
// studded tyres on snow and ice (which grip snow better than gravel tyres grip gravel; spec R3-1).
// C = Magic Formula shape: large-slip force ratio = sin(C*pi/2) (plateau vs drop).
// kp = peak slip ratio, ap = peak slip angle (rad), crr = rolling resistance coeff.
export const SURFACES = {
  tarmac:   { name: 'Tarmac',        mu: 1.15, C: 1.50, kp: 0.10, ap: 0.12, crr: 0.015, drag: 0 },
  hardpack: { name: 'Dirt',          mu: 0.90, C: 1.40, kp: 0.14, ap: 0.15, crr: 0.025, drag: 0 },
  gravel:   { name: 'Loose gravel',  mu: 0.80, C: 1.25, kp: 0.18, ap: 0.18, crr: 0.035, drag: 0 },
  grass:    { name: 'Grass',         mu: 0.55, C: 1.55, kp: 0.12, ap: 0.14, crr: 0.050, drag: 0.2 },
  sand:     { name: 'Sand',          mu: 0.50, C: 1.20, kp: 0.22, ap: 0.20, crr: 0.120, drag: 0.14 },
  mud:      { name: 'Mud',           mu: 0.40, C: 1.50, kp: 0.15, ap: 0.16, crr: 0.100, drag: 0.18 },
  packed:   { name: 'Packed snow',   mu: 0.75, C: 1.25, kp: 0.20, ap: 0.20, crr: 0.030, drag: 0 },
  snowbank: { name: 'Snowbank',      mu: 0.30, C: 1.20, kp: 0.25, ap: 0.22, crr: 0.150, drag: 0.1 },
  ice:      { name: 'Ice',           mu: 0.55, C: 1.40, kp: 0.08, ap: 0.08, crr: 0.015, drag: 0 },
};
for (const s of Object.values(SURFACES)) s.B = Math.tan(Math.PI / (2 * s.C)); // peak at rho = 1

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
