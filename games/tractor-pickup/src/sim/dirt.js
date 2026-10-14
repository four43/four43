// Dirt levels 0 (clean) .. 1 (very dirty) for the tractor, the cars and every animal (T-16). The rate comes from the ground material's
// game block (src/defs/materials.js, D6): `dirt` per second, times the speed fraction where `scaled`. Only the sprinkler (T-15) and the
// farmyard wash (T-36) clean. washing: 0, 1 (the sprinkler: clean in washTime) or a speed-up (the wash: WASH_RATE).
export const DIRT = { splash: 0.4, washTime: 1.5 }, WASH_RATE = 3; // the wash is short (9 m): it cleans 3 times as fast, so any pass comes out clean
const clamp = v => Math.max(0, Math.min(1, v));
export function stepDirt(level, { ground, speedFrac, washing }, dt) {
  if (washing) return clamp(level - dt * washing / DIRT.washTime);
  return clamp(level + ground.dirt * (ground.scaled ? Math.min(1, speedFrac) : 1) * dt);
}
export function stepRiderDirt(level, { carInMud, speed, washing }, dt) {
  if (washing) return clamp(level - dt * washing / DIRT.washTime);
  return carInMud && speed > 1 ? clamp(level + DIRT.splash * dt) : level;
}
