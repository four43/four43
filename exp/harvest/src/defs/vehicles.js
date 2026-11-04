// The vehicles (spec H-V1..H-V3; plan docs/spec/vehicle-ladder-plan.md), in the order the farm opens them. Each has a price (the
// first is free), its road speed (H-H5: off the crop it always drives this fast; in crop it slows to its speed upgrade's cutting
// speed), the zone it sells at (and, if not TUNE.unloadRate, how fast a bin unloads there), where it starts, whether it carries a bin on itself (the mower's catcher) besides the carts
// it tows, and its own upgrade table. Every table has the same five ids so the sim, the card and the saves treat them alike: speed,
// width (the cutter), bins (what each bin holds), carts (how many it tows) and blades (the toughest of its crops it cuts).
// value(level) is what a level gives; cost(level) is the price of going from level to level + 1 (base × growth^level, rounded to 5).
// Sim-pure data.
import { YARD, BACKYARD, MEADOW } from '../sim/layout.js';

export const UPGRADE_IDS = Object.freeze(['speed', 'width', 'bins', 'carts', 'blades']);
const up = (label, max, base, growth, value, noun) => Object.freeze({ label, max, base, growth, value, noun });

export const VEHICLE_IDS = Object.freeze(['mower', 'tractor', 'combine']);
// Balance (playtest 2026-11-01: "upgrade the blades and move on after barely touching the first field"): each blades level costs
// about 70-90 % of what the field before it pays on its first harvest, and each vehicle about what its chapter's fields pay, so a
// field is mostly cut before the next opens. Playtest 2026-11-04 ("the tractor should be an exciting jump, not a reset to a
// slog"): a new vehicle out-earns the one before it fully upgraded (per second and per load), so its crops pay ~10x the last
// chapter's. Cells cut a second: mower 4·deck·speed (0.5 m cells) 9.7 → 48; tractor deck·speed 7 → 35; combine 9.6 → 64. So the
// tractor on hay makes ~280 a second from the start against a maxed mower's ~145 on clover, the combine on wheat ~3,800 against a
// maxed tractor's ~3,100. First harvests: lawn 2,464, long grass 3,840, clover 4,800; hay 51,200, alfalfa 34,560, wildflowers
// 100,800; wheat 768,000, corn 1,372,800, sunflowers 2,059,200.
export const VEHICLES = Object.freeze({
  mower: Object.freeze({
    label: 'Mower', price: 0, road: 6.5, sell: 'compost', start: BACKYARD.start, bag: true,
    upgrades: Object.freeze({
      speed: up('Cut speed', 6, 120, 1.55, l => 2.2 + 0.4 * l),
      width: up('Deck', 5, 150, 1.6, l => 1.1 + 0.3 * l),
      bins: up('Bin size', 6, 100, 1.5, l => 300 + 80 * l), // clippings the catcher (and each tip cart) holds
      carts: up('Tip carts', 2, 600, 2.5, l => l, ['tip cart', 'tip carts']),
      blades: up('Blades', 2, 1800, 2, l => l),            // long grass 1,800, clover 3,600
    }),
  }),
  // the tractor's crop is baled: every `bale` cells cut make a round bale on its trailers, and a trailer holds `bins` cells
  tractor: Object.freeze({
    label: 'Tractor', price: 8000, road: 8, sell: 'haybarn', start: MEADOW.start, bag: false, bale: 12, unload: 30, // 30 cells a second: a bale every 0.4 s
    upgrades: Object.freeze({
      speed: up('Cut speed', 6, 3200, 1.55, l => 2.8 + 0.5 * l),
      width: up('Mower', 5, 4800, 1.6, l => 2.5 + 0.7 * l),
      bins: up('Bales a trailer', 2, 4000, 1.7, l => (12 + 4 * l) * 12), // 12 bales (three layers), up to 20 (five)
      carts: up('Trailers', 3, 12000, 2.2, l => 1 + l, ['trailer', 'trailers']),
      blades: up('Blades', 2, 32000, 1.1, l => l),          // alfalfa 32,000, wildflowers 35,200
    }),
  }),
  combine: Object.freeze({
    label: 'Combine', price: 180000, road: 10, sell: 'sell', start: YARD.start, bag: false,
    upgrades: Object.freeze({
      speed: up('Cut speed', 8, 40000, 1.5, l => 3.2 + 0.6 * l),
      width: up('Header', 5, 67000, 1.75, l => 3 + l),
      bins: up('Bin size', 6, 54000, 1.55, l => 600 + 150 * l), // grain one wagon holds
      carts: up('Wagons', 4, 160000, 2.1, l => 1 + l, ['wagon', 'wagons']),
      blades: up('Blades', 2, 600000, 1.85, l => l),         // corn 600,000, sunflowers 1,110,000
    }),
  }),
});

const round5 = v => Math.max(5, Math.round(v / 5) * 5);
// the price of a vehicle's upgrade from `level` to the next, or null at the top
export function costOf(vehicle, id, level) {
  const u = VEHICLES[vehicle]?.upgrades[id];
  return !u || level >= u.max ? null : round5(u.base * u.growth ** level);
}
export const upgrade = (vehicle, id) => VEHICLES[vehicle].upgrades[id];
