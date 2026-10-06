// Dirt levels 0 (clean) .. 1 (very dirty) for the tractor, the cars and every animal (T-16). Only the sprinkler (T-15) and the farmyard
// wash (T-36) clean. washing: false, true (the sprinkler: clean in washTime) or a speed-up (the wash: WASH_RATE).
export const DIRT = { gravel: 0.006, grass: 0.004, mud: 0.6, splash: 0.4, washTime: 1.5 }, WASH_RATE = 3; // the wash is short (9 m): it cleans 3 times as fast, so any pass comes out clean
const clamp = v => Math.max(0, Math.min(1, v));
export function stepDirt(level, { surface, speedFrac, washing }, dt) {
  if (washing) return clamp(level - dt * washing / DIRT.washTime);
  const rate = surface === 'mud' ? DIRT.mud : (DIRT[surface] ?? 0) * Math.min(1, speedFrac);
  return clamp(level + rate * dt);
}
export function stepRiderDirt(level, { carInMud, speed, washing }, dt) {
  if (washing) return clamp(level - dt * washing / DIRT.washTime);
  return carInMud && speed > 1 ? clamp(level + DIRT.splash * dt) : level;
}
