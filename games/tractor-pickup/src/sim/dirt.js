// Dirt levels 0 (clean) .. 1 (very dirty) (T-16). The tractor's and cars' dirt is the coverage kit's (per metre, the ground's dirtRate;
// the farm scene installs it, game/farm.js); riders' splash dirt stays here (animals are not pose entities). Only the sprinkler (T-15)
// and the farmyard wash (T-36) clean. washing: 0, 1 (the sprinkler: clean in washTime) or a speed-up (the wash: WASH_RATE).
export const DIRT = { splash: 0.4, washTime: 1.5 }, WASH_RATE = 3; // the wash is short (9 m): it cleans 3 times as fast, so any pass comes out clean
const clamp = v => Math.max(0, Math.min(1, v));
export function stepRiderDirt(level, { carInMud, speed, washing }, dt) {
  if (washing) return clamp(level - dt * washing / DIRT.washTime);
  return carInMud && speed > 1 ? clamp(level + DIRT.splash * dt) : level;
}
