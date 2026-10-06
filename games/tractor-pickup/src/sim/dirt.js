// Dirt levels 0 (clean) .. 1 (very dirty) for the tractor, the cars and every animal (T-16). Only the sprinkler cleans (T-15).
export const DIRT = { gravel: 0.006, grass: 0.004, mud: 0.6, splash: 0.4, washTime: 1.5 };
const clamp = v => Math.max(0, Math.min(1, v));
export function stepDirt(level, { surface, speedFrac, washing }, dt) {
  if (washing) return clamp(level - dt / DIRT.washTime);
  const rate = surface === 'mud' ? DIRT.mud : (DIRT[surface] ?? 0) * Math.min(1, speedFrac);
  return clamp(level + rate * dt);
}
export function stepRiderDirt(level, { carInMud, speed, washing }, dt) {
  if (washing) return clamp(level - dt / DIRT.washTime);
  return carInMud && speed > 1 ? clamp(level + DIRT.splash * dt) : level;
}
