// E-1: the riders sing along with the horn. After the HONK-honk, each animal in the trailer and the wagon calls once, in slot order
// (trailer front to wagon back), with a small hop. Times in s after the horn.
import { slotIndex } from './slots.js';
export const SING = { start: 0.7, gap: 0.12, hop: 0.35, h: 0.45 };
export function singOrder(slots) {
  return slots.filter(s => s.landed && s.animal).sort((a, b) => slotIndex(a) - slotIndex(b)).map((s, i) => ({ animal: s.animal, delay: SING.start + i * SING.gap }));
}
