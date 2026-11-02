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
// field is mostly cut before the next opens. First harvests: lawn 2,464, long grass 3,840, clover 4,800; hay 5,120, alfalfa 4,608,
// wildflowers 13,440; wheat 38,400, corn 91,520, sunflowers 183,040.
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
      speed: up('Cut speed', 6, 400, 1.55, l => 2.8 + 0.5 * l),
      width: up('Mower', 5, 600, 1.6, l => 2.5 + 0.7 * l),
      bins: up('Bales a trailer', 3, 500, 1.7, l => (6 + 2 * l) * 12), // 6 bales, up to 12 (three layers)
      carts: up('Trailers', 3, 1500, 2.2, l => 1 + l, ['trailer', 'trailers']),
      blades: up('Blades', 2, 3800, 1.15, l => l),          // alfalfa 3,800, wildflowers 4,370
    }),
  }),
  combine: Object.freeze({
    label: 'Combine', price: 30000, road: 10, sell: 'sell', start: YARD.start, bag: false,
    upgrades: Object.freeze({
      speed: up('Cut speed', 8, 3000, 1.5, l => 3.2 + 0.6 * l),
      width: up('Header', 5, 5000, 1.75, l => 3 + l),
      bins: up('Bin size', 6, 4000, 1.55, l => 600 + 150 * l), // grain one wagon holds
      carts: up('Wagons', 4, 12000, 2.1, l => 1 + l, ['wagon', 'wagons']),
      blades: up('Blades', 2, 30000, 2.4, l => l),           // corn 30,000, sunflowers 72,000
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
